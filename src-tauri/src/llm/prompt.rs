/// Strict prompt template enforcing the zero-hallucination policy.
/// The LLM must ONLY use the experiences provided — no invention allowed.
///
/// KEEP IN SYNC: `training/prompt_builder.py` mirrors this builder byte-for-byte
/// so the fine-tuned local model sees the exact prompt format it was trained on.
/// Any change here must be applied to the Python mirror and the golden files in
/// `src/llm/golden/` (regenerate with: `REGEN_GOLDEN=1 cargo test golden`).

/// The prompt split into chat roles: `system` carries the policy, `user` the
/// task. Local generation feeds these through the model's chat template; cloud
/// mode and the UI's prompt display join them via `build_prompt`.
pub struct PromptParts {
    pub system: String,
    pub user: String,
}

impl PromptParts {
    /// Join into the single-string form used by cloud mode and the UI display.
    pub fn joined(&self) -> String {
        format!("System: {}\n\n{}", self.system, self.user)
    }
}

const SYSTEM_PROMPT: &str = "You are a professional cover letter writer.
You MUST ONLY use the experiences listed below. Do NOT invent any skills, projects,
or employment history that are not explicitly provided. If the job description
requires experience that is not listed below, acknowledge that gap honestly
rather than fabricating credentials.";

