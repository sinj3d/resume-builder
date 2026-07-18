"""Synthetic candidate profiles + the template pool.

The model must be a GENERIC drop-in: at inference the app's RAG retrieves the
real user's relevant bullets and drops them into the prompt. Training mimics
that by generating a varied fictional candidate per JD, then running the SAME
retrieval (top-k embedding similarity) over the profile's bullets — so the
model sees RAG-shaped inputs from many different "users" and never specializes
to one person.

Everything is teacher-generated and cached under data/cache/ (cache dirs are
scoped per teacher model, so switching models never reuses stale outputs).
`build_dataset.py` pre-fetches profiles in bulk via claude.batch_cached using
the prompt/cache-path helpers here; `get_profile` reads that cache, falling
back to a synchronous call (used by eval.py).
"""
import json
from pathlib import Path

import claude
import config

PROFILE_PROMPT = """Generate a fictional but realistic candidate profile for someone applying to this job posting.

JOB POSTING:
{jd}

FIT LEVEL: {fit}
- "strong": the candidate is well qualified for this posting.
- "partial": the candidate comes from an adjacent background and is clearly MISSING 1-2 of the posting's major requirements (do not cover them at all), while still being a plausible applicant.

Output ONLY JSON:
{{"name": "First Last", "experiences": [{{"title": "...", "org": "...", "bullets": ["..."]}}]}}

Rules:
- 3-5 experiences (jobs, internships, projects); fictional org names.
- 15-25 bullets total. Each bullet is ONE concrete resume accomplishment, written like a real resume bullet: action verb, specific technology/skill, a number or outcome where natural.
- Vary style between profiles; no markdown; plain strings only."""

SYNTH_TEMPLATES_PROMPT = """Generate {n} diverse cover letter TEMPLATES as a JSON array of {{"name": "...", "content": "..."}}.

A template is structural guidance a writer follows: salutation, paragraph-by-paragraph
instructions with [bracketed placeholders], sign-off, then explicit tone and length bounds.
Example shape:

Structure: <one-line summary>.

Dear [Hiring Manager],

Paragraph 1: <what it must do>

...

Sincerely,
[Name]

Tone: <tone>. Length: <bounds> words.

Make the {n} templates genuinely distinct from each other: vary paragraph counts,
tone (formal, warm, direct, bold, understated), length bounds (120-450 words),
ordering, and structural gimmicks (requirements-to-experience mapping, story-led,
metrics-first, company-mission-first, bullet-point middle, single-paragraph note).
Plain text contents, no markdown. Output ONLY the JSON array."""


def profile_prompt(jd: dict, fit: str) -> str:
    return PROFILE_PROMPT.format(jd=jd["text"], fit=fit)


def profile_cache_path(jd: dict, fit: str, variant: int) -> Path:
    return config.CACHE_DIR / f"profiles_{config.TEACHER_MODEL}" / f"jd{jd['id']}_{fit}_{variant}.json"


def get_profile(jd: dict, fit: str, variant: int) -> dict:
    """Cached fictional candidate for a JD (cache-miss falls back to a sync call)."""
    path = profile_cache_path(jd, fit, variant)
    if not path.exists():
        raw = claude.generate(profile_prompt(jd, fit), config.TEACHER_MODEL)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(raw, encoding="utf-8")
    return claude.parse_json(path.read_text(encoding="utf-8"))


def profile_bullets(profile: dict) -> list[str]:
    return [b for exp in profile.get("experiences", []) for b in exp.get("bullets", [])]


def _builtin_templates_from_source() -> list[dict]:
    """Fallback when the app DB isn't available/migrated yet: parse the builtin
    templates straight out of seed_templates.rs — plain (name, r#"..."#) pairs."""
    import re
    source = (config.REPO_ROOT / "src-tauri" / "src" / "db" / "seed_templates.rs")
    pairs = re.findall(r'\(\s*"([^"]+)",\s*r#"(.*?)"#\s*,?\s*\)',
                       source.read_text(encoding="utf-8"), re.DOTALL)
    return [{"name": n, "content": c.replace("\r\n", "\n")} for n, c in pairs]


def get_template_pool() -> list[dict]:
    """Builtin (+ any user) templates from the app DB — falling back to the
    seed_templates.rs source when the DB isn't migrated yet — extended with
    cached teacher-generated ones for template-generalization."""
    pool: list[dict] = []
    try:
        import db_reader
        pool.extend({"name": t["name"], "content": t["content"]}
                    for t in db_reader.load_templates())
    except Exception as e:
        print(f"  (app DB templates unavailable: {e})")
    if not pool:
        pool = _builtin_templates_from_source()
        print(f"  (using {len(pool)} builtin templates parsed from seed_templates.rs)")

    path = config.CACHE_DIR / f"synthetic_templates_{config.TEMPLATE_MODEL}.json"
    if path.exists():
        synth = json.loads(path.read_text(encoding="utf-8"))
    else:
        half = config.N_SYNTH_TEMPLATES // 2
        synth = []
        for n in (half, config.N_SYNTH_TEMPLATES - half):
            synth.extend(claude.generate_json(
                SYNTH_TEMPLATES_PROMPT.format(n=n), config.TEMPLATE_MODEL))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(synth, ensure_ascii=False, indent=1), encoding="utf-8")
    existing = {t["name"] for t in pool}
    pool.extend(t for t in synth if t.get("name") and t.get("content")
                and t["name"] not in existing)
    return pool
