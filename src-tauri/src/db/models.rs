use serde::{Deserialize, Serialize};

/// A resume experience (job, project, hackathon, or education).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experience {
    pub id: i64,
    pub title: String,
    pub org: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A single bullet point belonging to an experience.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulletPoint {
    pub id: i64,
    pub experience_id: i64,
    pub content: String,
    pub sort_order: i32,
    pub created_at: String,
}

/// A professional archetype (e.g. "General SWE", "Robotics/Embedded").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Archetype {
    pub id: i64,
    pub name: String,
}

/// A professional skill configurable by category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: i64,
    pub category: String,
    pub name: String,
}

/// Input payload for creating a skill.
#[derive(Debug, Deserialize)]
pub struct CreateSkillInput {
    pub category: String,
    pub name: String,
}

/// Input payload for creating an experience.
#[derive(Debug, Deserialize)]
pub struct CreateExperienceInput {
    pub title: String,
    pub org: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: String,
}

/// Input payload for updating an experience.
#[derive(Debug, Deserialize)]
pub struct UpdateExperienceInput {
    pub id: i64,
    pub title: Option<String>,
    pub org: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub category: Option<String>,
}

/// Structured details for an education-type experience (all optional).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EducationDetails {
    pub experience_id: i64,
    pub degree: Option<String>,
    pub gpa: Option<String>,
    pub coursework: Option<String>,
    pub honors: Option<String>,
}

/// Input payload for creating/updating education details.
#[derive(Debug, Deserialize)]
pub struct UpsertEducationDetailsInput {
    pub experience_id: i64,
    pub degree: Option<String>,
    pub gpa: Option<String>,
    pub coursework: Option<String>,
    pub honors: Option<String>,
}

/// A previously generated cover letter (history).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverLetter {
    pub id: i64,
    pub archetype_id: Option<i64>,
    pub job_description: String,
    pub content: String,
    pub created_at: String,
}

/// A cover letter template the generation prompt can be conditioned on.
/// `is_builtin` is provenance only (seeded vs user-created) — builtins are
/// just as editable and deletable as user templates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverLetterTemplate {
    pub id: i64,
    pub name: String,
    pub content: String,
    pub is_builtin: bool,
    pub created_at: String,
}

/// Biographical information for the resume header.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bio {
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub location: Option<String>,
    pub linkedin: Option<String>,
    pub github: Option<String>,
    pub website: Option<String>,
}

/// Input payload for updating the bio.
#[derive(Debug, Deserialize)]
pub struct UpdateBioInput {
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub location: Option<String>,
    pub linkedin: Option<String>,
    pub github: Option<String>,
    pub website: Option<String>,
}
