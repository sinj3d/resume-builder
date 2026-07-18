"""Bullet retrieval mirroring the app's RAG path.

The app embeds with all-MiniLM-L6-v2 (ONNX, mean-pooled + L2-normalized) and
runs KNN over sqlite-vec. `sentence-transformers` uses the same model with the
same pooling, so `normalize_embeddings=True` + dot product reproduces the app's
ranking (no-archetype path).

A Retriever is built per candidate profile (small bullet sets), so the encoder
is loaded once and shared.
"""
import numpy as np
from sentence_transformers import SentenceTransformer

from config import EMBED_MODEL

_model: SentenceTransformer | None = None


def _encoder() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBED_MODEL)
    return _model


class Retriever:
    def __init__(self, bullets: list[str]):
        self.bullets = bullets
        self.embeddings = _encoder().encode(
            bullets, normalize_embeddings=True, show_progress_bar=False
        )

    def top_k(self, query: str, k: int) -> list[str]:
        q = _encoder().encode([query], normalize_embeddings=True)[0]
        scores = self.embeddings @ q
        idx = np.argsort(-scores)[:k]
        return [self.bullets[i] for i in idx]
