"""Base-vs-tuned evaluation on the held-out (real, scraped) JD split.

Each eval JD gets a fictional strong-fit candidate profile (cached, never seen
in training since eval JDs are held out), retrieval runs over its bullets like
the app's RAG, and both GGUFs write letters via llama-cli.exe (temp 0, same
manual ChatML the app falls back to). The teacher then scores each letter on a
rubric.

Usage:
    python eval.py --llama-cli <path\\to\\llama-cli.exe> --base <base.gguf> --tuned <tuned.gguf>
"""
import argparse
import json
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
            capture_output=True, text=True, encoding="utf-8", timeout=1200)
        if out.returncode != 0:
            raise RuntimeError(f"llama-cli failed: {out.stderr[-500:]}")
        return out.stdout.strip()
    finally:
        Path(prompt_file).unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--llama-cli", required=True)
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
                letter = run_gguf(args.llama_cli, gguf, prompt)
                scores = generate_json(
                    RUBRIC_PROMPT.format(bullets=numbered, template=t["content"],
                                         jd=jd["text"], letter=letter),
                    config.VERIFIER_MODEL)
                results.append({"jd_id": jd["id"], "template": t["name"],
                                "model": which, "scores": scores, "letter": letter})
                for k in ("template_adherence", "grounding", "writing_quality"):
                    totals[which].setdefault(k, []).append(scores.get(k, 0))
                print(f"jd {jd['id']} / {t['name']} / {which}: {scores}")

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