/// Build the prompt for cover letter generation, split into system/user parts.
///
/// # Arguments
/// * `retrieved_bullets` - The user's relevant bullet points, pre-ranked by RAG.
/// * `job_description`  - The target job description pasted by the user.
/// * `template`         - Optional cover letter template the output must follow.
/// * `candidate_name`   - The user's name for the sign-off (contact details are
///                        prepended programmatically, never by the model).
pub fn build_prompt_parts(
    retrieved_bullets: &[String],
    job_description: &str,
    template: Option<&str>,
    candidate_name: Option<&str>,
) -> PromptParts {
    let bullets_section = if retrieved_bullets.is_empty() {
        "No relevant experiences found in the database.".to_string()
    } else {
        retrieved_bullets
            .iter()
            .enumerate()
            .map(|(i, b)| format!("{}. {}", i + 1, b))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let template = template.map(str::trim).filter(|t| !t.is_empty());

    let template_section = match template {
        Some(t) => format!(
            "=== COVER LETTER TEMPLATE ===\n\
             Follow this template's structure, section order, length guidance, and tone.\n\
             Replace any bracketed placeholders with real content drawn ONLY from the\n\
             experiences listed above. The template never overrides the rules below:\n\
             never invent experience to fill a template section.\n\
             {}\n\n",
            t
        ),
        None => String::new(),
    };

    let length_rule = if template.is_some() {
        "5. Matches the length and tone specified in the COVER LETTER TEMPLATE (default 300-400 words if the template does not specify)."
    } else {
        "5. Is approximately 300-400 words."
    };

    let signoff = match candidate_name {
        Some(name) if !name.trim().is_empty() => {
            format!("7. Signs off with \"Sincerely,\" followed by the name {}.\n8. Starts directly with the salutation (e.g. \"Dear Hiring Manager,\") — do NOT add any address or contact header.", name.trim())
        }
        _ => "7. Starts directly with the salutation (e.g. \"Dear Hiring Manager,\") — do NOT add any address or contact header.".to_string(),
    };

    let user = format!(
        r#"=== USER'S RELEVANT EXPERIENCES ===
{bullets}

=== TARGET JOB DESCRIPTION ===
{jd}

{template_section}=== INSTRUCTIONS ===
Write a compelling, personalized cover letter that:
1. Opens with genuine enthusiasm for the specific role and company.
2. Maps the user's listed experiences to the job requirements.
3. Uses concrete details from the bullet points (numbers, technologies, outcomes).
4. Maintains a professional but personable tone.
{length_rule}
6. Does NOT include any experience, skill, or achievement not listed above.
{signoff}"#,
        bullets = bullets_section,
        jd = job_description,
        template_section = template_section,
        length_rule = length_rule,
        signoff = signoff,
    );

    PromptParts {
        system: SYSTEM_PROMPT.to_string(),
        user,
    }
}

/// Single-string form of the prompt, used for cloud generation and the UI's
/// prompt display. Byte-identical to the pre-template-feature prompt when
/// `template` is `None`.
pub fn build_prompt(
    retrieved_bullets: &[String],
    job_description: &str,
    template: Option<&str>,
    candidate_name: Option<&str>,
) -> String {
    build_prompt_parts(retrieved_bullets, job_description, template, candidate_name).joined()
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOLDEN_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/llm/golden");

    /// Golden files may be checked out with CRLF on Windows.
    fn normalize(s: &str) -> String {
        s.replace("\r\n", "\n")
    }

    #[test]
    fn test_prompt_includes_bullets_and_jd() {
        let bullets = vec![
            "Built a REST API serving 10k req/s".to_string(),
            "Reduced latency by 40%".to_string(),
        ];
        let jd = "Looking for a backend engineer with API experience.";

        let prompt = build_prompt(&bullets, jd, None, Some("Jane Doe"));

        assert!(prompt.contains("1. Built a REST API serving 10k req/s"));
        assert!(prompt.contains("2. Reduced latency by 40%"));
        assert!(prompt.contains(jd));
        assert!(prompt.contains("MUST ONLY use the experiences listed below"));
        assert!(prompt.contains("Do NOT invent"));
        assert!(prompt.contains("followed by the name Jane Doe"));
        assert!(prompt.contains("do NOT add any address or contact header"));
    }

    #[test]
    fn test_prompt_handles_empty_bullets() {
        let prompt = build_prompt(&[], "Some JD text", None, None);
        assert!(prompt.contains("No relevant experiences found"));
        assert!(!prompt.contains("followed by the name"));
    }

    #[test]
    fn test_prompt_template_section() {
        let bullets = vec!["Shipped a feature".to_string()];

        let with = build_prompt(&bullets, "JD", Some("Two paragraphs, max 150 words."), None);
        assert!(with.contains("=== COVER LETTER TEMPLATE ==="));
        assert!(with.contains("Two paragraphs, max 150 words."));
        assert!(with.contains("Matches the length and tone specified in the COVER LETTER TEMPLATE"));
        assert!(!with.contains("5. Is approximately 300-400 words."));

        let without = build_prompt(&bullets, "JD", None, None);
        assert!(!without.contains("=== COVER LETTER TEMPLATE ==="));
        assert!(without.contains("5. Is approximately 300-400 words."));

        // Blank template behaves like no template.
        let blank = build_prompt(&bullets, "JD", Some("   "), None);
        assert!(!blank.contains("=== COVER LETTER TEMPLATE ==="));
    }

    /// Golden-file parity test — the contract keeping this builder and
    /// `training/prompt_builder.py` identical (the Python side asserts the same
    /// files via `--selftest`). Regenerate with: `REGEN_GOLDEN=1 cargo test golden`.
    #[test]
    fn test_prompt_matches_golden_files() {
        let bullets = vec![
            "Built a REST API serving 10k req/s".to_string(),
            "Reduced latency by 40%".to_string(),
        ];
        let jd = "Looking for a backend engineer with API experience.";
        let template = normalize(
            &std::fs::read_to_string(format!("{}/fixture_template.txt", GOLDEN_DIR)).unwrap(),
        );

        let no_template = build_prompt(&bullets, jd, None, Some("Jane Doe"));
        let with_template = build_prompt(&bullets, jd, Some(&template), Some("Jane Doe"));

        let no_path = format!("{}/prompt_no_template.golden.txt", GOLDEN_DIR);
        let with_path = format!("{}/prompt_with_template.golden.txt", GOLDEN_DIR);

        if std::env::var("REGEN_GOLDEN").is_ok() {
            std::fs::write(&no_path, &no_template).unwrap();
            std::fs::write(&with_path, &with_template).unwrap();
        }

        assert_eq!(
            normalize(&std::fs::read_to_string(&no_path).unwrap()),
            no_template
        );
        assert_eq!(
            normalize(&std::fs::read_to_string(&with_path).unwrap()),
            with_template
        );
    }
}
