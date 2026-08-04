import { invoke, Channel } from '@tauri-apps/api/core';

export interface Experience {
  id: number;
  title: string;
  org: string;
  start_date: string;
  end_date: string;
  category: string;
  link?: string;
  created_at?: string;
}

export interface Bio {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
}

export interface BulletPoint {
  id: number;
  experience_id: number;
  content: string;
  sort_order: number;
}

export interface Archetype {
  id: number;
  name: string;
}

export interface Skill {
  id: number;
  category: string;
  name: string;
}

export interface CreateSkillInput {
  category: string;
  name: string;
}

export interface RetrievedBullet {
  id: number;
  experience_id: number;
  content: string;
  sort_order: number;
  score: number;
  vector_distance: number | null;
  keyword_rank: number | null;
}

export interface LLMSettings {
  mode: string;
  gguf_path?: string;
  api_key?: string;
  cloud_model?: string;
}

export interface GenerationResult {
  cover_letter: string;
  bullets_used: string[];
  prompt: string;
  cover_letter_id: number;
}

/** Progress events streamed while a cover letter generates. The awaited
 *  promise still delivers the final `GenerationResult`; these only carry
 *  progress (retrieved bullets, then raw body chunks). */
export type GenerationEvent =
  | { event: 'started'; data: { bulletsUsed: string[] } }
  | { event: 'token'; data: { chunk: string } };

// Database Commands
export const listExperiences = () => invoke<Experience[]>('list_experiences');
export const createExperience = (title: string, org: string, start_date: string, end_date: string, category: string, link: string = '') =>
  invoke<Experience>('create_experience', {
    input: {
      title,
      org: org || null,
      start_date: start_date || null,
      end_date: end_date || null,
      category,
      link: link || null
    }
  });
export const updateExperience = (id: number, title: string, org: string, start_date: string, end_date: string, category: string, link: string = '') =>
  invoke('update_experience', {
    input: {
      id,
      title: title || null,
      org: org || null,
      start_date: start_date || null,
      end_date: end_date || null,
      category: category || null,
      // Send the raw string (not `|| null`) so clearing the field persists —
      // the Rust update treats `null` as "leave unchanged".
      link
    }
  });
export const deleteExperience = (id: number) => invoke('delete_experience', { id });

export const getBio = () => invoke<Bio>('get_bio');
export const updateBio = (bio: Bio) => invoke<Bio>('update_bio', { input: bio });

export const listBullets = (experience_id: number) => invoke<BulletPoint[]>('list_bullets', { experienceId: experience_id });
export const createBullet = (experience_id: number, content: string) =>
  invoke<number>('create_bullet', { experienceId: experience_id, content });
export const updateBullet = (id: number, content: string, sort_order: number) =>
  invoke('update_bullet', { id, content, sortOrder: sort_order });
export const deleteBullet = (id: number) => invoke('delete_bullet', { id });

export const createArchetype = (name: string) => invoke<number>('create_archetype', { name });
export const deleteArchetype = (id: number) => invoke('delete_archetype', { id });
export const listArchetypes = () => invoke<Archetype[]>('list_archetypes'); // guessing this command exists based on CRUD
export const tagBullet = (archetype_id: number, bullet_point_id: number) =>
  invoke('tag_bullet', { archetypeId: archetype_id, bulletPointId: bullet_point_id });
export const untagBullet = (archetype_id: number, bullet_point_id: number) =>
  invoke('untag_bullet', { archetypeId: archetype_id, bulletPointId: bullet_point_id });
export const getArchetypeBullets = (archetype_id: number) =>
  invoke<BulletPoint[]>('get_archetype_bullets', { archetypeId: archetype_id });

export const tagExperience = (archetype_id: number, experience_id: number) =>
  invoke('tag_experience', { archetypeId: archetype_id, experienceId: experience_id });
export const untagExperience = (archetype_id: number, experience_id: number) =>
  invoke('untag_experience', { archetypeId: archetype_id, experienceId: experience_id });
export const getArchetypeExperiences = (archetype_id: number) =>
  invoke<Experience[]>('get_archetype_experiences', { archetypeId: archetype_id });

// Skills CRUD & Tagging
export const createSkill = (category: string, name: string) =>
  invoke<Skill>('create_skill', { input: { category, name } });
export const listSkills = () => invoke<Skill[]>('list_skills');
export const deleteSkill = (id: number) => invoke('delete_skill', { id });
export const tagSkill = (archetype_id: number, skill_id: number) =>
  invoke('tag_skill', { archetypeId: archetype_id, skillId: skill_id });
export const untagSkill = (archetype_id: number, skill_id: number) =>
  invoke('untag_skill', { archetypeId: archetype_id, skillId: skill_id });
export const getArchetypeSkills = (archetype_id: number) =>
  invoke<Skill[]>('get_archetype_skills', { archetypeId: archetype_id });

