import type { ResultadoAnalisis } from '../types';

interface Props {
  resultado: ResultadoAnalisis;
}

const SEMAFORO: Record<string, { cls: string; label: string }> = {
  ok:          { cls: 'semaphore-ok',    label: '● Correlativo OK' },
  duplicado:   { cls: 'semaphore-error', label: '● YA EXISTE' },
  salto:       { cls: 'semaphore-warn',  label: '● SALTO' },
  retroactivo: { cls: 'semaphore-warn',  label: '● RETROACTIVO' },
  revisar:     { cls: 'semaphore-warn',  label: '● REVISAR' },
};

export default function ResultadoCard({ resultado: r }: Props) {
  if (r.error) {
    return (
      <div className="sap-panel" style={{ marginBottom: 10, borderLeft: '4px solid #CC0000' }}>
        <div className="sap-panel-title">{r.pedido?.codigo ?? '—'} — Error</div>
        <div style={{ padding: 8, color: '#CC0000', fontSize: 12 }}>{r.error}</div>
      </div>
    );
  }

  const sem = SEMAFORO[r.turno?.estado] ?? SEMAFORO.revisar;

  const copiarCuadrito = () => {
    if (!r.cuadrito?.celdas) return;
    const header = r.cuadrito.dias.join('\t');
    const fila = r.cuadrito.celdas.join('\t');
    navigator.clipboard.writeText(`${header}\n${fila}`).then(
      () => alert('Cuadrito copiado al portapapeles (formato TSV, pegable en Excel).'),
      () => alert('No se pudo acceder al portapapeles.'),
    );
  };

  return (
    <div className="sap-panel" style={{ marginBottom: 12 }}>
      {/* Header */}
      <div className="sap-panel-title">
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.pedido.codigo}</span>
        {r.pedido.descripcion && (
          <span style={{ fontWeight: 'normal', fontSize: 12 }}>&mdash; {r.pedido.descripcion}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 'normal', color: '#CCD6F6' }}>
          Agrup. {r.pedido.agrupador} &middot; {r.pedido.linea}
          {r.pedido.es_flex && ' · FLEX'}
        </span>
      </div>

      {/* Error de parseo */}
      {!r.ok && (
        <div style={{ background: '#FFF0F0', border: '1px solid #CC0000', padding: 8, margin: 4 }}>
          <span style={{ color: '#CC0000', fontWeight: 'bold' }}>
            &#9888; No se pudo interpretar el detalle horario
          </span>
          {r.notas.map((n, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 4 }}>{n}</div>
          ))}
        </div>
      )}

      {r.ok && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* ---- Columna izquierda ---- */}
          <div>
            {/* Correlativo turno */}
            <div className="result-section">
              <div className="result-section-title">Correlativo de Turno (Regla)</div>
              <div>
                <span className={sem.cls}>{sem.label}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{r.turno.nota}</div>
            </div>

            {/* Horario parseado */}
            <div className="result-section">
              <div className="result-section-title">Horario Parseado</div>
              <table style={{ fontSize: 12, borderCollapse: 'collapse', lineHeight: 1.6 }}>
                <tbody>
                  <tr>
                    <td style={{ color: '#555', paddingRight: 8 }}>Rango:</td>
                    <td>
                      <strong>{r.horario.inicio}</strong> a <strong>{r.horario.fin}</strong>
                      {r.horario.cruza_medianoche && (
                        <span style={{ color: '#CC6600' }}> [cruza medianoche]</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: '#555' }}>Trabaja:</td>
                    <td>{r.horario.dias_trabaja.join(', ')}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#555' }}>Franco:</td>
                    <td>{r.horario.dias_franco.join(', ') || 'ninguno'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#555' }}>Feriados:</td>
                    <td>
                      {r.horario.fsi === true ? 'FSI (trabaja feriados)' :
                       r.horario.fsi === false ? 'FNO (no trabaja feriados)' : '?'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: '#555' }}>Horas calc.:</td>
                    <td>
                      {r.horario.horas_diarias_calc}h/día
                      &nbsp;&times;&nbsp;{r.horario.dias_trabaja.length} días
                      &nbsp;=&nbsp;<strong>{r.horario.horas_sem_calc}h/sem</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Validacion de horas */}
            {(r.validaciones.horas_diarias || r.validaciones.horas_sem) && (
              <div className="result-section">
                <div className="result-section-title">Validación de Horas</div>
                <table className="alv-table" style={{ width: 'auto' }}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th style={{ textAlign: 'right' }}>Declarado</th>
                      <th style={{ textAlign: 'right' }}>Calculado</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.validaciones.horas_diarias && (
                      <tr>
                        <td>Diarias</td>
                        <td style={{ textAlign: 'right' }}>{r.validaciones.horas_diarias.declarado}h</td>
                        <td style={{ textAlign: 'right' }}>{r.validaciones.horas_diarias.calculado}h</td>
                        <td>
                          {r.validaciones.horas_diarias.coincide
                            ? <span className="semaphore-ok">&#10003; OK</span>
                            : <span className="semaphore-error">&#10007; NO COINCIDE</span>}
                        </td>
                      </tr>
                    )}
                    {r.validaciones.horas_sem && (
                      <tr>
                        <td>Semanales</td>
                        <td style={{ textAlign: 'right' }}>{r.validaciones.horas_sem.declarado}h</td>
                        <td style={{ textAlign: 'right' }}>{r.validaciones.horas_sem.calculado}h</td>
                        <td>
                          {r.validaciones.horas_sem.coincide
                            ? <span className="semaphore-ok">&#10003; OK</span>
                            : <span className="semaphore-error">&#10007; NO COINCIDE</span>}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Diario */}
            {r.diario.accion && (
              <div className="result-section">
                <div className="result-section-title">Diario (PHTD)</div>
                {r.diario.accion === 'existe' ? (
                  <div style={{ fontSize: 12 }}>
                    <span className="semaphore-ok">&#10003; Existe:</span>{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{r.diario.codigo}</strong>
                    {r.diario.duplicado && r.diario.todos && (
                      <div style={{ marginTop: 6 }}>
                        <span className="semaphore-warn">
                          &#9888; {r.diario.todos.length} códigos para este horario — elegir uno:
                        </span>
                        <table className="alv-table" style={{ marginTop: 4 }}>
                          <thead>
                            <tr><th>Código</th><th>Texto SAP</th><th>Horas</th></tr>
                          </thead>
                          <tbody>
                            {r.diario.todos.map((d, i) => (
                              <tr key={i}>
                                <td style={{ fontFamily: 'monospace' }}>{d.codigo}</td>
                                <td>{d.texto}</td>
                                <td style={{ textAlign: 'right' }}>{d.horas}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12 }}>
                    <span className="semaphore-warn">&#10133; Crear:</span>{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{r.diario.codigo_propuesto}</strong>{' '}
                    <span style={{ color: '#666' }}>(familia {r.diario.familia})</span>
                    {r.diario.detalle?.nota && (
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {r.diario.detalle.nota}
                      </div>
                    )}
                  </div>
                )}
                {r.diario.notas?.map((n, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#CC6600', marginTop: 2 }}>! {n}</div>
                ))}
              </div>
            )}

            {/* Tolerancia */}
            {r.tolerancia?.inicio_teorico && (
              <div className="result-section">
                <div className="result-section-title">Tolerancia del Diario (para crear)</div>
                <table style={{ fontSize: 12, borderCollapse: 'collapse', lineHeight: 1.7 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#888', paddingRight: 10 }}>Inicio tol. (−29 min):</td>
                      <td><strong>{r.tolerancia.inicio_tolerancia}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#333' }}>Entrada teórica:</td>
                      <td><strong>{r.tolerancia.inicio_teorico}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888' }}>Fin tol. entrada (+5 min):</td>
                      <td><strong>{r.tolerancia.inicio_tolerancia_fin}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#333' }}>Salida teórica:</td>
                      <td><strong>{r.tolerancia.final_teorico}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888' }}>Fin tol. salida (+29 min):</td>
                      <td><strong>{r.tolerancia.fin_tolerancia}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Columna derecha ---- */}
          <div>
            {/* Periodico */}
            {r.periodico.accion && (
              <div className="result-section">
                <div className="result-section-title">Periódico (PHT por períodos)</div>
                {r.periodico.accion === 'existe' ? (
                  <div style={{ fontSize: 12 }}>
                    <span className="semaphore-ok">&#10003; Existe:</span>{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{r.periodico.codigo}</strong>
                  </div>
                ) : (
                  <div style={{ fontSize: 12 }}>
                    <span className="semaphore-warn">&#10133; Crear:</span>{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{r.periodico.codigo_propuesto}</strong>{' '}
                    <span style={{ color: '#666' }}>(familia {r.periodico.familia})</span>
                    {r.periodico.detalle?.nota && (
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {r.periodico.detalle.nota}
                      </div>
                    )}
                  </div>
                )}
                {r.periodico.notas?.map((n, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#CC6600', marginTop: 2 }}>! {n}</div>
                ))}
              </div>
            )}

            {/* Cuadrito */}
            {r.cuadrito?.celdas && (
              <div className="result-section">
                <div className="result-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Cuadrito — Grilla 7 días (para cargar en SAP)</span>
                  <button
                    className="sap-btn"
                    style={{ fontSize: 11, padding: '1px 8px', minWidth: 'auto' }}
                    onClick={copiarCuadrito}
                    title="Copiar al portapapeles en formato TSV (pegable en Excel)"
                  >
                    &#128203; Copiar
                  </button>
                </div>

                <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                  Diario utilizado: <strong style={{ fontFamily: 'monospace' }}>{r.cuadrito.codigo_diario_usado}</strong>
                </div>

                <table className="alv-table">
                  <thead>
                    <tr>
                      {r.cuadrito.dias.map(d => (
                        <th key={d} style={{ textAlign: 'center', minWidth: 52 }}>
                          {d.slice(0, 2)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {r.cuadrito.celdas.map((c, i) => (
                        <td
                          key={i}
                          style={{
                            textAlign: 'center',
                            fontFamily: 'monospace',
                            fontWeight: c !== 'LIBR' ? 'bold' : 'normal',
                            color: c === 'LIBR' ? '#888888' : '#000000',
                            background: c === 'LIBR' ? '#F0EDE8' : '#FFFFFF',
                          }}
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Notas / advertencias */}
            {r.notas.length > 0 && (
              <div className="result-section">
                <div className="result-section-title">Notas / Advertencias</div>
                {r.notas.map((n, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#CC6600', marginBottom: 2 }}>
                    &#9888; {n}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
