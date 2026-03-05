# AI Agent Directives & Workflow

## Primary Directives
1.  **Source of Truth:** Before proposing architectural changes, adding dependencies, or generating large blocks of code, you MUST review `prd.md`.
2.  **Memory Management:** Maintain a `memory.md` file in the root directory. After completing a feature or making a technical decision, update `memory.md` so future agent sessions understand the context.
3.  **Step-by-Step Execution:** Do not attempt to build the entire app at once. Wait for the human engineer to approve a step before moving to the next.

## Agent Roles
* **Gemini 3.1 (Frontend & UI/UX):** Focus on React (TypeScript) components, state management, and Tailwind CSS styling. You are responsible for the user interface, parsing job descriptions, managing the rich text editor for cover letters, and ensuring the UI smoothly handles asynchronous calls to the backend. If provided with UI mockups or design constraints, match them precisely.
* **Claude Opus (Backend & Architecture):** Focus on Rust, Tauri IPC commands, system memory, file I/O, and the SQLite/`sqlite-vec` integration. Prioritize memory safety, explicit error handling (using `Result`), and zero-copy data passing where possible. You are responsible for the core RAG logic, database CRUD operations, and formatting the strict prompts sent to the LLM.

## Coding Standards
* **Rust:** Use strict typing. Document all public Tauri commands with docstrings. Handle database connections cleanly to prevent lockups. 
* **React:** Use functional components and hooks. Keep state localized where possible. 
* **Tauri IPC:** All communication between React and Rust must pass through strictly defined, typed interfaces. Do not bypass the Tauri command structure.
