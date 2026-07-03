import { useRef, useState } from 'react';
import { analizar, cargarPedido, listarSolapas } from '../api';
import type { AnyResultado, PedidoCargado, PedidoIn, TablasState } from '../types';
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

const FLEX_PREFIXES = new Set(['LSFL', 'LSMF', 'LRFL', 'REGF', 'LMFL', 'LBSF']);

function esFlexPorPrefijo(codigo: string | null): boolean {
  if (!codigo) return false;
  const m = codigo.trim().match(/^([A-Za-z]+)/i);
  return m ? FLEX_PREFIXES.has(m[1].toUpperCase()) : false;
}

interface FormRow {
  id: string;
  codigo: string;
  descripcion: string;
  detalle_horario: string;
  franco: string;   // día franco (para turnos rotativos; viene de la columna FRANCO)
  agrupador: string; // '' = sin asignar (prefijo ambiguo o sin código)
  horas_diarias_decl: string;
  horas_sem_decl: string;
  horas_men_decl: number | null; // solo se completa desde import Excel
  es_flex: boolean;
}

const makeRow = (): FormRow => ({
  id: Math.random().toString(36).slice(2),
  codigo: '',
  descripcion: '',
  detalle_horario: '',
  franco: '',
  agrupador: '20',
  horas_diarias_decl: '',
  horas_sem_decl: '',
  horas_men_decl: null,
  es_flex: false,
});

function fromImportado(p: PedidoCargado): FormRow {
  return {
    id: Math.random().toString(36).slice(2),
    codigo: p.codigo ?? '',
    descripcion: p.descripcion ?? '',
    detalle_horario: p.detalle_horario ?? '',
    franco: p.franco ?? '',
    agrupador: p.agrupador != null ? String(p.agrupador) : '',
    horas_diarias_decl: p.horas_diarias_decl != null ? String(p.horas_diarias_decl) : '',
    horas_sem_decl: p.horas_sem_decl != null ? String(p.horas_sem_decl) : '',
    horas_men_decl: p.horas_men_decl ?? null,
    es_flex: esFlexPorPrefijo(p.codigo),
  };
}

interface Props {
  tablasState: TablasState | null;
  staleHours: number;
  onResultados: (r: AnyResultado[]) => void;
  onError: (msg: string) => void;
  onGoToTablas: () => void;
}

