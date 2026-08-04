"""Base-vs-tuned evaluation on the held-out (real, scraped) JD split.

Each eval JD gets a fictional strong-fit candidate profile (cached, never seen
in training since eval JDs are held out), retrieval runs over its bullets like
the app's RAG, and both GGUFs write letters via llama-completion.exe (temp 0,
same manual ChatML the app falls back to). The teacher then scores each letter
on a rubric.

Every (jd, template, model) cell is cached under data/cache/eval_letters/ as
soon as it is scored, so an interrupted run resumes without re-paying for the
generation or the rubric call. The cache key includes a fingerprint of the GGUF
and the prompt, so swapping a model or editing the prompt invalidates it.

Note: this needs llama-completion.exe, NOT llama-cli.exe. Since b10066 llama.cpp
splits raw completion into its own binary; llama-cli ignores -no-cnv, drops into
chat mode, and blocks forever on empty stdin.

Usage:
    python eval.py --llama-cli <path\\to\\llama-completion.exe> --base <base.gguf> --tuned <tuned.gguf>
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

import config
import profiles
import prompt_builder
from claude import generate_json
from retrieval import Retriever

N_TEMPLATES = 3
TOP_K = 8
# Generous: a letter is ~40s on an idle CPU box, but a machine under load has been
# seen at ~26min. Cells are cached, so a rerun after a genuine hang is cheap.
GEN_TIMEOUT = 3600

RUBRIC_PROMPT = """Score this cover letter on a 1-5 scale for each criterion.

ALLOWED EXPERIENCES (all the writer actually has):
{bullets}

TEMPLATE THE LETTER WAS ASKED TO FOLLOW (may be "none"):
{template}

JOB DESCRIPTION:
{jd}

COVER LETTER:
\"\"\"
{letter}
\"\"\"

Criteria:
- template_adherence: follows the template's structure/order/length/tone (5 = exactly; if template is "none", score general structure quality)
- grounding: every concrete claim traces to the allowed experiences (5 = no fabrication at all)
- writing_quality: clarity, flow, professional tone, no filler

Output ONLY JSON: {{"template_adherence": n, "grounding": n, "writing_quality": n, "fabrication_quotes": ["..."]}}"""


def chatml(system: str, user: str) -> str:
    return (f"<|im_start|>system\n{system}<|im_end|>\n"
            f"<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n")


def run_gguf(llama_cli: str, gguf: str, prompt: str) -> str:
    # Prompt via file: long prompts exceed Windows command-line limits.
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf-8") as f:
        f.write(prompt)
        prompt_file = f.name
    try:
        out = subprocess.run(
            [llama_cli, "-m", gguf, "-f", prompt_file, "--temp", "0",
             "-n", "800", "-no-cnv", "--no-display-prompt"],
            capture_output=True, text=True, encoding="utf-8", timeout=GEN_TIMEOUT,
            stdin=subprocess.DEVNULL)  # never fall through to an interactive prompt
        if out.returncode != 0:
            raise RuntimeError(f"llama-completion failed: {out.stderr[-500:]}")
        # llama.cpp prints the end-of-generation marker on stdout; it is not letter text.
        return out.stdout.replace("[end of text]", "").strip()
    finally:
        Path(prompt_file).unlink(missing_ok=True)


def cell_cache_path(jd_id, template_name: str, which: str, gguf: str,
                    prompt: str) -> Path:
    """One cache file per (jd, template, model), keyed by GGUF + prompt content."""
    g = Path(gguf)
    stamp = f"{g.name}:{g.stat().st_size if g.exists() else 0}:{prompt}"
    fingerprint = hashlib.sha256(stamp.encode("utf-8")).hexdigest()[:8]
    safe = re.sub(r"[^A-Za-z0-9]+", "-", template_name).strip("-")
    return (config.CACHE_DIR / "eval_letters"
            / f"jd{jd_id}_{safe}_{which}_{fingerprint}.json")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llama-cli", required=True,
                    help="path to llama-completion.exe (NOT llama-cli.exe — see module docstring)")
    ap.add_argument("--base", required=True, help="base model GGUF (e.g. Qwen2.5-3B-Instruct Q4_K_M)")
    ap.add_argument("--tuned", required=True, help="fine-tuned GGUF")
    args = ap.parse_args()

    jds = [json.loads(l) for l in (config.DATA_DIR / "jds.jsonl")
           .read_text(encoding="utf-8").splitlines() if l]
    eval_jds = [j for j in jds if j["split"] == "eval"]
    templates = profiles.get_template_pool()[:N_TEMPLATES]

    results = []
    totals = {"base": {}, "tuned": {}}
    for jd in eval_jds:
        profile = profiles.get_profile(jd, "strong", 0)
        bullet_pool = profiles.profile_bullets(profile)
        retrieved = Retriever(bullet_pool).top_k(jd["text"], min(TOP_K, len(bullet_pool)))
        numbered = "\n".join(f"{i + 1}. {b}" for i, b in enumerate(retrieved))
        for t in templates:
            system, user = prompt_builder.build_prompt_parts(
                retrieved, jd["text"], t["content"], profile.get("name"))
            prompt = chatml(system, user)
            for which, gguf in (("base", args.base), ("tuned", args.tuned)):
                path = cell_cache_path(jd["id"], t["name"], which, gguf, prompt)
                if path.exists():
                    cell = json.loads(path.read_text(encoding="utf-8"))
                    note = " (cached)"
                else:
                    letter = run_gguf(args.llama_cli, gguf, prompt)
                    scores = generate_json(
                        RUBRIC_PROMPT.format(bullets=numbered, template=t["content"],
                                             jd=jd["text"], letter=letter),
                        config.VERIFIER_MODEL)
                    cell = {"jd_id": jd["id"], "template": t["name"],
                            "model": which, "scores": scores, "letter": letter}
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(json.dumps(cell, ensure_ascii=False),
                                    encoding="utf-8")
                    note = ""
                results.append(cell)
                for k in ("template_adherence", "grounding", "writing_quality"):
                    totals[which].setdefault(k, []).append(cell["scores"].get(k, 0))
                print(f"jd {jd['id']} / {t['name']} / {which}{note}: {cell['scores']}")

    out = config.DATA_DIR / "eval_results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{'criterion':<22}{'base':>8}{'tuned':>8}")
    for k in ("template_adherence", "grounding", "writing_quality"):
        b = sum(totals["base"][k]) / len(totals["base"][k])
        t = sum(totals["tuned"][k]) / len(totals["tuned"][k])
        print(f"{k:<22}{b:>8.2f}{t:>8.2f}")
    print(f"\nFull results: {out}")


if __name__ == "__main__":
    main()
