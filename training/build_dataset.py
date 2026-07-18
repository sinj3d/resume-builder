"""Build the distillation dataset → data/train.jsonl + data/val.jsonl.

Per example: take a real (scraped) train-split JD, generate/reuse a fictional
candidate profile for it, retrieve top-k of the profile's bullets exactly like
the app's RAG does, pick a template from the pool (builtins + synthetic, ~15%
no-template), build the student prompt via prompt_builder, and have the Claude
teacher write the letter with extra quality guidance the student never sees.
Letters pass mechanical quality filters plus a model-verified no-fabrication
check.

Teacher calls run through the Anthropic Message Batches API (50% off) in three
phases — candidate profiles, letters, then fabrication checks — with every
result cached under data/cache/, so interrupted or partial runs resume free.

The result is a GENERIC dataset: many fictional candidates, real postings, and
a wide template pool — the tuned model drops in for any user without
retraining, because the app's RAG supplies their real bullets at inference.

Output format: ChatML messages JSONL — {"messages": [system, user, assistant]}.
"""
import hashlib
import json
import random
import re
from pathlib import Path

import claude
import config
import profiles
import prompt_builder
from retrieval import Retriever

TEACHER_GUIDANCE = """

=== ADDITIONAL GUIDANCE (for you, the writing model — the reader of the letter never sees this) ===
You are writing a gold-standard example. Write at the level of an expert human career coach.
- If a COVER LETTER TEMPLATE section is present, follow its structure, section order, length and tone EXACTLY.
- If the job description requires skills that are NOT in the experiences list, acknowledge the gap gracefully in one sentence and pivot to adjacent strengths. Never fabricate.
- Plain text only: no markdown, no headers, no bold, no bullet symbols unless the template explicitly asks for them.
- Replace every [bracketed placeholder] with real content, EXCEPT placeholders the template explicitly says to keep verbatim (e.g. [Referrer name]).
- Output ONLY the letter, starting at the salutation ("Dear ..."). No preamble, no commentary."""

VERIFIER_PROMPT = """You are auditing a cover letter for fabricated claims.

ALLOWED EXPERIENCES (the only concrete experience the writer has):
{bullets}

COVER LETTER:
\"\"\"
{letter}
\"\"\"

Does the letter claim any concrete skill, technology, employer, project, metric,
or accomplishment that is NOT supported by the allowed experiences? General
enthusiasm, soft skills, and restating the job posting's needs are fine — flag
only unsupported concrete claims about the writer's own experience.

Output ONLY JSON: {{"fabricated": true/false, "quote": "the offending text, or empty"}}"""


def letter_cache_path(key: str) -> Path:
    return config.CACHE_DIR / f"letters_{config.TEACHER_MODEL}" / f"{key}.txt"


def verify_cache_path(key: str) -> Path:
    return config.CACHE_DIR / f"verify_{config.VERIFIER_MODEL}" / f"{key}.json"


def _verify_prompt(bullets: list[str], letter: str) -> str:
    numbered = "\n".join(f"{i + 1}. {b}" for i, b in enumerate(bullets))
    return VERIFIER_PROMPT.format(bullets=numbered, letter=letter)


def _concrete_tokens(bullets: list[str]) -> set[str]:
    """Digit-bearing tokens ('10k', '40%', '2024') — cheap grounding signals."""
    tokens = set()
    for b in bullets:
        tokens.update(re.findall(r"\b\w*\d[\w%.]*\b", b))
    return tokens


def passes_filters(letter: str, template: str | None, bullets: list[str]) -> tuple[bool, str]:
    text = letter.strip()
    if not text.startswith("Dear"):
        return False, "does not start with salutation"

    words = len(text.split())
    lo, hi = (120, 500) if template else (250, 450)
    if not lo <= words <= hi:
        return False, f"length {words}w outside [{lo}, {hi}]"

    for residue in ("<|im_start|>", "<|im_end|>", "##", "**"):
        if residue in text:
            return False, f"markdown/ChatML residue: {residue}"

    # Placeholders may survive only if the template itself keeps them verbatim.
    for placeholder in re.findall(r"\[[^\]]*\]", text):
        if not template or placeholder not in template:
            return False, f"leftover placeholder {placeholder}"

    # Grounding: at least 2 concrete tokens from the bullets (1 if scarce).
    concrete = _concrete_tokens(bullets)
    needed = 2 if len(concrete) >= 2 else min(1, len(concrete))
    found = sum(1 for tok in concrete if tok in text)
    if found < needed:
        return False, f"only {found}/{needed} concrete bullet tokens present"

    return True, "ok"


