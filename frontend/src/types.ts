export interface PedidoIn {
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  agrupador: number;
  horas_diarias_decl?: number | null;
  horas_sem_decl?: number | null;
  horas_men_decl?: number | null;
  es_flex: boolean;
  franco?: string | null;
  rotativo?: boolean;
}

export interface TablasStatus {
  ok: boolean;
  n_diarios: number;
  n_periodicos: number;
  n_turnos: number;
}

export interface WhoAmI {
  authenticated: boolean;
  auth_enabled: boolean;
}

export interface EstadoTablas {
  cargadas: boolean;
  timestamp_ms: number | null;
  n_diarios: number;
  n_periodicos: number;
  n_turnos: number;
}

export interface TablasState {
  n_diarios: number;
  n_periodicos: number;
  n_turnos: number;
  loadedAt: number; // Date.now() timestamp
}

export interface ValidacionHoras {
  declarado: number | null;
  calculado: number;
  coincide: boolean | null;
}

export interface ResultadoTurno {
  estado: 'ok' | 'duplicado' | 'salto' | 'retroactivo' | 'revisar';
  nota: string;
  esperado?: string;
  ultimo_existente?: string;
  familia?: string;
}

export interface DiarioDetalle {
  codigo: string;
  texto: string;
  horas: number;
}

export interface CorrelativoDetalle {
  propuesto: string | null;
  ultimo_existente?: string;
  total_familia?: number;
  huecos?: string[];
  nota?: string;
}

export interface ResultadoDiario {
  accion: 'existe' | 'crear' | 'elegir_flex';
  codigo?: string;
  todos?: DiarioDetalle[];
  duplicado?: boolean;
  notas?: string[];
  codigo_propuesto?: string;
  familia?: string;
  detalle?: CorrelativoDetalle;
  candidatos?: DiarioDetalle[];   // FLEX: diarios candidatos para que el usuario elija
}

export interface ResultadoPeriodico {
  accion: 'existe' | 'crear' | 'pendiente_flex';
  codigo?: string;
  nota?: string;
  duplicado?: boolean;
  notas?: string[];
  codigo_propuesto?: string;
  familia?: string;
  detalle?: CorrelativoDetalle;
  fecha_referencia?: string;
  punto_arranque?: number;
}

export interface Cuadrito {
  dias: string[];
  celdas: string[];
  codigo_diario_usado: string;
}

export interface Tolerancia {
  inicio_tolerancia: string;
  inicio_teorico: string;
  inicio_tolerancia_fin: string;
  final_teorico: string;
  fin_tolerancia: string;
}

export interface GenerarTurnoInput {
  tipo: 'franco_corrido' | 'multihorario' | 'rotativo';
  agrupador: number;
  codigo_turno: string;
  indice_variante?: number;
  es_flex?: boolean;
  detalle_horario?: string;
  dias_franco?: string[];
  horarios_semana?: string[];
  dia_franco?: string;
}

export interface DiarioResuelto {
  accion: 'existe' | 'crear' | 'sin_motor';
  codigo?: string;
  codigo_propuesto?: string;
  familia?: string;
  duplicado?: boolean;
  todos?: DiarioDetalle[];
  notas?: string[];
  detalle?: CorrelativoDetalle;
  tolerancia?: Tolerancia;
}

export interface AccionDiarioGrilla {
  tipo: 'crear_diario';
  horario: string;
  codigo_propuesto: string;
  detalle: CorrelativoDetalle;
  tolerancia?: Tolerancia;
}

export interface FechaReferencia {
  fecha_referencia: string;
  punto_arranque: number;
  dia_semana: string;
  offset_dias: number;
}

