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
    const fila = '001\t' + r.cuadrito.celdas.join('\t');
    navigator.clipboard.writeText(fila).then(
      () => alert('Cuadrito copiado al portapapeles (formato SAP: Nº semana + 7 diarios, pegable directo en SAP).'),
      () => alert('No se pudo acceder al portapapeles.'),
    );
  };

  const copiarDatosSap = () => {
    if (!r.ok) return;
    const lineas = [
      `Regla p.plan h.tbjo.: ${r.pedido.codigo}`,
      `Texto: ${r.pedido.descripcion || ''}`,
      `Agrup.para PHTD: ${r.pedido.agrupador} (${r.pedido.linea})`,
      '',
      'Horario de trabajo:',
      `Hrs.trabajo por día: ${r.horario.horas_diarias_calc}`,
      `H tbjo.p/semana: ${r.horario.horas_sem_calc}`,
      `Hrs.trabajo por mes: ${r.validaciones.horas_men?.calculado ?? ''}`,
      `Días laborales sem.: ${r.horario.dias_trabaja.length}`,
    ];
    if (r.periodico.accion === 'crear') {
      lineas.push(
        '',
        'Generación plan horario trabajo:',
        `PHT por períodos: ${r.periodico.codigo_propuesto}`,
        `Fe.referencia PHTP: ${r.periodico.fecha_referencia ?? ''}`,
        `Pto.arranque en PHTP: ${r.periodico.punto_arranque != null ? String(r.periodico.punto_arranque).padStart(3, '0') : ''}`,
        `Regla tipos de día: ${r.horario.fsi === true ? '02' : r.horario.fsi === false ? '01' : ''}`,
        `Agrup.para PHTD: ${r.pedido.agrupador}`,
      );
    }
    navigator.clipboard.writeText(lineas.join('\n')).then(
      () => alert('Datos para SAP copiados al portapapeles.'),
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
          {/* ---- Columna izquierda: las 3 resoluciones, en orden diario -> periodico -> turno ---- */}
          <div>
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
                    <strong style={{ fontFamily: 'monospace' }}>{r.diario.codigo_propuesto}</strong>
                    {r.tolerancia?.inicio_teorico && (
                      <span style={{ color: '#444' }}>
                        {' '}({r.tolerancia.inicio_teorico} a {r.tolerancia.final_teorico},{' '}
                        {r.horario.horas_diarias_calc}h)
                      </span>
                    )}
                    <span style={{ color: '#666', marginLeft: 4 }}>(familia {r.diario.familia})</span>
                    {r.diario.detalle?.nota && (
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {r.diario.detalle.nota}
                      </div>
                    )}
                    {r.tolerancia?.inicio_teorico && (
                      <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: '3px solid #BDB9B3', fontSize: 11, color: '#333', lineHeight: 1.9 }}>
                        <div>
                          <span style={{ color: '#666', display: 'inline-block', minWidth: 100 }}>Tol. entrada:</span>
                          <strong style={{ fontFamily: 'monospace' }}>{r.tolerancia.inicio_tolerancia}</strong>
                          <span style={{ color: '#AAA', margin: '0 5px' }}>→</span>
                          <span style={{ background: '#F5F2EA', border: '1px solid #C8C5BE', padding: '0 4px', fontFamily: 'monospace' }}>
                            [{r.tolerancia.inicio_teorico}]
                          </span>
                          <span style={{ color: '#AAA', margin: '0 5px' }}>→</span>
                          <strong style={{ fontFamily: 'monospace' }}>{r.tolerancia.inicio_tolerancia_fin}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#666', display: 'inline-block', minWidth: 100 }}>Tol. salida:</span>
                          <span style={{ background: '#F5F2EA', border: '1px solid #C8C5BE', padding: '0 4px', fontFamily: 'monospace' }}>
                            [{r.tolerancia.final_teorico}]
                          </span>
                          <span style={{ color: '#AAA', margin: '0 5px' }}>→</span>
                          <strong style={{ fontFamily: 'monospace' }}>{r.tolerancia.fin_tolerancia}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {r.diario.notas?.map((n, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#CC6600', marginTop: 2 }}>! {n}</div>
                ))}
              </div>
            )}

            {/* Periodico + Cuadrito — juntos en un solo cuadro */}
            <div className="result-section">
              {r.periodico.accion && (
                <>
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
                </>
              )}

              {r.cuadrito?.celdas && (
                <div style={{ marginTop: r.periodico.accion ? 10 : 0, paddingTop: r.periodico.accion ? 8 : 0, borderTop: r.periodico.accion ? '1px solid #C5C2BB' : 'none' }}>
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
                        <th style={{ textAlign: 'center', minWidth: 36 }}>N&#186;</th>
                        {r.cuadrito.dias.map(d => (
                          <th key={d} style={{ textAlign: 'center', minWidth: 52 }}>
                            {d.slice(0, 2)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', color: '#555' }}>001</td>
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
            </div>

            {/* Correlativo de Turno + Horario Parseado — juntos en un solo cuadro */}
            <div className="result-section">
              <div className="result-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Correlativo de Turno (Regla)</span>
                <button
                  className="sap-btn"
                  style={{ fontSize: 11, padding: '1px 8px', minWidth: 'auto' }}
                  onClick={copiarDatosSap}
                  title="Copiar todos los datos para completar en SAP"
                >
                  &#128203; Copiar
                </button>
              </div>
              <div>
                <span className={sem.cls}>{sem.label}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{r.turno.nota}</div>

              <div style={{ fontSize: 12, marginTop: 6, color: '#333' }}>
                <div><strong>{r.pedido.descripcion || r.pedido.codigo}</strong></div>
                <div style={{ color: '#555' }}>Agrupador: {r.pedido.agrupador} &middot; {r.pedido.linea}</div>
              </div>

              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #C5C2BB' }}>
                <div style={{ fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', color: '#444', letterSpacing: 0.3, marginBottom: 4 }}>
                  Horario de Trabajo
                </div>
                <table style={{ fontSize: 12, borderCollapse: 'collapse', lineHeight: 1.6 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#555', paddingRight: 8 }}>Hrs.trabajo por día:</td>
                      <td><strong>{r.horario.horas_diarias_calc}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#555' }}>H tbjo.p/semana:</td>
                      <td><strong>{r.horario.horas_sem_calc}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#555' }}>Hrs.trabajo por mes:</td>
                      <td><strong>{r.validaciones.horas_men?.calculado ?? '—'}</strong></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#555' }}>Días laborales sem.:</td>
                      <td><strong>{r.horario.dias_trabaja.length}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {r.periodico.accion === 'crear' && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #C5C2BB' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', color: '#444', letterSpacing: 0.3, marginBottom: 4 }}>
                    Datos a completar — Generación Plan Horario Trabajo
                  </div>
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', lineHeight: 1.6 }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#555', paddingRight: 8 }}>PHT por períodos:</td>
                        <td><strong style={{ fontFamily: 'monospace' }}>{r.periodico.codigo_propuesto}</strong></td>
                      </tr>
                      <tr>
                        <td style={{ color: '#555' }}>Fe.referencia PHTP:</td>
                        <td><strong style={{ fontFamily: 'monospace' }}>{r.periodico.fecha_referencia ?? '—'}</strong></td>
                      </tr>
                      <tr>
                        <td style={{ color: '#555' }}>Pto.arranque en PHTP:</td>
                        <td>
                          <strong style={{ fontFamily: 'monospace' }}>
                            {r.periodico.punto_arranque != null ? String(r.periodico.punto_arranque).padStart(3, '0') : '—'}
                          </strong>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: '#555' }}>Regla tipos de día:</td>
                        <td>
                          <strong style={{ fontFamily: 'monospace' }}>
                            {r.horario.fsi === true ? '02' : r.horario.fsi === false ? '01' : '—'}
                          </strong>
                          <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>
                            ({r.horario.fsi === true ? 'feriado' : r.horario.fsi === false ? 'no feriado laboral' : '?'})
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: '#555' }}>Agrup.para PHTD:</td>
                        <td><strong style={{ fontFamily: 'monospace' }}>{r.pedido.agrupador}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="result-section-title" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #C5C2BB' }}>
                Horario Parseado
              </div>
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
          </div>

          {/* ---- Columna derecha: contexto (validacion de horas, notas) ---- */}
          <div>
            {/* Validacion de horas */}
            {(r.validaciones.horas_diarias || r.validaciones.horas_sem || r.validaciones.horas_men) && (
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
                    {r.validaciones.horas_men && (
                      <tr>
                        <td>Mensuales</td>
                        <td style={{ textAlign: 'right', color: r.validaciones.horas_men.declarado == null ? '#888' : undefined }}>
                          {r.validaciones.horas_men.declarado != null ? `${r.validaciones.horas_men.declarado}h` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.validaciones.horas_men.calculado}h</td>
                        <td>
                          {r.validaciones.horas_men.coincide == null
                            ? <span style={{ color: '#888', fontSize: 10 }}>referencia</span>
                            : r.validaciones.horas_men.coincide
                              ? <span className="semaphore-ok">&#10003; OK</span>
                              : <span className="semaphore-error">&#10007; NO COINCIDE</span>}
                        </td>
                      </tr>
                    )}
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
