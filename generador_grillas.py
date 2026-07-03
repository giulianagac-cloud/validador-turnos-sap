"""
generador_grillas.py - Generador de Turnos Universal (Fase 1)

Módulo NUEVO, al lado del motor. No modifica turnos_engine.py.
Reusa el parser y los buscadores del motor para validar.

Modelo unificado: un turno = grilla de N semanas x 7 días.
Cada celda = un horario (rango) o None (=franco/LIBR).

Empezamos por el caso más simple: FRANCO CORRIDO (1 semana, 1 horario).
"""
from dataclasses import dataclass, field
from typing import Optional

from turnos_engine import (
    parse_horario, _DIA_NOMBRE, _DIAS, _norm, _to_min,
)

DIAS_ORDEN = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']


# ---------------------------------------------------------------------------
# Estructura de grilla universal
# ---------------------------------------------------------------------------
@dataclass
class Celda:
    """Una celda de la grilla: un día de una semana.

    Estados posibles (según reglas reales del negocio):
    - horario normal: horario != None, es_franco=False
    - franco: es_franco=True (SOLO si la columna FRANCO lo indica)
    - a órdenes: a_ordenes=True (es una aclaración; PUEDE tener horario o no)
    - sin definir: todo vacío -> el sistema lo marca para completar a mano
    """
    horario: Optional[str] = None   # "06:30-15:30" canónico
    es_franco: bool = False
    a_ordenes: bool = False

    @property
    def sin_definir(self) -> bool:
        return self.horario is None and not self.es_franco and not self.a_ordenes

    def __repr__(self):
        if self.es_franco:
            return 'LIBR'
        if self.a_ordenes and self.horario:
            return f'{self.horario}(AO)'
        if self.a_ordenes:
            return 'A-ORD'
        if self.horario:
            return self.horario
        return '???'


@dataclass
class Grilla:
    """Grilla universal: semanas x 7 días."""
    semanas: list = field(default_factory=list)   # lista de listas de 7 Celdas
    notas: list = field(default_factory=list)

    @property
    def n_semanas(self):
        return len(self.semanas)

    def resumen(self):
        out = []
        for i, sem in enumerate(self.semanas, 1):
            celdas = ' | '.join(f'{DIAS_ORDEN[d][:2]}:{c}' for d, c in enumerate(sem))
            out.append(f'  Semana {i}: {celdas}')
        return '\n'.join(out)


# ---------------------------------------------------------------------------
# Generador de franco corrido (1 semana, 1 horario, franco en N días)
# ---------------------------------------------------------------------------
def _dia_a_idx(nombre: str) -> Optional[int]:
    return _DIAS.get(_norm(nombre))


def generar_franco_corrido(detalle_horario: str, dias_franco: list) -> Grilla:
    """
    Caso simple: un horario fijo, trabaja todos los días salvo los de franco.
    detalle_horario: texto tipo "Domingo a Viernes 00:00 a 08:00" (el rango se parsea)
    dias_franco: lista de nombres de día de franco, ej. ['Sabado']

    Construye 1 semana: horario en los días que trabaja, franco en los demás.
    """
    p = parse_horario(detalle_horario)
    g = Grilla()
    if not p.ok or not p.hora_inicio:
        g.notas.append(f'No se pudo parsear el horario de: "{detalle_horario}" -> REVISAR MANUAL')
        return g

    horario_canon = f'{p.hora_inicio}-{p.hora_fin}'
    francos_idx = set()
    for d in dias_franco:
        idx = _dia_a_idx(d)
        if idx is not None:
            francos_idx.add(idx)
        else:
            g.notas.append(f'Dia de franco no reconocido: "{d}"')

    semana = []
    for d in range(7):
        if d in francos_idx:
            semana.append(Celda(es_franco=True))
        else:
            semana.append(Celda(horario=horario_canon))
    g.semanas.append(semana)
    return g


# ---------------------------------------------------------------------------
# Parser multi-horario por segmentos (caso LD516 Córdoba)
# Texto: "LUNES Y JUEVES 6:30 A 15:30, MARTES Y VIERNES 8:30 A 17:30, ..."
# Cada segmento (separado por coma o barra) = grupo de días + un horario.
# ---------------------------------------------------------------------------
import re

