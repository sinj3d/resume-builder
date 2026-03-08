# Resume & Cover Letter Manager – Implementation Plan (v3)

A Tauri v2 desktop app that manages resume experiences, organizes them by archetype, and uses RAG + dual-mode LLM (local GGUF or cloud API) for cover letter generation. Includes a built-in LaTeX engine for real-time resume compilation.

## User Review Required

All open questions from v2 have been resolved:
- **SLM:** Phi-3 as default. App supports dual-mode: local GGUF file **or** cloud API key.
- **ONNX model:** Bundled (~80 MB). Acceptable.
- **Tectonic first-run download:** ~100 MB on first compile, cached after. Progress indicator will be shown.

---

## Proposed Changes

### Phase 0 — Project Scaffolding

#### [NEW] Tauri v2 project (repo root)

Scaffold via `npx create-tauri-app@latest` with React + TypeScript + Vite.

| Generated Path | Purpose |
|---|---|
| `src/` | React frontend |
| `src-tauri/` | Rust backend |
| `src-tauri/Cargo.toml` | Rust deps |
| `package.json` | Node deps |

#### [NEW] `memory.md`

Per `agents.md` — living document updated after each feature/decision.

---

### Phase 1 — Database Layer (Rust)

#### [MODIFY] [Cargo.toml](file:///c:/Users/sjin2/Documents/GitHub/resume-builder/src-tauri/Cargo.toml)

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
sqlite-vec = "0.1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

#### [NEW] `src-tauri/src/db/mod.rs`

Connection init, `sqlite-vec` extension loading, migrations. Schema:

```sql
-- Experiences (jobs, projects, hackathons, education)
CREATE TABLE experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, org TEXT, start_date TEXT, end_date TEXT,
  category TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);

-- Individual bullet points per experience
CREATE TABLE bullet_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experience_id INTEGER NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  content TEXT NOT NULL, sort_order INTEGER DEFAULT 0
);

-- Professional archetypes ("General SWE", "Robotics", etc.)
CREATE TABLE archetypes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE
);

-- Many-to-many: which bullets belong to which archetypes
CREATE TABLE archetype_bullets (
  archetype_id INTEGER REFERENCES archetypes(id) ON DELETE CASCADE,
  bullet_point_id INTEGER REFERENCES bullet_points(id) ON DELETE CASCADE,
  PRIMARY KEY (archetype_id, bullet_point_id)
);

-- Vector storage for semantic search
CREATE VIRTUAL TABLE bullet_embeddings USING vec0(
  bullet_id INTEGER PRIMARY KEY, embedding FLOAT[384]
);
```

#### [NEW] `src-tauri/src/db/commands.rs`

Tauri `#[command]` functions: `create_experience`, `list_experiences`, `update_experience`, `delete_experience`, `create_bullet`, `update_bullet`, `delete_bullet`, `create_archetype`, `tag_bullet`, `untag_bullet`, `get_archetype_bullets`. All accept `State<Mutex<Connection>>`.

---

### Phase 2 — RAG Pipeline (Rust)

#### [MODIFY] [Cargo.toml](file:///c:/Users/sjin2/Documents/GitHub/resume-builder/src-tauri/Cargo.toml)

```toml
ort = { version = "2", features = ["download-binaries"] }
tokenizers = "0.19"
ndarray = "0.15"
```

#### [NEW] `src-tauri/resources/model/`

Bundle `all-MiniLM-L6-v2` ONNX model + `tokenizer.json` (~80 MB total).

#### [NEW] `src-tauri/src/rag/mod.rs`

- `EmbeddingModel` struct — loads ONNX model + tokenizer once at startup, held in `tauri::State`.
- `embed(text) → Vec<f32>` — tokenize → ONNX session → mean-pool → L2-normalize → 384-d vector.
- Auto-embed on bullet create/update → `INSERT OR REPLACE INTO bullet_embeddings`.

#### [NEW] `src-tauri/src/rag/commands.rs`

`search_similar(job_description, archetype_id, top_k) → Vec<ScoredBullet>` — embed JD → KNN query filtered by archetype → ranked results.

---

### Phase 3 — Dual-Mode LLM (Rust)

#### [MODIFY] [Cargo.toml](file:///c:/Users/sjin2/Documents/GitHub/resume-builder/src-tauri/Cargo.toml)

```toml
llama-cpp-2 = "0.1"
reqwest = { version = "0.12", features = ["json"] }
```

#### [NEW] `src-tauri/src/llm/mod.rs`