export default function PedidoForm({ tablasState, staleHours, onResultados, onError, onGoToTablas }: Props) {
  const [rows, setRows] = useState<FormRow[]>([makeRow()]);
  const [loading, setLoading] = useState(false);
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [pendingPedidos, setPendingPedidos] = useState<PedidoIn[] | null>(null);

  // Import RRHH
  const [importLoading, setImportLoading] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importSummary, setImportSummary] = useState<{ total: number; sinAgrupador: number } | null>(null);
  // Selección de solapa
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [solapas, setSolapas] = useState<string[]>([]);
  const [solapaSeleccionada, setSolapaSeleccionada] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const tablasOk = tablasState !== null;
  const hasSinAgrupador = rows.some(r => r.agrupador === '');
  const eligiendoSolapa = !importLoading && pendingFile !== null && solapas.length > 1;

  const update = (id: string, field: keyof FormRow, value: string | boolean) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const removeRow = (id: string) =>
    setRows(prev => prev.filter(r => r.id !== id));

  const handleCargarSolapa = async (file: File, solapa: string) => {
    setImportLoading(true);
    try {
      const result = await cargarPedido(file, solapa);
      const newRows = result.pedidos.map(fromImportado);
      setRows(newRows.length > 0 ? newRows : [makeRow()]);
      const sinAgrupador = newRows.filter(r => r.agrupador === '').length;
      setImportSummary({ total: result.n_pedidos, sinAgrupador });
      setPendingFile(null);
      setSolapas([]);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportLoading(false);
    }
  };

  const handleFileSelected = async (file: File) => {
    setImportLoading(true);
    setImportSummary(null);
    setPendingFile(null);
    setSolapas([]);
    try {
      const result = await listarSolapas(file);
      if (result.solapas.length === 1) {
        await handleCargarSolapa(file, result.solapas[0]);
      } else {
        setPendingFile(file);
        setSolapas(result.solapas);
        setSolapaSeleccionada(result.solapas[0]);
        setImportLoading(false);
      }
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
      setImportLoading(false);
    }
  };

  const handleCancelarSolapa = () => {
    setPendingFile(null);
    setSolapas([]);
    setSolapaSeleccionada('');
  };

  const buildPedidos = (): PedidoIn[] | null => {
    if (hasSinAgrupador) {
      const n = rows.filter(r => r.agrupador === '').length;
      onError(`Seleccioná el agrupador en ${n} fila(s) resaltada(s) antes de analizar.`);
      return null;
    }
    const pedidos: PedidoIn[] = rows.map(r => ({
      codigo: r.codigo.trim(),
      descripcion: r.descripcion.trim(),
      detalle_horario: r.detalle_horario.trim(),
      agrupador: parseInt(r.agrupador, 10),
      horas_diarias_decl: r.horas_diarias_decl ? parseFloat(r.horas_diarias_decl) : null,
      horas_sem_decl: r.horas_sem_decl ? parseFloat(r.horas_sem_decl) : null,
      horas_men_decl: r.horas_men_decl,
      es_flex: r.es_flex,
      franco: r.franco.trim() || null,
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
      {/* Panel de importación del Excel de RRHH */}
      <div className="sap-panel" style={{ marginBottom: 8 }}>
        <div className="sap-panel-title">Importar pedido de RRHH (Excel)</div>
        <div style={{ padding: '8px 8px 10px' }}>
          <div
            className={[
              'sap-drop-zone',
              (importSummary && !importLoading) ? 'loaded' : '',
              importDragOver ? 'drag-over' : '',
              eligiendoSolapa ? 'loaded' : '',
            ].join(' ')}
            style={{
              maxWidth: 520,
              minHeight: 64,
              cursor: eligiendoSolapa ? 'default' : 'pointer',
            }}
            onClick={() => { if (!eligiendoSolapa) importRef.current?.click(); }}
            onDragOver={(e) => { if (!eligiendoSolapa) { e.preventDefault(); setImportDragOver(true); } }}
            onDragLeave={() => setImportDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setImportDragOver(false);
              if (!eligiendoSolapa) {
                const f = e.dataTransfer.files[0];
                if (f) handleFileSelected(f);
              }
            }}
          >
            {importLoading ? (
              <>
                <span style={{ fontSize: 18 }}>&#8635;</span>
                <span>{pendingFile ? 'Cargando pedido...' : 'Leyendo archivo...'}</span>
              </>
            ) : eligiendoSolapa ? (
              <>
                <span style={{ fontSize: 14 }}>&#128193; {pendingFile!.name}</span>
                <span style={{ fontSize: 11, color: '#555' }}>
                  El archivo tiene {solapas.length} solapas
                </span>
              </>
            ) : importSummary ? (
              <>
                <span style={{ fontSize: 18 }}>&#10003;</span>
                <span style={{ fontWeight: 'bold', color: '#006600' }}>
                  {importSummary.total} pedido(s) importado(s) — grilla precargada
                </span>
                {importSummary.sinAgrupador > 0 && (
                  <span style={{ fontSize: 11, color: '#9E5000' }}>
                    &#9888; {importSummary.sinAgrupador} fila(s) sin agrupador — seleccionarlo antes de analizar
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                  [cargar otro Excel]
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>&#128193;</span>
                <span>Click o arrastrar el Excel de pedido de RRHH</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  Precarga la grilla automáticamente con los pedidos del archivo
                </span>
              </>
            )}
          </div>

          {/* Selector de solapa — aparece solo cuando hay más de una */}
          {eligiendoSolapa && (
            <div style={{
              maxWidth: 520,
              marginTop: 6,
              padding: '7px 8px',
              background: '#E8E5DC',
              border: '1px solid #A0A0A0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Elegí la solapa a leer:</span>
              <select
                className="sap-select"
                style={{ flex: 1, minWidth: 120 }}
                value={solapaSeleccionada}
                onChange={e => setSolapaSeleccionada(e.target.value)}
              >
                {solapas.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                className="sap-btn sap-btn-primary"
                onClick={() => handleCargarSolapa(pendingFile!, solapaSeleccionada)}
              >
                Cargar
              </button>
              <button className="sap-btn" onClick={handleCancelarSolapa}>
                Cancelar
              </button>
            </div>
          )}

          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Panel de grilla de pedidos */}
      <div className="sap-panel">
        <div className="sap-panel-title">Pedidos de Turno</div>

        <div style={{ padding: '6px 8px' }}>
          {!tablasOk && (
            <div style={{ color: '#CC0000', marginBottom: 8, fontSize: 12 }}>
              &#9888; Primero cargá las tablas SAP (pestaña anterior).
            </div>
          )}
          {hasSinAgrupador && (
            <div style={{
              color: '#9E5000',
              background: '#FFF3CD',
              border: '1px solid #FFEAA0',
              padding: '4px 8px',
              marginBottom: 8,
              fontSize: 12,
            }}>
              &#9888; Las filas resaltadas tienen prefijo ambiguo (SC) o sin código.
              Seleccioná el agrupador manualmente antes de analizar.
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="alv-table" style={{ minWidth: 1010 }}>
              <thead>
                <tr>
                  <th style={{ width: 28, textAlign: 'center' }}>#</th>
                  <th style={{ width: 90 }}>Código <span style={{ color: '#CC0000' }}>*</span></th>
                  <th style={{ width: 160 }}>Descripción</th>
                  <th style={{ width: 240 }}>
                    Detalle Horario <span style={{ color: '#CC0000' }}>*</span>
                  </th>
                  <th style={{ width: 90 }}>Franco</th>
                  <th style={{ width: 155 }}>Agrupador <span style={{ color: '#CC0000' }}>*</span></th>
                  <th style={{ width: 75 }}>H. Diarias</th>
                  <th style={{ width: 75 }}>H. Semanales</th>
                  <th style={{ width: 42, textAlign: 'center' }}>FLEX</th>
                  <th style={{ width: 26 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const needsAgrupador = row.agrupador === '';
                  return (
                    <tr
                      key={row.id}
                      style={needsAgrupador ? {
                        background: '#FFF3CD',
                        boxShadow: 'inset 3px 0 0 #E09000',
                      } : undefined}
                    >
                      <td style={{ textAlign: 'center', color: needsAgrupador ? '#9E5000' : '#888', fontWeight: needsAgrupador ? 'bold' : undefined }}>
                        {needsAgrupador ? '!' : idx + 1}
                      </td>
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
                        <input
                          className="sap-input"
                          style={{ width: '100%' }}
                          value={row.franco}
                          onChange={e => update(row.id, 'franco', e.target.value)}
                          placeholder="ej. Lunes"
                          title="Día franco (rotativos)"
                        />
                      </td>
                      <td>
                        <select
                          className="sap-select"
                          style={{
                            width: '100%',
                            ...(needsAgrupador ? { outline: '1px solid #E09000' } : {}),
                          }}
                          value={row.agrupador}
                          onChange={e => update(row.id, 'agrupador', e.target.value)}
                        >
                          {needsAgrupador && (
                            <option value="">— elegir línea —</option>
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="sap-btn" onClick={() => setRows(prev => [...prev, makeRow()])}>
              + Agregar fila
            </button>
            <button
              className="sap-btn sap-btn-primary"
              onClick={handleAnalizar}
              disabled={loading || !tablasOk || hasSinAgrupador}
              title={hasSinAgrupador ? 'Completá el agrupador en las filas resaltadas' : undefined}
            >
              {loading ? 'Analizando...' : '&#9654; Analizar todos'}
            </button>
            {hasSinAgrupador && (
              <span style={{ fontSize: 11, color: '#9E5000' }}>
                &#9888; Completá el agrupador en las filas resaltadas para continuar
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dialog: tablas desactualizadas */}
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
