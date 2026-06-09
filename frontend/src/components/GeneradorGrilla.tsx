import { useState } from 'react';
import { generarTurno } from '../api';
import type {
  DiarioResuelto, GenerarTurnoInput, ResultadoGrilla, TablasState,
} from '../types';

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

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const VARIANTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const CODIGO_REVISAR = 'REVISAR_MANUAL';
const CODIGO_FRANCO = 'LIBR';

function cellStyle(codigo: string, diarios: Record<string, DiarioResuelto>): React.CSSProperties {
  const base: React.CSSProperties = { textAlign: 'center', fontSize: 11, padding: '2px 4px' };
  if (codigo === CODIGO_FRANCO) return { ...base, background: '#C8C5BE', color: '#555' };
  if (codigo === CODIGO_REVISAR) return { ...base, background: '#FFF3CD', color: '#9E5000', fontWeight: 'bold' };
  const isCrear = Object.values(diarios).some(
    d => d.accion === 'crear' && d.codigo_propuesto === codigo,
  );
  return isCrear
    ? { ...base, background: '#E8F0FF', color: '#0A246A', fontWeight: 'bold' }
    : base;
}

interface Props {
  tablasState: TablasState | null;
  onError: (msg: string) => void;
}

export default function GeneradorGrilla({ tablasState, onError }: Props) {
  const [tipo, setTipo] = useState<'franco_corrido' | 'multihorario' | 'rotativo'>('franco_corrido');
  const [codigo, setCodigo] = useState('');
  const [agrupador, setAgrupador] = useState('20');
  const [varianteIdx, setVarianteIdx] = useState('0');
  const [esFlex, setEsFlex] = useState(false);

  const [detalleHorario, setDetalleHorario] = useState('');
  const [diasFranco, setDiasFranco] = useState<Set<string>>(new Set());

  const [horariosRot, setHorariosRot] = useState(['', '']);
  const [diaFrancoRot, setDiaFrancoRot] = useState('Lunes');

  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGrilla | null>(null);

  const tablasOk = tablasState !== null;

  const toggleDia = (d: string) =>
    setDiasFranco(prev => { const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s; });

  const handleGenerar = async () => {
    if (!codigo.trim()) { onError('Ingresá el código de turno.'); return; }
    const req: GenerarTurnoInput = {
      tipo,
      agrupador: parseInt(agrupador),
      codigo_turno: codigo.trim(),
      indice_variante: parseInt(varianteIdx),
      es_flex: esFlex,
      ...(tipo !== 'rotativo' ? {
        detalle_horario: detalleHorario.trim(),
        dias_franco: Array.from(diasFranco),
      } : {
        horarios_semana: horariosRot.filter(h => h.trim()),
        dia_franco: diaFrancoRot,
      }),
    };
    setLoading(true);
    try {
      const r = await generarTurno(req);
      setResultado(r);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const label = (txt: string) => (
    <div style={{ fontSize: 11, marginBottom: 2, color: '#333' }}>{txt}</div>
  );

  return (
    <>
      <div className="sap-panel">
        <div className="sap-panel-title">Generador de Turno con Grilla</div>
        <div style={{ padding: '8px' }}>

          {/* Fila principal */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
            <div>
              {label('Tipo de turno')}
              <select
                className="sap-select"
                style={{ width: 230 }}
                value={tipo}
                onChange={e => { setTipo(e.target.value as typeof tipo); setResultado(null); }}
              >
                <option value="franco_corrido">Franco corrido (1 horario fijo)</option>
                <option value="multihorario">Multi-horario (distintos por día)</option>
                <option value="rotativo">Rotativo (ciclo N semanas)</option>
              </select>
            </div>
            <div>
              {label('Código de turno *')}
              <input
                className="sap-input"
                style={{ width: 90 }}
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="ej. LD573"
              />
            </div>
            <div>
              {label('Agrupador')}
              <select
                className="sap-select"
                style={{ width: 155 }}
                value={agrupador}
                onChange={e => setAgrupador(e.target.value)}
              >
                {AGRUPADORES.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              {label('Variante (fecha ref.)')}
              <select
                className="sap-select"
                style={{ width: 65 }}
                value={varianteIdx}
                onChange={e => setVarianteIdx(e.target.value)}
              >
                {VARIANTES.map((v, i) => (
                  <option key={i} value={i}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ paddingBottom: 2 }}>
              <label style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={esFlex}
                  onChange={e => setEsFlex(e.target.checked)}
                  style={{ marginRight: 4 }}
                />
                FLEX
              </label>
            </div>
          </div>

          {/* Campos: franco corrido + multihorario */}
          {(tipo === 'franco_corrido' || tipo === 'multihorario') && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 6 }}>
                {label(tipo === 'franco_corrido'
                  ? 'Detalle Horario * (ej. "Domingo a Viernes 00:00 a 08:00")'
                  : 'Detalle Horario * (ej. "LUNES Y JUEVES 6:30 A 15:30, MARTES 8:30 A 17:30, ...")'
                )}
                <input
                  className="sap-input"
                  style={{ width: 500 }}
                  value={detalleHorario}
                  onChange={e => setDetalleHorario(e.target.value)}
                  placeholder={tipo === 'franco_corrido' ? 'Domingo a Viernes 00:00 a 08:00' : 'LUNES Y JUEVES 6:30 A 15:30, ...'}
                />
              </div>
              <div>
                {label('Días de franco')}
                <div style={{ display: 'flex', gap: 10 }}>
                  {DIAS_SEMANA.map(d => (
                    <label key={d} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={diasFranco.has(d)}
                        onChange={() => toggleDia(d)}
                        style={{ marginRight: 3 }}
                      />
                      {d.slice(0, 2)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Campos: rotativo */}
          {tipo === 'rotativo' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 6 }}>
                {label('Día de franco')}
                <select
                  className="sap-select"
                  style={{ width: 120 }}
                  value={diaFrancoRot}
                  onChange={e => setDiaFrancoRot(e.target.value)}
                >
                  {DIAS_SEMANA.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {label('Horarios por semana (formato HH:MM-HH:MM)')}
              {horariosRot.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, width: 55 }}>Sem {i + 1}:</span>
                  <input
                    className="sap-input"
                    style={{ width: 120 }}
                    value={h}
                    placeholder="11:00-19:00"
                    onChange={e => {
                      const arr = [...horariosRot];
                      arr[i] = e.target.value;
                      setHorariosRot(arr);
                    }}
                  />
                  {horariosRot.length > 2 && (
                    <button
                      className="sap-btn"
                      style={{ minWidth: 'auto', padding: '1px 5px', color: '#CC0000' }}
                      onClick={() => setHorariosRot(prev => prev.filter((_, j) => j !== i))}
                    >
                      &#10005;
                    </button>
                  )}
                </div>
              ))}
              <button
                className="sap-btn"
                style={{ marginTop: 4 }}
                onClick={() => setHorariosRot(prev => [...prev, ''])}
              >
                + Agregar semana
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="sap-btn sap-btn-primary"
              onClick={handleGenerar}
              disabled={loading || !tablasOk}
              title={!tablasOk ? 'Primero cargá las tablas SAP' : undefined}
            >
              {loading ? 'Generando...' : '&#9654; Generar y resolver'}
            </button>
            {resultado && !loading && (
              <button className="sap-btn" onClick={() => setResultado(null)}>
                Limpiar resultado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Panel de resultado */}
      {resultado && (
        <ResultadoGrillaPanel resultado={resultado} />
      )}
    </>
  );
}


// ---------------------------------------------------------------------------
// Panel de resultado
// ---------------------------------------------------------------------------
function ResultadoGrillaPanel({ resultado }: { resultado: ResultadoGrilla }) {
  const semFijoStyle: React.CSSProperties = {
    background: '#BDB9B3', fontWeight: 'bold', padding: '2px 6px',
    border: '1px solid #888', fontSize: 12, whiteSpace: 'nowrap',
  };

  const estadoTurnoColor =
    resultado.turno?.estado === 'ok' ? '#006600' :
    resultado.turno?.estado === 'duplicado' ? '#CC0000' :
    resultado.turno?.estado === 'salto' ? '#CC6600' : '#555';

  return (
    <div className="sap-panel">
      <div className="sap-panel-title"
        style={{ background: resultado.ok ? '#1A5C1A' : resultado.hay_revisar ? '#9E5000' : '#0A246A' }}>
        {resultado.ok
          ? `&#10003; Resultado: ${resultado.codigo_turno}`
          : resultado.hay_revisar
            ? `&#9888; ${resultado.codigo_turno} — hay celdas REVISAR MANUAL`
            : `&#9432; ${resultado.codigo_turno} — resultado parcial`}
      </div>

      <div style={{ padding: '8px' }}>

        {/* Fecha de referencia */}
        <div style={{ marginBottom: 8, fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span>
            <strong>Fecha de referencia SAP:</strong>{' '}
            {resultado.fecha_referencia.fecha_referencia} ({resultado.fecha_referencia.dia_semana})
          </span>
          <span>
            <strong>Punto de arranque:</strong> {resultado.fecha_referencia.punto_arranque}
          </span>
          <span>
            <strong>Variante offset:</strong> {resultado.fecha_referencia.offset_dias} días
          </span>
        </div>

        {/* Grilla N × 7 */}
        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
          <table className="alv-table" style={{ minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ ...semFijoStyle, width: 42, textAlign: 'center' }}>N&#186;</th>
                {resultado.dias.map(d => (
                  <th key={d} style={{ ...semFijoStyle, width: 80, textAlign: 'center' }}>
                    {d.slice(0, 2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultado.semanas_codigos.map((sem, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center', fontFamily: 'monospace' }}>
                    {String(i + 1).padStart(3, '0')}
                  </td>
                  {sem.map((cod, j) => (
                    <td key={j} style={cellStyle(cod, resultado.diarios)}>
                      {cod === CODIGO_REVISAR ? '⚠ REVISAR' : cod}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Leyenda */}
        <div style={{ fontSize: 11, marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ background: '#C8C5BE', padding: '1px 6px', border: '1px solid #A0A0A0' }}>
            LIBR = franco
          </span>
          <span style={{ background: '#E8F0FF', color: '#0A246A', padding: '1px 6px', border: '1px solid #A0C0E0', fontWeight: 'bold' }}>
            Azul = diario a crear
          </span>
          <span style={{ background: '#FFF3CD', color: '#9E5000', padding: '1px 6px', border: '1px solid #FFEAA0' }}>
            ⚠ = REVISAR MANUAL
          </span>
        </div>

        {/* Acciones */}
        {(resultado.acciones_diario.length > 0 || resultado.periodico.accion === 'crear' || resultado.turno?.estado) && (
          <div className="result-section" style={{ marginBottom: 8 }}>
            <div className="result-section-title">Acciones SAP</div>
            <table className="alv-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Capa</th>
                  <th>Acción</th>
                  <th>Código</th>
                  <th>Último existente</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {/* Turno */}
                <tr>
                  <td>Turno (regla)</td>
                  <td style={{ color: estadoTurnoColor, fontWeight: 'bold' }}>
                    {resultado.turno?.estado?.toUpperCase() ?? '—'}
                  </td>
                  <td><strong>{resultado.codigo_turno}</strong></td>
                  <td>{resultado.turno?.ultimo_existente ?? '—'}</td>
                  <td style={{ maxWidth: 300 }}>{resultado.turno?.nota}</td>
                </tr>
                {/* Periódico */}
                <tr>
                  <td>Periódico</td>
                  <td style={{ fontWeight: 'bold', color: resultado.periodico.accion === 'crear' ? '#0A246A' : resultado.periodico.accion === 'existe' ? '#006600' : '#9E5000' }}>
                    {resultado.periodico.accion === 'crear' ? 'CREAR'
                      : resultado.periodico.accion === 'existe' ? 'EXISTE'
                      : resultado.periodico.accion === 'pendiente' ? 'PENDIENTE'
                      : '—'}
                  </td>
                  <td>
                    <strong>
                      {resultado.periodico.accion === 'crear'
                        ? resultado.periodico.codigo_propuesto
                        : resultado.periodico.codigo ?? '—'}
                    </strong>
                  </td>
                  <td>{resultado.periodico.detalle?.ultimo_existente ?? '—'}</td>
                  <td style={{ maxWidth: 300 }}>
                    {resultado.periodico.nota ?? resultado.periodico.detalle?.nota}
                  </td>
                </tr>
                {/* Diarios a crear */}
                {resultado.acciones_diario.map((a, i) => (
                  <tr key={i}>
                    <td>Diario</td>
                    <td style={{ fontWeight: 'bold', color: '#0A246A' }}>CREAR</td>
                    <td>
                      <strong>{a.codigo_propuesto}</strong>
                      {a.tolerancia && (
                        <span style={{ color: '#555', fontWeight: 'normal', marginLeft: 4 }}>
                          ({a.tolerancia.inicio_teorico} a {a.tolerancia.final_teorico})
                        </span>
                      )}
                    </td>
                    <td>{a.detalle?.ultimo_existente ?? '—'}</td>
                    <td style={{ maxWidth: 300 }}>
                      {a.horario} — {a.detalle?.nota}
                      {a.tolerancia && (
                        <div style={{ marginTop: 4, paddingLeft: 6, borderLeft: '2px solid #BDB9B3', fontSize: 10, color: '#444', lineHeight: 1.8 }}>
                          <div>
                            <span style={{ color: '#888', marginRight: 3 }}>Tol. entrada:</span>
                            <strong>{a.tolerancia.inicio_tolerancia}</strong>
                            <span style={{ color: '#BBB', margin: '0 3px' }}>→</span>
                            <span style={{ background: '#F5F2EA', border: '1px solid #C8C5BE', padding: '0 2px', fontFamily: 'monospace' }}>
                              [{a.tolerancia.inicio_teorico}]
                            </span>
                            <span style={{ color: '#BBB', margin: '0 3px' }}>→</span>
                            <strong>{a.tolerancia.inicio_tolerancia_fin}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#888', marginRight: 3 }}>Tol. salida: &nbsp;&nbsp;&nbsp;</span>
                            <span style={{ background: '#F5F2EA', border: '1px solid #C8C5BE', padding: '0 2px', fontFamily: 'monospace' }}>
                              [{a.tolerancia.final_teorico}]
                            </span>
                            <span style={{ color: '#BBB', margin: '0 3px' }}>→</span>
                            <strong>{a.tolerancia.fin_tolerancia}</strong>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Diarios existentes (para info) */}
        {Object.entries(resultado.diarios).some(([, d]) => d.accion === 'existe') && (
          <div className="result-section" style={{ marginBottom: 8 }}>
            <div className="result-section-title">Diarios existentes en SAP</div>
            <table className="alv-table" style={{ fontSize: 11 }}>
              <thead>
                <tr><th>Horario</th><th>Código</th><th>Horas</th><th>Nota</th></tr>
              </thead>
              <tbody>
                {Object.entries(resultado.diarios)
                  .filter(([, d]) => d.accion === 'existe')
                  .map(([horario, d]) => (
                    <tr key={horario}>
                      <td>{horario}</td>
                      <td>
                        {d.duplicado
                          ? <span style={{ color: '#CC6600' }}>
                              {d.todos?.map(t => t.codigo).join(', ')} (duplicado)
                            </span>
                          : <strong>{d.codigo}</strong>
                        }
                      </td>
                      <td>{d.todos?.[0]?.horas ?? '—'}</td>
                      <td style={{ fontSize: 10, color: '#666' }}>{d.notas?.join(' | ')}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Notas */}
        {resultado.notas.length > 0 && (
          <div className="result-section">
            <div className="result-section-title">Notas</div>
            {resultado.notas.map((n, i) => (
              <div key={i} style={{ fontSize: 11, padding: '1px 0', color: n.includes('REVISAR') ? '#9E5000' : '#333' }}>
                {n.includes('REVISAR') ? '⚠ ' : '• '}{n}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
