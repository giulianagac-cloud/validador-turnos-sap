from typing import List, Optional
from pydantic import BaseModel


class PedidoIn(BaseModel):
    codigo: str
    descripcion: str
    detalle_horario: str
    agrupador: int
    horas_diarias_decl: Optional[float] = None
    horas_sem_decl: Optional[float] = None
    es_flex: bool = False


class AnalisisRequest(BaseModel):
    pedidos: List[PedidoIn]
