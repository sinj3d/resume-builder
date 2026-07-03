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
- **Cover letters** — RAG-grounded generation via a local GGUF model or, optionally,
  the Gemini cloud API.

## Local-first & privacy

Everything that touches your resume content runs on-device:

| Capability            | How it runs                                                        |
| --------------------- | ------------------------------------------------------------------ |
| Storage               | Local SQLite in the app-data directory                             |
| Bullet embeddings     | Bundled ONNX model (all-MiniLM-L6-v2)                              |
| **Resume PDF import** | **Local specialized parser model, auto-downloaded on first use**   |
| PDF preview           | Self-hosted pdf.js worker (bundled — no CDN)                        |
| LaTeX compile         | Tectonic binary, auto-downloaded on first use                      |
| Cover letters         | Local GGUF by default; Gemini cloud is opt-in                      |

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

Backend unit + integration tests (DB, RAG, LaTeX injection, and the resume parser's
prompt/JSON-recovery logic):

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
  pages/                 Experiences, Archetypes, Generate, Latex, Bio, Onboarding, Settings
  lib/tauri.ts           Typed wrappers over Tauri commands
src-tauri/src/
  db/                    SQLite schema, models, CRUD commands
  rag/                   ONNX embedding model + vector search
  llm/                   Cover letters, settings, and the local resume parser
  latex/                 Templates, injection, Tectonic download & compile
```

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) +
  [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
  [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