// RAG Commands
export const searchSimilar = (query: string, archetype_id: number, top_k: number) =>
  invoke<RetrievedBullet[]>('search_similar', { query, archetypeId: archetype_id, topK: top_k });

// LLM Commands
export const generateCoverLetter = (
  jd: string,
  archetype_id: number | null,
  top_k: number,
  template_id: number | null,
  onEvent: (e: GenerationEvent) => void,
) => {
  const channel = new Channel<GenerationEvent>();
  channel.onmessage = onEvent;
  return invoke<GenerationResult>('generate_cover_letter', {
    jobDescription: jd, archetypeId: archetype_id, topK: top_k, templateId: template_id,
    onEvent: channel,
  });
};

// Cover letter templates
export interface CoverLetterTemplate {
  id: number;
  name: string;
  content: string;
  is_builtin: boolean;
  created_at: string;
}
export const listCoverLetterTemplates = () => invoke<CoverLetterTemplate[]>('list_cover_letter_templates');
export const createCoverLetterTemplate = (name: string, content: string) =>
  invoke<number>('create_cover_letter_template', { name, content });
export const updateCoverLetterTemplate = (id: number, name: string, content: string) =>
  invoke<void>('update_cover_letter_template', { id, name, content });
export const deleteCoverLetterTemplate = (id: number) =>
  invoke<void>('delete_cover_letter_template', { id });

// Cover letter history
export interface CoverLetter {
  id: number;
  archetype_id: number | null;
  job_description: string;
  content: string;
  created_at: string;
}
export const listCoverLetters = () => invoke<CoverLetter[]>('list_cover_letters');
export const deleteCoverLetter = (id: number) => invoke<void>('delete_cover_letter', { id });
export const getLlmSettings = () => invoke<LLMSettings>('get_llm_settings');
export const updateLlmSettings = (mode: string, ggufPath?: string, apiKey?: string, cloudModel?: string) =>
  invoke('update_llm_settings', { mode, ggufPath, apiKey, cloudModel });
// Resume parsing is local-only: this downloads a small specialized model on first
// use, then runs fully offline. Returns clean, validated `{ experiences: [...] }` JSON.
export const extractResumePdf = (pdf_path: string) =>
  invoke<string>('extract_resume_pdf', { pdfPath: pdf_path });
// Pre-download the local parser model (safe to call ahead of the first import).
export const checkOrDownloadParserModel = () =>
  invoke<void>('check_or_download_parser_model');

/** Progress events streamed while the fine-tuned cover-letter model downloads.
 *  The awaited promise still resolves to the local `.gguf` path; these only carry
 *  progress. `total` is null when the server sends no Content-Length. */
export type DownloadEvent =
  | { event: 'progress'; data: { downloaded: number; total: number | null } };

// Download the fine-tuned cover-letter GGUF into app-data (no-op if already present)
// and resolve to its local path, ready to store as `gguf_path`. `onEvent` streams
// download progress.
export const downloadCoverletterModel = (onEvent: (e: DownloadEvent) => void) => {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<string>('download_coverletter_model', { onEvent: channel });
};

// LaTeX / Layout Commands

/// Mirrors `LayoutConfig` in src-tauri/src/latex/layout.rs (snake_case fields
/// match serde exactly).
export interface LayoutConfig {
  body_font_pt: number;
  bullet_font_pt: number;
  section_font_pt: number;
  subsection_font_pt: number;
  name_font_pt: number;
  margin_h_in: number;
  margin_v_in: number;
  bullet_indent_pt: number;
  item_sep_pt: number;
  experience_gap_pt: number;
  section_gap_pt: number;
  line_spacing: number;
  accent_rgb: [number, number, number];
  heading_sans: boolean;
  section_rule: boolean;
  header_rule: boolean;
  target_pages: number;
}

/// Mirrors `ResumeEntry` in src-tauri/src/latex/template.rs.
export interface ResumeEntryData {
  title: string;
  org: string | null;
  start: string | null;
  end: string | null;
  bullets: string[];
  education: EducationDetails | null;
  link: string | null;
}

export interface SectionGroupData {
  heading: string;
  entries: ResumeEntryData[];
}

/// A job description to tailor the resume against. Mirrors `TailorSpec` in
/// src-tauri/src/latex/tailor.rs.
export interface TailorSpec {
  job_description: string;
  /// Cap on bullets kept under one experience (backend default: 6).
  max_bullets_per_entry?: number | null;
  /// Experiences the user switched off — never included.
  excluded_experience_ids?: number[];
  /// Experiences the user switched on — admitted ahead of the retrieval
  /// ranking, so one that "didn't fit" pushes a weaker match out instead.
  pinned_experience_ids?: number[];
}

/// One experience retrieval considered, and what became of it. Mirrors
/// `TailoredExperience` in src-tauri/src/latex/tailor.rs.
export interface TailoredExperience {
  experience_id: number;
  title: string;
  org: string | null;
  heading: string;
  matched_bullets: number;
  kept_bullets: number;
  kept: boolean;
  dropped_for_space: boolean;
  excluded: boolean;
  pinned: boolean;
}

