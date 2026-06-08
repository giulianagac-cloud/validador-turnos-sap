import { useState } from 'react';
import { analizar } from '../api';
import type { PedidoIn, TablasState, ResultadoAnalisis } from '../types';
import { formatElapsed } from '../utils';

const AGRUPADORES = [
  { value: 20, label: '20 — Sarmiento' },
  { value: 22, label: '22 — San Martín' },
  { value: 24, label: '24 — Roca' },
  { value: 26, label: '26 — Regionales' },
  { value: 28, label: '28 — Mitre' },
  { value: 30, label: '30 — Mitre LD' },
  { value: 32, label: '32 — Central' },
  { value: 34, label: '34 — Belgrano Sur' },
];

interface FormRow {
  id: string;
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  agrupador: string;
  horas_diarias_decl: string;
  horas_sem_decl: string;
  es_flex: boolean;
}

const makeRow = (): FormRow => ({
  id: Math.random().toString(36).slice(2),
  codigo: '',
  descripcion: '',
  detalle_horario: '',
  agrupador: '20',
  horas_diarias_decl: '',
  horas_sem_decl: '',
  es_flex: false,
});

interface Props {
  tablasState: TablasState | null;
  staleHours: number;
  onResultados: (r: ResultadoAnalisis[]) => void;
  onError: (msg: string) => void;
  onGoToTablas: () => void;
}

