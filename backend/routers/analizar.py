import io
import math
import re
import unicodedata
from typing import Any, Optional

import pandas as pd

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..models.schemas import AnalisisRequest
from turnos_engine import MotorTurnos

router = APIRouter()
_motor: Optional[MotorTurnos] = None


def _sanitize(obj: Any) -> Any:
    """Reemplaza NaN/Inf (que pandas puede generar) por None para JSON válido."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    return obj


@router.post("/cargar-tablas")
async def cargar_tablas(
    diarios: UploadFile = File(...),
    periodicos: UploadFile = File(...),
    turnos: UploadFile = File(...),
):
    global _motor
    try:
        buf_d = io.BytesIO(await diarios.read())
        buf_p = io.BytesIO(await periodicos.read())
        buf_t = io.BytesIO(await turnos.read())
        motor = MotorTurnos(buf_d, buf_p, buf_t)
        _motor = motor
        return {
            "ok": True,
            "n_diarios": len(motor.diarios),
            "n_periodicos": len(motor.periodicos),
            "n_turnos": len(motor.turnos),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error al cargar tablas: {exc}")


@router.post("/analizar")
async def analizar(req: AnalisisRequest):
    global _motor
    if _motor is None:
        raise HTTPException(
            status_code=400,
            detail="Primero cargá los 3 Excels de SAP en la pantalla de Carga de Tablas.",
        )
    resultados = []
    for p in req.pedidos:
        try:
            r = _motor.analizar_pedido(
                p.codigo,
                p.descripcion,
                p.detalle_horario,
                p.agrupador,
                p.horas_diarias_decl,
                p.horas_sem_decl,
                p.es_flex,
            )
            resultados.append(_sanitize(r))
        except Exception as exc:
            resultados.append({"error": str(exc), "pedido": {"codigo": p.codigo}})
    return JSONResponse(content={"resultados": resultados})


# prefijo de código de turno -> agrupador (línea). Sacado de los datos reales.
PREFIJO_AGRUPADOR = {
    "LS": 20,   "LSFL": 20,    # Sarmiento (normal + flex)
    "LSM": 22,  "LSMF": 22,    # San Martín
    "LR": 24,   "LRFL": 24,    # Roca
    "REG": 26,  "REGF": 26,    # Regionales
    "LM": 28,   "LMFL": 28,    # Mitre
    "LBS": 34,  "LBSF": 34,    # Belgrano Sur
    # NO incluidos a propósito por colisión (mismo prefijo en 2 líneas):
    #   "LD" -> Regionales (26) Y Mitre LD (30)
    #   "SC" -> Central (32) Y Mitre (28)
    # Para esos, el sistema deja agrupador=None y lo pide a mano.
}

# prefijos ambiguos: existen en más de una línea, no se puede deducir solo
PREFIJOS_AMBIGUOS = {"LD", "SC"}


def _deducir_agrupador(codigo):
    """Del prefijo del código (LR887 -> 'LR' -> 24).
    Devuelve None si no hay código, no matchea, o el prefijo es ambiguo."""
    if not codigo:
        return None
    m = re.match(r'^([A-Za-z]+)', str(codigo).strip())
    if not m:
        return None
    prefijo = m.group(1).upper()
    if prefijo in PREFIJOS_AMBIGUOS:
        return None   # ambiguo: que el usuario lo elija a mano
    return PREFIJO_AGRUPADOR.get(prefijo)


def _norm_col(s: str) -> str:
    """normaliza nombre de columna: sin acentos, minúsculas, sin espacios extra"""
    s = ''.join(c for c in unicodedata.normalize('NFD', str(s))
                if unicodedata.category(c) != 'Mn')
    return s.lower().strip()


def _buscar_col(columnas, *claves):
    """devuelve el nombre real de la primera columna que contenga TODAS las claves"""
    for col in columnas:
        n = _norm_col(col)
        if all(k in n for k in claves):
            return col
    return None


@router.post("/cargar-pedido")
async def cargar_pedido(archivo: UploadFile = File(...)):
    try:
        buf = io.BytesIO(await archivo.read())
        xl = pd.ExcelFile(buf)
        pedidos = []

        for hoja in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=hoja)
            if df.empty:
                continue
            cols = list(df.columns)

            # mapeo por patrones (tolerante a variaciones de nombre)
            c_codigo   = _buscar_col(cols, "codigo")
            c_desc     = _buscar_col(cols, "descripcion")
            c_detalle  = _buscar_col(cols, "detalle", "horario") or _buscar_col(cols, "detalle")
            c_hs_dia   = _buscar_col(cols, "horas", "diaria")
            c_hs_sem   = _buscar_col(cols, "horas", "sem")
            c_feriado  = _buscar_col(cols, "feriado")

            for _, fila in df.iterrows():
                detalle = fila.get(c_detalle) if c_detalle else None
                # saltar filas sin detalle horario (vacías)
                if detalle is None or (isinstance(detalle, float) and math.isnan(detalle)):
                    continue
                pedidos.append(_sanitize({
                    "codigo":             fila.get(c_codigo) if c_codigo else None,
                    "descripcion":        fila.get(c_desc) if c_desc else None,
                    "detalle_horario":    detalle,
                    "horas_diarias_decl": fila.get(c_hs_dia) if c_hs_dia else None,
                    "horas_sem_decl":     fila.get(c_hs_sem) if c_hs_sem else None,
                    "feriados":           fila.get(c_feriado) if c_feriado else None,
                    "agrupador":          _deducir_agrupador(fila.get(c_codigo) if c_codigo else None),
                    "hoja":               hoja,
                }))

        return {"ok": True, "n_pedidos": len(pedidos), "pedidos": pedidos}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error al leer el pedido: {exc}")
