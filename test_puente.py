"""
test_puente.py — Tests de resolver_grilla contra motor mock.
Cubre LD573 (diario existente), LD516 (4 diarios nuevos), ROCA (rotativo multisemana R055/R175).
Correr: python test_puente.py
"""
import re
import sys
from dataclasses import dataclass, field
from generador_grillas import generar_franco_corrido, generar_rotativo, Grilla, Celda, DIAS_ORDEN
from puente_grilla_motor import resolver_grilla, resolver_lote_rotativo, CODIGO_FRANCO, CODIGO_REVISAR


# ---------------------------------------------------------------------------
# Motor mock — simula MotorTurnos sin necesitar Excels SAP
# ---------------------------------------------------------------------------
@dataclass
class ResultadoBusqueda:
    existe: bool
    codigos: list = field(default_factory=list)
    duplicado: bool = False
    notas: list = field(default_factory=list)


class MotorMock:
    def __init__(self, diarios_existentes=None, periodicos_existentes=None,
                 ultimo_diario=0, ultimo_periodico=0, ultimo_turno=0):
        self.diarios_ex = diarios_existentes or {}
        self.periodicos_ex = periodicos_existentes or {}
        self.ultimo_diario = ultimo_diario
        self.ultimo_periodico = ultimo_periodico
        self.ultimo_turno = ultimo_turno

    def familia_objetivo(self, capa, agrupador, es_flex):
        prefijos = {20: ('S', 'SF'), 22: ('SM', 'SMF'), 24: ('R', 'RF'),
                    26: ('D', 'DF'), 28: ('M', 'MF'), 34: ('B', 'BF')}
        pnorm, pflex = prefijos.get(agrupador, ('X', 'XF'))
        return pflex if es_flex else pnorm

    def buscar_diario(self, agrupador, ini, fin):
        key = (agrupador, ini, fin)
        if key in self.diarios_ex:
            val = self.diarios_ex[key]
            cods = list(val) if isinstance(val, (list, tuple)) else [val]
            return ResultadoBusqueda(
                existe=True,
                codigos=[(c, f'{ini}-{fin}', 8.0) for c in cods],
                duplicado=len(cods) > 1,
                notas=([f'DUPLICADO: {len(cods)} codigos distintos para este horario '
                        f'en el agrupador: {", ".join(cods)}'] if len(cods) > 1 else []),
            )
        return ResultadoBusqueda(existe=False)

    def buscar_periodico(self, agrupador, grilla):
        key = (agrupador, grilla)
        if key in self.periodicos_ex:
            return ResultadoBusqueda(existe=True, codigos=[(self.periodicos_ex[key], '', None)])
        return ResultadoBusqueda(existe=False)

    def buscar_periodico_multi(self, agrupador, semanas):
        key = (agrupador, tuple(tuple(s) for s in semanas))
        if key in self.periodicos_ex:
            return ResultadoBusqueda(existe=True, codigos=[(self.periodicos_ex[key], '', None)])
        return ResultadoBusqueda(existe=False)

    def proponer_correlativo(self, capa, agrupador, familia, reservas=None):
        nums = set()
        if reservas:
            nums = reservas.get((capa, agrupador, familia), set())
        base = {'diario': self.ultimo_diario, 'periodico': self.ultimo_periodico,
                'turno': self.ultimo_turno}.get(capa, 0)
        siguiente = max({base} | nums) + 1
        propuesto = f'{familia}{siguiente:03d}'
        return {'propuesto': propuesto,
                'ultimo_existente': f'{familia}{base:03d}' if base else None,
                'nota': 'mock'}

    def _registrar_reserva(self, reservas, capa, agrupador, codigo):
        if not codigo:
            return
        mt = re.match(r'^([A-Za-z]+)(\d+)$', str(codigo))
        if not mt:
            return
        familia = mt.group(1)
        num = int(mt.group(2))
        reservas.setdefault((capa, agrupador, familia), set()).add(num)

    def validar_correlativo_turno(self, agrupador, codigo_turno, reservas=None):
        mt = re.match(r'^([A-Za-z]+)(\d+)$', str(codigo_turno))
        if not mt:
            return {'estado': 'revisar', 'nota': 'No se pudo parsear el codigo.'}
        fam = mt.group(1)
        num = int(mt.group(2))
        # Encadena con los correlativos ya reservados en el lote (igual que el motor real).
        nums_reservados = (reservas or {}).get(('turno', agrupador, fam), set())
        ultimo = max({self.ultimo_turno} | nums_reservados)
        siguiente = ultimo + 1
        if num in nums_reservados or num <= self.ultimo_turno:
            return {'estado': 'duplicado', 'nota': f'Ya existe {fam}{num:03d}.',
                    'ultimo_existente': f'{fam}{ultimo:03d}'}
        if num == siguiente:
            return {'estado': 'ok',
                    'nota': f'Correlativo correcto. Anterior: {fam}{ultimo:03d}',
                    'ultimo_existente': f'{fam}{ultimo:03d}'}
        return {'estado': 'salto',
                'nota': f'Saltea numeros. Esperado {fam}{siguiente:03d}.',
                'esperado': f'{fam}{siguiente:03d}'}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS = 0
