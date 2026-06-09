"""
test_puente.py — Tests de resolver_grilla contra motor mock.
Cubre LD573 (diario existente), LD516 (4 diarios nuevos), ROCA (rotativo multisemana R055/R175).
Correr: python test_puente.py
"""
import re
import sys
from dataclasses import dataclass, field
from generador_grillas import generar_franco_corrido, generar_rotativo, Grilla, Celda, DIAS_ORDEN
from puente_grilla_motor import resolver_grilla, CODIGO_FRANCO, CODIGO_REVISAR


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
            cod = self.diarios_ex[key]
            return ResultadoBusqueda(existe=True, codigos=[(cod, f'{ini}-{fin}', 8.0)])
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

    def validar_correlativo_turno(self, agrupador, codigo_turno):
        mt = re.match(r'^([A-Za-z]+)(\d+)$', str(codigo_turno))
        if not mt:
            return {'estado': 'revisar', 'nota': 'No se pudo parsear el codigo.'}
        num = int(mt.group(2))
        siguiente = self.ultimo_turno + 1
        fam = mt.group(1)
        if num == siguiente:
            return {'estado': 'ok',
                    'nota': f'Correlativo correcto. Anterior: {fam}{self.ultimo_turno:03d}',
                    'ultimo_existente': f'{fam}{self.ultimo_turno:03d}'}
        elif num > siguiente:
            return {'estado': 'salto',
                    'nota': f'Saltea numeros. Esperado {fam}{siguiente:03d}.',
                    'esperado': f'{fam}{siguiente:03d}'}
        else:
            return {'estado': 'duplicado', 'nota': f'Ya existe {fam}{num:03d}.'}


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
# Ejecutar
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    test_ld573()
    test_ld516()
    test_roca_rotativo()
    test_bisagra_roca_martes()

    print('\n' + '=' * 60)
    print(f'RESULTADO: {PASS} PASS, {FAIL} FAIL')
    if FAIL == 0:
        print('TODOS LOS TESTS PASARON')
    else:
        print('HAY FALLOS — ver arriba')
        sys.exit(1)
    print('=' * 60)
