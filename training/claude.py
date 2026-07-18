"""Anthropic API client for the teacher/verifier calls (replaces gemini.py).

Two modes:
- generate / generate_json — synchronous single calls (low-volume: template
  synthesis, eval scoring, cache-miss fallbacks).
- batch_cached — the Message Batches API for the bulk phases (profiles,
  letters, verification): 50% off all token usage, and every result is written
  to its per-item cache file so interrupted runs resume for free.

The key comes from ANTHROPIC_API_KEY (env var, or training/.env — loaded by
config.py; both are gitignored and never committed). Note: Opus 4.8 does not
accept temperature/top_p — output variety comes from prompt instructions.
"""
import json
import os
import re
import time
from pathlib import Path

import anthropic

import config  # noqa: F401  (side effect: loads training/.env into the environment)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise SystemExit(
                "No Anthropic API key found: set ANTHROPIC_API_KEY, or copy "
                "training/.env.example to training/.env and fill it in."
            )
        _client = anthropic.Anthropic(max_retries=5)
    return _client


def _text_of(message) -> str:
    """Concatenated text blocks; empty string on a safety refusal."""
    if message.stop_reason == "refusal":
        return ""
    return "".join(block.text for block in message.content if block.type == "text")


def generate(prompt: str, model: str, max_tokens: int = 16000) -> str:
    message = _get_client().messages.create(
        model=model,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
    )
    return _text_of(message)


def parse_json(raw: str):
    """Parse a JSON value from model output, tolerating markdown code fences."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    if not text.startswith(("{", "[")):
        m = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
        if m:
            text = m.group(0)
    return json.loads(text)


def generate_json(prompt: str, model: str):
    return parse_json(generate(prompt, model))


def _poll_and_collect(client, batch_id: str, stem_to_path: dict[str, Path],
                      poll_seconds: int) -> None:
    """Poll a batch until it ends, then write each success to its cache file."""
    while True:
        status = client.messages.batches.retrieve(batch_id)
        if status.processing_status == "ended":
            break
        counts = status.request_counts
        print(f"  batch {batch_id}: {counts.processing} processing, "
              f"{counts.succeeded} succeeded, {counts.errored} errored", flush=True)
        time.sleep(poll_seconds)

    succeeded = failed = stale = 0
    for result in client.messages.batches.results(batch_id):
        path = stem_to_path.get(result.custom_id)
        if path is None:
            stale += 1  # item from an older run's spec — nowhere to put it
            continue
        if result.result.type == "succeeded":
            text = _text_of(result.result.message)
            if text.strip():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
                succeeded += 1
                continue
        failed += 1
    print(f"  batch {batch_id} done: {succeeded} cached, {failed} failed/refused"
          + (f", {stale} stale" if stale else ""), flush=True)


def batch_cached(items: list[tuple[Path, str]], model: str,
                 max_tokens: int = 16000, poll_seconds: int = 30) -> None:
    """Resolve (cache_path, prompt) pairs through the Message Batches API.

    Already-cached items are skipped; the rest go up as ONE batch (50% cheaper
    than sequential calls) whose id is persisted next to the caches — if the
    poll is interrupted, the next run resumes the SAME batch instead of paying
    for a resubmission. Failed/refused items are left uncached; callers treat
    a missing cache file as a dropped example, and a rerun retries them.
    """
    if not items:
        return
    stem_to_path = {path.stem: path for path, _ in items}
    prompts = {path.stem: prompt for path, prompt in items}
    cache_dir = items[0][0].parent
    cache_dir.mkdir(parents=True, exist_ok=True)
    pending_file = cache_dir / "_pending_batch.json"
    client = _get_client()

    # Resume a batch left over from an interrupted run before deciding what's missing.
    if pending_file.exists():
        batch_id = json.loads(pending_file.read_text(encoding="utf-8"))["batch_id"]
        print(f"  resuming pending batch {batch_id}...", flush=True)
        try:
            _poll_and_collect(client, batch_id, stem_to_path, poll_seconds)
        except anthropic.NotFoundError:
            print("  pending batch no longer exists — resubmitting misses")
        pending_file.unlink()

    missing = [stem for stem, path in stem_to_path.items() if not path.exists()]
    if not missing:
        return
    print(f"  submitting batch of {len(missing)} requests to {model} "
          f"({len(items) - len(missing)} already cached)...", flush=True)
    batch = client.messages.batches.create(
        requests=[
            {
                "custom_id": stem,
                "params": {
                    "model": model,
                    "max_tokens": max_tokens,
                    "thinking": {"type": "adaptive"},
                    "messages": [{"role": "user", "content": prompts[stem]}],
                },
            }
            for stem in missing
        ]
    )
    pending_file.write_text(json.dumps({"batch_id": batch.id}), encoding="utf-8")
    _poll_and_collect(client, batch.id, stem_to_path, poll_seconds)
    pending_file.unlink()
