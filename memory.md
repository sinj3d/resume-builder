# Memory – Resume & Cover Letter Manager

## Project Setup
- **Date:** 2026-03-05
- **Framework:** Tauri v2 scaffolded with `create-tauri-app` (React + TypeScript + Vite)
- **Note:** `--force` flag was needed because `prd.md` and `agents.md` already existed. They were recreated after scaffolding.

## Technical Decisions
1. **Dual-mode LLM:** App supports local GGUF (Phi-3 default) OR cloud API key (Gemini). Abstracted behind a `GenerationProvider` trait.
2. **Embeddings:** `ort` crate with `all-MiniLM-L6-v2` ONNX model (~80 MB, bundled). `tokenizers` crate for text tokenization.
3. **LaTeX:** `tectonic` crate for in-app compilation. First compile downloads ~100 MB of LaTeX packages (cached after).
4. **Frontend:** Overhauled UI with Tailwind CSS, glassmorphism, and structured multi-view sidebars.
5. **Database:** SQLite + `sqlite-vec` for vector KNN search.
6. **PDF Onboarding:** Used `pdf-extract` and `tauri-plugin-dialog` alongside Gemini Cloud API to automate initial resume entry into nested DB structures.

## Completed Phases
# Memory – Resume & Cover Letter Manager

## Project Setup
- **Date:** 2026-03-05
- **Framework:** Tauri v2 scaffolded with `create-tauri-app` (React + TypeScript + Vite)
- **Note:** `--force` flag was needed because `prd.md` and `agents.md` already existed. They were recreated after scaffolding.

## Technical Decisions
1. **Dual-mode LLM:** App supports local GGUF (Phi-3 default) OR cloud API key (Gemini). Abstracted behind a `GenerationProvider` trait.
2. **Embeddings:** `ort` crate with `all-MiniLM-L6-v2` ONNX model (~80 MB, bundled). `tokenizers` crate for text tokenization.
3. **LaTeX:** `tectonic` crate for in-app compilation. First compile downloads ~100 MB of LaTeX packages (cached after).
4. **Frontend:** Overhauled UI with Tailwind CSS, glassmorphism, and structured multi-view sidebars.
5. **Database:** SQLite + `sqlite-vec` for vector KNN search.
6. **PDF Onboarding:** Used `pdf-extract` and `tauri-plugin-dialog` alongside Gemini Cloud API to automate initial resume entry into nested DB structures.

## Completed Phases
- [x] Phase 0: Scaffolding (Tauri v2 + React/TS + Vite)
- [x] Phase 1: Database Layer (Rust)
- [x] Phase 2: RAG Pipeline (Rust)
- [x] Phase 3: Dual-Mode LLM (Rust)
- [x] Phase 4: LaTeX Engine (Rust)
- [x] Phase 5: Minimal Frontend (React/TS)
- [x] Phase 6: Polish Phase (Tailwind UI, Nested Bullets, Latex Injection, Archetype Tags, PDF Parsing Onboarding)
- [x] Phase 7: Resume Layout Enhancements
  - Category-based section grouping (Education, Professional Experience, Projects, etc.) — each category → own `\section*{}`
  - Drag-and-drop section ordering panel in `LatexPage.tsx` via `@hello-pangea/dnd`
  - Page length selector (1/2/3 pages) with dynamic `\titlespacing` / `\parskip` calibration
  - Font size guard: error returned if spacing would require <9pt font
  - Page numbers suppressed with `\pagestyle{empty}`
  - Category normalization: `normalize_category()` in `template.rs` maps `"Work"` → `"Professional Experience"` etc.
  - New Tauri command: `get_archetype_sections` (returns ordered canonical section headings for selected archetype)
- **Bugfixes:** 
  - Removed `CHECK` constraint on `experiences.category` to allow custom frontend categories.
  - Fixed Tauri IPC parameter names in frontend `tauri.ts` (`start_date` -> `startDate`, `end_date` -> `endDate`) to match Tauri's camelCase expectations.
  - Fixed malformed `\titleformat` calls (missing `{sep}{before-code}` args) that caused Tectonic to fail with `Paragraph ended before \ttl@format@ii`.
