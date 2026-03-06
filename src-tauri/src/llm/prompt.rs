/// Strict prompt template enforcing the zero-hallucination policy.
/// The LLM must ONLY use the experiences provided — no invention allowed.

/// Build the full prompt for cover letter generation.
///
/// # Arguments
/// * `retrieved_bullets` - The user's relevant bullet points, pre-ranked by RAG.
/// * `job_description`  - The target job description pasted by the user.
pub fn build_prompt(retrieved_bullets: &[String], job_description: &str) -> String {
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

    format!(
        r#"System: You are a professional cover letter writer.
You MUST ONLY use the experiences listed below. Do NOT invent any skills, projects,
or employment history that are not explicitly provided. If the job description
requires experience that is not listed below, acknowledge that gap honestly
rather than fabricating credentials.

=== USER'S RELEVANT EXPERIENCES ===
{bullets}

=== TARGET JOB DESCRIPTION ===
{jd}

=== INSTRUCTIONS ===
Write a compelling, personalized cover letter that:
1. Opens with genuine enthusiasm for the specific role and company.
2. Maps the user's listed experiences to the job requirements.
3. Uses concrete details from the bullet points (numbers, technologies, outcomes).
4. Maintains a professional but personable tone.
5. Is approximately 300-400 words.
6. Does NOT include any experience, skill, or achievement not listed above."#,
        bullets = bullets_section,
        jd = job_description,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_includes_bullets_and_jd() {
        let bullets = vec![
            "Built a REST API serving 10k req/s".to_string(),
            "Reduced latency by 40%".to_string(),
        ];
        let jd = "Looking for a backend engineer with API experience.";

        let prompt = build_prompt(&bullets, jd);

        assert!(prompt.contains("1. Built a REST API serving 10k req/s"));
        assert!(prompt.contains("2. Reduced latency by 40%"));
        assert!(prompt.contains(jd));
        assert!(prompt.contains("MUST ONLY use the experiences listed below"));
        assert!(prompt.contains("Do NOT invent"));
    }

    #[test]
    fn test_prompt_handles_empty_bullets() {
        let prompt = build_prompt(&[], "Some JD text");
        assert!(prompt.contains("No relevant experiences found"));
    }
}
