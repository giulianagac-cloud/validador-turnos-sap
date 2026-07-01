"""Cliente mínimo de Vercel Blob Storage, sin SDK ni dependencias nuevas.

Usa únicamente `urllib.request` (stdlib) contra la REST API pública de
Vercel Blob (https://blob.vercel-storage.com). Solo se usa cuando la app
corre en Vercel (ver `storage_backend.py`) — en local/`.exe` no se importa
para nada.

Contrato de la API (verificado contra el código fuente del wrapper
`vercel_blob`, no usado como dependencia, solo como referencia):
- PUT  /?pathname=<path>      -> sube/reemplaza un blob
- GET  /?prefix=<prefix>      -> lista blobs (para leer uploadedAt/url)
- GET  <url pública del blob> -> descarga el contenido (sin auth, access=public)
"""

import json
import os
import urllib.error
import urllib.request
from typing import Optional
from urllib.parse import quote, urlencode

_BASE_URL = "https://blob.vercel-storage.com"
_API_VERSION = "10"


def _token() -> str:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN no está configurada.")
    return token


def subir_blob(pathname: str, data: bytes, content_type: str = "application/octet-stream") -> dict:
    """Sube (o reemplaza, si ya existe) un blob en un pathname fijo."""
    url = f"{_BASE_URL}/?pathname={quote(pathname)}"
    headers = {
        "access": "public",
        "authorization": f"Bearer {_token()}",
        "x-api-version": _API_VERSION,
        "x-content-type": content_type,
        "x-allow-overwrite": "1",
    }
    req = urllib.request.Request(url, data=data, method="PUT", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Error al subir '{pathname}' a Blob Storage: {exc.code} {detalle}") from exc


def listar_blobs(prefix: str) -> list[dict]:
    """Lista los blobs bajo un prefijo. Devuelve [{pathname, url, uploadedAt, size}, ...]."""
    params = urlencode({"prefix": prefix})
    url = f"{_BASE_URL}/?{params}"
    headers = {
        "authorization": f"Bearer {_token()}",
        "x-api-version": _API_VERSION,
    }
    req = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("blobs", [])
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Error al listar blobs '{prefix}': {exc.code} {detalle}") from exc


def bajar_blob(url: str) -> bytes:
    """Descarga el contenido de un blob público (sin auth)."""
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Error al descargar blob '{url}': {exc.code}") from exc


def buscar_url(blobs: list[dict], pathname: str) -> Optional[str]:
    """Busca la URL de un pathname exacto dentro de una lista de listar_blobs()."""
    for b in blobs:
        if b.get("pathname") == pathname:
            return b.get("url")
    return None
