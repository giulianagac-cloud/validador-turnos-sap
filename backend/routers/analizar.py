import io
import math
from typing import Any, Optional

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
