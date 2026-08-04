# Cover Letter Model Fine-Tuning Pipeline

Fine-tunes a 3B local model to write cover letters in this app's exact prompt
format, **conditioned on the cover-letter template in the prompt** — so a
template a user writes today works without retraining. Trained end-to-end here:
scrape real job postings → synthesize candidates → distill from a teacher model →
LoRA → GGUF → quantize → judged eval. The ~1.8 GB result runs on CPU inside the
desktop app, offline.

**Headline result:** against an identically-quantized stock base, the tuned model
**halves fabricated claims (98 → 46)** and lifts template adherence **1.85 → 3.28
of 5** across 120 held-out letters.

## Results

Held-out split: **20 real scraped JDs × 3 templates × 2 models = 120 letters**.
Both models get byte-identical prompts at `--temp 0`; each letter is scored 1–5
by `claude-sonnet-5`. The base is stock Qwen2.5-3B-Instruct pushed through the
*same* convert+quantize path as the tuned model, so the delta isolates the
fine-tune rather than quantization noise.

| Criterion | Base | Tuned | Δ | Win/Tie/Loss | Sign test |
|---|---|---|---|---|---|
| template_adherence | 1.85 | **3.28** | +1.43 | 52 / 5 / 3 | p = 1.5e-12 |
| grounding | 3.05 | **4.12** | +1.07 | 42 / 12 / 6 | p = 1.0e-07 |
| writing_quality | 3.03 | **3.73** | +0.70 | 41 / 15 / 4 | p = 9.3e-09 |

Fabrication is the metric that matters most for a tool that writes about
someone's real career:

| | Base | Tuned |
|---|---|---|
| Letters with zero fabricated claims | 10/60 (17%) | **31/60 (52%)** |
| Total fabricated claims | 98 | **46** |
| Perfect grounding (5/5) | 10/60 | **29/60** |
| `template_adherence` ≥ 4 | 1/60 | **18/60** |

**The base model scores `template_adherence` ≥ 4 on 1 of 60 letters.**
Template-following is the capability the fine-tune buys; the stock model
essentially ignores a supplied template no matter how the prompt is worded.

Gains hold on all three templates, and the ordering is informative: the base does
best on Problem-Solution because that's the shape it defaults to anyway, and
worst on Career Change, the least conventional structure.

| Template | Base | Tuned | Δ |
|---|---|---|---|
| Career Change | 2.35 | 3.75 | +1.40 |
| Narrative / Storytelling | 2.60 | 3.58 | +0.98 |
| Problem-Solution | 2.98 | 3.80 | +0.82 |

### How to read these numbers

- **The judge is `claude-sonnet-5`, the same model that wrote the training
  letters**, so it rewards its own house style — `template_adherence` and
  `writing_quality` are inflated by an unknown amount. `grounding` is the
  defensible one: it's checkable against the bullet list rather than taste.
- **Effective N is closer to 20 than 60.** The three templates within a JD share
  one profile and bullet set, so cells are correlated and the p-values are
  optimistic. The effect sizes are large enough that this doesn't change the
  conclusion.
- The judge occasionally counts an honest *"I have not yet worked directly
  with…"* gap acknowledgment as a fabrication (14 of base's 98 flagged quotes, 5
  of tuned's 46). Excluding them: 84 vs 41 — still a ~51% reduction.

Reproduce with step 6 below; raw per-letter output lands in
`data/eval_results.json`.

## Why the artifact is shareable

Training never touches a real user's data, so the quantized GGUF is a generic
drop-in that any user can point the app at:

- **Job descriptions are real, scraped** from public job-board APIs (RemoteOK,
  Greenhouse, Lever).
- **Candidates are fictional**: a teacher model generates a varied candidate
  profile per posting (some deliberately partial-fit, so the model learns honest
  gap acknowledgment), and the same embedding retrieval the app uses picks the
  top-k bullets — training inputs have exactly the shape the app's RAG produces
  at inference.
- At inference the app's RAG drops in the *actual* user's relevant experiences;
  because the model saw hundreds of different "users" in training, it generalizes
  instead of memorizing one person.

This directory is developer tooling — never part of the app build.

---

## Prerequisites

