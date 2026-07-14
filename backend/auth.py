"""Login compartido del equipo — solo activo cuando corre en Vercel.

En local/`.exe` (AUTH_ENABLED=False) la dependency `requerir_sesion` es un
no-op total: nunca pide login, exactamente igual que antes de este cambio.
Sesión = cookie firmada con HMAC-SHA256 (stdlib, sin dependencias nuevas).
"""

import hmac
import hashlib
import os
import time
from typing import Optional

from fastapi import Cookie, HTTPException, Response

# Login del equipo DESACTIVADO temporalmente a pedido de la usuaria.
# Para REACTIVARLO: volver a la línea original ->
#     AUTH_ENABLED = bool(os.environ.get("VERCEL"))
AUTH_ENABLED = False

COOKIE_NAME = "session"
_DURACION_SEG = 7 * 24 * 3600  # 7 días


def _secret() -> str:
    secreto = os.environ.get("APP_SECRET_KEY")
    if not secreto:
        raise RuntimeError("APP_SECRET_KEY no está configurada.")
    return secreto


def _firmar(expiry_ts: int) -> str:
    firma = hmac.new(_secret().encode("utf-8"), str(expiry_ts).encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{expiry_ts}.{firma}"


def crear_token() -> str:
    expiry_ts = int(time.time()) + _DURACION_SEG
    return _firmar(expiry_ts)


def _token_valido(token: str) -> bool:
    try:
        expiry_str, _ = token.split(".", 1)
        expiry_ts = int(expiry_str)
    except (ValueError, AttributeError):
        return False
    if time.time() > expiry_ts:
        return False
    return hmac.compare_digest(_firmar(expiry_ts), token)


def credenciales_validas(usuario: str, contrasena: str) -> bool:
    user_esperado = os.environ.get("APP_USERNAME")
    pass_esperado = os.environ.get("APP_PASSWORD")
    if not user_esperado or not pass_esperado:
        return False
    user_ok = hmac.compare_digest(usuario.encode("utf-8"), user_esperado.encode("utf-8"))
    pass_ok = hmac.compare_digest(contrasena.encode("utf-8"), pass_esperado.encode("utf-8"))
    return user_ok and pass_ok


def set_cookie_sesion(response: Response) -> None:
    response.set_cookie(
        COOKIE_NAME,
        crear_token(),
        max_age=_DURACION_SEG,
        httponly=True,
        samesite="lax",
        secure=AUTH_ENABLED,
    )


def borrar_cookie_sesion(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


def hay_sesion_valida(session: Optional[str]) -> bool:
    if not AUTH_ENABLED:
        return True
    return bool(session) and _token_valido(session)


def requerir_sesion(session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)) -> None:
    """Dependency de FastAPI para rutas protegidas: 401 si no hay sesión válida."""
    if not hay_sesion_valida(session):
        raise HTTPException(status_code=401, detail="No autenticado. Iniciá sesión.")