FAIL = 0

def ok(msg):
    global PASS
    PASS += 1
    print(f'  PASS: {msg}')

def fail(msg):
    global FAIL
    FAIL += 1
    print(f'  FAIL: {msg}')

def check(cond, msg_ok, msg_fail=None):
    if cond:
        ok(msg_ok)
    else:
        fail(msg_fail or msg_ok)


# ---------------------------------------------------------------------------
# CASO 1 — LD573: franco corrido 1 semana, diario R055 ya existe en SAP
# Esperado: grilla [R055 x5, LIBR x2], periodico a crear, turno correlativo ok
# ---------------------------------------------------------------------------
def test_ld573():
    print('\n' + '=' * 60)
    print('CASO 1: LD573 — 1 semana, diario R055 existente')
    print('=' * 60)

    motor = MotorMock(
        diarios_existentes={(26, '07:00', '13:00'): 'R055'},
        ultimo_diario=55,
        ultimo_periodico=172,
        ultimo_turno=572,
    )
    grilla = generar_franco_corrido('Lunes a Viernes 07:00 a 13:00', ['Sabado', 'Domingo'])
    r = resolver_grilla(grilla, 26, 'LD573', 0, motor)

    print(f'  semanas_codigos: {r["semanas_codigos"]}')
    print(f'  diario 07:00-13:00: accion={r["diarios"]["07:00-13:00"]["accion"]}, '
          f'codigo={r["diarios"]["07:00-13:00"].get("codigo")}')
    print(f'  periodico: accion={r["periodico"]["accion"]}, '
          f'propuesto={r["periodico"].get("codigo_propuesto")}')
    print(f'  turno: estado={r["turno"]["estado"]}')
    print(f'  fecha_ref: {r["fecha_referencia"]["fecha_referencia"]} ({r["fecha_referencia"]["dia_semana"]})')

    sem = r['semanas_codigos'][0]
    check(sem == ['R055', 'R055', 'R055', 'R055', 'R055', 'LIBR', 'LIBR'],
          'grilla correcta: [R055 x5, LIBR x2]',
          f'grilla incorrecta: {sem}')
    check(r['diarios']['07:00-13:00']['accion'] == 'existe',
          'diario 07:00-13:00 reconocido como existente')
    check(r['diarios']['07:00-13:00']['codigo'] == 'R055',
          'codigo correcto: R055')
    check(r['acciones_diario'] == [],
          'sin acciones de diario (todo existe)')
    check(r['periodico']['accion'] == 'crear',
          'periodico a crear (no existe en mock)')
    check(r['turno']['estado'] == 'ok',
          'turno correlativo ok (573 = 572+1)')
    check(not r['hay_revisar'],
          'sin celdas REVISAR_MANUAL')