_RE_RANGO_SEG = re.compile(r'(\d{1,2})[:.]?(\d{2})?\s*a\s*(\d{1,2})[:.]?(\d{2})?', re.I)


def _parsear_dias_segmento(texto_dias: str) -> list:
    """De un texto de días saca los índices. Maneja:
    - lista con Y/coma: "LUNES Y JUEVES" -> [0,3]
    - rango con 'a': "LUNES A VIERNES" -> [0,1,2,3,4]
    - día suelto: "MIERCOLES" -> [2]
    """
    t = _norm(texto_dias)
    # ¿rango? "X a Y" donde X e Y son días
    m = re.search(r'\b([a-z]+)\s+a\s+([a-z]+)\b', t)
    if m and _dia_a_idx(m.group(1)) is not None and _dia_a_idx(m.group(2)) is not None:
        d1, d2 = _dia_a_idx(m.group(1)), _dia_a_idx(m.group(2))
        if d1 <= d2:
            return list(range(d1, d2 + 1))
        return list(range(d1, 7)) + list(range(0, d2 + 1))
    # lista: separar por 'y' / 'e' / espacios y juntar días reconocidos
    tokens = re.split(r'\s+y\s+|\s+e\s+|,|\s+', t)
    dias = [_dia_a_idx(tk) for tk in tokens if _dia_a_idx(tk) is not None]
    return sorted(set(dias))


def _parsear_horario_segmento(texto: str) -> Optional[str]:
    """Extrae el rango horario de un segmento -> 'HH:MM-HH:MM' canónico."""
    m = _RE_RANGO_SEG.search(texto)
    if not m:
        return None
    h1 = int(m.group(1)); m1 = int(m.group(2) or 0)
    h2 = int(m.group(3)); m2 = int(m.group(4) or 0)
    return f'{h1:02d}:{m1:02d}-{h2:02d}:{m2:02d}'


def generar_multihorario(detalle_horario: str, dias_franco: list) -> Grilla:
    """
    Caso multi-horario: cada día puede tener un horario distinto.
    Parsea segmentos separados por coma o barra.
    Los días de franco vienen de la columna FRANCO (no se infieren del texto).
    Días no mencionados y sin franco -> sin_definir (se marcan para revisar).
    """
    g = Grilla()
    semana = [Celda() for _ in range(7)]   # arranca todo sin definir

    # marcar francos (de la columna FRANCO)
    francos_idx = set()
    for d in dias_franco:
        idx = _dia_a_idx(d)
        if idx is not None:
            francos_idx.add(idx)
            semana[idx].es_franco = True

    # partir en segmentos por coma o barra
    segmentos = re.split(r'[,/]', detalle_horario)
    for seg in segmentos:
        seg = seg.strip()
        if not seg:
            continue
        a_ord = 'orden' in _norm(seg) or 'disp' in _norm(seg)
        dias = _parsear_dias_segmento(seg)
        horario = _parsear_horario_segmento(seg)
        if not dias:
            g.notas.append(f'Segmento sin días reconocibles: "{seg}" -> REVISAR MANUAL')
            continue
        for d in dias:
            if semana[d].es_franco:
                g.notas.append(f'{DIAS_ORDEN[d]}: el texto le asigna horario pero está marcado franco -> REVISAR')
                continue
            semana[d].horario = horario
            semana[d].a_ordenes = a_ord
            if horario is None and not a_ord:
                g.notas.append(f'{DIAS_ORDEN[d]}: segmento sin horario claro -> REVISAR')

    # avisar días sin definir
    for d in range(7):
        if semana[d].sin_definir:
            g.notas.append(f'{DIAS_ORDEN[d]}: sin horario ni franco -> REVISAR MANUAL (¿falta dato?)')

    g.semanas.append(semana)
    return g


