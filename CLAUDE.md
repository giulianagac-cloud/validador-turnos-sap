# CLAUDE.md — Validador de Turnos SAP HCM (Trenes Argentinos)

Contexto persistente del proyecto. Leer antes de trabajar.

## Qué es esto

App interna para **automatizar la validación y armado de turnos SAP HCM** en Trenes
Argentinos. Hoy el proceso es manual: RRHH manda un Excel pidiendo un turno, y hay que
cruzarlo a mano contra exports de SAP para ver qué existe, qué hay que crear y con qué
correlativo. Esta app hace ese cruce automáticamente.

**Importante: la app NO se conecta a SAP.** Solo lee Excels exportados manualmente.
Solo OBSERVA y PROPONE. Nunca modifica datos, nunca elige por el usuario, nunca
rellena huecos de numeración.

## Arquitectura

- `turnos_engine.py` (raíz) — **NÚCLEO. NO MODIFICAR sin pedido explícito.** Lógica de
  negocio validada contra datos reales. Toda la inteligencia vive acá.
- `backend/` — FastAPI. Expone el motor vía API. Procesa Excels **en memoria** (io.BytesIO),
  nunca escribe a disco, nunca persiste datos de empleados.
- `frontend/` — React + Vite + TypeScript. Estética **SAP GUI clásico** (NO Fiori):
  gris/azul sobrio, campos sunken, tablas tipo ALV grid, fuente compacta, barra de estado.

## El motor: API principal

```python
MotorTurnos(path_diarios, path_periodicos, path_turnos)  # acepta paths o buffers BytesIO
.analizar_pedido(codigo_pedido, descripcion, detalle_horario, agrupador,
                 horas_diarias_decl=None, horas_sem_decl=None, es_flex=False) -> dict
```

Devuelve dict JSON-serializable: `pedido, horario, validaciones, diario, periodico,
turno, tolerancia, cuadrito, notas, ok`.

## Modelo de datos SAP (4 capas)

