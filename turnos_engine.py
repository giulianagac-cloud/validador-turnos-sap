"""
Motor de validación de turnos - Trenes Argentinos
v0.1 - Carga + Parser de horario

Filosofía: el sistema OBSERVA, VALIDA y PROPONE. Nunca modifica ni fusiona.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def _norm(s: str) -> str:
    """minúsculas, sin acentos, espacios colapsados"""
    s = _strip_accents(str(s)).lower()
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# Mapa de nombres de día -> índice 0=Lunes ... 6=Domingo
_DIAS = {
    'lunes': 0, 'l': 0, 'lu': 0,
    'martes': 1, 'ma': 1, 'mar': 1,
    'miercoles': 2, 'mi': 2, 'mie': 2, 'mier': 2, 'x': 2,
    'jueves': 3, 'ju': 3, 'jue': 3, 'j': 3,
    'viernes': 4, 'v': 4, 'vi': 4, 'vie': 4,
    'sabado': 5, 'sa': 5, 'sab': 5, 's': 5,
    'domingo': 6, 'd': 6, 'do': 6, 'dom': 6,
}
_DIA_NOMBRE = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']


def _dia_idx(token: str) -> Optional[int]:
    t = _norm(token)
    return _DIAS.get(t)


# ---------------------------------------------------------------------------
# Resultado del parseo
# ---------------------------------------------------------------------------
@dataclass
class HorarioParseado:
    raw: str
    hora_inicio: Optional[str] = None          # "12:24"
    hora_fin: Optional[str] = None             # "22:00"
    dias_trabaja: list = field(default_factory=list)   # [0,1,2,3,4]
    dias_franco: list = field(default_factory=list)    # [5,6]
    cruza_medianoche: bool = False
    fsi: Optional[bool] = None                 # True=Feriado SI, False=FNO
    horas_diarias_calc: Optional[float] = None
    horas_semanales_calc: Optional[float] = None
    notas: list = field(default_factory=list)  # advertencias / "revisar manual"
    ok: bool = True

    def resumen(self) -> str:
        dias = '-'.join(_DIA_NOMBRE[d][:2] for d in self.dias_trabaja) if self.dias_trabaja else '?'
        fr = '-'.join(_DIA_NOMBRE[d][:2] for d in self.dias_franco) if self.dias_franco else 'ninguno'
        fsi = 'FSI' if self.fsi else ('FNO' if self.fsi is False else '?')
        cm = ' [cruza medianoche]' if self.cruza_medianoche else ''
        return (f'{self.hora_inicio}-{self.hora_fin}{cm} | trabaja: {dias} | franco: {fr} | '
                f'{fsi} | {self.horas_diarias_calc}h/dia x {len(self.dias_trabaja)}d = '
                f'{self.horas_semanales_calc}h/sem')


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------
_RE_HORA = re.compile(r'(\d{1,2})[:.](\d{2})')
_RE_RANGO = re.compile(r'(\d{1,2}[:.]\d{2})\s*a\s*(\d{1,2}[:.]\d{2})')


def _to_min(hhmm: str) -> int:
    h, m = re.split(r'[:.]', hhmm)
    return int(h) * 60 + int(m)


def _fmt(hhmm: str) -> str:
    h, m = re.split(r'[:.]', hhmm)
    return f'{int(h):02d}:{int(m):02d}'


def parse_horario(texto: str) -> HorarioParseado:
    """Parsea un texto de DETALLE HORARIO del pedido de RRHH."""
    res = HorarioParseado(raw=str(texto))
    t = _norm(texto)

    # --- FSI / FNO ---
    if 'fsi' in t or 'feriado si' in t:
        res.fsi = True
    elif 'fno' in t or 'feriado no' in t:
        res.fsi = False

    # --- Rango horario ---
    m = _RE_RANGO.search(t)
    if not m:
        res.ok = False
        res.notas.append('No se pudo detectar el rango horario -> REVISAR MANUAL')
        return res
    ini, fin = _fmt(m.group(1)), _fmt(m.group(2))
    res.hora_inicio, res.hora_fin = ini, fin

    # --- Horas diarias (contemplando cruce de medianoche) ---
    mi, mf = _to_min(ini), _to_min(fin)
    if mf <= mi:
        res.cruza_medianoche = True
        dur = (24 * 60 - mi) + mf
    else:
        dur = mf - mi
    res.horas_diarias_calc = round(dur / 60, 2)

    # --- Días: detectar el patrón "X a Y" ANTES del rango horario ---
    pre = t[:m.start()]
    dias_set = _parse_dias(pre, res)
    res.dias_trabaja = sorted(dias_set)
    res.dias_franco = [d for d in range(7) if d not in dias_set]

    if res.dias_trabaja:
        res.horas_semanales_calc = round(res.horas_diarias_calc * len(res.dias_trabaja), 2)
    else:
        res.ok = False
        res.notas.append('No se pudieron detectar los dias -> REVISAR MANUAL')

    return res


def _parse_dias(pre: str, res: HorarioParseado) -> set:
    """Detecta rango de dias tipo 'l a v', 'lunes a domingo', 'mi a d'."""
    pre = pre.strip()
    # rango "X a Y"
    rng = re.search(r'\b([a-z]+)\s+a\s+([a-z]+)\b', pre)
    if rng:
        d1, d2 = _dia_idx(rng.group(1)), _dia_idx(rng.group(2))
        if d1 is not None and d2 is not None:
            if d1 <= d2:
                return set(range(d1, d2 + 1))
            else:  # envuelve la semana, ej. "v a l"
                return set(list(range(d1, 7)) + list(range(0, d2 + 1)))
    # día suelto repetido (poco común en estos pedidos)
    toks = re.findall(r'\b[a-z]+\b', pre)
    found = {_dia_idx(tk) for tk in toks if _dia_idx(tk) is not None}
    if found:
        return found
    return set()


# ---------------------------------------------------------------------------
# Tolerancia (regla real derivada de los datos: -29 / +5 entrada, +29 salida)
# ---------------------------------------------------------------------------
def calcular_tolerancia(hora_inicio: str, hora_fin: str) -> dict:
    mi, mf = _to_min(hora_inicio), _to_min(hora_fin)

    ini_tol_pre = mi - 29
    if ini_tol_pre < 0:   # borde: no cruzar a día anterior
        ini_tol_pre = 0
    ini_tol_post = mi + 5
    fin_tol = mf + 29
    if fin_tol >= 24 * 60:
        fin_tol -= 24 * 60

    f = lambda x: f'{x // 60:02d}:{x % 60:02d}'
    return {
        'inicio_tolerancia': f(ini_tol_pre),
        'inicio_teorico': f(mi),
        'inicio_tolerancia_fin': f(ini_tol_post),
        'final_teorico': f(mf),
        'fin_tolerancia': f(fin_tol),
    }


# ===========================================================================
# CAPA DE DATOS: carga de los Excels de SAP
# ===========================================================================
import pandas as pd

# Mapa agrupador PHTD -> linea (de Agrupadores_de_Líneas.xlsx)
AGRUPADOR_LINEA = {
    32: 'CENTRAL', 34: 'BELGRANO SUR', 28: 'MITRE', 30: 'MITRE LD',
    24: 'ROCA', 22: 'SAN MARTIN', 20: 'SARMIENTO', 26: 'REGIONALES',
}


# ---------------------------------------------------------------------------
# Extractor de rango canónico: entiende forma limpia, pegada y mayúsculas
# Devuelve (rango_canonico | None, categoria, texto_original)
#   categoria: 'rango' | 'flex' | 'franco' | 'especial'
# ---------------------------------------------------------------------------
_RE_RANGO_FLEX = re.compile(r'(\d{1,2})(?:[:.](\d{2}))?\s*a\s*(\d{1,2})(?:[:.](\d{2}))?', re.I)


def clasificar_texto(texto: str):
    t_orig = str(texto).strip()
    t = _norm(t_orig)

    if 'franco' in t or t == 'libr':
        return None, 'franco', t_orig
    if 'flex' in t:
        return _norm_flex(t_orig), 'flex', t_orig
    if any(k in t for k in ['ordenes', 'historic', 'historico', 'a ordenes', 'desempleo']):
        return None, 'especial', t_orig

    # Tomar solo el primer rango (antes de un eventual "/F...")
    head = re.split(r'/\s*f', t, maxsplit=1)[0]
    m = _RE_RANGO_FLEX.search(head)
    if m:
        h1 = int(m.group(1)); m1 = int(m.group(2) or 0)
        h2 = int(m.group(3)); m2 = int(m.group(4) or 0)
        canon = f'{h1:02d}:{m1:02d}-{h2:02d}:{m2:02d}'
        return canon, 'rango', t_orig

    return None, 'especial', t_orig


def _norm_flex(t_orig: str) -> str:
    """Clave canónica para familia FLEX (normaliza para comparar)."""
    t = _norm(t_orig)
    t = t.replace(',', '.').replace('horas', 'hr').replace('hora', 'hr')
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def horario_a_canon(hora_inicio: str, hora_fin: str) -> str:
    return f'{_to_min(hora_inicio)//60:02d}:{_to_min(hora_inicio)%60:02d}-' \
           f'{_to_min(hora_fin)//60:02d}:{_to_min(hora_fin)%60:02d}'


# ---------------------------------------------------------------------------
# Buscador de diario
# ---------------------------------------------------------------------------
@dataclass
class ResultadoBusqueda:
    existe: bool
    codigos: list = field(default_factory=list)   # [(codigo, texto_original, horas), ...]
    duplicado: bool = False
    notas: list = field(default_factory=list)


class MotorTurnos:
    def __init__(self, path_diarios, path_periodicos, path_turnos):
        self.diarios = pd.read_excel(path_diarios)
        self.periodicos = pd.read_excel(path_periodicos)
        self.turnos = pd.read_excel(path_turnos)
        self._indexar_diarios()

    def _indexar_diarios(self):
        """Construye un índice: (agrupador, rango_canonico) -> lista de codigos."""
        self._idx_diario = {}
        for _, r in self.diarios.iterrows():
            agr = r['Agrup.para PHTD']
            cod = str(r['Plan hor.tbjo.diario']).strip()
            txt = r['Texto plan hr.tr.dia']
            horas = r['Horas trabajo teór.']
            canon, cat, orig = clasificar_texto(txt)
            if cat == 'rango' and canon:
                key = (agr, canon)
                self._idx_diario.setdefault(key, []).append((cod, orig, horas))

    def buscar_diario(self, agrupador: int, hora_inicio: str, hora_fin: str) -> ResultadoBusqueda:
        canon = horario_a_canon(hora_inicio, hora_fin)
        key = (agrupador, canon)
        matches = self._idx_diario.get(key, [])
        # Deduplicar codigos idénticos (basura tipo [S150,S150]) pero contar
        codigos_unicos = []
        vistos = set()
        repetidos_basura = []
        for cod, orig, horas in matches:
            if cod in vistos:
                repetidos_basura.append(cod)
                continue
            vistos.add(cod)
            codigos_unicos.append((cod, orig, horas))

        res = ResultadoBusqueda(existe=len(codigos_unicos) > 0, codigos=codigos_unicos)
        if len(codigos_unicos) > 1:
            res.duplicado = True
            res.notas.append(f'DUPLICADO: {len(codigos_unicos)} codigos distintos para este horario en el agrupador: '
                             + ', '.join(c[0] for c in codigos_unicos))
        if repetidos_basura:
            res.notas.append(f'Filas repetidas en tabla (mismo codigo {set(repetidos_basura)}) - se respetan, no se tocan')
        return res


    def _indexar_periodicos(self):
        """Construye dos índices de periódicos:
        - _idx_periodico      : (agr, grilla_7) -> [cod]     — solo 1 semana (compat existente)
        - _idx_periodico_multi: (agr, (sem1, sem2, ...)) -> [cod] — todas las periodicidades
        """
        daycols = ['Plan hor.tbjo.diario', 'Plan hor.tbjo.diario.1', 'Plan hor.tbjo.diario.2',
                   'Plan hor.tbjo.diario.3', 'Plan hor.tbjo.diario.4', 'Plan hor.tbjo.diario.5',
                   'Plan hor.tbjo.diario.6']
        self._daycols = daycols
        self._idx_periodico = {}
        self._idx_periodico_multi = {}

        # Agrupar todas las filas por código de periódico
        from collections import defaultdict
        sems_por_cod: dict = defaultdict(dict)
        for _, r in self.periodicos.iterrows():
            cod = r['PHT por períodos']
            try:
                num_sem = int(r['Número de semana'])
            except (ValueError, TypeError):
                continue
            if num_sem in sems_por_cod[cod]:
                continue  # duplicado de semana en el export: ignorar filas extra
            agr = r['Agrup.para PHTD']
            grilla = tuple(str(r[c]).strip() for c in daycols)
            sems_por_cod[cod][num_sem] = (agr, grilla)

        for cod, sems in sems_por_cod.items():
            if not sems:
                continue
            n_max = max(sems.keys())
            # Indexar solo si el periódico tiene todas las semanas de 1 a n_max (sin huecos)
            if not all(i in sems for i in range(1, n_max + 1)):
                continue
            agr = sems[1][0]
            all_grillas = tuple(sems[i][1] for i in range(1, n_max + 1))
            # Índice multi (cubre 1 y N semanas)
            self._idx_periodico_multi.setdefault((agr, all_grillas), []).append(cod)
            # Índice 1-semana (compatibilidad con buscar_periodico existente)
            if n_max == 1:
                self._idx_periodico.setdefault((agr, all_grillas[0]), []).append(cod)

    def construir_grilla(self, codigo_diario: str, dias_trabaja: list, codigo_franco='LIBR') -> tuple:
        """Arma la grilla 7-dias: el diario en los dias que trabaja, franco en el resto."""
        return tuple(codigo_diario if d in dias_trabaja else codigo_franco for d in range(7))

    def buscar_periodico(self, agrupador: int, grilla: tuple) -> ResultadoBusqueda:
        if not hasattr(self, '_idx_periodico'):
            self._indexar_periodicos()
        codigos = self._idx_periodico.get((agrupador, grilla), [])
        res = ResultadoBusqueda(existe=len(codigos) > 0,
                                codigos=[(c, '', None) for c in codigos])
        if len(codigos) > 1:
            res.duplicado = True
            res.notas.append(f'DUPLICADO: {len(codigos)} periodicos con la misma grilla: ' + ', '.join(codigos))
        return res

    def buscar_periodico_multi(self, agrupador: int, semanas: list) -> ResultadoBusqueda:
        """Busca un periódico de N semanas.
        semanas: lista de N tuplas de 7 códigos (LIBR para francos).
        Funciona para 1 semana y para ciclos multisemana."""
        if not hasattr(self, '_idx_periodico_multi'):
            self._indexar_periodicos()
        key = (agrupador, tuple(tuple(s) for s in semanas))
        codigos = self._idx_periodico_multi.get(key, [])
        res = ResultadoBusqueda(existe=len(codigos) > 0,
                                codigos=[(c, '', None) for c in codigos])
        if len(codigos) > 1:
            res.duplicado = True
            res.notas.append(
                f'DUPLICADO: {len(codigos)} periódicos con la misma grilla: '
                + ', '.join(codigos)
            )
        return res


    # -----------------------------------------------------------------------
    # Proponedor de correlativos
    # Regla: siguiente del ultimo de la familia. NUNCA rellena huecos.
    # Los huecos se informan solo como dato.
    # -----------------------------------------------------------------------
    def _familias_de(self, df, col_codigo, agrupador):
        """Agrupa los codigos de un agrupador por prefijo alfabetico -> lista de numeros."""
        sub = df[df['Agrup.para PHTD'] == agrupador]
        familias = {}
        anchos = {}
        for c in sub[col_codigo].dropna().astype(str).unique():
            mt = re.match(r'^([A-Za-z]+)(\d+)$', c.strip())
            if mt:
                pref, num = mt.group(1), mt.group(2)
                familias.setdefault(pref, set()).add(int(num))
                anchos.setdefault(pref, len(num))  # ancho de relleno (R187 -> 3)
        return familias, anchos

    def proponer_correlativo(self, capa: str, agrupador: int, familia_prefijo: str, reservas=None):
        """capa: 'diario' | 'periodico' | 'turno'.
        Devuelve dict con el codigo propuesto y los huecos informados.
        reservas: {(capa, agrupador, familia): set(ints)} — numeros ya reservados en el lote."""
        if capa == 'diario':
            df, col = self.diarios, 'Plan hor.tbjo.diario'
        elif capa == 'periodico':
            df, col = self.periodicos, 'PHT por períodos'
        else:
            df, col = self.turnos, 'Regla p.plan h.tbjo.'

        familias, anchos = self._familias_de(df, col, agrupador)
        nums_tabla = familias.get(familia_prefijo)
        if not nums_tabla:
            return {'propuesto': None,
                    'nota': f'No existe la familia "{familia_prefijo}" en el agrupador {agrupador} '
                            f'(capa {capa}). Familias presentes: {sorted(familias.keys())}',
                    'huecos': []}
        nums_reservados = (reservas or {}).get((capa, agrupador, familia_prefijo), set())
        nums_merged = sorted(set(nums_tabla) | nums_reservados)
        ultimo = nums_merged[-1]
        ancho = anchos.get(familia_prefijo, 3)
        propuesto = f'{familia_prefijo}{ultimo + 1:0{ancho}d}'
        huecos = [f'{familia_prefijo}{n:0{ancho}d}'
                  for n in range(nums_merged[0], ultimo + 1) if n not in set(nums_merged)]
        return {
            'propuesto': propuesto,
            'ultimo_existente': f'{familia_prefijo}{ultimo:0{ancho}d}',
            'total_familia': len(nums_tabla),
            'huecos': huecos,
            'nota': (f'Propongo {propuesto} (siguiente de {familia_prefijo}{ultimo:0{ancho}d}). '
                     + (f'Hay {len(huecos)} huecos libres NO usados: {huecos[:10]}'
                        + ('...' if len(huecos) > 10 else '')
                        if huecos else 'Familia sin huecos.')),
        }


    # -----------------------------------------------------------------------
    # Validador de correlativo de TURNO (capa regla LS/LR)
    # -----------------------------------------------------------------------
    def validar_correlativo_turno(self, agrupador: int, codigo_pedido: str, reservas=None):
        """Verifica si el codigo que pide el negocio es el correlativo correcto.
        reservas: {(capa, agrupador, familia): set(ints)} — numeros ya reservados en el lote."""
        mt = re.match(r'^([A-Za-z]+)(\d+)$', str(codigo_pedido).strip())
        if not mt:
            return {'estado': 'revisar', 'nota': f'No se pudo interpretar el codigo "{codigo_pedido}"'}
        pref, num = mt.group(1), int(mt.group(2))
        familias, anchos = self._familias_de(self.turnos, 'Regla p.plan h.tbjo.', agrupador)
        nums_tabla = familias.get(pref)
        ancho = anchos.get(pref, len(mt.group(2)))
        if not nums_tabla:
            return {'estado': 'revisar',
                    'nota': f'La familia "{pref}" no existe en el agrupador {agrupador}. '
                            f'Familias presentes: {sorted(familias.keys())}'}
        nums_reservados = (reservas or {}).get(('turno', agrupador, pref), set())
        nums_merged = sorted(set(nums_tabla) | nums_reservados)
        ultimo = nums_merged[-1]
        esperado = ultimo + 1
        ya_existe = num in set(nums_tabla) or num in nums_reservados
        if ya_existe:
            estado = 'duplicado'
            nota = f'{codigo_pedido} YA EXISTE en el agrupador (ultimo de la familia: {pref}{ultimo:0{ancho}d}).'
        elif num == esperado:
            estado = 'ok'
            nota = f'Correlativo correcto: {codigo_pedido} es el siguiente de {pref}{ultimo:0{ancho}d}.'
        elif num > esperado:
            estado = 'salto'
            nota = (f'SALTO: pidieron {codigo_pedido} pero el siguiente correlativo seria '
                    f'{pref}{esperado:0{ancho}d} (ultimo existente: {pref}{ultimo:0{ancho}d}).')
        else:
            estado = 'retroactivo'
            nota = (f'El codigo {codigo_pedido} es menor al ultimo existente {pref}{ultimo:0{ancho}d} '
                    f'pero no existe (hueco). Revisar.')
        return {'estado': estado, 'nota': nota,
                'esperado': f'{pref}{esperado:0{ancho}d}',
                'ultimo_existente': f'{pref}{ultimo:0{ancho}d}', 'familia': pref}

    # -----------------------------------------------------------------------
    # Detectar familia de diario/periodico segun si el pedido es FLEX o normal
    # -----------------------------------------------------------------------
    def familia_objetivo(self, capa: str, agrupador: int, es_flex: bool):
        """Devuelve el prefijo de familia a usar segun agrupador y si es FLEX."""
        if capa == 'diario':
            df, col = self.diarios, 'Plan hor.tbjo.diario'
        elif capa == 'periodico':
            df, col = self.periodicos, 'PHT por períodos'
        else:
            df, col = self.turnos, 'Regla p.plan h.tbjo.'
        familias, _ = self._familias_de(df, col, agrupador)
        # Caso especial: Roca (24), periódico no-flex → preferir serie "R" sobre "RA" u otras
        if capa == 'periodico' and agrupador == 24 and not es_flex and 'R' in familias:
            return 'R'
        prefijos = sorted(familias.keys(), key=lambda p: -len(p))  # mas largos primero (FLEX suele ser mas largo)
        flex_pref = [p for p in prefijos if any(f in p.upper() for f in ['F', 'FL'])]
        normal_pref = [p for p in prefijos if p not in flex_pref]
        if es_flex and flex_pref:
            return flex_pref[0]
        if not es_flex and normal_pref:
            return normal_pref[0]
        return prefijos[0] if prefijos else None

    # -----------------------------------------------------------------------
    # ORQUESTADOR: analizar un pedido completo -> dict listo para JSON
    # -----------------------------------------------------------------------
    def _registrar_reserva(self, reservas, capa, agrupador, codigo):
        """Agrega el numero de un codigo al set de reservas del lote."""
        if not codigo:
            return
        mt = re.match(r'^([A-Za-z]+)(\d+)$', str(codigo).strip())
        if mt:
            key = (capa, agrupador, mt.group(1))
            reservas.setdefault(key, set()).add(int(mt.group(2)))

    def _analizar_impl(self, codigo_pedido, descripcion, detalle_horario,
                       agrupador, horas_diarias_decl, horas_sem_decl, horas_men_decl, es_flex, reservas):
        p = parse_horario(detalle_horario)
        out = {
            'pedido': {'codigo': codigo_pedido, 'descripcion': descripcion,
                       'detalle': detalle_horario, 'agrupador': agrupador,
                       'linea': AGRUPADOR_LINEA.get(agrupador, '?'), 'es_flex': es_flex},
            'horario': {
                'inicio': p.hora_inicio, 'fin': p.hora_fin,
                'cruza_medianoche': p.cruza_medianoche, 'fsi': p.fsi,
                'dias_trabaja': [_DIA_NOMBRE[d] for d in p.dias_trabaja],
                'dias_franco': [_DIA_NOMBRE[d] for d in p.dias_franco],
                'horas_diarias_calc': p.horas_diarias_calc,
                'horas_sem_calc': p.horas_semanales_calc,
            },
            'validaciones': {}, 'diario': {}, 'periodico': {}, 'turno': {},
            'tolerancia': {}, 'cuadrito': {}, 'notas': list(p.notas), 'ok': p.ok,
        }
        if not p.ok:
            return out

        v = {}
        if horas_diarias_decl is not None:
            coincide = abs(float(horas_diarias_decl) - p.horas_diarias_calc) < 0.001
            v['horas_diarias'] = {'declarado': horas_diarias_decl, 'calculado': p.horas_diarias_calc,
                                  'coincide': coincide}
        if horas_sem_decl is not None:
            coincide = abs(float(horas_sem_decl) - p.horas_semanales_calc) < 0.001
            v['horas_sem'] = {'declarado': horas_sem_decl, 'calculado': p.horas_semanales_calc,
                              'coincide': coincide}
        if p.horas_semanales_calc is not None:
            horas_men_calc = round(p.horas_semanales_calc * 4, 2)
            if horas_men_decl is not None:
                coincide = abs(float(horas_men_decl) - horas_men_calc) < 0.001
                v['horas_men'] = {'declarado': float(horas_men_decl), 'calculado': horas_men_calc,
                                  'coincide': coincide}
            else:
                v['horas_men'] = {'declarado': None, 'calculado': horas_men_calc, 'coincide': None}
        out['validaciones'] = v

        out['turno'] = self.validar_correlativo_turno(agrupador, codigo_pedido, reservas)

        rb = self.buscar_diario(agrupador, p.hora_inicio, p.hora_fin)
        if rb.existe:
            codigo_diario = rb.codigos[0][0]
            out['diario'] = {'accion': 'existe', 'codigo': codigo_diario,
                             'todos': [{'codigo': c, 'texto': o, 'horas': h} for c, o, h in rb.codigos],
                             'duplicado': rb.duplicado, 'notas': rb.notas}
        else:
            fam = self.familia_objetivo('diario', agrupador, es_flex)
            prop = self.proponer_correlativo('diario', agrupador, fam, reservas)
            codigo_diario = prop['propuesto']
            out['diario'] = {'accion': 'crear', 'codigo_propuesto': codigo_diario,
                             'familia': fam, 'detalle': prop}
            out['tolerancia'] = calcular_tolerancia(p.hora_inicio, p.hora_fin)

        grilla = self.construir_grilla(codigo_diario, p.dias_trabaja)
        rp = self.buscar_periodico(agrupador, grilla)
        if rp.existe:
            out['periodico'] = {'accion': 'existe', 'codigo': rp.codigos[0][0],
                                'duplicado': rp.duplicado, 'notas': rp.notas}
        else:
            fam = self.familia_objetivo('periodico', agrupador, es_flex)
            prop = self.proponer_correlativo('periodico', agrupador, fam, reservas)
            out['periodico'] = {'accion': 'crear', 'codigo_propuesto': prop['propuesto'],
                                'familia': fam, 'detalle': prop}

        out['cuadrito'] = {
            'dias': _DIA_NOMBRE,
            'celdas': list(grilla),
            'codigo_diario_usado': codigo_diario,
        }
        return out

    def analizar_pedido(self, codigo_pedido: str, descripcion: str, detalle_horario: str,
                        agrupador: int, horas_diarias_decl=None, horas_sem_decl=None,
                        horas_men_decl=None, es_flex=False):
        return self._analizar_impl(codigo_pedido, descripcion, detalle_horario,
                                   agrupador, horas_diarias_decl, horas_sem_decl, horas_men_decl, es_flex, None)

    def analizar_lote(self, pedidos):
        """Analiza una lista de pedidos encadenando correlativos entre si.
        pedidos: lista de dicts con keys codigo, descripcion, detalle_horario, agrupador,
                 horas_diarias_decl (opt), horas_sem_decl (opt), es_flex (opt).
        Devuelve lista de resultados en el mismo formato que analizar_pedido."""
        reservas = {}
        resultados = []
        for p in pedidos:
            codigo = p.get('codigo')
            agrupador = p.get('agrupador')
            try:
                r = self._analizar_impl(
                    codigo,
                    p.get('descripcion', '') or '',
                    p.get('detalle_horario', '') or '',
                    agrupador,
                    p.get('horas_diarias_decl'),
                    p.get('horas_sem_decl'),
                    p.get('horas_men_decl'),
                    p.get('es_flex', False) or False,
                    reservas,
                )
                # Reservar turno siempre (para que el siguiente pedido cuente este numero)
                self._registrar_reserva(reservas, 'turno', agrupador, codigo)
                # Reservar diario/periodico solo si se van a crear
                if r.get('diario', {}).get('accion') == 'crear':
                    self._registrar_reserva(reservas, 'diario', agrupador,
                                            r['diario'].get('codigo_propuesto'))
                if r.get('periodico', {}).get('accion') == 'crear':
                    self._registrar_reserva(reservas, 'periodico', agrupador,
                                            r['periodico'].get('codigo_propuesto'))
            except Exception as exc:
                r = {'error': str(exc), 'pedido': {'codigo': codigo}}
            resultados.append(r)
        return resultados


# ---------------------------------------------------------------------------
# Prueba contra los textos reales
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    casos = [
        'Lunes a Domingo 07:00 a 13:00 FSI',
        'L a D 06:00 a 15:00 FSI',
        'L a D 23:00 a 05:00 FSI',
        'L a V 12:24 a 22:00 FSI',
        'LUNES A VIERNES 12:24 a 22:00hs FSI',
        'Mi a D 12:24 a 22:00 FSI',
        'MIERCOLES A DOMINGO 12:24 a 22:00 hs FSI',
    ]
    print('=' * 95)
    print('PRUEBA DEL PARSER DE HORARIO (textos reales de los pedidos)')
    print('=' * 95)
    for c in casos:
        r = parse_horario(c)
        print(f'\nIN : {c}')
        print(f'OUT: {r.resumen()}')
        if r.notas:
            for n in r.notas:
                print(f'  ! {n}')

    print('\n' + '=' * 95)
    print('PRUEBA DE TOLERANCIA (regla -29/+5/+29)')
    print('=' * 95)
    for hi, hf in [('07:00', '13:00'), ('12:24', '22:00'), ('00:00', '06:00'), ('23:00', '05:00')]:
        tol = calcular_tolerancia(hi, hf)
        print(f'\n{hi} a {hf}:')
        print(f'  Inicio tol: {tol["inicio_tolerancia"]} | Teorico ini: {tol["inicio_teorico"]} | '
              f'Tol ini fin: {tol["inicio_tolerancia_fin"]}')
        print(f'  Teorico fin: {tol["final_teorico"]} | Fin tol: {tol["fin_tolerancia"]}')