# ---------------------------------------------------------------------------
# Generador ROTATIVO multisemana (caso ROCA TPTE 26)
# Patrón verificado contra datos reales: el franco es una "bisagra".
# En cada semana i, los días DESPUÉS del franco usan horarios_semana[i];
# los días ANTES del franco usan horarios_semana[i-1] (wraparound).
# Ejemplo verificado (franco MARTES):
#   Sem1: [H_{i-1}, LIBR, H_i, H_i, H_i, H_i, H_i]
#   Sem2: [H_i,     LIBR, H_{i+1}, ...]
# ---------------------------------------------------------------------------
def generar_rotativo(horarios_semana: list, dia_franco: str) -> Grilla:
    """
    horarios_semana: lista de rangos canónicos, uno por semana del ciclo.
        ej. ['07:00-13:00', '13:00-21:00']
    dia_franco: nombre del día de franco, ej. 'Martes'

    Bisagra: días DESPUÉS del franco → horarios_semana[i] (propio de esta semana).
             días ANTES del franco  → horarios_semana[i-1] (semana anterior, wraparound).
    """
    g = Grilla()
    n = len(horarios_semana)
    f = _dia_a_idx(dia_franco)
    if f is None:
        g.notas.append(f'Día de franco no reconocido: "{dia_franco}" -> REVISAR')
        return g
    if n < 2:
        g.notas.append('Rotativo necesita al menos 2 semanas. Usar generar_franco_corrido para 1 semana.')
        return g

    for i in range(n):
        semana = []
        horario_propio = horarios_semana[i]
        horario_previo = horarios_semana[(i - 1) % n]
        for d in range(7):
            if d == f:
                semana.append(Celda(es_franco=True))
            elif d > f:
                semana.append(Celda(horario=horario_propio))
            else:
                semana.append(Celda(horario=horario_previo))
        g.semanas.append(semana)
    return g


# ---------------------------------------------------------------------------
# Deteccion y parseo del formato ROTATIVO del pedido de RRHH
# El DETALLE HORARIO viene tipo "SEM 1 - 11:00 A 19:00" (numero de semana del
# ciclo + rango), SIN el dia (el dia franco esta en la columna FRANCO aparte).
# ---------------------------------------------------------------------------
_RE_SEM = re.compile(r'sem\w*\s*(\d+)', re.I)


def parse_detalle_rotativo(texto: str):
    """'SEM 1 - 11:00 A 19:00' -> (1, '11:00-19:00'). None si no matchea el patron.

    Devuelve (numero_de_semana, horario_canonico). El numero de semana indica
    en que semana del ciclo aplica ese horario. El dia NO sale de aca (va en la
    columna FRANCO).
    """
    if texto is None:
        return None
    t = _norm(texto)
    m_sem = _RE_SEM.search(t)
    if not m_sem:
        return None
    semana = int(m_sem.group(1))
    # aislar el rango: lo que viene despues de "SEM N" (evita que el N se
    # confunda con un horario)
    resto = t[m_sem.end():]
    horario = _parsear_horario_segmento(resto)
    if not horario:
        return None
    return (semana, horario)


def es_pedido_rotativo(descripcion, detalle) -> bool:
    """Un pedido es rotativo si la descripcion arranca/contiene 'ROT' o el
    detalle horario trae el patron 'SEM N'. Señales elegidas con la usuaria."""
    desc = _norm(descripcion or '')
    det = _norm(detalle or '')
    if re.search(r'\brot', desc):        # "ROT TPTE 26", "ROTATIVO"
        return True
    if _RE_SEM.search(det):              # "SEM 1 - 11:00 A 19:00"
        return True
    return False


# ---------------------------------------------------------------------------
# Anclaje temporal: fecha de referencia + punto de arranque
# Verificado en datos: base FIJA 01/04/2019 (lunes). Cada variante corre la
# fecha de referencia segun en que semana/dia del ciclo arranca.
# Pto.arranque queda en 1 (default observado en 10.789 casos).
# ---------------------------------------------------------------------------
import datetime

FECHA_REFERENCIA_BASE = datetime.date(2019, 4, 1)   # lunes


def calcular_fecha_referencia(indice_variante: int, offset_dia: int = 0) -> dict:
    """
    indice_variante: 0=A, 1=B, 2=C... (cada letra = una semana mas adelante en el ciclo)
    offset_dia: corrimiento adicional de dias (si la rotacion arranca otro dia)

    Devuelve la fecha de referencia y el punto de arranque.
    """
    dias_offset = indice_variante * 7 + offset_dia
    fecha = FECHA_REFERENCIA_BASE + datetime.timedelta(days=dias_offset)
    return {
        'fecha_referencia': fecha.strftime('%d.%m.%Y'),
        'punto_arranque': 1,
        'dia_semana': fecha.strftime('%A'),
        'offset_dias': dias_offset,
    }


