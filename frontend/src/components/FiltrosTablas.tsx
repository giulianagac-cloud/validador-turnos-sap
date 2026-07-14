import { useEffect, useMemo, useRef, useState } from 'react';
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

// Etiqueta para el valor vacío dentro del desplegable de autofiltro.
const VACIO = '(vacías)';

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

// Comparador numérico-aware (igual criterio que el orden de columnas).
function cmp(a: string, b: string): number {
  const an = parseFloat(a), bn = parseFloat(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && a !== '' && b !== '') return an - bn;
  return a.localeCompare(b, 'es');
}

interface Props {
  tablasState: TablasState | null;
  onError: (msg: string) => void;
}

export default function FiltrosTablas({ tablasState, onError }: Props) {
  const [cual, setCual] = useState<Cual>('turnos');
  const [data, setData] = useState<TablaData | null>(null);
  const [loading, setLoading] = useState(false);
  // Autofiltro por columna: para cada columna con filtro activo, el conjunto de
  // valores (texto visible) que se muestran. Columna ausente = sin filtro.
  const [colFiltros, setColFiltros] = useState<Record<number, Set<string>>>({});
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  // Estado del desplegable abierto (menú de autofiltro).
  const [menu, setMenu] = useState<{ col: number; x: number; y: number } | null>(null);
  const [opciones, setOpciones] = useState<string[]>([]);   // valores distintos de la columna abierta
  const [draft, setDraft] = useState<Set<string>>(new Set()); // selección en edición
  const [buscar, setBuscar] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);

  const loadedAt = tablasState?.loadedAt ?? 0;

  // Trae la tabla activa. Se re-ejecuta al cambiar de sub-tabla o cuando se
  // recargan las tablas SAP (loadedAt cambia) -> siempre muestra lo último.
  useEffect(() => {
    if (!tablasState) { setData(null); return; }
    let cancelado = false;
    setLoading(true);
    setData(null);
    setColFiltros({});
    setSort(null);
    setMenu(null);
    getTabla(cual)
      .then(d => { if (!cancelado) setData(d); })
      .catch(e => { if (!cancelado) onError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cual, loadedAt]);

  // Cerrar el desplegable al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const filasFiltradas = useMemo(() => {
    if (!data) return [];
    const activos = Object.entries(colFiltros);
    let out = data.rows;
    if (activos.length) {
      out = out.filter(row =>
        activos.every(([ci, set]) => set.has(textoCelda(row[Number(ci)]))),
      );
    }
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => cmp(textoCelda(a[col]), textoCelda(b[col])) * dir);
    }
    return out;
  }, [data, colFiltros, sort]);

  const hayFiltros = Object.keys(colFiltros).length > 0;
  const clickHeader = (col: number) =>
    setSort(prev => prev && prev.col === col
      ? (prev.dir === 1 ? { col, dir: -1 } : null)
      : { col, dir: 1 });

  // Abre el desplegable de autofiltro de una columna: calcula los valores
  // distintos y arranca la selección desde el filtro actual (o todo tildado).
  const abrirMenu = (col: number, btn: HTMLElement) => {
    if (!data) return;
    if (menu && menu.col === col) { setMenu(null); return; }
    const set = new Set<string>();
    for (const row of data.rows) set.add(textoCelda(row[col]));
    const arr = [...set].sort(cmp);
    setOpciones(arr);
    setDraft(colFiltros[col] ? new Set(colFiltros[col]) : new Set(arr));
    setBuscar('');
    const rect = btn.getBoundingClientRect();
    setMenu({ col, x: rect.right, y: rect.bottom });
  };

  const opcionesVisibles = useMemo(
    () => {
      const q = buscar.trim().toLowerCase();
      if (!q) return opciones;
      return opciones.filter(o => (o === '' ? VACIO : o).toLowerCase().includes(q));
    },
    [opciones, buscar],
  );

  const todasVisiblesTildadas = opcionesVisibles.length > 0 && opcionesVisibles.every(o => draft.has(o));

  const toggleValor = (o: string) =>
    setDraft(prev => {
      const n = new Set(prev);
      if (n.has(o)) n.delete(o); else n.add(o);
      return n;
    });

  const toggleTodasVisibles = () =>
    setDraft(prev => {
      const n = new Set(prev);
      if (todasVisiblesTildadas) opcionesVisibles.forEach(o => n.delete(o));
      else opcionesVisibles.forEach(o => n.add(o));
      return n;
    });

  const aplicarMenu = () => {
    if (!menu) return;
    const col = menu.col;
    setColFiltros(prev => {
      const next = { ...prev };
      if (draft.size === opciones.length) delete next[col]; // todo seleccionado = sin filtro
      else next[col] = new Set(draft);
      return next;
    });
    setMenu(null);
  };

  const limpiarColumna = (col: number) => {
    setColFiltros(prev => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    setMenu(null);
  };

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
              onClick={() => { setColFiltros({}); setSort(null); setMenu(null); }}
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
                  {/* Encabezado: nombre (clic = ordenar) + flechita de autofiltro */}
                  <tr>
                    {data.columns.map((col, ci) => {
                      const filtrada = !!colFiltros[ci];
                      const abierta = menu?.col === ci;
                      return (
                        <th
                          key={ci}
                          style={{
                            position: 'sticky', top: 0, zIndex: 2,
                            background: filtrada ? '#CBD9EC' : '#BDB9B3',
                            whiteSpace: 'nowrap', padding: '2px 4px 2px 8px',
                            borderBottom: '1px solid #888',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span
                              onClick={() => clickHeader(ci)}
                              style={{ cursor: 'pointer', flex: 1 }}
                              title="Clic para ordenar"
                            >
                              {col}
                              {sort && sort.col === ci ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                            </span>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); abrirMenu(ci, e.currentTarget); }}
                              title={filtrada ? 'Columna filtrada — clic para cambiar' : 'Filtrar esta columna'}
                              style={{
                                cursor: 'pointer', border: '1px solid #7A7A7A',
                                background: abierta ? '#5A7DB0' : (filtrada ? '#7C9BC7' : '#D6D2CB'),
                                color: abierta || filtrada ? '#fff' : '#333',
                                borderRadius: 2, lineHeight: 1, fontSize: 10,
                                padding: '2px 3px', width: 18, height: 18,
                              }}
                            >
                              {filtrada ? '▼' : '▾'}
                            </button>
                          </span>
                        </th>
                      );
                    })}
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

      {/* Desplegable de autofiltro (estilo Excel), posición fija para no recortarse. */}
      {menu && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            left: Math.min(menu.x - 220, window.innerWidth - 236),
            top: menu.y + 2,
            width: 220, zIndex: 100,
            background: '#F0EEE8', border: '1px solid #6A6A6A',
            boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column',
            fontSize: 12,
          }}
        >
          <div style={{ padding: 6, borderBottom: '1px solid #C9C5BD' }}>
            <input
              className="sap-input"
              style={{ width: '100%' }}
              autoFocus
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderBottom: '1px solid #C9C5BD',
              fontWeight: 'bold', cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={todasVisiblesTildadas} onChange={toggleTodasVisibles} />
            (Seleccionar todo)
          </label>
          <div style={{ maxHeight: 240, overflow: 'auto', background: '#fff', border: '1px solid #D6D2CB' }}>
            {opcionesVisibles.length === 0 && (
              <div style={{ padding: 8, color: '#888' }}>Sin coincidencias.</div>
            )}
            {opcionesVisibles.map((o, i) => (
              <label
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 8px', cursor: 'pointer',
                  color: o === '' ? '#888' : '#000',
                }}
              >
                <input type="checkbox" checked={draft.has(o)} onChange={() => toggleValor(o)} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {o === '' ? VACIO : o}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid #C9C5BD' }}>
            <button className="sap-btn sap-btn-primary" style={{ flex: 1 }} onClick={aplicarMenu}>
              Aceptar
            </button>
            <button className="sap-btn" onClick={() => setMenu(null)}>Cancelar</button>
            <button
              className="sap-btn"
              onClick={() => limpiarColumna(menu.col)}
              disabled={!colFiltros[menu.col]}
              title="Quitar el filtro de esta columna"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
