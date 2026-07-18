/// Builtin cover letter templates seeded into `cover_letter_templates` exactly
/// once on first launch (guarded by the `builtin_templates_seeded` marker in
/// `app_settings`, see `run_migrations`). Users may edit or delete them freely;
/// they are never re-inserted afterwards.
///
/// Template content is written as structural guidance the LLM follows — see the
/// `=== COVER LETTER TEMPLATE ===` section in `crate::llm::prompt`. Bracketed
/// placeholders are filled by the model from real data only; a placeholder with
/// no real source (e.g. `[Referrer name]`) is left verbatim for the user.
pub const BUILTIN_TEMPLATES: &[(&str, &str)] = &[
    (
        "Traditional Three-Paragraph",
        r#"Structure: classic three-paragraph letter.

Dear [Hiring Manager],

Paragraph 1 — Introduction: state the role being applied for and where it was found. Give a one-sentence hook connecting the strongest relevant experience to the company's mission or product.

Paragraph 2 — Evidence: present the 2-3 strongest experiences that match the job requirements. Use concrete outcomes (numbers, technologies, results). Connect each experience explicitly to a requirement from the job description.

Paragraph 3 — Closing: reiterate enthusiasm for the role, state what you would bring to the team, and ask for an interview.

Sincerely,
[Name]

Tone: professional and confident. Length: 300-400 words."#,
    ),
    (
        "T-Format (Requirements vs Experience)",
        r#"Structure: T-format letter that directly maps job requirements to experience.

Dear [Hiring Manager],

Opening paragraph (2-3 sentences): name the role and summarize in one sentence why you are a strong match.

Requirements mapping — 3-4 pairings, each as its own short block, in exactly this form:
You need: [a key requirement quoted or paraphrased from the job description]
I bring: [a matching experience with a concrete metric or technology]

Closing paragraph (2-3 sentences): brief enthusiasm and a call to action.

Sincerely,
[Name]

Tone: direct and factual. Length: 250-350 words."#,
    ),
    (
        "Narrative / Storytelling",
        r#"Structure: storytelling letter built around one real experience.

Dear [Hiring Manager],

Opening: begin with a brief, specific anecdote (2-4 sentences) drawn from one of the listed experiences — a moment of challenge, discovery, or achievement. Do NOT open with "I am applying for...".

Middle: connect the story's arc to the role — show how the skills demonstrated in the anecdote, plus 1-2 supporting experiences, map to what the job requires.

Closing: tie the story back to why this specific company and role are the natural next chapter, then ask for a conversation.

Sincerely,
[Name]

Tone: warm, personal, vivid but professional. Length: 350-450 words."#,
    ),
    (
        "Problem-Solution",
        r#"Structure: problem-solution letter positioning the candidate as the answer to the team's core need.

Dear [Hiring Manager],

Paragraph 1 — The problem: infer from the job description the core problem this role exists to solve, and name it in one or two sentences.

Paragraphs 2-3 — The evidence: show analogous problems already solved, one experience per paragraph, each with measurable results. Explicitly draw the parallel between what was done and what this role needs.

Paragraph 4 — The close: state what you would tackle first in this role and invite a conversation.

Sincerely,
[Name]

Tone: strategic and consultative. Length: 300-400 words."#,
    ),
    (
        "Short and Punchy",
        r#"Structure: ultra-concise letter, three short paragraphs.

Dear [Hiring Manager],

Paragraph 1: one-line hook — the single strongest reason this candidate fits the role.

Paragraph 2: three tight sentences of evidence, each anchored to a concrete number, technology, or outcome from the listed experiences.

Paragraph 3: one-line close with a call to action.

Sincerely,
[Name]

Tone: crisp and confident. No filler phrases ("I am writing to express...") and no repetition. Length: 150-200 words total."#,
    ),
    (
        "Referral / Networking",
        r#"Structure: referral letter that opens with the connection.

Dear [Hiring Manager],

Paragraph 1: open by naming the referrer — [Referrer name], [relationship to the candidate or company] — and why they suggested this role would fit. The referrer is NOT known from the experiences or job description, so keep these bracketed placeholders verbatim for the user to fill in.

Paragraph 2: map the 2-3 most relevant experiences to the role's requirements with concrete outcomes.

Paragraph 3: warm close referencing the referrer once more and asking for a conversation.

Sincerely,
[Name]

Tone: warm and collegial. Length: 250-350 words."#,
    ),
    (
        "Career Change",
        r#"Structure: career-change letter that frames the transition as an asset.

Dear [Hiring Manager],

Paragraph 1: acknowledge the transition up front — name the field the candidate comes from and the direction they are heading — and frame it as a deliberate, motivated choice.

Paragraph 2: map transferable accomplishments from the listed experiences to the new field's requirements. Focus on skills that cross domains (leadership, analysis, shipping results) and anchor each in a concrete outcome.

Paragraph 3: address the obvious gap honestly — name what has not been done yet, paired with evidence of fast learning or steps already taken.

Paragraph 4: close with why this specific role is the right entry point and ask for a conversation.

Sincerely,
[Name]

Tone: candid, motivated, forward-looking. Length: 350-450 words."#,
    ),
];