def variante_a_indice(letra: str) -> int:
    """'A'->0, 'B'->1, 'C'->2..."""
    return ord(letra.strip().upper()) - ord('A')


# ---------------------------------------------------------------------------
# Cálculo de horas de una grilla (para el chequeo formal de horas de rotativos)
# OBSERVA y REPORTA: calcula el valor exacto y lo deja a la vista; la validación
# contra lo declarado (y la decisión) viven arriba. NO redondea a horas enteras.
# ---------------------------------------------------------------------------
def horas_de_horario(canon: str) -> Optional[float]:
    """'11:00-19:00' -> 8.0. Tolera cruce de medianoche ('23:00-05:00' -> 6.0).

    Reusa la misma aritmética de minutos del motor (_to_min) para que la duración
    coincida exacto con la que calcula el analizador simple. None si no parsea.
    """
    if not canon or '-' not in canon:
        return None
    ini, fin = canon.split('-', 1)
    try:
        mi, mf = _to_min(ini), _to_min(fin)
    except (ValueError, AttributeError):
        return None
    dur = (24 * 60 - mi) + mf if mf <= mi else mf - mi
    return round(dur / 60, 2)


def calcular_horas_grilla(grilla: 'Grilla') -> dict:
    """Desglose de horas de una grilla ya construida (N semanas × 7 días).

    Cuenta SOLO días efectivamente trabajados: excluye francos (LIBR), celdas
    "a órdenes" (horario incierto) y celdas sin definir. Devuelve:
      - por_horario:  horas diarias de cada horario distinto de la grilla
      - por_semana:   días trabajados y horas de cada semana del ciclo
      - ciclo_total:  suma de todas las semanas
      - promedio_semanal
      - semanas_desiguales: True si las semanas del ciclo no cargan lo mismo
        (pasa cuando la "bisagra" mezcla horarios de distinta duración → hay que
        mirarlo a mano; en un rotativo prolijo todas las semanas cierran igual).
    """
    def es_trabajado(c) -> bool:
        return bool(c.horario) and not c.es_franco and not c.a_ordenes

    vistos: list = []
    for sem in grilla.semanas:
        for c in sem:
            if es_trabajado(c) and c.horario not in vistos:
                vistos.append(c.horario)
    por_horario = [{'horario': h, 'horas': horas_de_horario(h)} for h in sorted(vistos)]

    por_semana = []
    for i, sem in enumerate(grilla.semanas, 1):
        trab = [c for c in sem if es_trabajado(c)]
        hs = round(sum(horas_de_horario(c.horario) or 0 for c in trab), 2)
        por_semana.append({'semana': i, 'dias_trabajados': len(trab), 'horas': hs})

    total = round(sum(s['horas'] for s in por_semana), 2)
    n = len(por_semana) or 1
    return {
        'por_horario': por_horario,
        'por_semana': por_semana,
        'ciclo_total': total,
        'promedio_semanal': round(total / n, 2),
        'semanas_desiguales': len({s['horas'] for s in por_semana}) > 1,
    }


# ---------------------------------------------------------------------------
# Prueba contra el caso real LD573
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    print('=' * 75)
    print('CASO LD573: "Domingo a Viernes 00:00 a 08:00", franco SABADO')
    print('Esperado (del desglose real): trabaja todos menos Sabado')
    print('=' * 75)
    g = generar_franco_corrido('Domingo a Viernes 00:00 a 08:00', ['SABADO'])
    print(g.resumen())
    if g.notas:
        for n in g.notas:
            print('  !', n)

    print()
    print('=' * 75)
    print('CASO LD574: "Lunes a Sabados 00:00 a 08:00", franco DOMINGO')
    print('=' * 75)
    g2 = generar_franco_corrido('Lunes a Sabados 00:00 a 08:00', ['DOMINGO'])
    print(g2.resumen())

    print()
    print('=' * 75)
    print('CASO LD580: "Domingo a Viernes 16:00 a 00:00", franco SABADO (cruza medianoche)')
    print('=' * 75)
    g3 = generar_franco_corrido('Domingo a Viernes 16:00 a 00:00', ['SABADO'])
    print(g3.resumen())