# ---------------------------------------------------------------------------
# CASO 2 — LD516: multihorario 1 semana, 4 diarios NINGUNO existe
# Esperado: 3 acciones crear (L=V comparten horario), correlativos D171/D172/D173
# ---------------------------------------------------------------------------
def test_ld516():
    print('\n' + '=' * 60)
    print('CASO 2: LD516 — 1 semana, 4 diarios nuevos (L=V comparten)')
    print('=' * 60)

    motor = MotorMock(ultimo_diario=170, ultimo_periodico=510, ultimo_turno=515)

    # Lunes+Viernes: 06:00-14:00 (mismo), Martes: 08:00-16:00, Miercoles: 10:00-18:00, Jueves: 14:00-22:00
    grilla = Grilla(
        semanas=[[
            Celda(horario='06:00-14:00'),  # L
            Celda(horario='08:00-16:00'),  # Ma
            Celda(horario='10:00-18:00'),  # Mi
            Celda(horario='14:00-22:00'),  # J
            Celda(horario='06:00-14:00'),  # V (mismo que L)
            Celda(es_franco=True),          # Sa
            Celda(es_franco=True),          # Do
        ]],
        notas=[]
    )
    r = resolver_grilla(grilla, 26, 'LD516', 0, motor)

    print(f'  diarios resueltos:')
    for h, d in sorted(r['diarios'].items()):
        print(f'    {h} -> accion={d["accion"]}, prop={d.get("codigo_propuesto")}')
    print(f'  acciones_diario: {[a["codigo_propuesto"] for a in r["acciones_diario"]]}')
    print(f'  semanas_codigos: {r["semanas_codigos"]}')

    sem = r['semanas_codigos'][0]
    check(len(r['diarios']) == 4,
          '4 horarios únicos identificados',
          f'se esperan 4, got {len(r["diarios"])}')
    check(len(r['acciones_diario']) == 4,
          '4 acciones crear_diario (todos nuevos)',
          f'se esperan 4, got {len(r["acciones_diario"])}')
    check(sem[0] == sem[4],
          f'L y V usan el mismo codigo ({sem[0]})',
          f'L={sem[0]} != V={sem[4]}')
    check(sem[5] == CODIGO_FRANCO and sem[6] == CODIGO_FRANCO,
          'Sa y Do son LIBR')
    # Correlativos consecutivos: D171, D172, D173, D174
    props = sorted(a['codigo_propuesto'] for a in r['acciones_diario'])
    check(props == ['D171', 'D172', 'D173', 'D174'],
          f'correlativos consecutivos: {props}',
          f'correlativos incorrectos: {props}')
    check(r['turno']['estado'] == 'ok',
          'turno correlativo ok (516 = 515+1)')


# ---------------------------------------------------------------------------
# CASO 3 — ROCA rotativo: 2 semanas, diarios R055 y R175 ya existen en SAP
# Esperado: sin acciones de diario, grilla alterna R055/R175, LIBR en domingo
# ---------------------------------------------------------------------------
def test_roca_rotativo():
    print('\n' + '=' * 60)
    print('CASO 3: ROCA LR101 — rotativo 2 sem, franco MARTES, bisagra verificada')
    print('=' * 60)
    # Datos reales verificados: horarios_semana[0]=07:00-13:00 (R055), [1]=13:00-21:00 (R175)
    # Franco MARTES (d=1). Bisagra:
    #   Sem1: L(R175), LIBR, Mi-Do(R055)  → [R175, LIBR, R055, R055, R055, R055, R055]
    #   Sem2: L(R055), LIBR, Mi-Do(R175)  → [R055, LIBR, R175, R175, R175, R175, R175]

    motor = MotorMock(
        diarios_existentes={
            (24, '07:00', '13:00'): 'R055',
            (24, '13:00', '21:00'): 'R175',
        },
        ultimo_diario=175,
        ultimo_periodico=220,
        ultimo_turno=100,
    )
    grilla = generar_rotativo(['07:00-13:00', '13:00-21:00'], 'Martes')

    print(f'  n_semanas grilla: {grilla.n_semanas}')
    for i, sem in enumerate(grilla.semanas):
        print(f'  Sem{i+1} celdas: {[(c.horario, c.es_franco) for c in sem]}')

    r = resolver_grilla(grilla, 24, 'LR101', 2, motor)

    print(f'  diarios resueltos:')
    for h, d in sorted(r['diarios'].items()):
        print(f'    {h} -> accion={d["accion"]}, codigo={d.get("codigo")}')
    print(f'  acciones_diario: {r["acciones_diario"]}')
    print(f'  semanas_codigos:')
    for i, sem in enumerate(r['semanas_codigos']):
        print(f'    Sem{i+1}: {sem}')
    print(f'  periodico: accion={r["periodico"]["accion"]}')
    print(f'  fecha_ref: {r["fecha_referencia"]["fecha_referencia"]} '
          f'(variante C, offset={r["fecha_referencia"]["offset_dias"]})')

    check(grilla.n_semanas == 2,
          'grilla generada tiene 2 semanas')
    for h, d in r['diarios'].items():
        check(d['accion'] == 'existe',
              f'{h} -> existe en SAP ({d.get("codigo")})',
              f'{h} -> accion incorrecta: {d["accion"]}')
    check(r['acciones_diario'] == [],
          'sin diarios a crear (ambos existen)')

    # Bisagra verificada contra datos reales (franco MARTES = d=1):
    # Sem1: d=0(L) < franco → horario_previo=H1=R175 | d=1 LIBR | d=2-6 > franco → H0=R055
    # Sem2: d=0(L) < franco → horario_previo=H0=R055 | d=1 LIBR | d=2-6 > franco → H1=R175
    sem1_esperada = ['R175', 'LIBR', 'R055', 'R055', 'R055', 'R055', 'R055']
    sem2_esperada = ['R055', 'LIBR', 'R175', 'R175', 'R175', 'R175', 'R175']
    sem1 = r['semanas_codigos'][0]
    sem2 = r['semanas_codigos'][1]
    check(sem1 == sem1_esperada,
          f'Sem1 bisagra correcta: {sem1}',
          f'Sem1 incorrecta: {sem1} (esperado {sem1_esperada})')
    check(sem2 == sem2_esperada,
          f'Sem2 bisagra correcta: {sem2}',
          f'Sem2 incorrecta: {sem2} (esperado {sem2_esperada})')
    check(r['periodico']['accion'] in ('crear', 'existe'),
          f'periodico tiene accion valida: {r["periodico"]["accion"]}')
    check(not r['hay_revisar'],
          'sin celdas REVISAR_MANUAL')
    check(r['fecha_referencia']['offset_dias'] == 14,
          f'variante C = offset 14 dias, got {r["fecha_referencia"]["offset_dias"]}')


