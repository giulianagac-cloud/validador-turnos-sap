import { useEffect, useMemo, useState } from 'react';
import { getTabla, type TablaData } from '../api';
import type { TablasState } from '../types';

type Cual = 'diarios' | 'periodicos' | 'turnos';

const SUBTABS: { cual: Cual; label: string }[] = [
  { cual: 'diarios', label: 'Diarios' },
  { cual: 'periodicos', label: 'Periódicos' },
  { cual: 'turnos', label: 'Turnos' },
];

// Tope de filas renderizadas a la vez (el filtrado achica el conjunto; esto
// evita congelar el navegador con tablas muy grandes).
const MAX_FILAS = 1500;

// Texto visible de una celda. Las fechas ISO se muestran en formato SAP
// (dd.mm.yyyy). Se usa el MISMO texto para mostrar, filtrar y ordenar, así el
// filtro coincide con lo que se ve (como en Excel).
function textoCelda(v: string | number | boolean | null): string {
  if (v === null || v === '') return '';
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    return v;
  }
  return String(v);
}

interface Props {
  tablasState: TablasState | null;
  onError: (msg: string) => void;
}

export default function FiltrosTablas({ tablasState, onError }: Props) {
  const [cual, setCual] = useState<Cual>('turnos');
  const [data, setData] = useState<TablaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState<Record<number, string>>({});
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  const loadedAt = tablasState?.loadedAt ?? 0;

  // Trae la tabla activa. Se re-ejecuta al cambiar de sub-tabla o cuando se
  // recargan las tablas SAP (loadedAt cambia) -> siempre muestra lo último.
  useEffect(() => {
    if (!tablasState) { setData(null); return; }
    let cancelado = false;
    setLoading(true);
    setData(null);
    setFiltros({});
    setSort(null);
    getTabla(cual)
      .then(d => { if (!cancelado) setData(d); })
      .catch(e => { if (!cancelado) onError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cual, loadedAt]);

  const filasFiltradas = useMemo(() => {
    if (!data) return [];
    const activos = Object.entries(filtros).filter(([, v]) => v.trim() !== '');
    let out = data.rows;
    if (activos.length) {
      out = out.filter(row =>
        activos.every(([ci, val]) =>
          textoCelda(row[Number(ci)]).toLowerCase().includes(val.trim().toLowerCase()),
        ),
      );
    }
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => {
        const at = textoCelda(a[col]), bt = textoCelda(b[col]);
        const an = typeof a[col] === 'number' ? (a[col] as number) : parseFloat(at);
        const bn = typeof b[col] === 'number' ? (b[col] as number) : parseFloat(bt);
        if (!Number.isNaN(an) && !Number.isNaN(bn) && at !== '' && bt !== '') {
          return (an - bn) * dir;
        }
        return at.localeCompare(bt, 'es') * dir;
      });
    }
    return out;
  }, [data, filtros, sort]);

  const hayFiltros = Object.values(filtros).some(v => v.trim() !== '');
  const clickHeader = (col: number) =>
    setSort(prev => prev && prev.col === col
      ? (prev.dir === 1 ? { col, dir: -1 } : null)
      : { col, dir: 1 });

  if (!tablasState) {
    return (
      <div className="sap-panel">
        <div className="sap-panel-title">Filtros de tablas SAP</div>
        <div style={{ padding: 12, color: '#CC0000', fontSize: 12 }}>
          &#9888; Primero cargá las tablas SAP (pestaña "1. Carga de Tablas").
        </div>
      </div>
    );
  }

  const visibles = filasFiltradas.slice(0, MAX_FILAS);
  const truncado = filasFiltradas.length > MAX_FILAS;

  return (
    <div className="sap-panel">
      <div className="sap-panel-title">Filtros de tablas SAP</div>
      <div style={{ padding: '8px 8px 10px' }}>

        {/* Sub-solapas: Diarios / Periódicos / Turnos */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {SUBTABS.map(t => (
            <button
              key={t.cual}
              className={`sap-btn${cual === t.cual ? ' sap-btn-primary' : ''}`}
              onClick={() => setCual(t.cual)}
            >
              {t.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {data && (
              <span style={{ fontSize: 11, color: '#444' }}>
                {hayFiltros
                  ? <><b>{filasFiltradas.length}</b> de {data.n} filas</>
                  : <><b>{data.n}</b> filas</>}
              </span>
            )}
            <button
              className="sap-btn"
              onClick={() => { setFiltros({}); setSort(null); }}
              disabled={!hayFiltros && !sort}
              title="Quitar todos los filtros y el orden"
            >
              Limpiar filtros
            </button>
          </span>
        </div>

        {loading && (
          <div style={{ padding: 16, fontSize: 12, color: '#555' }}>
            &#8635; Cargando tabla...
          </div>
        )}

        {!loading && data && (
          <>
            <div style={{ overflow: 'auto', maxHeight: '62vh', border: '1px solid #A0A0A0' }}>
              <table className="alv-table" style={{ fontSize: 12, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  {/* Fila 1: nombres de columna (clic = ordenar) */}
                  <tr>
                    {data.columns.map((col, ci) => (
                      <th
                        key={ci}
                        onClick={() => clickHeader(ci)}
                        style={{
                          position: 'sticky', top: 0, zIndex: 2,
                          background: '#BDB9B3', cursor: 'pointer',
                          whiteSpace: 'nowrap', padding: '3px 8px',
                          borderBottom: '1px solid #888',
                        }}
                        title="Clic para ordenar"
                      >
                        {col}
                        {sort && sort.col === ci ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                  {/* Fila 2: filtro por columna (contiene, como Excel) */}
                  <tr>
                    {data.columns.map((_, ci) => (
                      <th
                        key={ci}
                        style={{
                          position: 'sticky', top: 24, zIndex: 2,
                          background: '#E8E5DC', padding: '2px 3px',
                          borderBottom: '1px solid #A0A0A0',
                        }}
                      >
                        <input
                          className="sap-input"
                          style={{ width: '100%', minWidth: 70, fontWeight: 'normal' }}
                          value={filtros[ci] ?? ''}
                          onChange={e => setFiltros(prev => ({ ...prev, [ci]: e.target.value }))}
                          placeholder="filtrar…"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            whiteSpace: 'nowrap', padding: '2px 8px',
                            borderBottom: '1px solid #E0DED8',
                          }}
                        >
                          {textoCelda(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={data.columns.length} style={{ padding: 12, color: '#888', textAlign: 'center' }}>
                        No hay filas que coincidan con el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {truncado && (
              <div style={{ fontSize: 11, color: '#9E5000', marginTop: 5 }}>
                &#9888; Mostrando las primeras {MAX_FILAS} de {filasFiltradas.length} filas.
                Afiná los filtros para ver el resto.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
