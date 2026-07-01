from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Response

from ..auth import (
    AUTH_ENABLED,
    COOKIE_NAME,
    borrar_cookie_sesion,
    credenciales_validas,
    hay_sesion_valida,
    set_cookie_sesion,
)
from ..models.schemas import LoginRequest

router = APIRouter()


@router.post("/login")
def login(req: LoginRequest, response: Response):
    if not credenciales_validas(req.usuario, req.contrasena):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    set_cookie_sesion(response)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    borrar_cookie_sesion(response)
    return {"ok": True}


@router.get("/whoami")
def whoami(session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)):
    return {"authenticated": hay_sesion_valida(session), "auth_enabled": AUTH_ENABLED}