# ---------------------------------------------------------------------------
# REGRESIÓN BISAGRA — test mínimo que no depende del motor.
# Entrada exacta verificada contra datos reales de ROCA.
# Si alguien toca generar_rotativo, este test lo detecta primero.
# ---------------------------------------------------------------------------
def test_bisagra_roca_martes():
    """
    Datos reales ROCA: horario[0]=07:00-13:00 (R055), horario[1]=13:00-21:00 (R175).
    Franco MARTES (d=1). Bisagra:
      Sem1: L arrastra H1 (previo) | Ma LIBR | Mi-Do usan H0 (propio)
      Sem2: L arrastra H0 (previo) | Ma LIBR | Mi-Do usan H1 (propio)
    """
    print('\n' + '=' * 60)
    print('REGRESIÓN BISAGRA: generar_rotativo franco MARTES (datos reales ROCA)')
    print('=' * 60)

    H0 = '07:00-13:00'
    H1 = '13:00-21:00'
    grilla = generar_rotativo([H0, H1], 'Martes')

    sem1 = [c.horario if not c.es_franco else 'LIBR' for c in grilla.semanas[0]]
    sem2 = [c.horario if not c.es_franco else 'LIBR' for c in grilla.semanas[1]]

    print(f'  Sem1: {sem1}')
    print(f'  Sem2: {sem2}')

    # Valores exactos verificados contra SAP real
    esperada_sem1 = [H1, 'LIBR', H0, H0, H0, H0, H0]
    esperada_sem2 = [H0, 'LIBR', H1, H1, H1, H1, H1]

    check(sem1 == esperada_sem1,
          f'Sem1 correcta: {sem1}',
          f'Sem1 INCORRECTA: {sem1}\n    esperado: {esperada_sem1}')
    check(sem2 == esperada_sem2,
          f'Sem2 correcta: {sem2}',
          f'Sem2 INCORRECTA: {sem2}\n    esperado: {esperada_sem2}')
    check(grilla.semanas[0][1].es_franco, 'Sem1 Martes = franco')
    check(grilla.semanas[1][1].es_franco, 'Sem2 Martes = franco')


