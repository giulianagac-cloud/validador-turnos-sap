"""
puente_grilla_motor.py — Conecta el generador de grillas con el motor de turnos.

Toma una Grilla generada y resuelve cada celda contra el motor SAP,
devolviendo todo lo necesario para cargar el turno en SAP.

Filosofía: OBSERVA y PROPONE. Nunca elige por el usuario ante ambigüedad.
"""
import re
from typing import Optional

from generador_grillas import (
    Grilla, calcular_fecha_referencia, DIAS_ORDEN,
    generar_rotativo, parse_detalle_rotativo, variante_a_indice,
)
from turnos_engine import MotorTurnos, calcular_tolerancia

CODIGO_FRANCO = 'LIBR'
CODIGO_REVISAR = 'REVISAR_MANUAL'


def _split_horario(canon: str):
    """'06:30-15:30' -> ('06:30', '15:30'). Funciona también con '16:00-00:00'."""
    return tuple(canon.split('-', 1))


def resolver_grilla(
    grilla: Grilla,
    agrupador: int,
    codigo_turno: str,
    indice_variante: int = 0,
    motor: Optional[MotorTurnos] = None,
    es_flex: bool = False,
    reservas: Optional[dict] = None,
    diarios_previos: Optional[dict] = None,
) -> dict:
    """
    Resuelve una Grilla contra el motor, devolviendo un dict JSON-serializable.

    grilla          : Grilla generada por generar_franco_corrido / generar_multihorario /
                      generar_rotativo
    agrupador       : código de agrupador (20, 24, 26, ...)
    codigo_turno    : ej. "LD573" — para validar/proponer el correlativo de turno
    indice_variante : 0=A, 1=B, 2=C — para calcular la fecha de referencia SAP
    motor           : instancia de MotorTurnos con las tablas SAP cargadas
    es_flex         : afecta qué familia de diario/periódico se usa
    reservas        : dict de reservas de correlativos COMPARTIDO entre varias
                      llamadas (para encadenar diario/periódico/turno en un lote).
                      Si es None se usa uno interno (comportamiento original).
    diarios_previos : dict {horario_canon -> resultado} COMPARTIDO entre grillas
                      del mismo lote, para no re-proponer un diario ya resuelto en
                      otra grilla. Si es None se usa uno interno.
    """
    notas = list(grilla.notas)
    if reservas is None:
        reservas = {}

    # -----------------------------------------------------------------------
    # 1. Recolectar horarios únicos a través de todas las semanas
    # -----------------------------------------------------------------------
    horarios_unicos: set = set()
    for sem in grilla.semanas:
        for celda in sem:
            if celda.horario and not celda.es_franco and not celda.a_ordenes:
                horarios_unicos.add(celda.horario)

    # -----------------------------------------------------------------------
    # 2. Resolver cada horario único → buscar/proponer diario
    #    Reservas intra-grilla: N diarios nuevos en la misma grilla reciben
    #    correlativos consecutivos, no el mismo número repetido.
    # -----------------------------------------------------------------------
    diarios_por_horario: dict = diarios_previos if diarios_previos is not None else {}
    acciones_diario: list = []

    if motor is not None:
        familia_diario = motor.familia_objetivo('diario', agrupador, es_flex)
        for horario in sorted(horarios_unicos):
            if horario in diarios_por_horario:
                continue   # ya resuelto en otra grilla del mismo lote
            ini, fin = _split_horario(horario)
            rb = motor.buscar_diario(agrupador, ini, fin)
            if rb.existe:
                diarios_por_horario[horario] = {
                    'accion': 'existe',
                    'codigo': rb.codigos[0][0],
                    'todos': [{'codigo': c, 'texto': o, 'horas': h} for c, o, h in rb.codigos],
                    'duplicado': rb.duplicado,
                    'notas': rb.notas,
                }
                if rb.duplicado:
                    notas.append(
                        f'Diario {horario}: múltiples códigos en agrupador {agrupador}: '
                        + ', '.join(c[0] for c in rb.codigos)
                        + '. Se usa el primero; confirmar.'
                    )
            else:
                prop = motor.proponer_correlativo('diario', agrupador, familia_diario, reservas)
                codigo_prop = prop['propuesto']
                tol = calcular_tolerancia(ini, fin)
                diarios_por_horario[horario] = {
                    'accion': 'crear',
                    'codigo_propuesto': codigo_prop,
                    'familia': familia_diario,
                    'detalle': prop,
                    'tolerancia': tol,
                }
                acciones_diario.append({
                    'tipo': 'crear_diario',
                    'horario': horario,
                    'codigo_propuesto': codigo_prop,
                    'detalle': prop,
                    'tolerancia': tol,
                })
                # Reservar para que el siguiente diario (de esta grilla o del lote) tome el siguiente número
                motor._registrar_reserva(reservas, 'diario', agrupador, codigo_prop)
    else:
        notas.append('Motor no disponible — diarios no resueltos.')
        for horario in sorted(horarios_unicos):
            diarios_por_horario[horario] = {'accion': 'sin_motor', 'codigo': None}

    # -----------------------------------------------------------------------
    # 3. Armar la grilla de códigos (N semanas × 7)
    # -----------------------------------------------------------------------
    hay_revisar = False
    semanas_codigos: list = []

    for i_sem, sem in enumerate(grilla.semanas):
        fila = []
        for d, celda in enumerate(sem):
            if celda.es_franco:
                fila.append(CODIGO_FRANCO)
            elif celda.a_ordenes or celda.sin_definir:
                fila.append(CODIGO_REVISAR)
                hay_revisar = True
                tipo_aviso = 'sin definir' if celda.sin_definir else '"a órdenes"'
                notas.append(f'Sem{i_sem + 1}/{DIAS_ORDEN[d]}: {tipo_aviso} → REVISAR MANUAL')
            elif celda.horario:
                info = diarios_por_horario.get(celda.horario, {})
                accion = info.get('accion')
                if accion == 'existe':
                    fila.append(info['codigo'])
                elif accion == 'crear':
                    fila.append(info.get('codigo_propuesto') or CODIGO_REVISAR)
                else:
                    fila.append(CODIGO_REVISAR)
                    hay_revisar = True
            else:
                fila.append(CODIGO_REVISAR)
                hay_revisar = True
        semanas_codigos.append(fila)

    # -----------------------------------------------------------------------
    # 4. Buscar / proponer el periódico
    # -----------------------------------------------------------------------
    if motor is None:
        resultado_periodico = {'accion': 'sin_motor'}
    elif hay_revisar:
        resultado_periodico = {
            'accion': 'pendiente',
            'nota': 'No se puede determinar el periódico hasta resolver las celdas REVISAR_MANUAL.',
        }
    else:
        semanas_tuples = [tuple(fila) for fila in semanas_codigos]
        if grilla.n_semanas == 1:
            rp = motor.buscar_periodico(agrupador, semanas_tuples[0])
        else:
            rp = motor.buscar_periodico_multi(agrupador, semanas_tuples)

        if rp.existe:
            resultado_periodico = {
                'accion': 'existe',
                'codigo': rp.codigos[0][0],
                'todos': [c[0] for c in rp.codigos],
                'duplicado': rp.duplicado,
                'notas': rp.notas,
            }
            if rp.duplicado:
                notas.append(
                    f'Periódico DUPLICADO: {", ".join(c[0] for c in rp.codigos)}. '
                    'Listar todos y dejar elegir.'
                )
        else:
            familia_per = motor.familia_objetivo('periodico', agrupador, es_flex)
            prop = motor.proponer_correlativo('periodico', agrupador, familia_per, reservas)
            resultado_periodico = {
                'accion': 'crear',
                'codigo_propuesto': prop['propuesto'],
                'familia': familia_per,
                'detalle': prop,
            }
            # Reservar para que el siguiente periódico del lote tome el siguiente número
            motor._registrar_reserva(reservas, 'periodico', agrupador, prop['propuesto'])

    # -----------------------------------------------------------------------
    # 5. Validar correlativo de turno
    # -----------------------------------------------------------------------
    resultado_turno = (
        motor.validar_correlativo_turno(agrupador, codigo_turno, reservas)
        if motor is not None
        else {'estado': 'sin_motor', 'nota': 'Motor no disponible.'}
    )

    # -----------------------------------------------------------------------
    # 6. Fecha de referencia SAP
    # -----------------------------------------------------------------------
    fecha_ref = calcular_fecha_referencia(indice_variante)

    # -----------------------------------------------------------------------
    # 7. Resultado final
    # -----------------------------------------------------------------------
    return {
        'codigo_turno': codigo_turno,
        'agrupador': agrupador,
        'n_semanas': grilla.n_semanas,
        'semanas_codigos': semanas_codigos,
        'dias': DIAS_ORDEN,
        'diarios': diarios_por_horario,
        'acciones_diario': acciones_diario,
        'periodico': resultado_periodico,
        'turno': resultado_turno,
        'fecha_referencia': fecha_ref,
        'hay_revisar': hay_revisar,
        'notas': notas,
        'ok': not hay_revisar and motor is not None,
    }


