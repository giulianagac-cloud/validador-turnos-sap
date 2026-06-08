export interface PedidoIn {
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  agrupador: number;
  horas_diarias_decl?: number | null;
  horas_sem_decl?: number | null;
  es_flex: boolean;
}

export interface TablasStatus {
  ok: boolean;
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
  declarado: number;
  calculado: number;
  coincide: boolean;
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
