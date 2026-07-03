import type { DiarioResuelto, ResultadoGrilla, ResultadoRotativo } from '../types';

const CODIGO_REVISAR = 'REVISAR_MANUAL';
const CODIGO_FRANCO = 'LIBR';

export function cellStyle(
  codigo: string,
  diarios: Record<string, DiarioResuelto>,
): React.CSSProperties {
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

function esRot(r: ResultadoGrilla | ResultadoRotativo): r is ResultadoRotativo {
  return (r as ResultadoRotativo).tipo === 'rotativo';
}

/**
 * Panel de resultado de una grilla (franco corrido / multi-horario / rotativo).
 * Compartido entre el Generador de Grilla (carga manual) y los Resultados del
 * análisis del Excel (turnos rotativos auto-detectados).
 */
export default function GrillaResultado({ resultado }: { resultado: ResultadoGrilla | ResultadoRotativo }) {
  const semFijoStyle: React.CSSProperties = {
    background: '#BDB9B3', fontWeight: 'bold', padding: '2px 6px',
    border: '1px solid #888', fontSize: 12, whiteSpace: 'nowrap',
  };

  const estadoTurnoColor =
    resultado.turno?.estado === 'ok' ? '#006600' :
    resultado.turno?.estado === 'duplicado' ? '#CC0000' :
    resultado.turno?.estado === 'salto' ? '#CC6600' : '#555';

  const rotativo = esRot(resultado);
  const titulo = rotativo
    ? `${resultado.codigo_base} — ROTATIVO (franco ${resultado.franco ?? '?'})`
    : resultado.codigo_turno;

  return (
    <div className="sap-panel">
      <div className="sap-panel-title"
        style={{ background: resultado.ok ? '#1A5C1A' : resultado.hay_revisar ? '#9E5000' : '#0A246A' }}>
        {resultado.ok
          ? `✓ Resultado: ${titulo}`
          : resultado.hay_revisar
            ? `⚠ ${titulo} — hay celdas REVISAR MANUAL`
            : `ℹ ${titulo} — resultado parcial`}
      </div>

      <div style={{ padding: '8px' }}>

        {/* Rotativo: variantes A/B con su fecha de referencia (un código por rotación) */}
        {rotativo ? (
          <div className="result-section" style={{ marginBottom: 8 }}>
            <div className="result-section-title">
              Variantes (un código por rotación — comparten diario y periódico)
            </div>
            <table className="alv-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Variante</th>
                  <th>Código de turno</th>
                  <th>Fecha de referencia SAP</th>
                  <th>Pto. arranque</th>
                </tr>
              </thead>
              <tbody>
                {resultado.variantes.map(v => (
                  <tr key={v.codigo}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{v.variante}</td>
                    <td><strong>{v.codigo}</strong></td>
                    <td>{v.fecha_referencia.fecha_referencia} ({v.fecha_referencia.dia_semana})</td>
                    <td style={{ textAlign: 'center' }}>{v.fecha_referencia.punto_arranque}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
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
        )}

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
                  <td><strong>{rotativo ? resultado.codigo_base : resultado.codigo_turno}</strong></td>
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
