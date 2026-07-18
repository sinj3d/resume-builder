"""Exact Python mirror of the app's cover-letter prompt builder.

KEEP IN SYNC: this mirrors `src-tauri/src/llm/prompt.rs` byte-for-byte so the
fine-tuned model trains on exactly the prompt the app builds at inference time.
Any change on either side must update both implementations and the golden files
in src-tauri/src/llm/golden/. Verify parity with:

    python prompt_builder.py --selftest
"""
import sys

from config import GOLDEN_DIR

SYSTEM_PROMPT = (
    "You are a professional cover letter writer.\n"
    "You MUST ONLY use the experiences listed below. Do NOT invent any skills, projects,\n"
    "or employment history that are not explicitly provided. If the job description\n"
    "requires experience that is not listed below, acknowledge that gap honestly\n"
    "rather than fabricating credentials."
)


def build_prompt_parts(retrieved_bullets: list[str], job_description: str,
                       template: str | None = None,
                       candidate_name: str | None = None) -> tuple[str, str]:
    """Returns (system, user) — mirror of prompt.rs::build_prompt_parts."""
    if retrieved_bullets:
        bullets_section = "\n".join(f"{i + 1}. {b}" for i, b in enumerate(retrieved_bullets))
    else:
        bullets_section = "No relevant experiences found in the database."

    template = template.strip() if template is not None else None
    if not template:
        template = None

    if template is not None:
        template_section = (
            "=== COVER LETTER TEMPLATE ===\n"
            "Follow this template's structure, section order, length guidance, and tone.\n"
            "Replace any bracketed placeholders with real content drawn ONLY from the\n"
            "experiences listed above. The template never overrides the rules below:\n"
            "never invent experience to fill a template section.\n"
            f"{template}\n\n"
        )
        length_rule = (
            "5. Matches the length and tone specified in the COVER LETTER TEMPLATE "
            "(default 300-400 words if the template does not specify)."
        )
    else:
        template_section = ""
        length_rule = "5. Is approximately 300-400 words."

    name = candidate_name.strip() if candidate_name else ""
    if name:
        signoff = (
            f'7. Signs off with "Sincerely," followed by the name {name}.\n'
            '8. Starts directly with the salutation (e.g. "Dear Hiring Manager,") '
            "— do NOT add any address or contact header."
        )
    else:
        signoff = (
            '7. Starts directly with the salutation (e.g. "Dear Hiring Manager,") '
            "— do NOT add any address or contact header."
        )

    user = (
        "=== USER'S RELEVANT EXPERIENCES ===\n"
        f"{bullets_section}\n"
        "\n"
        "=== TARGET JOB DESCRIPTION ===\n"
        f"{job_description}\n"
        "\n"
        f"{template_section}=== INSTRUCTIONS ===\n"
        "Write a compelling, personalized cover letter that:\n"
        "1. Opens with genuine enthusiasm for the specific role and company.\n"
        "2. Maps the user's listed experiences to the job requirements.\n"
        "3. Uses concrete details from the bullet points (numbers, technologies, outcomes).\n"
        "4. Maintains a professional but personable tone.\n"
        f"{length_rule}\n"
        "6. Does NOT include any experience, skill, or achievement not listed above.\n"
        f"{signoff}"
    )

    return SYSTEM_PROMPT, user


def joined(system: str, user: str) -> str:
    """Mirror of PromptParts::joined — the single-string prompt form."""
    return f"System: {system}\n\n{user}"


def _read_golden(name: str) -> str:
    # Golden files may be checked out with CRLF on Windows.
    return (GOLDEN_DIR / name).read_text(encoding="utf-8").replace("\r\n", "\n")


def selftest() -> None:
    """Assert byte-parity with the Rust golden files (same fixture as the Rust
    test `test_prompt_matches_golden_files`)."""
    import difflib

    bullets = ["Built a REST API serving 10k req/s", "Reduced latency by 40%"]
    jd = "Looking for a backend engineer with API experience."
    fixture_template = _read_golden("fixture_template.txt")

    cases = [
        ("prompt_no_template.golden.txt", None),
        ("prompt_with_template.golden.txt", fixture_template),
    ]
    for golden_name, template in cases:
        golden = _read_golden(golden_name)
        system, user = build_prompt_parts(bullets, jd, template, "Jane Doe")
        actual = joined(system, user)
        if actual != golden:
            diff = "\n".join(difflib.unified_diff(
                golden.splitlines(), actual.splitlines(),
                fromfile=f"rust:{golden_name}", tofile="python", lineterm=""))
            raise SystemExit(f"PARITY FAILURE against {golden_name}:\n{diff}")

    print("selftest OK — Python prompt builder matches the Rust golden files.")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        print(__doc__)
