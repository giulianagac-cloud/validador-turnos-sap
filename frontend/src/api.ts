import type {
  AnyResultado, CargarPedidoResponse, EstadoTablas, GenerarTurnoInput, PedidoIn,
  ResultadoGrilla, TablasStatus, WhoAmI,
} from './types';

// Ruta relativa por defecto: funciona servido desde el backend (mismo origen).
// En `npm run dev` (5173) el proxy de Vite redirige /api → localhost:8000.
// Se puede sobrescribir con VITE_API_BASE si hiciera falta.
const BASE = `${import.meta.env.VITE_API_BASE ?? ''}/api`;

export async function cargarTablas(
  diarios: File,
  periodicos: File,
  turnos: File,
): Promise<TablasStatus> {
  const fd = new FormData();
  fd.append('diarios', diarios);
  fd.append('periodicos', periodicos);
  fd.append('turnos', turnos);
  const res = await fetch(`${BASE}/cargar-tablas`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Error al cargar tablas');
  }
  return res.json();
}

export async function analizar(
  pedidos: PedidoIn[],
): Promise<{ resultados: AnyResultado[] }> {
  const res = await fetch(`${BASE}/analizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedidos }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Error al analizar');
  }
  return res.json();
}

export async function generarTurno(req: GenerarTurnoInput): Promise<ResultadoGrilla> {
  const res = await fetch(`${BASE}/generar-turno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Error al generar el turno');
  }
  return res.json();
}

export async function listarSolapas(archivo: File): Promise<{ ok: boolean; solapas: string[] }> {
  const fd = new FormData();
  fd.append('archivo', archivo);
  const res = await fetch(`${BASE}/listar-solapas`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Error al leer el archivo');
  }
  return res.json();
}

export async function login(usuario: string, contrasena: string): Promise<void> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contrasena }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Usuario o contraseña incorrectos.');
  }
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/logout`, { method: 'POST' });
}

export async function whoami(): Promise<WhoAmI> {
  const res = await fetch(`${BASE}/whoami`);
  if (!res.ok) throw new Error('No se pudo consultar el estado de sesión.');
  return res.json();
}

export async function estadoTablas(): Promise<EstadoTablas> {
  const res = await fetch(`${BASE}/estado-tablas`);
  if (!res.ok) throw new Error('Error al consultar estado de tablas');
  return res.json();
}

export async function cargarPedido(archivo: File, solapa?: string): Promise<CargarPedidoResponse> {
  const fd = new FormData();
  fd.append('archivo', archivo);
  if (solapa) fd.append('solapa', solapa);
  const res = await fetch(`${BASE}/cargar-pedido`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Error al cargar el pedido');
  }
  return res.json();
}