export default function PedidoForm({ tablasState, staleHours, onResultados, onError, onGoToTablas }: Props) {
  const [rows, setRows] = useState<FormRow[]>([makeRow()]);
  const [loading, setLoading] = useState(false);
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [pendingPedidos, setPendingPedidos] = useState<PedidoIn[] | null>(null);

  const tablasOk = tablasState !== null;

  const update = (id: string, field: keyof FormRow, value: string | boolean) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const removeRow = (id: string) =>
    setRows(prev => prev.filter(r => r.id !== id));

  const buildPedidos = (): PedidoIn[] | null => {
    const pedidos: PedidoIn[] = rows.map(r => ({
      codigo: r.codigo.trim(),
      descripcion: r.descripcion.trim(),
      detalle_horario: r.detalle_horario.trim(),
      agrupador: parseInt(r.agrupador, 10),
      horas_diarias_decl: r.horas_diarias_decl ? parseFloat(r.horas_diarias_decl) : null,
      horas_sem_decl: r.horas_sem_decl ? parseFloat(r.horas_sem_decl) : null,
      es_flex: r.es_flex,
    }));
    const invalid = pedidos.filter(p => !p.codigo || !p.detalle_horario);
    if (invalid.length > 0) {
      onError(`Completá al menos Código y Detalle Horario en cada fila (${invalid.length} fila(s) incompleta(s)).`);
      return null;
    }
    return pedidos;
  };

  const executeAnalisis = async (pedidos: PedidoIn[]) => {
    setLoading(true);
    try {
      const result = await analizar(pedidos);
      onResultados(result.resultados);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAnalizar = async () => {
    const pedidos = buildPedidos();
    if (!pedidos) return;

    // Guard rail: advertir si las tablas tienen más de `staleHours` horas
    if (tablasState && Date.now() - tablasState.loadedAt > staleHours * 3600 * 1000) {
      setPendingPedidos(pedidos);
      setShowStaleWarning(true);
      return;
    }

    await executeAnalisis(pedidos);
  };

  const handleContinueAnyway = async () => {
    setShowStaleWarning(false);
    if (pendingPedidos) {
      await executeAnalisis(pendingPedidos);
      setPendingPedidos(null);
    }
  };

  const handleGoUpdate = () => {
    setShowStaleWarning(false);
    setPendingPedidos(null);
    onGoToTablas();
  };

  const elapsedMs = tablasState ? Date.now() - tablasState.loadedAt : 0;

  return (
    <>
      <div className="sap-panel">
        <div className="sap-panel-title">Pedidos de Turno</div>

        <div style={{ padding: '6px 8px' }}>
          {!tablasOk && (
            <div style={{ color: '#CC0000', marginBottom: 8, fontSize: 12 }}>
              &#9888; Primero cargá las tablas SAP (pestaña anterior).
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="alv-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ width: 28, textAlign: 'center' }}>#</th>
                  <th style={{ width: 90 }}>Código <span style={{ color: '#CC0000' }}>*</span></th>
                  <th style={{ width: 160 }}>Descripción</th>
                  <th style={{ width: 240 }}>
                    Detalle Horario <span style={{ color: '#CC0000' }}>*</span>
                  </th>
                  <th style={{ width: 150 }}>Agrupador</th>
                  <th style={{ width: 75 }}>H. Diarias</th>
                  <th style={{ width: 75 }}>H. Semanales</th>
                  <th style={{ width: 42, textAlign: 'center' }}>FLEX</th>
                  <th style={{ width: 26 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                    <td>
                      <input
                        className="sap-input"
                        style={{ width: '100%' }}
                        value={row.codigo}
                        onChange={e => update(row.id, 'codigo', e.target.value)}
                        placeholder="ej. LS0123"
                      />
                    </td>
                    <td>
                      <input
                        className="sap-input"
                        style={{ width: '100%' }}
                        value={row.descripcion}
                        onChange={e => update(row.id, 'descripcion', e.target.value)}
                        placeholder="descripción"
                      />
                    </td>
                    <td>
                      <input
                        className="sap-input"
                        style={{ width: '100%' }}
                        value={row.detalle_horario}
                        onChange={e => update(row.id, 'detalle_horario', e.target.value)}
                        placeholder="ej. L a V 07:00 a 13:00 FSI"
                      />
                    </td>
                    <td>
                      <select
                        className="sap-select"
                        style={{ width: '100%' }}
                        value={row.agrupador}
                        onChange={e => update(row.id, 'agrupador', e.target.value)}
                      >
                        {AGRUPADORES.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="sap-input"
                        style={{ width: '100%' }}
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.horas_diarias_decl}
                        onChange={e => update(row.id, 'horas_diarias_decl', e.target.value)}
                        placeholder="6.00"
                      />
                    </td>
                    <td>
                      <input
                        className="sap-input"
                        style={{ width: '100%' }}
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.horas_sem_decl}
                        onChange={e => update(row.id, 'horas_sem_decl', e.target.value)}
                        placeholder="30.00"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.es_flex}
                        onChange={e => update(row.id, 'es_flex', e.target.checked)}
                      />
                    </td>
                    <td>
                      {rows.length > 1 && (
                        <button
                          className="sap-btn"
                          style={{ minWidth: 'auto', padding: '1px 5px', color: '#CC0000' }}
                          onClick={() => removeRow(row.id)}
                          title="Eliminar fila"
                        >
                          &#10005;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="sap-btn" onClick={() => setRows(prev => [...prev, makeRow()])}>
              + Agregar fila
            </button>
            <button
              className="sap-btn sap-btn-primary"
              onClick={handleAnalizar}
              disabled={loading || !tablasOk}
            >
              {loading ? 'Analizando...' : '&#9654; Analizar'}
            </button>
          </div>
        </div>
      </div>

      {/* Dialog de advertencia por tablas desactualizadas */}
      {showStaleWarning && tablasState && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="sap-panel" style={{ maxWidth: 520, width: '92%' }}>
            <div className="sap-panel-title" style={{ background: '#9E5000' }}>
              &#9888; Tablas posiblemente desactualizadas
            </div>
            <div style={{ padding: '14px 16px 6px', fontSize: 12, lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 10px 0' }}>
                Estas tablas se cargaron hace{' '}
                <strong>{formatElapsed(elapsedMs)}</strong>.
                Como otras personas pueden haber creado turnos desde entonces,
                conviene actualizarlas para que los correlativos propuestos sean correctos.
              </p>
              <p style={{ margin: 0, color: '#666' }}>
                Si continuás, el sistema podría proponer un código que ya fue usado
                por otra persona.
              </p>
            </div>
            <div style={{ padding: '12px 16px 14px', display: 'flex', gap: 10 }}>
              <button
                className="sap-btn sap-btn-primary"
                onClick={handleGoUpdate}
                style={{ minWidth: 140 }}
              >
                &#8635; Actualizar tablas
              </button>
              <button
                className="sap-btn"
                onClick={handleContinueAnyway}
                disabled={loading}
              >
                Continuar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