/// What tailoring actually cut. Mirrors `TailorReport` in
/// src-tauri/src/latex/tailor.rs.
export interface TailorReport {
  matched_bullets: number;
  kept_bullets: number;
  kept_entries: number;
  dropped_entries: number;
  target_pages: number;
  estimated_pages: number;
  budget_exhausted: boolean;
  /// Every experience in the running, best-first.
  experiences: TailoredExperience[];
}

/// Mirrors `ResumeData` in src-tauri/src/latex/commands.rs.
export interface ResumeData {
  bio: Bio;
  skills: [string, string[]][];
  groups: SectionGroupData[];
  /// Present only when the content was tailored to a job description.
  tailoring?: TailorReport | null;
}

/// A named resume section mapping to one or more experience categories.
export interface SectionDef {
  id: string;
  heading: string;
  categories: string[];
}

export interface LayoutPreset {
  name: string;
  config: LayoutConfig;
}

export interface ResumeConfigRow {
  layout_json: string | null;
  sections_json: string | null;
}

export interface EducationDetails {
  experience_id: number;
  degree?: string | null;
  gpa?: string | null;
  coursework?: string | null;
  honors?: string | null;
}

export const getLayoutPresets = () => invoke<LayoutPreset[]>('get_layout_presets');
export const compileTex = (source: string) => invoke<number[]>('compile_tex', { source });
export const getDefaultTemplate = () => invoke<string>('get_default_template');
// `archetype_id: null` on the three calls below means "the whole record" —
// the job-description path, which retrieves across everything instead of a
// curated archetype. Passing `tailor` narrows the result to what the posting
// asks for, trimmed to `layout.target_pages`.
export const injectTemplate = (
  archetype_id: number | null,
  layout: LayoutConfig,
  sections: SectionDef[] | null,
  tailor: TailorSpec | null = null,
) =>
  invoke<string>('inject_template', { archetypeId: archetype_id, layout, sections, tailor });
export const getArchetypeCategories = (archetype_id: number | null) =>
  invoke<string[]>('get_archetype_categories', { archetypeId: archetype_id });
export const getResumeData = (
  archetype_id: number | null,
  sections: SectionDef[] | null,
  layout: LayoutConfig | null = null,
  tailor: TailorSpec | null = null,
) =>
  invoke<ResumeData>('get_resume_data', { archetypeId: archetype_id, sections, layout, tailor });
export const savePdf = (path: string, data: number[]) =>
  invoke<void>('save_pdf', { path, data });

export const getResumeConfig = (archetype_id: number) =>
  invoke<ResumeConfigRow | null>('get_resume_config', { archetypeId: archetype_id });
export const saveResumeConfig = (archetype_id: number, layout: LayoutConfig, sections: SectionDef[]) =>
  invoke<void>('save_resume_config', {
    archetypeId: archetype_id,
    layoutJson: JSON.stringify(layout),
    sectionsJson: JSON.stringify(sections),
  });

// Education details
export const getEducationDetails = (experience_id: number) =>
  invoke<EducationDetails | null>('get_education_details', { experienceId: experience_id });
export const upsertEducationDetails = (input: EducationDetails) =>
  invoke<void>('upsert_education_details', { input });
export const deleteEducationDetails = (experience_id: number) =>
  invoke<void>('delete_education_details', { experienceId: experience_id });

// Application tracker
export const APPLICATION_STATUSES = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export interface Application {
  id: number;
  company: string;
  role_title: string;
  url: string | null;
  status: ApplicationStatus;
  applied_at: string | null;
  notes: string | null;
  cover_letter_id: number | null;
  archetype_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApplicationInput {
  company: string;
  role_title: string;
  url?: string | null;
  status?: ApplicationStatus;
  applied_at?: string | null;
  notes?: string | null;
  cover_letter_id?: number | null;
  archetype_id?: number | null;
}

export interface UpdateApplicationInput {
  id: number;
  company?: string;
  role_title?: string;
  url?: string | null;
  status?: ApplicationStatus;
  applied_at?: string | null;
  notes?: string | null;
}

export const createApplication = (input: CreateApplicationInput) =>
  invoke<Application>('create_application', { input });
export const listApplications = () => invoke<Application[]>('list_applications');
export const updateApplication = (input: UpdateApplicationInput) =>
  invoke<Application>('update_application', { input });
export const deleteApplication = (id: number) => invoke<void>('delete_application', { id });

// App settings (generic key/value) — used to persist e.g. the first-run
// onboarding-complete flag.
export const getAppSetting = (key: string) => invoke<string | null>('get_app_setting', { key });
export const setAppSetting = (key: string, value: string) => invoke<void>('set_app_setting', { key, value });

