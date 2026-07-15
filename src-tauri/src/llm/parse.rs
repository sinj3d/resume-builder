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
      "category": "one of: Work, Project, Education, Competition, Leadership, Volunteer",
      "bullets": ["one accomplishment or responsibility per string"]
    }
  ]
}
Rules:
- Group each role, project, or degree into its own experience object.
- Put each accomplishment or responsibility as a separate string in "bullets".
- Choose the category carefully for every experience:
  - "Work": paid jobs, internships, co-ops, research positions.
  - "Education": degrees, schools, universities, bootcamps.
  - "Project": personal or side projects, coursework projects.
  - "Competition": hackathons, contests, olympiads, competitive events.
  - "Leadership": club officer roles, team lead or mentoring positions.
  - "Volunteer": unpaid community or charity work.
- Use the resume's own section headings (e.g. "Projects", "Competitions") as the strongest hint for the category.
- Only use information that appears in the resume text.
- Output only the JSON object.

Resume text:
"#;

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
}
