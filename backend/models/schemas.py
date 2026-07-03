from typing import List, Optional
from pydantic import BaseModel


class PedidoIn(BaseModel):
    codigo: str
    descripcion: str
    detalle_horario: str
    agrupador: int
    horas_diarias_decl: Optional[float] = None
    horas_sem_decl: Optional[float] = None
    horas_men_decl: Optional[float] = None
    es_flex: bool = False
    franco: Optional[str] = None      # día franco (columna FRANCO) — turnos rotativos
    rotativo: bool = False            # informativo; el backend re-detecta igual


class AnalisisRequest(BaseModel):
    pedidos: List[PedidoIn]


class LoginRequest(BaseModel):
    usuario: str
    contrasena: str


class GenerarTurnoRequest(BaseModel):
    tipo: str                                    # 'franco_corrido' | 'multihorario' | 'rotativo'
    agrupador: int
    codigo_turno: str
    indice_variante: int = 0                     # 0=A, 1=B, 2=C ...
    es_flex: bool = False
    # franco_corrido + multihorario
    detalle_horario: Optional[str] = None
    dias_franco: Optional[List[str]] = None
    # rotativo
    horarios_semana: Optional[List[str]] = None  # ['11:00-19:00', '03:00-11:00']
    dia_franco: Optional[str] = None             # 'Lunes'