export interface ResultadoGrilla {
  codigo_turno: string;
  agrupador: number;
  n_semanas: number;
  semanas_codigos: string[][];
  dias: string[];
  diarios: Record<string, DiarioResuelto>;
  acciones_diario: AccionDiarioGrilla[];
  periodico: {
    accion: 'existe' | 'crear' | 'pendiente' | 'pendiente_flex' | 'sin_motor';
    codigo?: string;
    codigo_propuesto?: string;
    todos?: string[];
    duplicado?: boolean;
    familia?: string;
    detalle?: CorrelativoDetalle;
    nota?: string;
    notas?: string[];
  };
  turno: ResultadoTurno;
  fecha_referencia: FechaReferencia;
  hay_revisar: boolean;
  notas: string[];
  ok: boolean;
  // Extensiones para renderizar tambien resultados SIMPLES/FLEX/YA-CREADO con este
  // mismo diseño (via adaptador simpleToGrilla o lookup inverso). Ausentes en los
  // rotativos reales.
  flex?: boolean;
  flexCandidatos?: DiarioDetalle[];
  parseError?: boolean;
  ya_existe?: boolean;
}

// Datos crudos del pedido (fila del Excel) que se conservan en el frontend para
// mostrarlos al costado de cada turno en el resultado (descripción, detalle,
// franco, horas, feriados). No viajan al backend; se unen por código.
export interface PedidoDisplay {
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  franco: string;
  horas_diarias_decl: string;
  horas_sem_decl: string;
  feriados: string;
}

export interface PedidoCargado {
  codigo: string | null;
  descripcion: string | null;
  detalle_horario: string;
  horas_diarias_decl: number | null;
  horas_sem_decl: number | null;
  horas_men_decl: number | null;
  feriados: string | null;
  franco: string | null;
  agrupador: number | null;
  rotativo: boolean;
  hoja: string;
}

export interface CargarPedidoResponse {
  ok: boolean;
  n_pedidos: number;
  pedidos: PedidoCargado[];
}

// Resultado de un turno ROTATIVO multisemana (subido del Excel). Reusa la forma
// de ResultadoGrilla y agrega las variantes A/B con su fecha de referencia.
export interface VarianteRotativa {
  codigo: string;
  variante: string;
  fecha_referencia: FechaReferencia;
}

export interface ResultadoRotativo extends ResultadoGrilla {
  tipo: 'rotativo';
  codigo_base: string;
  franco: string | null;
  variantes: VarianteRotativa[];
}

export interface ResultadoAnalisis {
  pedido: {
    codigo: string;
    descripcion: string;
    detalle: string;
    agrupador: number;
    linea: string;
    es_flex: boolean;
  };
  horario: {
    inicio: string | null;
    fin: string | null;
    cruza_medianoche: boolean;
    fsi: boolean | null;
    dias_trabaja: string[];
    dias_franco: string[];
    horas_diarias_calc: number | null;
    horas_sem_calc: number | null;
  };
  validaciones: {
    horas_diarias?: ValidacionHoras;
    horas_sem?: ValidacionHoras;
    horas_men?: ValidacionHoras;
  };
  diario: ResultadoDiario;
  periodico: ResultadoPeriodico;
  turno: ResultadoTurno;
  tolerancia: Tolerancia;
  cuadrito: Cuadrito;
  notas: string[];
  ok: boolean;
  flex?: boolean;   // pedido FLEX sin rango: no autocompletable, hay que elegir el diario
  error?: string;
}

// Resultado de un turno que YA EXISTE, resuelto por lookup inverso desde las
// tablas (turno → periódico real → diarios reales). Reusa la forma de grilla.
export interface ResultadoExistente extends ResultadoGrilla {
  tipo: 'existente';
  ya_existe: true;
  descripcion_real?: string;
  descripcion_pedido?: string;
}

// Un resultado puede ser: análisis simple, turno rotativo, o turno ya existente.
export type AnyResultado = ResultadoAnalisis | ResultadoRotativo | ResultadoExistente;

export function esRotativo(r: AnyResultado): r is ResultadoRotativo {
  return (r as ResultadoRotativo).tipo === 'rotativo';
}

export function esExistente(r: AnyResultado): r is ResultadoExistente {
  return (r as ResultadoExistente).tipo === 'existente';
}