- Windows with an NVIDIA GPU (16 GB VRAM for the default 3B model), CUDA driver installed.
- Python 3.10+.
- An **Anthropic API key** (teacher + verifier calls). API access is pay-as-you-go
  via [platform.claude.com](https://platform.claude.com) — a claude.ai Pro
  subscription does NOT include API credits.
- Optional: the app installed and launched once — its builtin (and your custom)
  templates then join the training template pool.

**API key handling** — the key is never committed: copy `.env.example` to
`training/.env` (gitignored, along with all `data/` outputs) and fill it in,
or set the `ANTHROPIC_API_KEY` environment variable. Nothing in this pipeline
writes the key to disk or into the dataset.

```powershell
cd training
Copy-Item .env.example .env   # then paste your key into .env
python -m venv .venv
.venv\Scripts\Activate.ps1
# cu128 required for RTX 50-series (Blackwell); cu126 works for RTX 30/40
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

## Run order

```powershell
# 0. Sanity: the Python prompt builder matches the Rust one byte-for-byte
python prompt_builder.py --selftest

# 1. Scrape ~200 real job postings (public APIs, cached; dead board slugs skip)
python scrape_jds.py

# 2. Build the dataset (~650 kept examples). Teacher calls run as three
#    Anthropic Message Batches (profiles -> letters -> verification) at 50%
#    off; each batch usually completes within the hour and the script polls
#    until done. Everything is cached+resumable — rerun after any interruption.
python build_dataset.py
#    -> SPOT-CHECK ~10 rows of data/train.jsonl before training:
#       template followed? no fabricated skills? partial-fit acknowledged honestly?

# 3. Smoke-train (5 steps — catches bitsandbytes/CUDA issues in ~2 min), then train (<2 h)
python train.py --smoke
python train.py

# 4. Merge LoRA into the base model
python merge_and_convert.py

# 5. Convert to GGUF + quantize (llama.cpp tooling)
git clone --depth 1 https://github.com/ggml-org/llama.cpp
pip install -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt
python llama.cpp/convert_hf_to_gguf.py out/merged --outfile out/coverletter-f16.gguf --outtype f16
# download llama-bXXXX-bin-win-cpu-x64.zip from https://github.com/ggml-org/llama.cpp/releases
llama-quantize.exe out\coverletter-f16.gguf out\coverletter-Q4_K_M.gguf Q4_K_M

# 6. Evaluate base vs tuned on the held-out real JDs (llama-completion.exe from the same zip).
#    Must be llama-completion.exe: since b10066 llama-cli ignores -no-cnv, drops into
#    chat mode and blocks forever on empty stdin. Needs a base GGUF to compare against —
#    quantize one from the stock Qwen2.5-3B-Instruct with the same step 5 commands.
#    ~40s/letter x 120 letters on CPU; each cell is cached, so reruns are free.
python eval.py --llama-cli <path>\llama-completion.exe --base out\base-qwen2.5-3b-Q4_K_M.gguf --tuned out\coverletter-Q4_K_M.gguf
```

Finally: in the app, **Settings → Local (GGUF)** → paste the path to
`out\coverletter-Q4_K_M.gguf` (works the same on any other user's machine).
Test with a brand-new template on the Templates page — template-conditioning
should generalize to templates never seen in training.

**Shipping it to users:** upload the quantized GGUF to a HuggingFace repo, then
set `COVERLETTER_MODEL_URL` in `src-tauri/src/llm/model.rs` to its
`resolve/main/…gguf` link. Settings → Local (GGUF) then shows a **Download the
tuned cover-letter model** button that fetches it into app-data and fills in the
path automatically — users never have to find or paste a file path.

## The prompt-parity contract

The app builds prompts in `src-tauri/src/llm/prompt.rs`; this pipeline mirrors
it in `prompt_builder.py`. Both are asserted byte-for-byte against the golden
files in `src-tauri/src/llm/golden/` (Rust: `cargo test golden`; Python:
`--selftest`). **If you change the prompt on either side**, update the mirror
and regenerate goldens with `REGEN_GOLDEN=1 cargo test golden` — training on a
drifted prompt silently degrades the model.

## Model / size notes

- The app runs GGUFs on **CPU** via llama.cpp: the 3B Q4_K_M (~1.8 GB file,
  ~3 GB RSS) fits 8 GB-RAM machines, generating a letter in roughly 1–2 min.
- Qwen2.5-3B-Instruct uses the Qwen **Research** license (non-commercial). For
  Apache-2.0 (required if you distribute the tuned model broadly) or ~2x faster
  CPU inference, set `BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"` in `config.py`
  and rerun from step 3.
- Cost: roughly 1,800 teacher/verifier calls for the dataset build. With the
  default `claude-sonnet-5` teacher (intro pricing $2/$10 per MTok through
  2026-08-31) via the Batch API (50% off), expect on the order of **$8**;
  results are cached under `data/cache/` (scoped per model), so reruns are
  free/resumable. Knobs in `config.py`: `claude-opus-4-8` as teacher for
  max letter quality (~$20 — the teacher is the ceiling of what the student
  learns), or `VERIFIER_MODEL = "claude-haiku-4-5"` to cut cost (it only
  answers YES/NO).
- Scraping etiquette: one bulk JSON request per board with caching — a handful
  of requests total. Board slugs rot; edit `GREENHOUSE_SLUGS` / `LEVER_SLUGS`
  in `config.py` if `scrape_jds.py` reports too few postings.

## Troubleshooting

- **bitsandbytes can't find CUDA** (smoke run fails): make sure torch was
  installed from the cu126 index and `python -c "import torch;
  print(torch.cuda.is_available())"` prints True. If bitsandbytes still fails,
  fall back to WSL2 (Ubuntu + CUDA toolkit) where `pip install unsloth` also
  works and trains faster; the dataset JSONL files are portable as-is.
- **OOM during training**: drop `per_device_train_batch_size` to 1 (raise
  `gradient_accumulation_steps` to 16), or switch to the 1.5B base.
- **Letters ignore the template after tuning**: inspect `data/train.jsonl` —
  the teacher may have been sloppy; tighten `passes_filters` or raise
  `EXAMPLES_PER_JD` and retrain.
- **Too few scraped JDs**: add board slugs in `config.py`, or relax
  `JD_MAX_WORDS` (watch `MAX_SEQ_LEN` — over-length examples are dropped at
  training time).
