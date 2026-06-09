import io
import math
import re
import unicodedata
from typing import Any, Optional

import pandas as pd

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..models.schemas import AnalisisRequest, GenerarTurnoRequest
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
    pedidos_dicts = [
        {
            'codigo': p.codigo,
            'descripcion': p.descripcion,
            'detalle_horario': p.detalle_horario,
            'agrupador': p.agrupador,
            'horas_diarias_decl': p.horas_diarias_decl,
            'horas_sem_decl': p.horas_sem_decl,
            'es_flex': p.es_flex,
        }
        for p in req.pedidos
    ]
    resultados = _motor.analizar_lote(pedidos_dicts)
    return JSONResponse(content={"resultados": [_sanitize(r) for r in resultados]})


# prefijo de código de turno -> agrupador (línea). Sacado de los datos reales.
PREFIJO_AGRUPADOR = {
    "LS": 20,   "LSFL": 20,    # Sarmiento
    "LSM": 22,  "LSMF": 22,    # San Martín
    "LR": 24,   "LRFL": 24,    # Roca
    "REG": 26,  "REGF": 26,    # Regionales
    "LD": 26,                  # Regionales (LD también existe en Mitre LD/30, pero por uso se asigna a 26)
    "LM": 28,   "LMFL": 28,    # Mitre
    "LBS": 34,  "LBSF": 34,    # Belgrano Sur
    # "SC" queda ambiguo: Central (32) y Mitre (28)
}

# prefijos ambiguos: existen en más de una línea, no se puede deducir solo
PREFIJOS_AMBIGUOS = {"SC"}


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


@router.post("/listar-solapas")
async def listar_solapas(archivo: UploadFile = File(...)):
    try:
        buf = io.BytesIO(await archivo.read())
        solapas = pd.ExcelFile(buf).sheet_names
        return {"ok": True, "solapas": solapas}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo: {exc}")


@router.post("/cargar-pedido")
async def cargar_pedido(
    archivo: UploadFile = File(...),
    solapa: Optional[str] = Form(None),
):
    try:
        buf = io.BytesIO(await archivo.read())
        xl = pd.ExcelFile(buf)
        hojas = [solapa] if solapa else xl.sheet_names
        pedidos = []

        for hoja in hojas:
            if hoja not in xl.sheet_names:
                raise HTTPException(status_code=400, detail=f"Solapa '{hoja}' no existe en el archivo.")
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


@router.post("/generar-turno")
async def generar_turno(req: GenerarTurnoRequest):
    global _motor
    if _motor is None:
        raise HTTPException(
            status_code=400,
            detail="Primero cargá los 3 Excels de SAP en la pantalla de Carga de Tablas.",
        )
    try:
        from generador_grillas import (
            generar_franco_corrido, generar_multihorario, generar_rotativo,
        )
        from puente_grilla_motor import resolver_grilla

        if req.tipo == 'franco_corrido':
            if not req.detalle_horario:
                raise HTTPException(400, detail="franco_corrido requiere detalle_horario.")
            grilla = generar_franco_corrido(req.detalle_horario, req.dias_franco or [])
        elif req.tipo == 'multihorario':
            if not req.detalle_horario:
                raise HTTPException(400, detail="multihorario requiere detalle_horario.")
            grilla = generar_multihorario(req.detalle_horario, req.dias_franco or [])
        elif req.tipo == 'rotativo':
            if not req.horarios_semana or not req.dia_franco:
                raise HTTPException(400, detail="rotativo requiere horarios_semana y dia_franco.")
            grilla = generar_rotativo(req.horarios_semana, req.dia_franco)
        else:
            raise HTTPException(400, detail=f"Tipo de turno desconocido: '{req.tipo}'.")

        resultado = resolver_grilla(
            grilla, req.agrupador, req.codigo_turno,
            req.indice_variante, _motor, req.es_flex,
        )
        return JSONResponse(content=_sanitize(resultado))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error al generar el turno: {exc}")
