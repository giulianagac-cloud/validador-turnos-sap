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
    calcular_horas_grilla,
)
from turnos_engine import MotorTurnos, calcular_tolerancia

CODIGO_FRANCO = 'LIBR'
CODIGO_REVISAR = 'REVISAR_MANUAL'


def _split_horario(canon: str):
    """'06:30-15:30' -> ('06:30', '15:30'). Funciona también con '16:00-00:00'."""
    return tuple(canon.split('-', 1))


def _buscar_periodico_rotando(motor, agrupador, semanas_tuples):
    """Busca un periódico multisemana tolerando la rotación del ciclo.

    Un periódico rotativo es CÍCLICO: SAP puede tenerlo guardado arrancando por
    cualquier semana del ciclo (la fase real la fija la Fe.referencia de cada
    variante, no el periódico —A y B comparten un mismo periódico). Por eso, si
    no coincide tal cual, probamos las N rotaciones de las semanas; si alguna
    coincide, es el MISMO periódico.

    Devuelve (ResultadoBusqueda, shift): shift = cuántas semanas hubo que rotar
    para encontrarlo (0 = coincidió tal cual, o no existe).
    """
    rp = motor.buscar_periodico_multi(agrupador, semanas_tuples)
    n = len(semanas_tuples)
    if rp.existe or n <= 1:
        return rp, 0
    for shift in range(1, n):
        rot = semanas_tuples[shift:] + semanas_tuples[:shift]
        rp_rot = motor.buscar_periodico_multi(agrupador, rot)
        if rp_rot.existe:
            return rp_rot, shift
    return rp, 0


def _tuples_desde_layout(semanas_layout, eleccion):
    """Arma las tuplas de códigos de la grilla a partir del layout y una elección
    concreta de código por horario. Cada celda del layout es:
      ('lit', codigo)  -> celda fija (LIBR o REVISAR)
      ('h', horario)   -> celda de trabajo; toma el código elegido para ese horario
    """
    filas = []
    for fila in semanas_layout:
        out = []
        for tipo, val in fila:
            out.append(val if tipo == 'lit' else eleccion[val])
        filas.append(tuple(out))
    return filas


