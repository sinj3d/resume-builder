"""Optional read-only access to the app's SQLite database.

The generic pipeline only reads cover letter TEMPLATES from the app (builtins
plus any the user added — extra diversity for the training pool). No personal
data (bullets, bio) is ever read: the model must stay a drop-in generic
artifact. A missing DB is fine; profiles.get_template_pool() falls back to the
synthetic pool.
"""
import sqlite3

from config import DB_PATH


def load_templates() -> list[dict]:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"App database not found at {DB_PATH} (set RESUME_DB to override).")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            """SELECT id, name, content, is_builtin
               FROM cover_letter_templates ORDER BY is_builtin DESC, name"""
        ).fetchall()
    finally:
        conn.close()
    return [
        {"id": r[0], "name": r[1], "content": r[2], "is_builtin": bool(r[3])}
        for r in rows
    ]


if __name__ == "__main__":
    try:
        templates = load_templates()
        print(f"DB: {DB_PATH}")
        print(f"templates: {len(templates)} ({sum(t['is_builtin'] for t in templates)} builtin)")
    except sqlite3.OperationalError as e:
        if "cover_letter_templates" in str(e):
            raise SystemExit(
                "The cover_letter_templates table does not exist yet — launch the "
                "updated app once so migrations run and the builtin templates are "
                "seeded. (The pipeline can also run without the app DB.)"
            )
        raise