# ---------------------------------------------------------------------------
# REGRESIÓN — periódico rotativo guardado ROTADO (caso real LR846 / R848).
# SAP guarda el periódico arrancando por la otra semana del ciclo; el match
# debe encontrarlo igual (probando rotaciones), no proponer crear.
# ---------------------------------------------------------------------------
def test_periodico_rotado():
    print('\n' + '=' * 60)
    print('REGRESIÓN: periódico rotativo guardado ROTADO (R848)')
    print('=' * 60)

    LIBR = 'LIBR'
    sem_R055 = (LIBR, 'R055', 'R055', 'R055', 'R055', 'R055', 'R055')
    sem_R175 = (LIBR, 'R175', 'R175', 'R175', 'R175', 'R175', 'R175')
    # R848 guardado ROTADO: Sem1=R175, Sem2=R055 (al revés de lo que arma la app)
    motor = MotorMock(
        diarios_existentes={
            (28, '11:00', '19:00'): 'R055',
            (28, '03:00', '11:00'): 'R175',
        },
        periodicos_existentes={(28, (sem_R175, sem_R055)): 'R848'},
        ultimo_diario=175, ultimo_periodico=847, ultimo_turno=845,
    )
    # App: franco Lunes, SEM1=11-19 (R055), SEM2=03-11 (R175)
    grilla = generar_rotativo(['11:00-19:00', '03:00-11:00'], 'Lunes')
    r = resolver_grilla(grilla, 28, 'LR846', 0, motor)

    print(f'  semanas_codigos: {r["semanas_codigos"]}')
    print(f'  periodico: accion={r["periodico"]["accion"]}, codigo={r["periodico"].get("codigo")}')
    check(r['periodico']['accion'] == 'existe',
          'periódico encontrado por rotación (no propone crear)',
          f'FALLA: accion={r["periodico"]["accion"]} (esperaba existe)')
    check(r['periodico'].get('codigo') == 'R848',
          'periódico correcto: R848',
          f'código incorrecto: {r["periodico"].get("codigo")}')
    check(any('rotado' in n for n in r['notas']),
          'nota de rotación presente')


# ---------------------------------------------------------------------------
# REGRESIÓN — diario DUPLICADO: el periódico existe pero está guardado con el
# segundo código del duplicado. Caso real LR846/R848: 03:00-11:00 existe como
# R008 y R175; R848 usa R175. La app arma la grilla con R008 (el primero) y debe
# reconocer R848 probando la alternativa R175, y alinear la grilla a R175.
# ---------------------------------------------------------------------------
def test_diario_duplicado_periodico_existe():
    print('\n' + '=' * 60)
    print('DUPLICADO: periódico guardado con el 2do código del diario (R175 vs R008)')
    print('=' * 60)
    motor = MotorMock(
        diarios_existentes={
            (24, '11:00', '19:00'): 'R055',
            (24, '03:00', '11:00'): ['R008', 'R175'],   # duplicado: R848 usa R175
        },
        periodicos_existentes={
            (24, (('LIBR', 'R055', 'R055', 'R055', 'R055', 'R055', 'R055'),
                  ('LIBR', 'R175', 'R175', 'R175', 'R175', 'R175', 'R175'))): 'R848',
        },
        ultimo_diario=175, ultimo_periodico=847, ultimo_turno=845,
    )
    pedidos = [
        {'codigo': 'LR846A', 'descripcion': 'ROT TPTE 26', 'agrupador': 24,
         'detalle_horario': 'SEM 1 - 11:00 A 19:00', 'franco': 'Lunes'},
        {'codigo': 'LR846B', 'descripcion': 'ROT TPTE 26', 'agrupador': 24,
         'detalle_horario': 'SEM 2 - 03:00 A 11:00', 'franco': 'Lunes'},
    ]
    r = resolver_lote_rotativo(pedidos, motor)[0]
    print(f'  periodico: {r["periodico"]["accion"]} {r["periodico"].get("codigo")}')
    print(f'  Sem2: {r["semanas_codigos"][1]}')

    check(r['periodico']['accion'] == 'existe',
          'periódico reconocido como YA CREADO (no propone crear)',
          f'FALLA: accion={r["periodico"]["accion"]}')
    check(r['periodico'].get('codigo') == 'R848',
          'periódico correcto: R848')
    check(r['semanas_codigos'][1] == ['LIBR'] + ['R175'] * 6,
          'grilla Sem2 alineada a R175 (el que usa R848), no R008',
          f'Sem2={r["semanas_codigos"][1]}')
    check(any('R175' in n and 'R848' in n for n in r['notas']),
          'nota explica que se usa R175 porque es el del periódico R848')