def main() -> None:
    rng = random.Random(config.SEED)

    jds_path = config.DATA_DIR / "jds.jsonl"
    if not jds_path.exists():
        raise SystemExit("data/jds.jsonl missing — run scrape_jds.py first.")
    jds = [json.loads(l) for l in jds_path.read_text(encoding="utf-8").splitlines() if l]
    train_jds = [j for j in jds if j["split"] == "train"]

    template_pool = profiles.get_template_pool()
    if not template_pool:
        raise SystemExit("Template pool is empty — check the API key.")
    print(f"{len(train_jds)} train JDs, {len(template_pool)} templates in pool")

    # ── Phase 1: enumerate example specs (all randomness happens here, so the
    # plan is deterministic for a given SEED and cache keys are stable). The
    # last PARTIAL_FIT_EXAMPLES_PER_JD examples of each JD use a partial-fit
    # candidate → the model learns honest gap acknowledgment.
    specs = []
    template_cycle = 0
    for jd in train_jds:
        for ex_i in range(config.EXAMPLES_PER_JD):
            partial = ex_i >= config.EXAMPLES_PER_JD - config.PARTIAL_FIT_EXAMPLES_PER_JD
            fit = "partial" if partial else "strong"
            variant = 0 if partial else ex_i % (config.PROFILES_PER_JD - 1 or 1)
            k = rng.choice(range(6, 11))
            drop_name = rng.random() < config.NO_NAME_FRACTION
            if rng.random() < config.NO_TEMPLATE_FRACTION:
                template, template_name = None, "(none)"
            else:
                t = template_pool[template_cycle % len(template_pool)]
                template_cycle += 1
                template, template_name = t["content"], t["name"]
            key = hashlib.sha1(
                f"{jd['id']}|{fit}|{variant}|{template_name}|{k}|{ex_i}".encode("utf-8")
            ).hexdigest()[:16]
            specs.append({"jd": jd, "ex_i": ex_i, "fit": fit, "variant": variant,
                          "k": k, "drop_name": drop_name, "template": template,
                          "template_name": template_name, "key": key})

    # ── Phase 2: candidate profiles (batched teacher calls)
    profile_items = {}
    for s in specs:
        path = profiles.profile_cache_path(s["jd"], s["fit"], s["variant"])
        profile_items[path] = profiles.profile_prompt(s["jd"], s["fit"])
    print(f"Phase 2 — profiles ({len(profile_items)} unique)")
    claude.batch_cached(list(profile_items.items()), config.TEACHER_MODEL)

    # ── Phase 3: retrieval + student prompts, then letters (batched)
    dropped = []
    prepared = []
    for s in specs:
        try:
            profile = profiles.get_profile(s["jd"], s["fit"], s["variant"])
        except Exception as e:
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "reason": f"profile unavailable: {e}"})
            continue
        bullet_pool = profiles.profile_bullets(profile)
        if len(bullet_pool) < 6:
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "reason": "profile too small"})
            continue
        retrieved = Retriever(bullet_pool).top_k(
            s["jd"]["text"], min(s["k"], len(bullet_pool)))
        candidate_name = None if s["drop_name"] else profile.get("name")
        system, user = prompt_builder.build_prompt_parts(
            retrieved, s["jd"]["text"], s["template"], candidate_name)
        prepared.append({**s, "retrieved": retrieved, "system": system, "user": user})

    print(f"Phase 3 — letters ({len(prepared)} examples)")
    claude.batch_cached(
        [(letter_cache_path(s["key"]),
          prompt_builder.joined(s["system"], s["user"]) + TEACHER_GUIDANCE)
         for s in prepared],
        config.TEACHER_MODEL)

    # ── Phase 4: mechanical filters, then fabrication checks (batched)
    passing = []
    for s in prepared:
        path = letter_cache_path(s["key"])
        if not path.exists():
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "template": s["template_name"], "reason": "teacher call failed"})
            continue
        letter = path.read_text(encoding="utf-8").strip()
        ok, reason = passes_filters(letter, s["template"], s["retrieved"])
        if not ok:
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "template": s["template_name"], "reason": reason})
            continue
        passing.append({**s, "letter": letter})

    print(f"Phase 4 — verification ({len(passing)} letters passed filters)")
    claude.batch_cached(
        [(verify_cache_path(s["key"]), _verify_prompt(s["retrieved"], s["letter"]))
         for s in passing],
        config.VERIFIER_MODEL)

    # ── Phase 5: assemble, split, write
    examples = []
    for s in passing:
        vpath = verify_cache_path(s["key"])
        if not vpath.exists():
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "template": s["template_name"], "reason": "verifier call failed"})
            continue
        try:
            verdict = claude.parse_json(vpath.read_text(encoding="utf-8"))
        except Exception:
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "template": s["template_name"], "reason": "verifier output unparseable"})
            continue
        if verdict.get("fabricated"):
            dropped.append({"key": s["key"], "jd_id": s["jd"]["id"],
                            "template": s["template_name"],
                            "reason": f"fabrication: {str(verdict.get('quote', ''))[:80]}"})
            continue
        examples.append({
            "messages": [
                {"role": "system", "content": s["system"]},
                {"role": "user", "content": s["user"]},
                {"role": "assistant", "content": s["letter"]},
            ],
            "meta": {"jd_id": s["jd"]["id"], "template": s["template_name"],
                     "top_k": s["k"], "fit": s["fit"]},
        })

    rng.shuffle(examples)
    n_val = max(1, int(len(examples) * config.VAL_FRACTION))
    val, train = examples[:n_val], examples[n_val:]

    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train.jsonl", train), ("val.jsonl", val)):
        with (config.DATA_DIR / name).open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    (config.DATA_DIR / "dropped.jsonl").write_text(
        "\n".join(json.dumps(d, ensure_ascii=False) for d in dropped), encoding="utf-8")

    print(f"train: {len(train)}  val: {len(val)}  dropped: {len(dropped)}")
    print("Spot-check ~10 rows of data/train.jsonl before training (template followed, "
          "no fabrications, partial-fit JDs acknowledged honestly).")


if __name__ == "__main__":
    main()
