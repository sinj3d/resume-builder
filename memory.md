# Memory – Resume & Cover Letter Manager

## Project Setup
- **Date:** 2026-03-05
- **Framework:** Tauri v2 scaffolded with `create-tauri-app` (React + TypeScript + Vite)
- **Note:** `--force` flag was needed because `prd.md` and `agents.md` already existed. They were recreated after scaffolding.

## Technical Decisions
1. **Dual-mode LLM:** App supports local GGUF (Phi-3 default) OR cloud API key (Gemini). Abstracted behind a `GenerationProvider` trait.
2. **Embeddings:** `ort` crate with `all-MiniLM-L6-v2` ONNX model (~80 MB, bundled). `tokenizers` crate for text tokenization.
3. **LaTeX:** `tectonic` crate for in-app compilation. First compile downloads ~100 MB of LaTeX packages (cached after).
4. **Frontend:** Minimal functional wiring only — UI design deferred to separate session/agent.
5. **Database:** SQLite + `sqlite-vec` for vector KNN search.

## Completed Phases
- [x] Phase 0: Scaffolding (Tauri v2 + React/TS + Vite)