def test_diario_duplicado_sin_periodico():
    print('\n' + '=' * 60)
    print('DUPLICADO: sin periódico existente -> usa el primero (R008) y avisa confirmar')
    print('=' * 60)
    # Mismo duplicado pero NINGÚN periódico guardado: no hay evidencia para elegir,
    # se queda con el primero (R008) y propone crear el periódico.
    motor = MotorMock(
        diarios_existentes={
            (24, '11:00', '19:00'): 'R055',
            (24, '03:00', '11:00'): ['R008', 'R175'],
        },
        ultimo_diario=175, ultimo_periodico=847, ultimo_turno=845,
    )
    pedidos = [
        {'codigo': 'LR846A', 'descripcion': 'ROT TPTE 26', 'agrupador': 24,
         'detalle_horario': 'SEM 1 - 11:00 A 19:00', 'franco': 'Lunes'},
        {'codigo': 'LR846B', 'descripcion': 'ROT TPTE 26', 'agrupador': 24,
         'detalle_horario': 'SEM 2 - 03:00 A 11:00', 'franco': 'Lunes'},
    ]
    r = resolver_lote_rotativo(pedidos, motor)[0]
    check(r['periodico']['accion'] == 'crear',
          'sin periódico guardado propone crear')
    check(r['semanas_codigos'][1] == ['LIBR'] + ['R008'] * 6,
          'grilla Sem2 queda con el primero (R008)',
          f'Sem2={r["semanas_codigos"][1]}')
    check(any('duplicado' in n.lower() and 'R008' in n and 'R175' in n for n in r['notas']),
          'nota reporta el duplicado y que se usa el primero; confirmar')


# ---------------------------------------------------------------------------
# CHEQUEO DE HORAS — rotativo prolijo (LR846): 8h/día, 48h/sem, todo coincide.
# ---------------------------------------------------------------------------
def _motor_lr846():
    return MotorMock(
        diarios_existentes={
            (28, '11:00', '19:00'): 'R055',
            (28, '03:00', '11:00'): 'R175',
        },
        ultimo_diario=175, ultimo_periodico=847, ultimo_turno=845,
    )


def test_horas_rotativo_ok():
    print('\n' + '=' * 60)
    print('HORAS: rotativo prolijo LR846 — 8h/día, 48h/sem (todo coincide)')
    print('=' * 60)
    pedidos = [
        {'codigo': 'LR846A', 'descripcion': 'ROT TPTE 26', 'agrupador': 28,
         'detalle_horario': 'SEM 1 - 11:00 A 19:00', 'franco': 'Lunes',
         'horas_diarias_decl': 8, 'horas_sem_decl': 48},
        {'codigo': 'LR846B', 'descripcion': 'ROT TPTE 26', 'agrupador': 28,
         'detalle_horario': 'SEM 2 - 03:00 A 11:00', 'franco': 'Lunes',
         'horas_diarias_decl': 8, 'horas_sem_decl': 48},
    ]
    r = resolver_lote_rotativo(pedidos, _motor_lr846())[0]
    vh = r['validaciones_horas']
    print(f'  por_semana: {r["horas"]["por_semana"]}')
    print(f'  diaria: {vh["diaria"]}')
    print(f'  semanal: {vh["semanal"]}')

    check([s['horas'] for s in r['horas']['por_semana']] == [48.0, 48.0],
          'ambas semanas suman 48h',
          f'horas por semana: {r["horas"]["por_semana"]}')
    check([s['dias_trabajados'] for s in r['horas']['por_semana']] == [6, 6],
          '6 días trabajados por semana')
    check(all(x['coincide'] for x in vh['diaria']),
          'horas diarias coinciden (8h) en las dos SEM')
    check(all(x['coincide'] for x in vh['semanal']),
          'horas semanales coinciden (48h) en las dos semanas')
    check(not vh['semanas_desiguales'], 'semanas iguales')
    check(vh['ok'], 'validación de horas OK')


def test_horas_rotativo_mismatch():
    print('\n' + '=' * 60)
    print('HORAS: declara 40h/sem pero la grilla suma 48 -> aviso, no bloquea')
    print('=' * 60)
    pedidos = [
        {'codigo': 'LR846A', 'descripcion': 'ROT TPTE 26', 'agrupador': 28,
         'detalle_horario': 'SEM 1 - 11:00 A 19:00', 'franco': 'Lunes',
         'horas_diarias_decl': 8, 'horas_sem_decl': 40},
        {'codigo': 'LR846B', 'descripcion': 'ROT TPTE 26', 'agrupador': 28,
         'detalle_horario': 'SEM 2 - 03:00 A 11:00', 'franco': 'Lunes',
         'horas_diarias_decl': 8, 'horas_sem_decl': 40},
    ]
    r = resolver_lote_rotativo(pedidos, _motor_lr846())[0]
    vh = r['validaciones_horas']
    print(f'  semanal: {vh["semanal"]}')

    check(all(x['coincide'] for x in vh['diaria']),
          'horas diarias siguen coincidiendo (8h)')
    check(all(x['coincide'] is False for x in vh['semanal']),
          'horas semanales marcan NO coincide (48 calc vs 40 decl)')
    check(not vh['ok'], 'validación de horas marca ok=False')
    check(any('semanales' in n.lower() for n in r['notas']),
          'hay nota avisando la diferencia semanal')
    check(r['ok'], 'el turno igual queda ok (no lo bloquea el chequeo de horas)')