# ===========================================================================
# Lote ROTATIVO: puente entre el Excel de pedido y el generador de grillas
# ===========================================================================
def _split_base_letra(codigo):
    """'LR846A' -> ('LR846','A'); 'LR846-A' -> ('LR846','A'); 'LR846' -> ('LR846','').
    El sufijo de letra identifica la variante/rotación (A=entra en SEM1, B en SEM2...)."""
    if not codigo:
        return (codigo, '')
    c = str(codigo).strip()
    m = re.match(r'^([A-Za-z]+\d+)-?([A-Za-z]+)$', c)
    if m:
        return (m.group(1), m.group(2))
    return (c, '')


def resolver_lote_rotativo(pedidos, motor, reservas=None):
    """Resuelve un lote de pedidos ROTATIVOS multisemana subidos del Excel.

    pedidos: lista de dicts con keys codigo, descripcion, detalle_horario,
             agrupador, franco (día de la columna FRANCO), es_flex (opt).
    reservas: dict de reservas COMPARTIDO (para encadenar correlativos con el
              resto del lote —simples y rotativos—). Si es None se crea uno.

    Agrupa por código base (LR846A/LR846B -> LR846 = un turno de un día franco),
    arma horarios_semana ordenado por número de SEM, construye la grilla rotativa
    con generar_rotativo() y la resuelve con resolver_grilla(). A y B comparten
    diarios y periódico; solo cambian la fecha de referencia (punto de arranque).

    Devuelve una lista de resultados (uno por código base), cada uno con
    tipo='rotativo', la grilla de N semanas, y la lista de variantes A/B con su
    fecha de referencia.
    """
    if reservas is None:
        reservas = {}
    diarios_previos: dict = {}   # horario_canon -> resultado, compartido en el lote

    # 1. Agrupar por código base, preservando orden de aparición
    grupos: dict = {}
    for p in pedidos:
        base, letra = _split_base_letra(p.get('codigo'))
        grupos.setdefault(base, []).append((letra, p))

    resultados = []
    for base, filas in grupos.items():
        semanas: dict = {}          # num_sem -> horario_canon
        franco = None
        agrupador = None
        es_flex = False
        variantes = []              # (letra, codigo_completo)
        notas_grupo = []

        for letra, p in filas:
            if franco is None:
                franco = p.get('franco')
            if agrupador is None:
                agrupador = p.get('agrupador')
            es_flex = es_flex or bool(p.get('es_flex'))
            pr = parse_detalle_rotativo(p.get('detalle_horario'))
            if pr:
                num, horario = pr
                semanas[num] = horario
            else:
                notas_grupo.append(
                    f'No se pudo leer "SEM N - HH:MM A HH:MM" en: '
                    f'"{p.get("detalle_horario")}" -> REVISAR MANUAL'
                )
            variantes.append((letra, p.get('codigo')))

        horarios_semana = [semanas[k] for k in sorted(semanas)]

        # Construir y resolver la grilla rotativa (variante base = índice 0)
        grilla = generar_rotativo(horarios_semana, franco or '')
        grilla.notas.extend(notas_grupo)
        r = resolver_grilla(
            grilla, agrupador, base, 0, motor, es_flex,
            reservas=reservas, diarios_previos=diarios_previos,
        )

        # Fechas de referencia por variante A/B (comparten diario/periódico)
        r['tipo'] = 'rotativo'
        r['codigo_base'] = base
        r['franco'] = franco
        r['variantes'] = [
            {
                'codigo': cod,
                'variante': letra,
                'fecha_referencia': calcular_fecha_referencia(
                    variante_a_indice(letra[:1]) if letra else 0
                ),
            }
            for (letra, cod) in sorted(variantes)
        ]

        # Encadenar el correlativo de turno para el próximo grupo/lote
        if motor is not None and agrupador is not None:
            motor._registrar_reserva(reservas, 'turno', agrupador, base)

        resultados.append(r)

    return resultados
