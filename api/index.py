"""Entrypoint de Vercel Functions: reexporta el FastAPI app del backend.

Vercel detecta automáticamente `api/index.py` como entrypoint Python y busca
acá una instancia de FastAPI llamada `app`. Toda la lógica real vive en
`backend/main.py` (compartida con el modo local/`.exe`) — este archivo solo
la reexpone.
"""

from backend.main import app  # noqa: F401
