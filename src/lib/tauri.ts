import { invoke } from '@tauri-apps/api/core';

export interface Experience {
  id: number;
  title: string;
  org: string;
  start_date: string;
  end_date: string;
  category: string;
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

export interface ScoredBullet {
  bullet: BulletPoint;
  score: number;
}

export interface LLMSettings {
  mode: string;
  model_path?: string;
  api_key?: string;
}

export interface GenerationResult {
  cover_letter: string;
  bullets_used: string[];
  prompt: string;
}

// Database Commands
export const listExperiences = () => invoke<Experience[]>('list_experiences');
export const createExperience = (title: string, org: string, start_date: string, end_date: string, category: string) =>
  invoke<Experience>('create_experience', { 
    input: { 
      title, 
      org: org || null, 
      start_date: start_date || null, 
      end_date: end_date || null, 
      category 
    } 
  });
export const updateExperience = (id: number, title: string, org: string, start_date: string, end_date: string, category: string) =>
  invoke('update_experience', { 
    input: { 
      id, 
      title: title || null, 
      org: org || null, 
      startDate: start_date || null, 
      endDate: end_date || null, 
      category: category || null 
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

// RAG Commands
export const searchSimilar = (job_description: string, archetype_id: number, top_k: number) =>
  invoke<ScoredBullet[]>('search_similar', { jobDescription: job_description, archetypeId: archetype_id, topK: top_k });

// LLM Commands
export const generateCoverLetter = (jd: string, archetype_id: number, top_k: number) =>
  invoke<GenerationResult>('generate_cover_letter', { jobDescription: jd, archetypeId: archetype_id, topK: top_k });
export const getLlmSettings = () => invoke<LLMSettings>('get_llm_settings');
export const updateLlmSettings = (mode: string, path?: string, key?: string) =>
  invoke('update_llm_settings', { mode, ggufPath: path, apiKey: key });
export const extractResumePdf = (pdf_path: string) =>
  invoke<string>('extract_resume_pdf', { pdfPath: pdf_path });

// LaTeX Commands
export const getTemplates = () => invoke<string[]>('get_templates');
export const compileTex = (source: string) => invoke<number[]>('compile_tex', { source });
export const getDefaultTemplate = () => invoke<string>('get_default_template');
export const injectAndCompile = (archetype_id: number, bullet_ids: number[], template_idx: number) =>
  invoke<number[]>('inject_and_compile', { archetypeId: archetype_id, bulletIds: bullet_ids, templateIdx: template_idx });
