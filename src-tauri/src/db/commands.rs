use rusqlite::OptionalExtension;
use tauri::State;
use crate::db::DbState;
use crate::db::models::*;

// ──────────────────────────────────────────────
// Experience CRUD
// ──────────────────────────────────────────────

/// Create a new resume experience.
#[tauri::command]
pub fn create_experience(
    state: State<'_, DbState>,
    input: CreateExperienceInput,
) -> Result<Experience, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO experiences (title, org, start_date, end_date, category) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![input.title, input.org, input.start_date, input.end_date, input.category],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let exp = conn.query_row(
        "SELECT id, title, org, start_date, end_date, category, created_at, updated_at FROM experiences WHERE id = ?1",
        [id],
        |row| {
            Ok(Experience {
                id: row.get(0)?,
                title: row.get(1)?,
                org: row.get(2)?,
                start_date: row.get(3)?,
                end_date: row.get(4)?,
                category: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    Ok(exp)
}

/// List all experiences.
#[tauri::command]
pub fn list_experiences(state: State<'_, DbState>) -> Result<Vec<Experience>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, org, start_date, end_date, category, created_at, updated_at FROM experiences ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Experience {
                id: row.get(0)?,
                title: row.get(1)?,
                org: row.get(2)?,
                start_date: row.get(3)?,
                end_date: row.get(4)?,
                category: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let experiences: Vec<Experience> = rows.filter_map(|r| r.ok()).collect();
    Ok(experiences)
}

/// Update an existing experience. Only non-None fields are updated.
#[tauri::command]
pub fn update_experience(
    state: State<'_, DbState>,
    input: UpdateExperienceInput,
) -> Result<Experience, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Build dynamic SET clause for partial updates
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref title) = input.title {
        sets.push("title = ?".to_string());
        params.push(Box::new(title.clone()));
    }
    if let Some(ref org) = input.org {
        sets.push("org = ?".to_string());
        params.push(Box::new(org.clone()));
    }
    if let Some(ref start_date) = input.start_date {
        sets.push("start_date = ?".to_string());
        params.push(Box::new(start_date.clone()));
    }
    if let Some(ref end_date) = input.end_date {
        sets.push("end_date = ?".to_string());
        params.push(Box::new(end_date.clone()));
    }
    if let Some(ref category) = input.category {
        sets.push("category = ?".to_string());
        params.push(Box::new(category.clone()));
    }

    if sets.is_empty() {
        return Err("No fields to update".to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());
    params.push(Box::new(input.id));

    let sql = format!(
        "UPDATE experiences SET {} WHERE id = ?",
        sets.join(", ")
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    // Re-fetch the updated row
    conn.query_row(
        "SELECT id, title, org, start_date, end_date, category, created_at, updated_at FROM experiences WHERE id = ?1",
        [input.id],
        |row| {
            Ok(Experience {
                id: row.get(0)?,
                title: row.get(1)?,
                org: row.get(2)?,
                start_date: row.get(3)?,
                end_date: row.get(4)?,
                category: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    ).map_err(|e| e.to_string())
}

/// Delete an experience by ID. Cascades to bullet_points.
#[tauri::command]
pub fn delete_experience(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM experiences WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Experience with id {} not found", id));
    }
    Ok(())
}

// ──────────────────────────────────────────────
// Bullet Point CRUD
// ──────────────────────────────────────────────

/// Create a new bullet point for an experience.
#[tauri::command]
pub fn create_bullet(
    state: State<'_, DbState>,
    experience_id: i64,
    content: String,
) -> Result<BulletPoint, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // Auto-assign sort_order as max + 1
    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM bullet_points WHERE experience_id = ?1",
            [experience_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO bullet_points (experience_id, content, sort_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![experience_id, content, max_order + 1],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, experience_id, content, sort_order, created_at FROM bullet_points WHERE id = ?1",
        [id],
        |row| {
            Ok(BulletPoint {
                id: row.get(0)?,
                experience_id: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Update a bullet point's content.
#[tauri::command]
pub fn update_bullet(
    state: State<'_, DbState>,
    id: i64,
    content: String,
) -> Result<BulletPoint, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let affected = conn
        .execute(
            "UPDATE bullet_points SET content = ?1 WHERE id = ?2",
            rusqlite::params![content, id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Bullet point with id {} not found", id));
    }

    conn.query_row(
        "SELECT id, experience_id, content, sort_order, created_at FROM bullet_points WHERE id = ?1",
        [id],
        |row| {
            Ok(BulletPoint {
                id: row.get(0)?,
                experience_id: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Delete a bullet point by ID.
#[tauri::command]
pub fn delete_bullet(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM bullet_points WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Bullet point with id {} not found", id));
    }
    Ok(())
}

/// List all bullet points for a given experience.
#[tauri::command]
pub fn list_bullets(
    state: State<'_, DbState>,
    experience_id: i64,
) -> Result<Vec<BulletPoint>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, experience_id, content, sort_order, created_at FROM bullet_points WHERE experience_id = ?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([experience_id], |row| {
            Ok(BulletPoint {
                id: row.get(0)?,
                experience_id: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ──────────────────────────────────────────────
// Archetype CRUD & Tagging
// ──────────────────────────────────────────────

/// Create a new archetype.
#[tauri::command]
pub fn create_archetype(
    state: State<'_, DbState>,
    name: String,
) -> Result<Archetype, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO archetypes (name) VALUES (?1)", [&name])
        .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    Ok(Archetype { id, name })
}

/// List all archetypes.
#[tauri::command]
pub fn list_archetypes(state: State<'_, DbState>) -> Result<Vec<Archetype>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM archetypes ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Archetype {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Delete an archetype by ID.
#[tauri::command]
pub fn delete_archetype(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM archetypes WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Archetype with id {} not found", id));
    }
    Ok(())
}

/// Tag a bullet point to an archetype.
#[tauri::command]
pub fn tag_bullet(
    state: State<'_, DbState>,
    archetype_id: i64,
    bullet_point_id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO archetype_bullets (archetype_id, bullet_point_id) VALUES (?1, ?2)",
        rusqlite::params![archetype_id, bullet_point_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove a bullet point from an archetype.
#[tauri::command]
pub fn untag_bullet(
    state: State<'_, DbState>,
    archetype_id: i64,
    bullet_point_id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM archetype_bullets WHERE archetype_id = ?1 AND bullet_point_id = ?2",
        rusqlite::params![archetype_id, bullet_point_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get all bullet points tagged to a given archetype.
#[tauri::command]
pub fn get_archetype_bullets(
    state: State<'_, DbState>,
    archetype_id: i64,
) -> Result<Vec<BulletPoint>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT bp.id, bp.experience_id, bp.content, bp.sort_order, bp.created_at
             FROM bullet_points bp
             INNER JOIN archetype_bullets ab ON ab.bullet_point_id = bp.id
             WHERE ab.archetype_id = ?1
             ORDER BY bp.sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([archetype_id], |row| {
            Ok(BulletPoint {
                id: row.get(0)?,
                experience_id: row.get(1)?,
                content: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ──────────────────────────────────────────────
// Bio CRUD
// ──────────────────────────────────────────────

/// Get the user's biographical information.
#[tauri::command]
pub fn get_bio(state: State<'_, DbState>) -> Result<Bio, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    
    // There's only one row with id = 1
    let bio: Bio = conn.query_row(
        "SELECT name, email, phone, location, linkedin, github, website FROM bio WHERE id = 1",
        [],
        |row| {
            Ok(Bio {
                name: row.get(0)?,
                email: row.get(1)?,
                phone: row.get(2)?,
                location: row.get(3)?,
                linkedin: row.get(4)?,
                github: row.get(5)?,
                website: row.get(6)?,
            })
        },
    ).unwrap_or(Bio {
        name: None,
        email: None,
        phone: None,
        location: None,
        linkedin: None,
        github: None,
        website: None,
    });

    Ok(bio)
}

/// Update the user's biographical information.
#[tauri::command]
pub fn update_bio(
    state: State<'_, DbState>,
    input: UpdateBioInput,
) -> Result<Bio, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE bio SET name = ?1, email = ?2, phone = ?3, location = ?4, linkedin = ?5, github = ?6, website = ?7 WHERE id = 1",
        rusqlite::params![
            input.name,
            input.email,
            input.phone,
            input.location,
            input.linkedin,
            input.github,
            input.website
        ],
    ).map_err(|e| format!("Failed to update bio: {}", e))?;

    // Re-fetch
    let bio: Bio = conn.query_row(
        "SELECT name, email, phone, location, linkedin, github, website FROM bio WHERE id = 1",
        [],
        |row| {
            Ok(Bio {
                name: row.get(0)?,
                email: row.get(1)?,
                phone: row.get(2)?,
                location: row.get(3)?,
                linkedin: row.get(4)?,
                github: row.get(5)?,
                website: row.get(6)?,
            })
        },
    ).map_err(|e| format!("Failed to fetch updated bio: {}", e))?;

    Ok(bio)
}

// ──────────────────────────────────────────────
// Experience-Archetype Tagging
// ──────────────────────────────────────────────

#[tauri::command]
pub fn tag_experience(state: State<'_, DbState>, archetype_id: i64, experience_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO archetype_experiences (archetype_id, experience_id) VALUES (?1, ?2)",
        [archetype_id, experience_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn untag_experience(state: State<'_, DbState>, archetype_id: i64, experience_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM archetype_experiences WHERE archetype_id = ?1 AND experience_id = ?2",
        [archetype_id, experience_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_archetype_experiences(state: State<'_, DbState>, archetype_id: i64) -> Result<Vec<Experience>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("
            SELECT e.id, e.title, e.org, e.start_date, e.end_date, e.category, e.created_at, e.updated_at
            FROM experiences e
            JOIN archetype_experiences ae ON e.id = ae.experience_id
            WHERE ae.archetype_id = ?1
            ORDER BY e.created_at DESC
        ")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([archetype_id], |row| {
            Ok(Experience {
                id: row.get(0)?,
                title: row.get(1)?,
                org: row.get(2)?,
                start_date: row.get(3)?,
                end_date: row.get(4)?,
                category: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let exps: Vec<Experience> = rows.filter_map(|r| r.ok()).collect();
    Ok(exps)
}

// ──────────────────────────────────────────────
// Skills CRUD & Tagging
// ──────────────────────────────────────────────

#[tauri::command]
pub fn create_skill(state: State<'_, DbState>, input: CreateSkillInput) -> Result<Skill, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO skills (category, name) VALUES (?1, ?2)",
        [&input.category, &input.name],
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, category, name FROM skills WHERE category = ?1 AND name = ?2").map_err(|e| e.to_string())?;
    let skill = stmt.query_row([&input.category, &input.name], |row| {
        Ok(Skill {
            id: row.get(0)?,
            category: row.get(1)?,
            name: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(skill)
}

#[tauri::command]
pub fn list_skills(state: State<'_, DbState>) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, category, name FROM skills ORDER BY category ASC, name ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Skill {
            id: row.get(0)?,
            category: row.get(1)?,
            name: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let skills: Vec<Skill> = rows.filter_map(|r| r.ok()).collect();
    Ok(skills)
}

#[tauri::command]
pub fn delete_skill(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM skills WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn tag_skill(state: State<'_, DbState>, archetype_id: i64, skill_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO archetype_skills (archetype_id, skill_id) VALUES (?1, ?2)",
        [archetype_id, skill_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn untag_skill(state: State<'_, DbState>, archetype_id: i64, skill_id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM archetype_skills WHERE archetype_id = ?1 AND skill_id = ?2",
        [archetype_id, skill_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_archetype_skills(state: State<'_, DbState>, archetype_id: i64) -> Result<Vec<Skill>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("
        SELECT s.id, s.category, s.name
        FROM skills s
        JOIN archetype_skills as_k ON s.id = as_k.skill_id
        WHERE as_k.archetype_id = ?1
        ORDER BY s.category ASC, s.name ASC
    ").map_err(|e| e.to_string())?;

    let rows = stmt.query_map([archetype_id], |row| {
        Ok(Skill {
            id: row.get(0)?,
            category: row.get(1)?,
            name: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let skills: Vec<Skill> = rows.filter_map(|r| r.ok()).collect();
    Ok(skills)
}

// ──────────────────────────────────────────────
// Education Details
// ──────────────────────────────────────────────

/// Get the structured education details for an experience, if any.
#[tauri::command]
pub fn get_education_details(
    state: State<'_, DbState>,
    experience_id: i64,
) -> Result<Option<EducationDetails>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let details = conn
        .query_row(
            "SELECT experience_id, degree, gpa, coursework, honors
             FROM education_details WHERE experience_id = ?1",
            [experience_id],
            |row| {
                Ok(EducationDetails {
                    experience_id: row.get(0)?,
                    degree: row.get(1)?,
                    gpa: row.get(2)?,
                    coursework: row.get(3)?,
                    honors: row.get(4)?,
                })
            },
        )
        .ok();

    Ok(details)
}

/// Create or replace the education details for an experience.
#[tauri::command]
pub fn upsert_education_details(
    state: State<'_, DbState>,
    input: UpsertEducationDetailsInput,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO education_details (experience_id, degree, gpa, coursework, honors)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(experience_id) DO UPDATE SET
             degree = excluded.degree,
             gpa = excluded.gpa,
             coursework = excluded.coursework,
             honors = excluded.honors",
        rusqlite::params![
            input.experience_id,
            input.degree,
            input.gpa,
            input.coursework,
            input.honors
        ],
    )
    .map_err(|e| format!("Failed to save education details: {}", e))?;

    Ok(())
}

/// Remove the education details for an experience.
#[tauri::command]
pub fn delete_education_details(
    state: State<'_, DbState>,
    experience_id: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM education_details WHERE experience_id = ?1",
        [experience_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ──────────────────────────────────────────────
// Cover Letter History
// ──────────────────────────────────────────────

/// List past generated cover letters, most recent first.
#[tauri::command]
pub fn list_cover_letters(state: State<'_, DbState>) -> Result<Vec<CoverLetter>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, archetype_id, job_description, content, created_at
             FROM cover_letters ORDER BY created_at DESC, id DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CoverLetter {
                id: row.get(0)?,
                archetype_id: row.get(1)?,
                job_description: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Delete a cover letter from history.
#[tauri::command]
pub fn delete_cover_letter(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cover_letters WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ──────────────────────────────────────────────
// Cover Letter Templates
// ──────────────────────────────────────────────

/// List all cover letter templates, builtins first, then by name.
#[tauri::command]
pub fn list_cover_letter_templates(
    state: State<'_, DbState>,
) -> Result<Vec<CoverLetterTemplate>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, content, is_builtin, created_at
             FROM cover_letter_templates ORDER BY is_builtin DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CoverLetterTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                content: row.get(2)?,
                is_builtin: row.get::<_, i64>(3)? != 0,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Create a user cover letter template. Returns the new id.
#[tauri::command]
pub fn create_cover_letter_template(
    state: State<'_, DbState>,
    name: String,
    content: String,
) -> Result<i64, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Template name cannot be empty.".to_string());
    }
    if content.trim().is_empty() {
        return Err("Template content cannot be empty.".to_string());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cover_letter_templates (name, content) VALUES (?1, ?2)",
        rusqlite::params![name, content],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            "A template with this name already exists.".to_string()
        }
        other => other.to_string(),
    })?;
    Ok(conn.last_insert_rowid())
}

/// Update a template's name and content (builtins are editable too).
#[tauri::command]
pub fn update_cover_letter_template(
    state: State<'_, DbState>,
    id: i64,
    name: String,
    content: String,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Template name cannot be empty.".to_string());
    }
    if content.trim().is_empty() {
        return Err("Template content cannot be empty.".to_string());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute(
            "UPDATE cover_letter_templates SET name = ?1, content = ?2 WHERE id = ?3",
            rusqlite::params![name, content, id],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(err, _)
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                "A template with this name already exists.".to_string()
            }
            other => other.to_string(),
        })?;
    if affected == 0 {
        return Err("Template not found.".to_string());
    }
    Ok(())
}

/// Delete a cover letter template.
#[tauri::command]
pub fn delete_cover_letter_template(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cover_letter_templates WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ──────────────────────────────────────────────
// Resume Config (per-archetype layout + sections)
// ──────────────────────────────────────────────

/// Saved per-archetype resume configuration (raw JSON blobs).
#[derive(serde::Serialize)]
pub struct ResumeConfigRow {
    pub layout_json: Option<String>,
    pub sections_json: Option<String>,
}

/// Get the saved layout/sections config for an archetype, if any.
/// The JSON blobs are returned raw; the frontend deserializes them.
#[tauri::command]
pub fn get_resume_config(
    state: State<'_, DbState>,
    archetype_id: i64,
) -> Result<Option<ResumeConfigRow>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let row = conn
        .query_row(
            "SELECT layout_json, sections_json FROM resume_configs WHERE archetype_id = ?1",
            [archetype_id],
            |row| {
                Ok(ResumeConfigRow {
                    layout_json: row.get(0)?,
                    sections_json: row.get(1)?,
                })
            },
        )
        .ok();

    Ok(row)
}

/// Save (upsert) the layout/sections config for an archetype.
#[tauri::command]
pub fn save_resume_config(
    state: State<'_, DbState>,
    archetype_id: i64,
    layout_json: Option<String>,
    sections_json: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO resume_configs (archetype_id, layout_json, sections_json, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(archetype_id) DO UPDATE SET
             layout_json = excluded.layout_json,
             sections_json = excluded.sections_json,
             updated_at = excluded.updated_at",
        rusqlite::params![archetype_id, layout_json, sections_json],
    )
    .map_err(|e| format!("Failed to save resume config: {}", e))?;

    Ok(())
}

// ──────────────────────────────────────────────
// Application Tracker
// ──────────────────────────────────────────────

fn select_application_row(conn: &rusqlite::Connection, id: i64) -> Result<Application, String> {
    conn.query_row(
        "SELECT id, company, role_title, url, status, applied_at, notes,
                cover_letter_id, archetype_id, created_at, updated_at
         FROM applications WHERE id = ?1",
        [id],
        |row| {
            Ok(Application {
                id: row.get(0)?,
                company: row.get(1)?,
                role_title: row.get(2)?,
                url: row.get(3)?,
                status: row.get(4)?,
                applied_at: row.get(5)?,
                notes: row.get(6)?,
                cover_letter_id: row.get(7)?,
                archetype_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Create a new tracked application. Status defaults to "applied" if omitted.
#[tauri::command]
pub fn create_application(
    state: State<'_, DbState>,
    input: CreateApplicationInput,
) -> Result<Application, String> {
    let status = input.status.unwrap_or_else(|| "applied".to_string());
    validate_status(&status)?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO applications
            (company, role_title, url, status, applied_at, notes, cover_letter_id, archetype_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            input.company,
            input.role_title,
            input.url,
            status,
            input.applied_at,
            input.notes,
            input.cover_letter_id,
            input.archetype_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    select_application_row(&conn, conn.last_insert_rowid())
}

/// List all tracked applications, most recently created first.
#[tauri::command]
pub fn list_applications(state: State<'_, DbState>) -> Result<Vec<Application>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, company, role_title, url, status, applied_at, notes,
                    cover_letter_id, archetype_id, created_at, updated_at
             FROM applications ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Application {
                id: row.get(0)?,
                company: row.get(1)?,
                role_title: row.get(2)?,
                url: row.get(3)?,
                status: row.get(4)?,
                applied_at: row.get(5)?,
                notes: row.get(6)?,
                cover_letter_id: row.get(7)?,
                archetype_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Update an existing application. Only non-None fields are updated.
#[tauri::command]
pub fn update_application(
    state: State<'_, DbState>,
    input: UpdateApplicationInput,
) -> Result<Application, String> {
    if let Some(ref status) = input.status {
        validate_status(status)?;
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref company) = input.company {
        sets.push("company = ?".to_string());
        params.push(Box::new(company.clone()));
    }
    if let Some(ref role_title) = input.role_title {
        sets.push("role_title = ?".to_string());
        params.push(Box::new(role_title.clone()));
    }
    if let Some(ref url) = input.url {
        sets.push("url = ?".to_string());
        params.push(Box::new(url.clone()));
    }
    if let Some(ref status) = input.status {
        sets.push("status = ?".to_string());
        params.push(Box::new(status.clone()));
    }
    if let Some(ref applied_at) = input.applied_at {
        sets.push("applied_at = ?".to_string());
        params.push(Box::new(applied_at.clone()));
    }
    if let Some(ref notes) = input.notes {
        sets.push("notes = ?".to_string());
        params.push(Box::new(notes.clone()));
    }

    if sets.is_empty() {
        return Err("No fields to update".to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());
    params.push(Box::new(input.id));

    let sql = format!("UPDATE applications SET {} WHERE id = ?", sets.join(", "));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let affected = conn
        .execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Application with id {} not found", input.id));
    }

    select_application_row(&conn, input.id)
}

/// Delete a tracked application by ID.
#[tauri::command]
pub fn delete_application(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM applications WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Application with id {} not found", id));
    }
    Ok(())
}

// ──────────────────────────────────────────────
// App settings (generic key/value)
// ──────────────────────────────────────────────

/// Read a value from the generic `app_settings` table, e.g. the
/// `onboarding_complete` first-run flag. `None` if the key is unset.
#[tauri::command]
pub fn get_app_setting(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", [key], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

/// Write a value into the generic `app_settings` table.
#[tauri::command]
pub fn set_app_setting(state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
