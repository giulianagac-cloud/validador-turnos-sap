"""Elige el backend de persistencia de las 3 tablas SAP según el entorno.

Local / `.exe`: disco en Documentos/ValidadorTurnos (vía `paths.py`) — mismo
comportamiento de siempre, sin cambios.
Vercel: Vercel Blob Storage (`blob_client.py`). Se activa solo cuando corre
como función serverless de Vercel (variable de entorno `VERCEL`, que Vercel
setea automáticamente — no hace falta ningún flag manual).
"""

import json
import os
from datetime import datetime
from typing import Optional

from .paths import data_dir

EN_VERCEL = bool(os.environ.get("VERCEL"))

_PREFIJO_BLOB = "sap-tables/"
_PATHNAME_DIARIOS = _PREFIJO_BLOB + "diarios.bin"
_PATHNAME_PERIODICOS = _PREFIJO_BLOB + "periodicos.bin"
_PATHNAME_TURNOS = _PREFIJO_BLOB + "turnos.bin"
_PATHNAME_META = _PREFIJO_BLOB + "meta.json"

_DATA_DIR = None if EN_VERCEL else data_dir()
if _DATA_DIR is not None:
    _FILE_DIARIOS = _DATA_DIR / "diarios.bin"
    _FILE_PERIODICOS = _DATA_DIR / "periodicos.bin"
    _FILE_TURNOS = _DATA_DIR / "turnos.bin"
    _FILE_META = _DATA_DIR / "meta.json"


def _meta_dict(n_diarios: int, n_periodicos: int, n_turnos: int) -> dict:
    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "n_diarios": n_diarios,
        "n_periodicos": n_periodicos,
        "n_turnos": n_turnos,
    }


def guardar(bytes_d: bytes, bytes_p: bytes, bytes_t: bytes,
            n_diarios: int, n_periodicos: int, n_turnos: int) -> None:
    """Persiste las 3 tablas + metadata (timestamp, counts) de forma reemplazable."""
    meta = _meta_dict(n_diarios, n_periodicos, n_turnos)
    if EN_VERCEL:
        from . import blob_client
        blob_client.subir_blob(_PATHNAME_DIARIOS, bytes_d)
        blob_client.subir_blob(_PATHNAME_PERIODICOS, bytes_p)
        blob_client.subir_blob(_PATHNAME_TURNOS, bytes_t)
        blob_client.subir_blob(
            _PATHNAME_META,
            json.dumps(meta, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
        )
    else:
        _DATA_DIR.mkdir(exist_ok=True)
        _FILE_DIARIOS.write_bytes(bytes_d)
        _FILE_PERIODICOS.write_bytes(bytes_p)
        _FILE_TURNOS.write_bytes(bytes_t)
        _FILE_META.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def leer_meta() -> Optional[dict]:
    """Devuelve {timestamp, n_diarios, n_periodicos, n_turnos} o None si no hay nada."""
    if EN_VERCEL:
        from . import blob_client
        try:
            blobs = blob_client.listar_blobs(_PREFIJO_BLOB)
            url = blob_client.buscar_url(blobs, _PATHNAME_META)
            if not url:
                return None
            return json.loads(blob_client.bajar_blob(url).decode("utf-8"))
        except Exception:
            return None
    else:
        try:
            return json.loads(_FILE_META.read_text(encoding="utf-8"))
        except Exception:
            return None


def cargar() -> Optional[tuple]:
    """Devuelve (bytes_diarios, bytes_periodicos, bytes_turnos) o None si todavía no se cargó nada."""
    if EN_VERCEL:
        from . import blob_client
        try:
            blobs = blob_client.listar_blobs(_PREFIJO_BLOB)
            url_d = blob_client.buscar_url(blobs, _PATHNAME_DIARIOS)
            url_p = blob_client.buscar_url(blobs, _PATHNAME_PERIODICOS)
            url_t = blob_client.buscar_url(blobs, _PATHNAME_TURNOS)
            if not (url_d and url_p and url_t):
                return None
            return (
                blob_client.bajar_blob(url_d),
                blob_client.bajar_blob(url_p),
                blob_client.bajar_blob(url_t),
            )
        except Exception:
            return None
    else:
        if not _FILE_META.exists() or not _FILE_DIARIOS.exists():
            return None
        return (
            _FILE_DIARIOS.read_bytes(),
            _FILE_PERIODICOS.read_bytes(),
            _FILE_TURNOS.read_bytes(),
        )
