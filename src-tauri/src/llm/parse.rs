//! Specialized, **local-only** resume-text → structured-JSON parsing.
//!
//! This module powers the offline resume importer. The two responsibilities that
//! don't need a model in memory — building the parser prompt and recovering a
//! clean JSON object from the model's raw output — live here as pure functions so
//! they can be unit-tested without downloading or loading the GGUF.
//!
//! The actual generation is done by [`crate::llm::generate_local_parse`] using the
//! auto-downloaded parser model (see [`crate::llm::model`]).

/// System instruction for the parser model.
///
/// Tuned for small instruct models: terse, single-responsibility, and heavy on
/// "JSON only" guardrails so we don't have to fight prose in the output.
const PARSE_SYSTEM_PROMPT: &str = "You are a precise resume parser. You convert raw resume text into a single structured JSON object. You output ONLY that JSON object and nothing else: no prose, no explanations, no markdown code fences. If a field is missing, use an empty string. Never invent facts that are not present in the resume text.";

/// User-turn instructions + schema. Kept as a raw string (not a format template)
/// so the literal JSON braces don't need escaping.
const PARSE_INSTRUCTIONS: &str = r#"Parse the resume text below into a single JSON object with exactly this schema:
{
  "experiences": [
    {
      "title": "role, project, or degree title",
      "org": "company / organization / school (empty string if none)",
      "start_date": "e.g. Jan 2020 (empty string if none)",
      "end_date": "e.g. Present (empty string if none)",
      "section": "the resume section heading this item appears under, copied verbatim (empty string if none)",
      "category": "one of: Work, Project, Education, Competition, Leadership, Volunteer",
      "bullets": ["one accomplishment or responsibility per string"]
    }
  ]
}
Rules:
- Group each role, project, or degree into its own experience object.
- Put each accomplishment or responsibility as a separate string in "bullets".
- For "section", copy the exact heading the item is listed under (e.g. "Work Experience", "Projects", "Leadership"). This is the most important signal for the category.
- Choose the category carefully for every experience:
  - "Work": paid jobs, internships, co-ops, research positions.
  - "Education": degrees, schools, universities, bootcamps.
  - "Project": personal or side projects, coursework projects.
  - "Competition": hackathons, contests, olympiads, competitive events.
  - "Leadership": club officer roles, team lead or mentoring positions.
  - "Volunteer": unpaid community or charity work.
- Use the resume's own section headings as the strongest hint for the category.
- Only use information that appears in the resume text.
- Output only the JSON object.

Examples of choosing the category from the section heading:
- Under "Work Experience": "Software Engineer Intern, Acme" -> "Work".
- Under "Projects": "Personal Budgeting App" -> "Project".
- Under "Awards" or "Competitions": "1st Place, HackTheNorth" -> "Competition".
- Under "Leadership" or "Activities": "President, Robotics Club" -> "Leadership".
- Under "Volunteering": "Food Bank Helper" -> "Volunteer".

Resume text:
"#;

// NOTE: an earlier version constrained decoding with a GBNF grammar (pinning the
// JSON schema and the six-value category enum). It was removed because it crashed
// the parser at runtime — grammar-constrained decoding can hard-abort inside
// llama.cpp (a native abort/exception that a Rust `Result` can't catch). Category
// correctness is instead guaranteed downstream by `postprocess_experiences`
// (section-heading override + canonicalization), which touches no decoding.

/// Build a ChatML-formatted prompt for a Qwen2.5-style instruct model
/// (the auto-downloaded parser model). ChatML is the template that model expects.
pub fn build_parse_prompt(resume_text: &str) -> String {
    let user = format!("{instructions}\"\"\"\n{text}\n\"\"\"", instructions = PARSE_INSTRUCTIONS, text = resume_text);
    format!(
        "<|im_start|>system\n{sys}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n",
        sys = PARSE_SYSTEM_PROMPT,
        user = user,
    )
}

