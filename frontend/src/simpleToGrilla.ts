import type { ResultadoAnalisis, ResultadoGrilla, DiarioResuelto } from './types';

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

/**
 * Convierte un análisis SIMPLE (turno de una sola semana) al formato de grilla,
 * para renderizarlo con el mismo <GrillaResultado> que los rotativos (AGRUPADOR
 * arriba → TURNO → PERIÓDICO → DIARIO). Un turno simple es una grilla de 1 semana
 * con un solo diario. Los casos FLEX / error de parseo se marcan con flags para
 * que el renderer los muestre distinto (candidatos a elegir / aviso).
 */
export function simpleToGrilla(r: ResultadoAnalisis): ResultadoGrilla {
  const horarioCanon =
    r.horario.inicio && r.horario.fin ? `${r.horario.inicio}-${r.horario.fin}` : '';

  const diarios: Record<string, DiarioResuelto> = {};
  if (horarioCanon && (r.diario.accion === 'existe' || r.diario.accion === 'crear')) {
    diarios[horarioCanon] = {
      accion: r.diario.accion,
      codigo: r.diario.codigo,
      codigo_propuesto: r.diario.codigo_propuesto,
      todos: r.diario.todos,
      duplicado: r.diario.duplicado,
      notas: r.diario.notas,
      detalle: r.diario.detalle,
      // La tolerancia solo viene cuando el diario se crea; si no, se omite.
      tolerancia: r.tolerancia && r.tolerancia.inicio_teorico ? r.tolerancia : undefined,
    };
  }

  return {
    codigo_turno: r.pedido.codigo,
    agrupador: r.pedido.agrupador,
    n_semanas: 1,
    semanas_codigos: r.cuadrito?.celdas ? [r.cuadrito.celdas] : [],
    dias: r.cuadrito?.dias ?? DIAS,
    diarios,
    acciones_diario: [],
    periodico: {
      accion: r.periodico.accion,
      codigo: r.periodico.codigo,
      codigo_propuesto: r.periodico.codigo_propuesto,
      familia: r.periodico.familia,
      detalle: r.periodico.detalle,
      nota: r.periodico.nota,
    },
    turno: r.turno,
    fecha_referencia: {
      fecha_referencia: r.periodico.fecha_referencia ?? '',
      punto_arranque: r.periodico.punto_arranque ?? 1,
      dia_semana: '',
      offset_dias: 0,
    },
    hay_revisar: false,
    notas: r.notas ?? [],
    ok: r.ok,
    flex: r.flex,
    flexCandidatos: r.diario.candidatos,
    parseError: !r.ok && !r.flex,
  };
}
