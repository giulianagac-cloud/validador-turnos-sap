import type { PedidoIn, TablasStatus, ResultadoAnalisis } from './types';

const BASE = 'http://localhost:8000/api';

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
): Promise<{ resultados: ResultadoAnalisis[] }> {
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