def test_horas_semanas_desiguales():
    print('\n' + '=' * 60)
    print('HORAS: bisagra con horarios de distinta duración -> semanas desiguales')
    print('=' * 60)
    # ROCA franco MARTES, SEM1=07-13 (6h), SEM2=13-21 (8h). La bisagra mezcla:
    # Sem1 = 8 + 6*5 = 38h ; Sem2 = 6 + 8*5 = 46h.
    motor = MotorMock(
        diarios_existentes={
            (24, '07:00', '13:00'): 'R055',
            (24, '13:00', '21:00'): 'R175',
        },
        ultimo_diario=175, ultimo_periodico=220, ultimo_turno=100,
    )
    pedidos = [
        {'codigo': 'LR101A', 'descripcion': 'ROT', 'agrupador': 24,
         'detalle_horario': 'SEM 1 - 07:00 A 13:00', 'franco': 'Martes',
         'horas_diarias_decl': 6, 'horas_sem_decl': None},
        {'codigo': 'LR101B', 'descripcion': 'ROT', 'agrupador': 24,
         'detalle_horario': 'SEM 2 - 13:00 A 21:00', 'franco': 'Martes',
         'horas_diarias_decl': 8, 'horas_sem_decl': None},
    ]
    r = resolver_lote_rotativo(pedidos, motor)[0]
    vh = r['validaciones_horas']
    print(f'  por_semana: {r["horas"]["por_semana"]}')

    check(sorted(s['horas'] for s in r['horas']['por_semana']) == [38.0, 46.0],
          'semanas suman 38h y 46h (bisagra mezcla duraciones)',
          f'horas: {[s["horas"] for s in r["horas"]["por_semana"]]}')
    check(vh['semanas_desiguales'], 'flag semanas_desiguales = True')
    check(any('no cargan lo mismo' in n for n in r['notas']),
          'nota avisa que las semanas no cargan lo mismo')
    check(all(x['coincide'] for x in vh['diaria']),
          'horas diarias coinciden (6h y 8h según SEM)')


# ---------------------------------------------------------------------------
# PARSER DE DÍAS — variantes de rango que trae RRHH (formatos incrementales).
# Bug real (pedido LBS 29.05.2025): "Lunes a sabados" (plural) daba solo [Lunes]
# porque el plural no estaba en el mapa de días; caía a "día suelto".
# ---------------------------------------------------------------------------
def test_parser_dias_rango():
    print('\n' + '=' * 60)
    print('PARSER: rangos de días (plural, abreviado, wrap de semana)')
    print('=' * 60)
    from turnos_engine import parse_horario
    LMMJVS = [0, 1, 2, 3, 4, 5]
    casos = [
        ('Lunes a sabados de 13:00 a 19:00', LMMJVS, 36.0),   # plural (el del bug)
        ('Lunes a Sabados de 13:00 a 19:00', LMMJVS, 36.0),   # plural + mayúscula
        ('Lun a Sab de 13:00 a 19:00',       LMMJVS, 36.0),   # abreviado 3 letras
        ('Lunes a Sabado de 13:00 a 19:00',  LMMJVS, 36.0),   # singular (ya andaba)
        ('lunes a viernes de 07:00 a 13:00', [0, 1, 2, 3, 4], 30.0),
        ('Domingos de 08:00 a 14:00',        [6], 6.0),        # día suelto plural
        ('sabados a lunes de 22:00 a 04:00', [0, 5, 6], 18.0), # wrap de semana
    ]
    for texto, dias_esp, hsem_esp in casos:
        p = parse_horario(texto)
        check(p.dias_trabaja == dias_esp,
              f'{texto!r} -> días {dias_esp}',
              f'{texto!r} -> días {p.dias_trabaja} (esperaba {dias_esp})')
        check(p.horas_semanales_calc == hsem_esp,
              f'{texto!r} -> {hsem_esp}h/sem',
              f'{texto!r} -> {p.horas_semanales_calc}h (esperaba {hsem_esp})')


