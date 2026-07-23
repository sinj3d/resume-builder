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
    pub link: Option<String>,
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
    pub link: Option<String>,
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
    pub link: Option<String>,
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

/// Valid application statuses, validated in Rust rather than a SQL CHECK
/// (removing a CHECK later requires a full table swap in SQLite).
pub const APPLICATION_STATUSES: [&str; 5] =
    ["wishlist", "applied", "interviewing", "offer", "rejected"];

/// Validate an application status against `APPLICATION_STATUSES`.
pub fn validate_status(status: &str) -> Result<(), String> {
    if APPLICATION_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "Invalid application status '{}'. Valid statuses: {}",
            status,
            APPLICATION_STATUSES.join(", ")
        ))
    }
}

/// A tracked job application, optionally linked to the cover letter it was
/// sent with and the archetype it targeted (both survive deletion via
/// ON DELETE SET NULL).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    pub id: i64,
    pub company: String,
    pub role_title: String,
    pub url: Option<String>,
    pub status: String,
    pub applied_at: Option<String>,
    pub notes: Option<String>,
    pub cover_letter_id: Option<i64>,
    pub archetype_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input payload for creating an application.
#[derive(Debug, Deserialize)]
pub struct CreateApplicationInput {
    pub company: String,
    pub role_title: String,
    pub url: Option<String>,
    pub status: Option<String>,
    pub applied_at: Option<String>,
    pub notes: Option<String>,
    pub cover_letter_id: Option<i64>,
    pub archetype_id: Option<i64>,
}

/// Input payload for updating an application. Only non-None fields change.
#[derive(Debug, Deserialize)]
pub struct UpdateApplicationInput {
    pub id: i64,
    pub company: Option<String>,
    pub role_title: Option<String>,
    pub url: Option<String>,
    pub status: Option<String>,
    pub applied_at: Option<String>,
    pub notes: Option<String>,
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
