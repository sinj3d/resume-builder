# Resume Builder: Build, Run & Test Guide

This guide provides step-by-step instructions on how to run, build, and test the Resume Builder application locally on Windows.

## 1. Prerequisites
Ensure you have the following installed on your system:
- **Node.js**: (v18+) and npm
- **Rust**: Setup via `rustup` (with Windows MSVC toolchain)
- **Tauri Prerequisites**: 
  - Microsoft Visual Studio C++ Build Tools
  - Webview2 (Usually pre-installed on Windows 11)
- **CMake & LLVM**: Necessary for compiling `llama-cpp-2` locally (for the SLM). Make sure your `LIBCLANG_PATH` environment variable is set.

## 2. Installation
Clone the repository and install the Node frontend dependencies:
```bash
# From the project root
npm install
```

## 3. Running for Development
To launch the application in development mode with Hot-Module Replacement (HMR) for the frontend and auto-reloading for the Rust backend:
```bash
npm run tauri dev
```
*Note: Due to Rust dependencies (especially `llama.cpp` bindings and `tectonic`), the initial build may take several minutes. Subsequent builds will be much faster.*

## 4. Testing
The application uses automated tests primarily on the Rust backend. To run the test suite:
```bash
# Change directory to the Rust backend
cd src-tauri

# Run the test suite
cargo test
```
*These tests verify database functionality, embeddings pipeline (RAG), prompt formatting, and LaTeX compilation.* 

At this time, there are no specific frontend automated tests (Vitest/Jest). To verify the frontend locally, rely on TypeScript's compiler via `npm run build`.

## 5. Building for Production
To build the final optimized binary and installer (.exe / .msi) for distribution:
```bash
npm run tauri build
```
The compiled installers will be located in `src-tauri/target/release/bundle/`.
