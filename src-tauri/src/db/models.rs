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