1. **Regla de turno** (LS/LR####) — lo que pide RRHH. Vive en `Turnos.XLSX`, col
   `Regla p.plan h.tbjo.`. Apunta a un periódico.
2. **Periódico** (PHT por períodos) — grilla semanal de 7 días × N semanas. Cada celda
   es un código de diario o LIBR (franco). Vive en `Periodicos.XLSX`.
3. **PHTD diario** — el "ladrillo": un horario atómico (ej. S032 = 07:00 a 13:00, 6h).
   Vive en `Diarios.XLSX`.
4. **Agrupadores** — mapean línea ↔ número. 20=Sarmiento, 22=San Martín, 24=Roca,
   26=Regionales, 28=Mitre, 30=Mitre LD, 32=Central, 34=Belgrano Sur.

## Reglas de negocio (validadas — no inventar)

- **Tolerancia de un diario**: −29 min antes de la entrada teórica, +5 después; +29
  después de la salida teórica. Borde: si la entrada es antes de 00:29, la tolerancia
  previa se recorta a 00:00 (no cruza a día anterior).
- **Correlativos**: SIEMPRE el siguiente del último de la familia, dentro del agrupador.
  NUNCA rellenar huecos (solo se informan). La familia se detecta de la tabla, no se
  infiere de la letra. FLEX es familia aparte (ej. R normal vs RF flex; LS vs LSFL).
- **Duplicados preexistentes**: se RESPETAN y se REPORTAN. Nunca fusionar ni borrar.
  Si un horario tiene varios códigos en el agrupador, listarlos todos y dejar elegir.
- **Horas**: mostrar SIEMPRE el valor exacto calculado. NO redondear (la usuaria decide).
  Diaria = duración del rango. Semanal = diaria × días trabajados (sin contar francos).
- **Parser de horario**: tolera forma corta ("L a V") y larga ("LUNES A VIERNES"),
  con/sin "hs", FSI/FNO, y cruce de medianoche ("23:00 a 05:00").
- **Turno ROTATIVO multisemana** (ej. ROCA TPTE 26): tipo de horario donde el
  `DETALLE HORARIO` viene como `"SEM N - HH:MM A HH:MM"` (número de semana del
  ciclo + rango), SIN el día adentro. El **día franco sale de la columna FRANCO**,
  no del texto. Cada día de la semana genera su turno (LR846=Lunes … LR852=Domingo)
  y **cada turno lleva un código por rotación**: `LR846A` entra en SEM 1, `LR846B`
  en SEM 2. A y B son el **mismo turno/periódico** (misma grilla) y solo cambian la
  **fecha de referencia** (punto de arranque del ciclo). La grilla usa el patrón de
  "bisagra" ya en `generador_grillas.py::generar_rotativo` (días después del franco
  usan el horario de esa semana; días antes, el de la semana anterior). Detección:
  DESCRIPCIÓN contiene "ROT" **o** DETALLE matchea `SEM N`. Al subir el Excel, estos
  pedidos se rutean al generador de grillas (`puente_grilla_motor.resolver_lote_rotativo`),
  NO al analizador simple; los correlativos de diario/periódico/turno se encadenan
  con un `reservas` compartido en todo el lote.

## Seguridad (requisito — es para mostrar a dirección)

- Excels procesados en memoria y descartados. Cero persistencia de datos de empleados.
- Sin conexión a SAP. Solo lee exports manuales.
- Pensada para correr local / red interna. No exponer a internet.
- `.gitignore` debe excluir `*.xlsx`/`*.XLSX` para no commitear datos reales.

## Estado / pendientes

- Motor: completo y probado (parser, tolerancia, diario, periódico, correlativos, turno).
- Turnos rotativos multisemana: soportados al subir el Excel (detección + grilla de
  bisagra + correlativos encadenados + variantes A/B con fecha de referencia).
  Verificado contra ROCA TPTE 26.
- Chequeo formal de horas para rotativos multisemana: **hecho**. Calcula el desglose
  exacto de la grilla (por horario, por semana, ciclo total) y lo compara contra lo
  declarado en el pedido. OBSERVA y REPORTA (marca coincide True/False/None + notas),
  no bloquea el turno. Detecta semanas desiguales cuando la bisagra mezcla duraciones.
  Ver `generador_grillas.horas_de_horario`/`calcular_horas_grilla` y
  `puente_grilla_motor._validar_horas_rotativo`.
- Pendiente a futuro: ciclos de 3+ semanas (el diseño lo soporta pero solo se probó
  con 2); afinar matcheo FLEX con más casos.

## Convenciones

- Español rioplatense en UI y comentarios.
- No agregar dependencias pesadas sin necesidad. Stack: FastAPI + pandas + openpyxl
  (backend), React + Vite + TS (frontend).

## Qué modelo usar para este proyecto

Guía rápida de cuándo usar cada modelo con Claude Code en este repo:

- **Sonnet (default)**: usar para el 90% del trabajo — agregar endpoints, ajustar
  reglas de negocio, debuggear, mapear columnas, tareas de tamaño chico/mediano.
  Es el que se usó para construir prácticamente todo el proyecto hasta ahora
  (motor, generador de grillas, backend, frontend, empaquetado).
- **Opus**: reservar para tareas puntualmente grandes o de diseño complejo, donde
  hay muchas piezas interdependientes y un error temprano de diseño sale caro
  (ej. si en el futuro se aborda un refactor grande del motor). Más lento y caro —
  usar solo cuando el problema lo justifique, no por defecto.
- **Haiku**: para tareas simples y mecánicas, poco relevante para el tipo de
  trabajo de este proyecto.

Regla simple: arrancar siempre con Sonnet. Si una tarea puntual es de diseño muy
grande/complejo y Sonnet da vueltas sin converger, probar esa tarea con Opus y
volver a Sonnet después.