def _buscar_periodico_flexible(motor, agrupador, semanas_layout, opciones_por_horario, n_semanas):
    """Busca un periódico existente tolerando DOS ambigüedades a la vez:

      (a) la rotación del ciclo (via _buscar_periodico_rotando), y
      (b) los DIARIOS DUPLICADOS: un horario que en el agrupador existe con varios
          códigos equivalentes (ej. 03:00-11:00 = R008 y R175) puede estar guardado
          en el periódico con CUALQUIERA de ellos. La grilla elige uno (el primero),
          pero el periódico real pudo armarse con otro.

    Prueba las combinaciones de códigos por horario —primero la elección primaria,
    así el caso sin duplicados no cambia— y para cada una prueba las rotaciones.
    Devuelve (rp, shift, eleccion): rp/shift del primer match; eleccion = qué código
    quedó por horario. Si ninguna combinación existe, devuelve el resultado primario
    (existe=False) con la elección primaria, para que arriba se proponga crear.
    """
    import itertools
    horarios = sorted({val for fila in semanas_layout for tipo, val in fila if tipo == 'h'})
    listas = [opciones_por_horario.get(h) or [None] for h in horarios]
    # La primera opción de cada horario es la primaria: product() la prueba primero.
    resultado_primario = None
    for combo in itertools.product(*listas) if horarios else [()]:
        eleccion = dict(zip(horarios, combo))
        semanas_tuples = _tuples_desde_layout(semanas_layout, eleccion)
        if n_semanas == 1:
            rp = motor.buscar_periodico(agrupador, semanas_tuples[0])
            shift = 0
        else:
            rp, shift = _buscar_periodico_rotando(motor, agrupador, semanas_tuples)
        if resultado_primario is None:
            resultado_primario = (rp, shift, eleccion)
        if rp.existe:
            return rp, shift, eleccion
    return resultado_primario if resultado_primario is not None else (
        motor.buscar_periodico_multi(agrupador, []), 0, {})


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
                    # Tolerancia también para los diarios que ya existen (para mostrarla
                    # en la visual junto al horario; no cambia ninguna decisión).
                    'tolerancia': calcular_tolerancia(ini, fin),
                }
                if rb.duplicado:
                    notas.append(
                        f'Diario {horario}: duplicado preexistente en agrupador {agrupador}: '
                        + ', '.join(c[0] for c in rb.codigos)
                        + f'. Se usa {rb.codigos[0][0]} salvo que un periódico existente '
                        'indique otro; confirmar.'
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

    # Opciones de código por horario, para tolerar diarios duplicados al matchear
    # el periódico: un horario que ya existe con varios códigos equivalentes puede
    # estar guardado en el periódico con cualquiera de ellos. La primera es la
    # primaria (la que muestra la grilla salvo que un periódico existente diga otra).
    opciones_por_horario: dict = {}
    for h, info in diarios_por_horario.items():
        if info.get('accion') == 'existe':
            opciones_por_horario[h] = [t['codigo'] for t in info.get('todos', [])] or [info.get('codigo')]
        elif info.get('accion') == 'crear':
            opciones_por_horario[h] = [info.get('codigo_propuesto')]
        else:
            opciones_por_horario[h] = [info.get('codigo')]

    # -----------------------------------------------------------------------
    # 3. Armar la grilla de códigos (N semanas × 7)
    #    semanas_layout guarda, en paralelo, de qué depende cada celda: literal
    #    (LIBR / REVISAR) o el horario de trabajo. Sirve para re-armar la grilla
    #    con otra elección de diario cuando un periódico existente lo exige.
    # -----------------------------------------------------------------------
    hay_revisar = False
    semanas_codigos: list = []
    semanas_layout: list = []

    for i_sem, sem in enumerate(grilla.semanas):
        fila = []
        fila_layout = []
        for d, celda in enumerate(sem):
            if celda.es_franco:
                fila.append(CODIGO_FRANCO)
                fila_layout.append(('lit', CODIGO_FRANCO))
            elif celda.a_ordenes or celda.sin_definir:
                fila.append(CODIGO_REVISAR)
                fila_layout.append(('lit', CODIGO_REVISAR))
                hay_revisar = True
                tipo_aviso = 'sin definir' if celda.sin_definir else '"a órdenes"'
                notas.append(f'Sem{i_sem + 1}/{DIAS_ORDEN[d]}: {tipo_aviso} → REVISAR MANUAL')
            elif celda.horario:
                info = diarios_por_horario.get(celda.horario, {})
                accion = info.get('accion')
                if accion == 'existe':
                    fila.append(info['codigo'])
                    fila_layout.append(('h', celda.horario))
                elif accion == 'crear':
                    fila.append(info.get('codigo_propuesto') or CODIGO_REVISAR)
                    fila_layout.append(('h', celda.horario))
                else:
                    fila.append(CODIGO_REVISAR)
                    fila_layout.append(('lit', CODIGO_REVISAR))
                    hay_revisar = True
            else:
                fila.append(CODIGO_REVISAR)
                fila_layout.append(('lit', CODIGO_REVISAR))
                hay_revisar = True
        semanas_codigos.append(fila)
        semanas_layout.append(fila_layout)

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
        rp, shift, eleccion = _buscar_periodico_flexible(
            motor, agrupador, semanas_layout, opciones_por_horario, grilla.n_semanas)

        # Si el periódico existe gracias a un diario duplicado resuelto por un código
        # distinto al primario, la grilla y el diario elegido se alinean a ese código
        # (es el que usa el periódico real) y se deja una nota. Sin duplicados no pasa.
        if rp.existe:
            for h, cod in eleccion.items():
                info = diarios_por_horario.get(h, {})
                if info.get('accion') == 'existe' and cod and info.get('codigo') != cod:
                    anterior = info.get('codigo')
                    info['codigo'] = cod
                    semanas_codigos = [
                        [cod if celda == anterior else celda for celda in fila]
                        for fila in semanas_codigos
                    ]
                    notas.append(
                        f'Diario {h}: hay duplicados ({", ".join(o for o in opciones_por_horario[h])}); '
                        f'se usa {cod} porque es el que figura en el periódico existente '
                        f'{rp.codigos[0][0]} (no {anterior}).'
                    )

            resultado_periodico = {
                'accion': 'existe',
                'codigo': rp.codigos[0][0],
                'todos': [c[0] for c in rp.codigos],
                'duplicado': rp.duplicado,
                'notas': rp.notas,
            }
            if shift:
                notas.append(
                    f'Periódico {rp.codigos[0][0]}: SAP lo tiene guardado arrancando por '
                    f'otra semana del ciclo (rotado {shift}). Es el MISMO periódico; la '
                    f'fase la fija la fecha de referencia de cada variante.'
                )
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
        # Desglose de horas de la grilla (por horario, por semana, total del
        # ciclo). Informativo: mostrar SIEMPRE el valor exacto. La comparación
        # contra lo declarado la agrega resolver_lote_rotativo (que tiene el
        # dato del pedido); acá solo se calcula.
        'horas': calcular_horas_grilla(grilla),
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


def _coincide(declarado, calculado):
    """True/False si declarado coincide con calculado (tolerancia 0.001).
    None si falta el valor declarado o no es numérico (no se puede validar)."""
    if declarado is None or calculado is None:
        return None
    try:
        return abs(float(declarado) - float(calculado)) < 0.001
    except (TypeError, ValueError):
        return None


def _validar_horas_rotativo(declaradas_por_sem, semanas_map, horas_grilla):
    """Compara las horas calculadas de la grilla contra lo declarado en el pedido.

    declaradas_por_sem : {num_sem: {'diaria': x|None, 'semanal': x|None}}
    semanas_map        : {num_sem: horario_canon}  (horario declarado de esa SEM)
    horas_grilla       : bloque de calcular_horas_grilla (por_semana, etc.)

    OBSERVA y REPORTA, no decide: marca coincide True/False/None y deja cada
    diferencia como nota para que la usuaria la mire. Devuelve (validaciones, notas).
    """
    from generador_grillas import horas_de_horario
    notas = []

    # --- Diaria: por cada SEM, duración del horario vs. horas diarias declaradas
    diaria = []
    for num in sorted(semanas_map):
        horario = semanas_map[num]
        calc = horas_de_horario(horario)
        decl = (declaradas_por_sem.get(num) or {}).get('diaria')
        coincide = _coincide(decl, calc)
        diaria.append({'sem': num, 'horario': horario,
                       'declarado': decl, 'calculado': calc, 'coincide': coincide})
        if coincide is False:
            notas.append(
                f'Horas diarias SEM {num}: el horario {horario} da {calc} h, '
                f'pero el pedido declara {decl} h. Revisar.'
            )

    # --- Semanal: horas trabajadas de cada semana de la grilla vs. lo declarado.
    # El declarado es por variante; en un rotativo prolijo todas declaran lo mismo.
    declaradas_sem = {d['semanal'] for d in declaradas_por_sem.values()
                      if d.get('semanal') is not None}
    ref_sem = None
    if len(declaradas_sem) == 1:
        ref_sem = next(iter(declaradas_sem))
    elif len(declaradas_sem) > 1:
        notas.append(
            'Las variantes declaran horas semanales distintas '
            f'({", ".join(str(x) for x in sorted(declaradas_sem))}); '
            'no se puede validar contra un único valor. Revisar.'
        )

    semanal = []
    for s in horas_grilla['por_semana']:
        coincide = _coincide(ref_sem, s['horas']) if ref_sem is not None else None
        semanal.append({'semana': s['semana'], 'dias_trabajados': s['dias_trabajados'],
                        'declarado': ref_sem, 'calculado': s['horas'], 'coincide': coincide})
        if coincide is False:
            notas.append(
                f'Horas semanales Sem{s["semana"]}: la grilla suma {s["horas"]} h '
                f'({s["dias_trabajados"]} días), el pedido declara {ref_sem} h. Revisar.'
            )

    if horas_grilla.get('semanas_desiguales'):
        detalle = ', '.join(f'Sem{s["semana"]}={s["horas"]}h'
                            for s in horas_grilla['por_semana'])
        notas.append(
            f'Las semanas del ciclo no cargan lo mismo ({detalle}). Suele pasar '
            'cuando la rotación mezcla horarios de distinta duración; revisar a mano.'
        )

    validaciones = {
        'diaria': diaria,
        'semanal': semanal,
        'ciclo_total': horas_grilla.get('ciclo_total'),
        'promedio_semanal': horas_grilla.get('promedio_semanal'),
        'semanas_desiguales': horas_grilla.get('semanas_desiguales', False),
        # ok = ninguna comparación con dato declarado dio distinto (las que no
        # se pudieron validar por falta de dato no cuentan como error).
        'ok': all(x['coincide'] is not False for x in diaria + semanal),
    }
    return validaciones, notas


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
        declaradas: dict = {}       # num_sem -> {'diaria':x|None, 'semanal':x|None}
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
                declaradas[num] = {
                    'diaria': p.get('horas_diarias_decl'),
                    'semanal': p.get('horas_sem_decl'),
                }
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

        # Chequeo formal de horas: calculado (grilla) vs. declarado (pedido).
        # Informa/avisa, no bloquea (ok del turno sigue atado a hay_revisar).
        val_horas, notas_horas = _validar_horas_rotativo(declaradas, semanas, r['horas'])
        r['validaciones_horas'] = val_horas
        r['notas'].extend(notas_horas)

        # Encadenar el correlativo de turno para el próximo grupo/lote
        if motor is not None and agrupador is not None:
            motor._registrar_reserva(reservas, 'turno', agrupador, base)

        resultados.append(r)

    return resultados