- `GenerationProvider` trait — `async fn generate(prompt: &str) → Result<String>`.
- `LocalProvider` — loads a user-specified GGUF file (Phi-3 default) via `llama-cpp-2`.
- `CloudProvider` — sends prompt to cloud API (Gemini) via `reqwest` using a user-provided API key.
- Active provider selected from persisted settings.

#### [NEW] `src-tauri/src/llm/prompt.rs`

Strict prompt template enforcing the zero-hallucination policy:

```text
System: You are a professional cover letter writer.
You MUST ONLY use the experiences listed below. Do NOT invent any skills
or employment history. If the job requires unlisted experience, state that
explicitly.

=== USER'S RELEVANT EXPERIENCES ===
{retrieved_bullets}

=== TARGET JOB DESCRIPTION ===
{job_description}

Write a compelling, personalized cover letter.
```

#### [NEW] `src-tauri/src/llm/commands.rs`

| Command | Purpose |
|---|---|
| `generate_cover_letter(jd, archetype_id, top_k)` | RAG → prompt → active provider → return text |
| `get_llm_settings()` | Return current provider mode, model path, API key (masked) |
| `update_llm_settings(mode, path?, key?)` | Persist provider choice |

---

### Phase 4 — LaTeX Engine (Rust)

#### [MODIFY] [Cargo.toml](file:///c:/Users/sjin2/Documents/GitHub/resume-builder/src-tauri/Cargo.toml)

```toml
tectonic = "0.15"
```

#### [NEW] `src-tauri/src/latex/mod.rs`

- `compile_latex(tex_source: &str) → Result<Vec<u8>>` — calls `tectonic::latex_to_pdf()`, returns PDF bytes.
- Note: `tectonic` is not thread-safe (global mutex internally), so calls are serialized.

#### [NEW] `src-tauri/src/latex/template.rs`

- Default LaTeX template (ATS-friendly `article` class, `geometry`/`titlesec`/`enumitem` packages, Maroon accent `\definecolor{maroon}{RGB}{128,0,0}`).
- `inject_bullets(template, bullets) → String` — merges selected bullet points into the template's `\begin{itemize}` sections.

#### [NEW] `src-tauri/src/latex/commands.rs`

| Command | Purpose |
|---|---|
| `compile_tex(source: String) → Vec<u8>` | Compile arbitrary LaTeX → PDF bytes |
| `get_default_template() → String` | Return the bundled template |
| `inject_and_compile(archetype_id, bullet_ids) → Vec<u8>` | Inject selected bullets into template → compile → return PDF |

---

### Phase 5 — Minimal Frontend (React/TS)

> [!NOTE]
> UI design and polish are deferred to a separate session/agent. This phase builds only the minimal functional wiring needed to exercise the backend.

#### [MODIFY] [package.json](file:///c:/Users/sjin2/Documents/GitHub/resume-builder/package.json)

Dependencies: `@tauri-apps/api`, `react-pdf`, `@monaco-editor/react`.

#### [NEW] `src/lib/tauri.ts` — Typed `invoke()` wrappers.

#### Minimal Pages/Components
| Component | Scope |
|---|---|
| `Layout.tsx` | Basic sidebar nav + content area (unstyled) |
| `ExperiencesPage.tsx` | List + simple form for CRUD |
| `ArchetypesPage.tsx` | List + tag/untag checkboxes |
| `GeneratePage.tsx` | JD textarea, archetype dropdown, generate button, output display |
| `LatexPage.tsx` | Monaco editor + "Compile" button + PDF iframe/viewer |
| `SettingsPage.tsx` | LLM mode toggle (local/cloud), GGUF path, API key input |

---

### Phase 6 — Integration Testing

- End-to-end flow: add experience → generate letter → compile LaTeX → export PDF.
- Loading indicator for SLM inference and tectonic first-run.
- Error handling for missing GGUF model, invalid API key, empty DB, LaTeX compilation errors.

---

## Verification Plan

### Automated Tests

**Rust (`cargo test` in `src-tauri/`):**
- DB migrations apply cleanly; CRUD operations are correct.
- Embedding module outputs 384-d normalized vector.
- KNN search returns expected top-k against fixtures.
- Prompt builder matches expected template.
- `tectonic::latex_to_pdf` compiles the default template successfully.

**Frontend (`npm test`):**
- Component rendering and form submission payloads via Vitest + React Testing Library.

### Manual Verification
1. Add experience → verify in list.
2. Create archetype, tag bullets → verify archetype view.
3. Paste JD → generate cover letter → verify it uses only your bullet points.
4. Open LaTeX editor → compile default template → verify PDF renders.
5. Inject bullets into template → recompile → verify updated PDF.
6. Verify UI stays responsive during SLM generation (sidebar, scrolling still work).
