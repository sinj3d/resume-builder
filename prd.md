# Product Requirements Document (PRD): Resume & Cover Letter Manager

## 1. Project Overview
A lightning-fast, locally hosted desktop application designed to manage a master repository of resume experiences, organize them into targeted professional archetypes, and use Retrieval-Augmented Generation (RAG) to dynamically draft highly tailored cover letters based on job descriptions. The app includes a built-in LaTeX engine for real-time resume compilation and PDF generation.

## 2. Architecture & Tech Stack
* **Application Framework:** Tauri (v2)
* **Frontend Layer:** React (TypeScript), Tailwind CSS, Vite.
* **Backend Layer:** Rust.
* **Database:** Local SQLite bundled with `sqlite-vec` for vector extensions. 
* **LaTeX Engine:** `tectonic` (Rust-based, self-contained LaTeX engine). Chosen because it compiles directly within the backend without requiring the user to install a massive TeX Live distribution.
* **AI / RAG Pipeline:**
    * *Embeddings:* Local inference via Rust (`ort` crate with `all-MiniLM-L6-v2`, `tokenizers` crate for text tokenization) to convert text to vectors.
    * *Generation:* Local SLM (e.g., Llama 3 8B or Phi-3) running via `llama.cpp` Rust bindings, fine-tuned or heavily prompted for cover letter synthesis.

## 3. Core Features
1.  **Master Database CRUD:** Ability to add, edit, and delete discrete resume entities (e.g., jobs, projects, hackathons).
2.  **Archetype Tagging:** Group specific bullet points into profiles (e.g., "General SWE", "Robotics/Embedded").
3.  **Semantic Retrieval (RAG):** The backend converts a pasted job description into a vector, querying the SQLite database for the most relevant resume bullet points within a chosen archetype.
4.  **Local Cover Letter Generation:** The backend constructs a strict prompt containing the retrieved bullet points and sends it to the local SLM to generate the letter.
5.  **In-App LaTeX Editor & Compiler:** * A split-pane code editor in the UI. 
    * The backend dynamically injects retrieved/selected bullet points into a `.tex` file.
    * The `tectonic` engine compiles the document to PDF in milliseconds and renders it in the frontend viewer.

## 4. Default LaTeX Template
The system will ship with a default, highly readable single-page template utilizing the `article` class. It includes pre-configured packages for optimal spacing (`geometry`, `titlesec`, `enumitem`) and uses a custom Maroon accent color (`\definecolor{maroon}{RGB}{128, 0, 0}`) for section headers to ensure ATS-friendly parsing while maintaining visual distinction.

## 5. System Constraints
* **Zero Hallucination Policy:** The SLM must *only* use experiences retrieved from the local database. 
* **Performance:** The UI must remain entirely responsive during local vector embedding, SLM generation, and LaTeX compilation.