/// Recover the first well-formed JSON object from a model's raw output.
///
/// Small local models routinely wrap JSON in markdown fences, add a sentence of
/// preamble, or leave ChatML residue. Rather than trust the model to be clean, we
/// scan for the first `{` and walk to its matching `}` (honoring string literals
/// and escapes), then strip trailing commas and validate the result parses.
pub fn extract_json_object(raw: &str) -> Result<String, String> {
    let bytes = raw.as_bytes();
    let start = raw
        .find('{')
        .ok_or_else(|| "No JSON object found in the model output.".to_string())?;

    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escaped = false;
    let mut end: Option<usize> = None;

    for i in start..bytes.len() {
        let c = bytes[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if c == b'\\' {
                escaped = true;
            } else if c == b'"' {
                in_string = false;
            }
        } else {
            match c {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
    }

    let end = end.ok_or_else(|| "The model output contained an unterminated JSON object.".to_string())?;
    // `start` and `end` both land on ASCII braces, so slicing is UTF-8 safe.
    let candidate = &raw[start..=end];
    let cleaned = strip_trailing_commas(candidate);

    serde_json::from_str::<serde_json::Value>(&cleaned)
        .map_err(|e| format!("The model did not return valid JSON: {}", e))?;

    Ok(cleaned)
}

/// Validate that an extracted JSON payload carries the shape the importer expects.
pub fn validate_experiences(json_str: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Parsed output was not valid JSON: {}", e))?;

    match value.get("experiences") {
        Some(serde_json::Value::Array(_)) => Ok(()),
        _ => Err("Parsed JSON is missing an 'experiences' array.".to_string()),
    }
}

/// The canonical stored category values, matching the frontend's category
/// dropdown and understood by `normalize_category` in the LaTeX renderer.
const CANONICAL_CATEGORIES: [&str; 6] = [
    "Professional Experience",
    "Education",
    "Project",
    "Competition",
    "Leadership",
    "Volunteer",
];
/// Used when neither the section heading nor the model's category is recognized.
const DEFAULT_CATEGORY: &str = "Professional Experience";

/// Map the model's category token (or any synonym) to a canonical stored value,
/// or `None` if it isn't recognized.
fn canonical_category(raw: &str) -> Option<String> {
    let c = match raw.trim().to_ascii_lowercase().as_str() {
        "work" | "professional experience" | "job" | "employment" | "internship" | "research" => {
            "Professional Experience"
        }
        "education" | "school" | "academic" => "Education",
        "project" | "projects" => "Project",
        "competition" | "competitions" | "hackathon" | "contest" | "olympiad" => "Competition",
        "leadership" => "Leadership",
        "volunteer" | "volunteering" | "volunteer experience" => "Volunteer",
        _ => return None,
    };
    Some(c.to_string())
}

/// Infer the canonical category from a resume section heading, or `None` when
/// the heading gives no clear signal. Order matters: the specific sections are
/// checked before the generic "experience"/"work" catch-all so that
/// "Volunteer Experience" and "Leadership Experience" don't fall through to
/// Professional Experience.
fn category_from_section(heading: &str) -> Option<String> {
    let h = heading.to_ascii_lowercase();
    let has = |kw: &str| h.contains(kw);
    let c = if has("education") || has("academic") {
        "Education"
    } else if has("volunteer") {
        "Volunteer"
    } else if has("leadership") {
        "Leadership"
    } else if has("competition") || has("hackathon") || has("contest") || has("olympiad") {
        "Competition"
    } else if has("project") {
        "Project"
    } else if has("experience") || has("employment") || has("work") || has("professional") || has("internship") {
        "Professional Experience"
    } else {
        return None;
    };
    Some(c.to_string())
}

/// Normalize each parsed experience's category and drop the transient `section`
/// field. The model tags every experience with the verbatim resume heading it
/// sat under; that heading is a stronger category signal than the model's own
/// guess, so it wins when recognized, then we fall back to the model's category,
/// then to a safe default. Guarantees the stored category is always one of
/// [`CANONICAL_CATEGORIES`], so nothing lands uncategorized or off-vocabulary.
pub fn postprocess_experiences(json_str: &str) -> Result<String, String> {
    let mut value: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Parsed output was not valid JSON: {}", e))?;

    if let Some(arr) = value.get_mut("experiences").and_then(|v| v.as_array_mut()) {
        for exp in arr.iter_mut() {
            let Some(obj) = exp.as_object_mut() else { continue };
            let section = obj.get("section").and_then(|v| v.as_str()).unwrap_or("");
            let model_cat = obj.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let category = category_from_section(section)
                .or_else(|| canonical_category(model_cat))
                .unwrap_or_else(|| DEFAULT_CATEGORY.to_string());
            debug_assert!(
                CANONICAL_CATEGORIES.contains(&category.as_str()),
                "non-canonical category slipped through: {category}"
            );
            obj.insert("category".to_string(), serde_json::Value::String(category));
            obj.remove("section");
        }
    }

    serde_json::to_string(&value).map_err(|e| format!("Failed to re-serialize parsed JSON: {}", e))
}

/// Remove commas that immediately precede a `}` or `]` (JSON forbids them, but
/// language models frequently emit them). String contents are left untouched.
fn strip_trailing_commas(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut in_string = false;
    let mut escaped = false;

    for i in 0..chars.len() {
        let c = chars[i];

        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            continue;
        }

        if c == ',' {
            // Look ahead past whitespace for the next meaningful char.
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == '}' || chars[j] == ']') {
                // Drop this trailing comma.
                continue;
            }
        }

        out.push(c);
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_contains_system_and_resume() {
        let prompt = build_parse_prompt("Jane Doe — Software Engineer at Acme");
        assert!(prompt.contains("<|im_start|>system"));
        assert!(prompt.contains("<|im_start|>user"));
        assert!(prompt.contains("<|im_start|>assistant"));
        assert!(prompt.contains("precise resume parser"));
        assert!(prompt.contains("Jane Doe — Software Engineer at Acme"));
        // Schema keys must be present so the model targets the right shape.
        assert!(prompt.contains("\"experiences\""));
        assert!(prompt.contains("\"bullets\""));
    }

    #[test]
    fn test_extract_plain_json() {
        let raw = r#"{"experiences": []}"#;
        assert_eq!(extract_json_object(raw).unwrap(), r#"{"experiences": []}"#);
    }

    #[test]
    fn test_extract_from_markdown_fence() {
        let raw = "```json\n{\"experiences\": [{\"title\": \"SWE\"}]}\n```";
        let out = extract_json_object(raw).unwrap();
        assert!(out.starts_with('{') && out.ends_with('}'));
        assert!(out.contains("\"title\": \"SWE\""));
    }

    #[test]
    fn test_extract_ignores_prose_and_chatml_residue() {
        let raw = "Sure! Here is the JSON you asked for:\n{\"experiences\": []}<|im_end|>";
        assert_eq!(extract_json_object(raw).unwrap(), r#"{"experiences": []}"#);
    }

    #[test]
    fn test_extract_handles_braces_inside_strings() {
        // A bullet that itself contains braces must not confuse the brace matcher.
        let raw = r#"{"experiences": [{"title": "Wrote a {templating} engine"}]}"#;
        let out = extract_json_object(raw).unwrap();
        assert!(out.contains("Wrote a {templating} engine"));
        // Round-trips as valid JSON.
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(v["experiences"].is_array());
    }

    #[test]
    fn test_extract_strips_trailing_commas() {
        let raw = "{\"experiences\": [{\"title\": \"SWE\",}],}";
        let out = extract_json_object(raw).unwrap();
        // Must now be valid JSON that serde accepts.
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["experiences"][0]["title"], "SWE");
    }

    #[test]
    fn test_extract_errors_without_json() {
        assert!(extract_json_object("I could not parse this resume.").is_err());
    }

    #[test]
    fn test_validate_experiences_ok_and_err() {
        assert!(validate_experiences(r#"{"experiences": []}"#).is_ok());
        assert!(validate_experiences(r#"{"jobs": []}"#).is_err());
        assert!(validate_experiences(r#"{"experiences": "nope"}"#).is_err());
    }

    #[test]
    fn test_prompt_carries_section_and_examples() {
        let prompt = build_parse_prompt("resume");
        assert!(prompt.contains("\"section\""), "schema must ask for a section");
        assert!(prompt.contains("Examples of choosing the category"), "few-shot examples missing");
    }

    #[test]
    fn test_canonical_category_maps_synonyms() {
        assert_eq!(canonical_category("Work").as_deref(), Some("Professional Experience"));
        assert_eq!(canonical_category("research").as_deref(), Some("Professional Experience"));
        assert_eq!(canonical_category("projects").as_deref(), Some("Project"));
        assert_eq!(canonical_category("Hackathon").as_deref(), Some("Competition"));
        assert_eq!(canonical_category("nonsense"), None);
    }

    #[test]
    fn test_category_from_section_priority() {
        // Specific sections beat the generic "experience"/"work" catch-all.
        assert_eq!(category_from_section("Volunteer Experience").as_deref(), Some("Volunteer"));
        assert_eq!(category_from_section("Leadership & Activities").as_deref(), Some("Leadership"));
        assert_eq!(category_from_section("Relevant Projects").as_deref(), Some("Project"));
        assert_eq!(category_from_section("Work Experience").as_deref(), Some("Professional Experience"));
        assert_eq!(category_from_section("Education").as_deref(), Some("Education"));
        assert_eq!(category_from_section("Publications"), None);
    }

    #[test]
    fn test_postprocess_section_heading_overrides_model_and_strips_field() {
        // Model guessed "Work", but the item sits under "Projects": heading wins.
        let raw = r#"{"experiences":[{"title":"X","org":"","start_date":"","end_date":"","section":"Projects","category":"Work","bullets":[]}]}"#;
        let out = postprocess_experiences(raw).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["experiences"][0]["category"], "Project");
        assert!(v["experiences"][0].get("section").is_none(), "section must be stripped");
    }

    #[test]
    fn test_postprocess_falls_back_to_model_then_default() {
        // Unmapped section -> normalize the model's own category ("Work" -> canonical).
        let a = postprocess_experiences(
            r#"{"experiences":[{"title":"X","section":"","category":"Work","bullets":[]}]}"#,
        ).unwrap();
        let va: serde_json::Value = serde_json::from_str(&a).unwrap();
        assert_eq!(va["experiences"][0]["category"], "Professional Experience");

        // Nothing recognized anywhere -> safe default, never uncategorized.
        let b = postprocess_experiences(
            r#"{"experiences":[{"title":"X","section":"Blah","category":"???","bullets":[]}]}"#,
        ).unwrap();
        let vb: serde_json::Value = serde_json::from_str(&b).unwrap();
        assert_eq!(vb["experiences"][0]["category"], "Professional Experience");
    }
}
