"""Collect REAL job descriptions from public job-board APIs → data/jds.jsonl.

Sources (all public JSON endpoints, one bulk request per board, no auth):
- RemoteOK:   https://remoteok.com/api
- Greenhouse: https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
- Lever:      https://api.lever.co/v0/postings/<slug>?mode=json

Postings are cleaned to plain text, filtered by length/language, deduped, and
capped at N_JDS_TARGET; N_EVAL_JDS are reserved for eval and never trained on.
Dead board slugs are skipped. Raw responses are cached under data/cache/scrape/
so reruns don't re-hit the boards.
"""
import hashlib
import html
import json
import random
import re
import time

import requests

import config

HEADERS = {"User-Agent": "resume-builder-training/1.0 (personal research; low volume)"}


def _cached_get(name: str, url: str):
    cache_dir = config.CACHE_DIR / "scrape"
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.5)  # be polite between boards
    return data


def _strip_html(text: str) -> str:
    text = html.unescape(html.unescape(text))  # Greenhouse double-escapes
    text = re.sub(r"<(br|/p|/div|/li|/h[1-6])\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _mostly_english(text: str) -> bool:
    if not text:
        return False
    ascii_ratio = sum(1 for c in text if ord(c) < 128) / len(text)
    return ascii_ratio > 0.9


def scrape_remoteok() -> list[dict]:
    out = []
    try:
        data = _cached_get("remoteok", "https://remoteok.com/api")
    except Exception as e:
        print(f"  remoteok failed: {e}")
        return out
    for item in data:
        if not isinstance(item, dict) or "position" not in item:
            continue  # first element is a legal notice
        text = _strip_html(item.get("description", "") or "")
        out.append({"title": item.get("position", ""), "company": item.get("company", ""),
                    "source": "remoteok", "text": text})
    return out


def scrape_greenhouse(slug: str) -> list[dict]:
    out = []
    try:
        data = _cached_get(f"gh_{slug}",
                           f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true")
    except Exception as e:
        print(f"  greenhouse/{slug} skipped: {e}")
        return out
    for job in data.get("jobs", []):
        text = _strip_html(job.get("content", "") or "")
        out.append({"title": job.get("title", ""), "company": slug,
                    "source": f"greenhouse/{slug}", "text": text})
    return out


def scrape_lever(slug: str) -> list[dict]:
    out = []
    try:
        data = _cached_get(f"lever_{slug}",
                           f"https://api.lever.co/v0/postings/{slug}?mode=json")
    except Exception as e:
        print(f"  lever/{slug} skipped: {e}")
        return out
    for job in data if isinstance(data, list) else []:
        parts = [job.get("descriptionPlain", "") or ""]
        for lst in job.get("lists", []) or []:
            parts.append(lst.get("text", ""))
            parts.append(_strip_html(lst.get("content", "") or ""))
        parts.append(job.get("additionalPlain", "") or "")
        text = "\n".join(p for p in parts if p).strip()
        out.append({"title": job.get("text", ""), "company": slug,
                    "source": f"lever/{slug}", "text": text})
    return out


def main() -> None:
    raw: list[dict] = []
    print("Scraping RemoteOK...")
    raw += scrape_remoteok()
    print(f"  {len(raw)} postings so far")
    for slug in config.GREENHOUSE_SLUGS:
        raw += scrape_greenhouse(slug)
    print(f"  {len(raw)} after Greenhouse")
    for slug in config.LEVER_SLUGS:
        raw += scrape_lever(slug)
    print(f"  {len(raw)} after Lever")

    # Filter + dedupe.
    seen: set[str] = set()
    jds = []
    for item in raw:
        text, title = item["text"], item["title"].strip()
        if not title or not text or not _mostly_english(text):
            continue
        words = len(text.split())
        if not config.JD_MIN_WORDS <= words <= config.JD_MAX_WORDS:
            continue
        fingerprint = hashlib.sha1(
            f"{title.lower()}|{item['company'].lower()}|{text[:200]}".encode("utf-8")
        ).hexdigest()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        jds.append(item)

    # Shuffle deterministically and cap; boards over-represent whoever is listed
    # first otherwise.
    random.Random(config.SEED).shuffle(jds)
    jds = jds[: config.N_JDS_TARGET]
    if len(jds) < config.N_EVAL_JDS + 30:
        raise SystemExit(
            f"Only {len(jds)} usable postings — add more board slugs in config.py "
            "before continuing.")

    eval_idx = set(random.Random(config.SEED + 1).sample(range(len(jds)), config.N_EVAL_JDS))
    for i, jd in enumerate(jds):
        jd["id"] = i
        jd["split"] = "eval" if i in eval_idx else "train"

    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = config.DATA_DIR / "jds.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for jd in jds:
            f.write(json.dumps(jd, ensure_ascii=False) + "\n")
    by_source: dict[str, int] = {}
    for jd in jds:
        key = jd["source"].split("/")[0]
        by_source[key] = by_source.get(key, 0) + 1
    print(f"Wrote {len(jds)} real JDs ({config.N_EVAL_JDS} eval-reserved) to {out}")
    print(f"  by source: {by_source}")


if __name__ == "__main__":
    main()
