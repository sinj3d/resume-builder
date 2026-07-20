# Resume Builder

A local-first desktop app for managing tailored resumes and cover letters. You
maintain one master pool of experiences, bullet points, and skills, tag them into
role-specific **archetypes**, and generate a polished LaTeX resume PDF (plus AI
cover letters) for each archetype — all on your own machine.

Built with **Tauri 2** (Rust backend) + **React 19 / TypeScript / Vite / Tailwind**.

## Highlights

- **Master content pool** — experiences → bullet points, skills, and biographical
  info, stored locally in SQLite.
- **Archetypes** — tag any bullet, experience, or skill into role profiles
  (e.g. "General SWE", "ML Engineer") and generate a resume per profile.
- **Semantic retrieval (RAG)** — every bullet is embedded on-device
  (all-MiniLM-L6-v2 ONNX, 384-dim) into a `sqlite-vec` table for similarity search.
- **LaTeX generation** — inject an archetype's content into one of three templates
  with page-length-aware spacing, compile with **Tectonic**, preview the PDF, and
  export.
- **Offline resume import** — parse an existing PDF resume into structured
  experiences using a **specialized local model** that downloads once and then runs
  fully offline (no cloud, no API key). See below.
- **Cover letters** — RAG-grounded, zero-hallucination generation via a local GGUF
  model (a **purpose-fine-tuned model** ships from this repo's pipeline — see below)
  or, optionally, the Gemini cloud API.
- **Cover letter templates** — pick a structural template (T-format, narrative,
  problem–solution, …) or write your own on the Templates page; the generator
  follows its structure, length, and tone. Seven builtins are seeded on first run.
- **Fine-tuning pipeline** — [`training/`](training/README.md) builds a generic,
  drop-in cover-letter model: real scraped job postings, teacher-distilled letters
  (Claude via the Batch API), QLoRA on Qwen2.5-3B, exported to a ~1.8 GB GGUF that
  runs on 8 GB machines.

## Local-first & privacy

Everything that touches your resume content runs on-device:

| Capability            | How it runs                                                        |
| --------------------- | ------------------------------------------------------------------ |
| Storage               | Local SQLite in the app-data directory                             |
| Bullet embeddings     | Bundled ONNX model (all-MiniLM-L6-v2)                              |
| **Resume PDF import** | **Local specialized parser model, auto-downloaded on first use**   |
| PDF preview           | Self-hosted pdf.js worker (bundled — no CDN)                        |
| LaTeX compile         | Tectonic binary, auto-downloaded on first use                      |
| Cover letters         | Local fine-tuned GGUF by default; Gemini cloud is opt-in           |

The only network calls are one-time downloads (the Tectonic binary and the parser
model) and — only if you explicitly choose cloud mode — cover-letter generation.

### The specialized resume parser

Resume import is **local-only**. On the first import the app downloads a small
instruct model (Qwen2.5-1.5B-Instruct, Q4_K_M GGUF, ~1 GB) into the app-data
directory, then runs it on-device to turn resume text into a strict
`{ "experiences": [...] }` JSON payload. The model output is recovered and
validated in Rust (markdown fences, stray prose, and trailing commas are handled),
so the frontend always receives clean JSON. Cover-letter generation can still use
the cloud if you opt in via Settings, but parsing never does.

Relevant code:

- [`src-tauri/src/llm/parse.rs`](src-tauri/src/llm/parse.rs) — parser prompt + JSON recovery/validation
- [`src-tauri/src/llm/model.rs`](src-tauri/src/llm/model.rs) — parser-model auto-download
- [`src-tauri/src/llm/commands.rs`](src-tauri/src/llm/commands.rs) — `extract_resume_pdf` (local-only)

### Template-conditioned cover letters & the fine-tuned model

Cover letter generation is **template-conditioned**: the prompt carries the
selected template's structure alongside the RAG-retrieved bullets and the job
description, under a strict zero-hallucination policy (the model may only use
the experiences it is given). Templates are plain text managed on the Templates
page — adding a new one changes output immediately, no retraining.

The [`training/`](training/README.md) pipeline produces a small local model
specialized for exactly this prompt. It is a **generic, drop-in artifact** — no
user data is involved in training:

1. Real job postings are scraped from public job-board APIs (RemoteOK,
   Greenhouse, Lever).
2. A teacher model (Claude, via the Message Batches API) writes gold letters
   for fictional candidate profiles whose bullets pass through the **same
   embedding retrieval the app uses**, so training inputs match inference
   exactly. Every letter passes mechanical quality filters plus an LLM
   fabrication check.
3. QLoRA fine-tunes Qwen2.5-3B-Instruct, which is merged and quantized to a
   **Q4_K_M GGUF (~1.8 GB)** that generates a letter in ~30 s on CPU.

The prompt format is a byte-level contract between the app and the pipeline:
[`llm/prompt.rs`](src-tauri/src/llm/prompt.rs) and
[`training/prompt_builder.py`](training/prompt_builder.py) are both asserted
against shared golden files (`cargo test golden` /
`python prompt_builder.py --selftest`), because a drifted training prompt
silently degrades the model. Local generation feeds the GGUF's own embedded
chat template, matching how the model was trained.

Point **Settings → Local (GGUF)** at any tuned model file to use it; any other
Qwen-style instruct GGUF also works untuned.

## Download & install

Prebuilt installers for every release are on the
[Releases page](https://github.com/sinj3d/resume-builder/releases). Builds are
currently **unsigned**, so each OS shows a one-time warning:

- **Windows** — download the `.msi` or `-setup.exe`. If SmartScreen warns, click
  **More info → Run anyway**.
- **macOS** — download the `.dmg` (Apple Silicon / M1 or later; for Intel Macs
  build from source). The app is not notarized: on first launch approve it under
  **System Settings → Privacy & Security → Open Anyway**, or run
  `xattr -cr /Applications/resume-builder.app`.
- **Linux** — download the `.AppImage` (then `chmod +x` it), or install the
  `.deb` (`sudo apt install ./resume-builder_*.deb`) / `.rpm`
  (`sudo dnf install ./resume-builder-*.rpm`).

Maintainers: see [docs/RELEASING.md](docs/RELEASING.md) for how releases are cut.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable toolchain)
- **CMake** — required to build the bundled local-LLM engine (`llama-cpp-2`)
- Platform build dependencies for Tauri 2 — see the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Install & run

```bash
npm install
npm run tauri dev      # launch the desktop app in development
```

### Build a release bundle

```bash
npm run tauri build
```

## Testing

Backend unit + integration tests (DB, RAG, LaTeX injection, the resume parser's
prompt/JSON-recovery logic, and the cover-letter prompt golden files that keep
the app and the training pipeline byte-identical):

```bash
cd src-tauri
cargo test
```

The pure parser logic (prompt building, JSON extraction) is testable without the
model present:

```bash
cd src-tauri
cargo test --no-default-features llm::parse   # skips building the local-LLM engine
```

## Cargo features

- `local-llm` (default) — builds the `llama-cpp-2` engine for local generation and
  resume parsing. Requires CMake. Build with `--no-default-features` to skip it
  (resume import and local cover letters will then return a "not enabled" error).

## Project layout

```
src/                     React frontend
  pages/                 Experiences, Archetypes, Generate, Templates, Latex, Bio,
                         Onboarding, Settings
  lib/tauri.ts           Typed wrappers over Tauri commands
src-tauri/src/
  db/                    SQLite schema, models, CRUD commands, builtin template seeds
  rag/                   ONNX embedding model + vector search
  llm/                   Cover letters, settings, local resume parser, prompt golden files
  latex/                 Templates, injection, Tectonic download & compile
training/                Fine-tuning pipeline (scrape → distill → QLoRA → GGUF);
                         see training/README.md
```

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) +
  [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
  [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
