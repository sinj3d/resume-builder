"""Shared configuration for the cover-letter fine-tuning pipeline.

This pipeline is developer tooling, run manually — it is never part of the app
build. It produces a GENERIC, drop-in model: training uses real scraped job
descriptions and synthetic candidate profiles (mimicking what the app's RAG
retrieves at inference), never one user's personal data, so the resulting GGUF
works for any user without retraining. The app's SQLite DB is only read for
cover letter templates (optional).
"""
import os
from pathlib import Path

APP_IDENTIFIER = "com.sjin2.resume-builder"

TRAINING_DIR = Path(__file__).resolve().parent
REPO_ROOT = TRAINING_DIR.parent
GOLDEN_DIR = REPO_ROOT / "src-tauri" / "src" / "llm" / "golden"
DATA_DIR = TRAINING_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
OUT_DIR = TRAINING_DIR / "out"


def _default_db_path() -> Path:
    return Path(os.environ["APPDATA"]) / APP_IDENTIFIER / "resume_builder.db"


# Override with RESUME_DB=<path> (e.g. to train against a copy of the DB).
DB_PATH = Path(os.environ["RESUME_DB"]) if os.environ.get("RESUME_DB") else _default_db_path()


def _load_dotenv() -> None:
    """Load training/.env (gitignored) into the environment. Existing env vars win."""
    env_file = TRAINING_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_dotenv()

# Teacher/verifier: Anthropic API (see claude.py). Sonnet 5 has intro pricing
# ($2/$10 per MTok through 2026-08-31) and strong writing; "claude-opus-4-8"
# is the max-quality option. The verifier only answers a YES/NO fabrication
# check — "claude-haiku-4-5" also works there to cut cost further.
TEACHER_MODEL = "claude-sonnet-5"
VERIFIER_MODEL = "claude-sonnet-5"
# The template pool is tiny (2 calls) but shapes every training example —
# generated with Opus for maximum quality/diversity.
TEMPLATE_MODEL = "claude-opus-4-8"

# Student. Qwen2.5-3B-Instruct uses the Qwen *Research* license (non-commercial);
# fine for a personal tool. Swap to "Qwen/Qwen2.5-1.5B-Instruct" (Apache-2.0,
# ~2x faster on CPU) if license or speed matters.
BASE_MODEL = "Qwen/Qwen2.5-3B-Instruct"

# Must match the app's embedding model (src-tauri/resources/model, see rag/mod.rs).
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# ── JD scraping (real postings from public job-board APIs) ──
N_JDS_TARGET = 200       # stop once this many usable postings are collected
N_EVAL_JDS = 20          # reserved out of the pool above; never trained on
JD_MIN_WORDS = 120
JD_MAX_WORDS = 700       # keeps prompt + letter within MAX_SEQ_LEN

# Greenhouse/Lever board slugs to pull from (public JSON endpoints; dead slugs
# are skipped gracefully — rot is expected, add/remove freely).
GREENHOUSE_SLUGS = [
    "stripe", "airbnb", "gitlab", "cloudflare", "databricks", "figma",
    "discord", "coinbase", "doordash", "dropbox", "duolingo", "elastic",
    "instacart", "reddit", "robinhood", "twilio", "vercel", "anthropic",
    "pinterest", "flexport", "samsara", "gusto", "benchling", "checkr",
]
LEVER_SLUGS = [
    "netflix", "plaid", "ramp", "attentive", "scaleai", "palantir",
    "kraken", "voleon", "mistral", "zoox",
]

# ── Dataset shape ──
EXAMPLES_PER_JD = 4
PROFILES_PER_JD = 2      # synthetic candidate profiles per JD (see profiles.py)
PARTIAL_FIT_EXAMPLES_PER_JD = 1   # of EXAMPLES_PER_JD, use the partial-fit profile
NO_TEMPLATE_FRACTION = 0.15
NO_NAME_FRACTION = 0.2   # train the no-candidate-name prompt variant too
N_SYNTH_TEMPLATES = 20   # teacher-generated extra templates for generalization
VAL_FRACTION = 0.05
MAX_SEQ_LEN = 3072
SEED = 20260716


