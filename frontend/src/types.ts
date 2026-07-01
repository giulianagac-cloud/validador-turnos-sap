export interface PedidoIn {
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  agrupador: number;
  horas_diarias_decl?: number | null;
  horas_sem_decl?: number | null;
  horas_men_decl?: number | null;
  es_flex: boolean;
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
  accion: 'existe' | 'crear';
  codigo?: string;
  todos?: DiarioDetalle[];
  duplicado?: boolean;
  notas?: string[];
  codigo_propuesto?: string;
  familia?: string;
  detalle?: CorrelativoDetalle;
}

export interface ResultadoPeriodico {
  accion: 'existe' | 'crear';
  codigo?: string;
  duplicado?: boolean;
  notas?: string[];
  codigo_propuesto?: string;
  familia?: string;
  detalle?: CorrelativoDetalle;
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
    accion: 'existe' | 'crear' | 'pendiente' | 'sin_motor';
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
}

export interface PedidoCargado {
  codigo: string | null;
  descripcion: string | null;
  detalle_horario: string;
  horas_diarias_decl: number | null;
  horas_sem_decl: number | null;
  horas_men_decl: number | null;
  feriados: string | null;
  agrupador: number | null;
  hoja: string;
}

export interface CargarPedidoResponse {
  ok: boolean;
  n_pedidos: number;
  pedidos: PedidoCargado[];
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
  error?: string;
}