# ---------------------------------------------------------------------------
# FLEX — "Flex 6 hrs" (sin rango): lista diarios FLEX candidatos del agrupador
# por horas declaradas, para que el usuario elija. Nunca elige uno solo.
# ---------------------------------------------------------------------------
def _motor_flex():
    import pandas as pd
    from turnos_engine import MotorTurnos
    m = MotorTurnos.__new__(MotorTurnos)   # sin __init__: no lee Excel
    m.diarios = pd.DataFrame({
        'Agrup.para PHTD':      [34, 34, 34, 34, 34, 28],
        'Plan hor.tbjo.diario': ['BF02', 'BF12', 'ZLFN', 'B048', 'BF16', 'MF06'],
        'Texto plan hr.tr.dia': ['Flex 36 - 6', 'Flex 36 6 NOC', 'Flex 6 hr NOC',
                                 '13:00 a 19:00', 'Flex 4 Horas', 'Flex 6 Horas'],
        'Horas trabajo teór.':  ['6', '6', '6', '6', '4', '6'],
    })
    m._indexar_diarios()
    return m


def test_flex_candidatos_por_horas():
    print('\n' + '=' * 60)
    print('FLEX: lista candidatos por horas declaradas (no elige uno solo)')
    print('=' * 60)
    m = _motor_flex()
    cands = m.candidatos_diario_flex(34, 6)
    cods = [c['codigo'] for c in cands]
    print(f'  candidatos 6h agrup 34: {cods}')
    check(set(cods) == {'BF02', 'BF12', 'ZLFN'},
          'lista los 3 FLEX de 6h del agrupador 34',
          f'obtuvo {cods}')
    check('B048' not in cods, 'excluye el diario con rango (no FLEX)')
    check('BF16' not in cods, 'excluye el FLEX de otras horas (4h)')
    check('MF06' not in cods, 'excluye FLEX de otro agrupador (28)')


def test_flex_sin_match_ofrece_todos():
    print('\n' + '=' * 60)
    print('FLEX: si no hay match exacto de horas, ofrece TODOS los FLEX del agrup')
    print('=' * 60)
    m = _motor_flex()
    cands = m.candidatos_diario_flex(34, 99)   # ninguna de 99h
    cods = {c['codigo'] for c in cands}
    check(cods == {'BF02', 'BF12', 'ZLFN', 'BF16'},
          'sin match por horas, devuelve todos los FLEX del agrupador 34',
          f'obtuvo {cods}')


def test_flex_analisis_elegir():
    print('\n' + '=' * 60)
    print('FLEX: el análisis marca elegir_flex y adjunta los candidatos')
    print('=' * 60)
    import pandas as pd
    m = _motor_flex()
    # turnos mínimos para que validar_correlativo_turno no reviente
    m.turnos = pd.DataFrame({
        'Agrup.para PHTD':       [34],
        'Regla p.plan h.tbjo.':  ['LBS882'],
    })
    r = m._analizar_flex('LBS883', 'Flex 6 hrs', 'Flex 6 hrs', 34, 6, 30, None, {})
    check(r['flex'] is True and r['ok'] is False,
          'resultado marcado FLEX y ok=False (requiere elección)')
    check(r['diario']['accion'] == 'elegir_flex',
          'diario.accion = elegir_flex')
    check(len(r['diario']['candidatos']) == 3,
          '3 candidatos de 6h adjuntos',
          f'{len(r["diario"]["candidatos"])} candidatos')
    check(r['periodico']['accion'] == 'pendiente_flex',
          'periódico queda pendiente de la elección del diario')
    check(r['validaciones']['horas_diarias']['declarado'] == 6,
          'muestra las horas declaradas (6) sin calcular')


# ---------------------------------------------------------------------------
# Ejecutar
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    test_ld573()
    test_ld516()
    test_roca_rotativo()
    test_bisagra_roca_martes()
    test_periodico_rotado()
    test_diario_duplicado_periodico_existe()
    test_diario_duplicado_sin_periodico()
    test_horas_rotativo_ok()
    test_horas_rotativo_mismatch()
    test_horas_semanas_desiguales()
    test_parser_dias_rango()
    test_flex_candidatos_por_horas()
    test_flex_sin_match_ofrece_todos()
    test_flex_analisis_elegir()

    print('\n' + '=' * 60)
    print(f'RESULTADO: {PASS} PASS, {FAIL} FAIL')
    if FAIL == 0:
        print('TODOS LOS TESTS PASARON')
    else:
        print('HAY FALLOS — ver arriba')
        sys.exit(1)
    print('=' * 60)
