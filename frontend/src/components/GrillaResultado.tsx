import { useState } from 'react';
import type {
  DiarioResuelto, FechaReferencia, PedidoDisplay,
  ResultadoGrilla, ResultadoRotativo,
} from '../types';

const CODIGO_REVISAR = 'REVISAR_MANUAL';
const CODIGO_FRANCO = 'LIBR';

const LINEA: Record<number, string> = {
  20: 'Sarmiento', 22: 'San Martín', 24: 'Roca', 26: 'Regionales',
  28: 'Mitre', 30: 'Mitre LD', 32: 'Central', 34: 'Belgrano Sur',
};

function esRot(r: ResultadoGrilla | ResultadoRotativo): r is ResultadoRotativo {
  return (r as ResultadoRotativo).tipo === 'rotativo';
}

// '11:00-19:00' -> '11:00 a 19:00'. Solo parte rangos horarios reales; un texto
// FLEX ('Flex 36 - 6') se muestra tal cual.
function horarioTexto(canon: string): string {
  if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(canon)) return canon;
  const [ini, fin] = canon.split('-', 2);
  return `${ini} a ${fin}`;
}

// Duración exacta de un rango, en horas (tolera cruce de medianoche). Solo para mostrar.
function horasDeRango(canon: string): number | null {
  const [ini, fin] = canon.split('-', 2);
  if (!ini || !fin) return null;
  const [h1, m1] = ini.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  if ([h1, m1, h2, m2].some(n => Number.isNaN(n))) return null;
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// Modelo unificado de 3 estados para las 3 capas SAP (turno / periódico / diario).
// "Ya creado" se ve SIEMPRE igual (verde), nunca como error.
type EstadoVisual = { label: string; color: string; bg: string };

const BADGE = {
  crear:   { label: 'CREAR',     color: '#0A246A', bg: '#E8F0FF' },
  creado:  { label: 'YA CREADO', color: '#0A5C0A', bg: '#E3F1E3' },
  revisar: { label: 'REVISAR',   color: '#9E5000', bg: '#FFF3CD' },
  neutro:  { label: '—',         color: '#555',    bg: 'transparent' },
} as const;

/**
 * Estado del TURNO (regla LR/LBS…). `yaExiste` distingue los dos sentidos de
 * 'duplicado':
 *  - lookup inverso (el código EXACTO ya está en Turnos.XLSX) → YA CREADO (verde).
 *  - analizador simple (el número ya está tomado, p.ej. por variantes -A/-B, pero
 *    el código exacto no existe) → es una COLISIÓN a revisar, NO un "ya creado".
 */
function badgeTurno(estado?: string, yaExiste?: boolean): EstadoVisual {
  if (estado === 'duplicado') return yaExiste ? BADGE.creado : BADGE.crear;
  if (estado === 'ok') return BADGE.crear;
  if (estado === 'salto' || estado === 'retroactivo' || estado === 'revisar') return BADGE.revisar;
  return BADGE.neutro;
}

/** Estado del PERIÓDICO/DIARIO: crear=hay que crearlo, existe=ya está en SAP. */
function badgeAccion(accion?: string): EstadoVisual {
  if (accion === 'crear') return BADGE.crear;
  if (accion === 'existe') return BADGE.creado;
  if (accion === 'pendiente' || accion === 'pendiente_flex') return BADGE.revisar;
  return BADGE.neutro;
}

function Badge({ v, extra }: { v: EstadoVisual; extra?: string }) {
  return (
    <span style={{
      background: v.bg, color: v.color, fontWeight: 'bold',
      padding: '1px 7px', border: `1px solid ${v.color}55`, fontSize: 10,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.color, display: 'inline-block' }} />
      {v.label}{extra ? ` · ${extra}` : ''}
    </span>
  );
}

const mono: React.CSSProperties = { fontFamily: 'Consolas, "Courier New", monospace' };
const stepStyle: React.CSSProperties = {
  fontFamily: 'Consolas, monospace', fontSize: 11,
  background: 'rgba(255,255,255,.18)', padding: '0 5px',
};

/**
 * Resultado de un turno como el Excel: AGRUPADOR arriba, y el turno desmenuzado
 * de arriba hacia abajo en TURNO → PERIÓDICO → DIARIO, marcando en cada capa si
 * ya existe (verde) o si hay que crearlo (azul, propone el siguiente).
 *
 * `pedidos` (opcional): datos crudos del Excel por código, para mostrar al costado
 * de cada turno. Ausente en el Generador de Grilla manual (degrada a "—").
 */
export default function GrillaResultado({
  resultado,
  pedidos,
  esPrimerAviso = false,
}: {
  resultado: ResultadoGrilla | ResultadoRotativo;
  pedidos?: Record<string, PedidoDisplay>;
  // true solo para el PRIMER turno del lote con colisión de correlativo: ese
  // muestra REVISAR + la aclaración (para ir a mirar la solapa Filtros). Los
  // demás muestran directo el turno a crear, sin repetir el cartel.
  esPrimerAviso?: boolean;
}) {
  const rotativo = esRot(resultado);
  const agr = resultado.agrupador;
  const linea = LINEA[agr];
  const franco = rotativo ? resultado.franco : null;

  const tituloTurno = rotativo ? resultado.codigo_base : resultado.codigo_turno;
  // Aviso de correlativo del turno: el código pedido colisiona (número ya
  // tomado) o no encaja como siguiente, y NO es un turno ya creado real.
  const turnoAviso = !resultado.ya_existe && resultado.turno
    && ['duplicado', 'salto', 'retroactivo', 'revisar'].includes(resultado.turno.estado)
    ? resultado.turno : null;
  // Primer turno con colisión -> REVISAR + aclaración. Los demás -> crear directo.
  const mostrarRevisar = !!turnoAviso && esPrimerAviso;
  const mostrarCrearDirecto = !!turnoAviso && !esPrimerAviso;

  let turnoBadge = badgeTurno(resultado.turno?.estado, resultado.ya_existe);
  if (mostrarRevisar) turnoBadge = BADGE.revisar;
  else if (mostrarCrearDirecto) turnoBadge = BADGE.crear;
  const periodicoBadge = badgeAccion(resultado.periodico.accion);
  const periodicoCodigo = resultado.periodico.accion === 'crear'
    ? resultado.periodico.codigo_propuesto
    : resultado.periodico.codigo;

  // Código de turno a mostrar en el cuadro: si hay colisión de correlativo, el
  // que se va a CREAR (esperado), no el pedido que ya está ocupado.
  const codigoTurnoMostrar = turnoAviso?.esperado ?? resultado.codigo_turno;

  // Variantes uniformes (rotativo A/B; o una sola para grilla simple).
  // `codigo` = lo que se MUESTRA (el correlativo a crear si hubo colisión);
  // `codigoPedido` = clave para buscar los datos del pedido (descripción,
  // detalle, franco, horas, feriado), que están indexados por el código pedido.
  const variantes: { codigo: string; codigoPedido: string; variante: string; ref: FechaReferencia }[] = rotativo
    ? resultado.variantes.map(v => ({ codigo: v.codigo, codigoPedido: v.codigo, variante: v.variante, ref: v.fecha_referencia }))
    : [{ codigo: codigoTurnoMostrar, codigoPedido: resultado.codigo_turno, variante: '', ref: resultado.fecha_referencia }];

  // Diarios usados EN ESTE turno (el dict puede venir compartido en un lote):
  // filtrar por los códigos que aparecen en la grilla.
  const codigosEnGrilla = new Set(
    resultado.semanas_codigos.flat().filter(c => c !== CODIGO_FRANCO && c !== CODIGO_REVISAR),
  );
  const diariosDelTurno = Object.entries(resultado.diarios)
    .filter(([, d]) => {
      const cod = d.accion === 'crear' ? d.codigo_propuesto : d.codigo;
      return cod ? codigosEnGrilla.has(cod) : false;
    })
    .sort(([a], [b]) => a.localeCompare(b));
  const nAcrear = diariosDelTurno.filter(([, d]) => d.accion === 'crear').length;

  // Copiar la grilla del periódico (código + días × semanas), tabulada para
  // pegarla al crear el periódico en SAP.
  const [copiado, setCopiado] = useState(false);
  const copiarPeriodico = async () => {
    const encabezado = ['#', ...resultado.dias.map(d => d.slice(0, 3))].join('\t');
    const filas = resultado.semanas_codigos.map((sem, i) =>
      [String(i + 1), ...sem.map(c => (c === CODIGO_REVISAR ? 'REVISAR' : c))].join('\t'),
    );
    const texto = [encabezado, ...filas].join('\n');
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Fallback para navegadores/contextos sin Clipboard API.
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  };

  const cellStyle = (codigo: string): React.CSSProperties => {
    const base: React.CSSProperties = { ...mono, textAlign: 'center', padding: '4px 0' };
    if (codigo === CODIGO_FRANCO) return { ...base, background: '#C8C5BE', color: '#555' };
    if (codigo === CODIGO_REVISAR) return { ...base, background: '#FFF3CD', color: '#9E5000', fontWeight: 'bold' };
    const isCrear = Object.values(resultado.diarios).some(
      d => d.accion === 'crear' && d.codigo_propuesto === codigo,
    );
    return isCrear ? { ...base, background: '#E8F0FF', color: '#0A246A', fontWeight: 'bold' } : base;
  };

  return (
    <div className="sap-panel" style={{ marginBottom: 12 }}>
      {/* ===== AGRUPADOR: primera instancia, arriba del título del turno ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '8px 14px',
        background: 'linear-gradient(180deg,#F1EFE8,#E2DFD5)',
        borderBottom: '1px solid #888', boxShadow: 'inset 1px 1px 0 #fff',
      }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#444', fontWeight: 'bold' }}>
          Agrupador
        </span>
        <span style={{ ...mono, fontSize: 30, lineHeight: 1, fontWeight: 'bold', color: '#0A246A' }}>{agr}</span>
        {linea && <span style={{ fontSize: 15, color: '#444' }}>· {linea}</span>}
      </div>
      <div className="sap-panel-title"
        style={{ background: resultado.parseError ? '#CC0000'
          : resultado.flex ? '#9E5000'
          : resultado.hay_revisar ? '#9E5000'
          : mostrarCrearDirecto ? '#0A246A'
          : turnoAviso ? '#9E5000'
          : resultado.ok ? '#1A5C1A' : '#0A246A' }}>
        {resultado.parseError
          ? `⚠ ${tituloTurno} — no se pudo interpretar el horario`
          : resultado.ya_existe
          ? `✓ ${tituloTurno} — YA CREADO (cadena real de las tablas)`
          : resultado.flex
          ? `${tituloTurno} — FLEX: elegí el diario`
          : resultado.hay_revisar
          ? `⚠ ${tituloTurno} — hay celdas REVISAR MANUAL`
          : mostrarCrearDirecto
          ? `Turno a crear: ${turnoAviso?.esperado}`
          : turnoAviso
          ? `⚠ ${turnoAviso.esperado ?? tituloTurno} — revisá el correlativo`
          : `Resultado — ${tituloTurno}${rotativo ? ' (ROTATIVO)' : ''}`}
      </div>

      <div style={{ padding: 10 }}>

        {/* ===== 1. TURNO ===== */}
        <div className="sap-panel" style={{ marginBottom: 12 }}>
          <div className="sap-panel-title" style={{ gap: 10 }}>
            <span style={stepStyle}>1</span>
            <span>TURNO&nbsp;&nbsp;(regla — lo que pide RRHH)</span>
            <span style={{ marginLeft: 'auto' }}><Badge v={turnoBadge} /></span>
          </div>
          <div style={{ padding: 8 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="alv-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Detalle horario</th>
                    <th>Franco</th>
                    <th style={{ textAlign: 'center' }}>Hs. diarias</th>
                    <th style={{ textAlign: 'center' }}>Hs. sem.</th>
                    <th style={{ textAlign: 'center' }}>Feriados</th>
                    <th>Datos para SAP</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {variantes.map(v => {
                    const p = pedidos?.[v.codigoPedido];
                    return (
                      <tr key={v.codigo}>
                        <td style={{ ...mono, fontWeight: 'bold' }}>{v.codigo}</td>
                        <td>{p?.descripcion || '—'}</td>
                        <td style={mono}>{p?.detalle_horario || '—'}</td>
                        <td>{franco || p?.franco || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{p?.horas_diarias_decl || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{p?.horas_sem_decl || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{p?.feriados || '—'}</td>
                        <td style={{ ...mono, background: '#F3F7F0', borderLeft: '2px solid #7FB07F', whiteSpace: 'nowrap' }}>
                          {v.ref.fecha_referencia ? (
                            <>
                              <span style={{ color: '#444' }}>Fe.ref</span>{' '}
                              <b style={{ color: '#0A5C0A' }}>{v.ref.fecha_referencia}</b>{' '}
                              <span style={{ color: '#444' }}>· Pto.arr</span>{' '}
                              <b style={{ color: '#0A5C0A' }}>{v.ref.punto_arranque}</b>
                            </>
                          ) : (
                            <span style={{ color: '#888' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}><Badge v={turnoBadge} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {mostrarRevisar && turnoAviso && (
              <div style={{
                marginTop: 8, padding: '7px 9px', fontSize: 12,
                background: '#FFF3CD', border: '1px solid #E0B000', color: '#7A4E00',
              }}>
                <b>⚠ Revisar el correlativo.</b> {turnoAviso.nota}
                {turnoAviso.esperado && (
                  <> El siguiente correlativo libre sería <b style={mono}>{turnoAviso.esperado}</b>.</>
                )}
                <div style={{ marginTop: 3, color: '#8A6000' }}>
                  Mirá la solapa <b>Filtros</b> (Turnos) para ver la numeración de la familia.
                  Los turnos que siguen ya toman el correlativo corrido.
                </div>
              </div>
            )}
            {rotativo && (
              <p style={{ fontSize: 11, color: '#444', margin: '7px 0 0' }}>
                Rotación de {resultado.n_semanas} semanas: las variantes son el <b>mismo turno y periódico</b>;
                solo cambia la <b>fecha de referencia</b> (+7 días = una semana del ciclo). Pto. de arranque queda en 1.
              </p>
            )}
          </div>
        </div>

        {/* ===== Error de parseo: aviso, sin periódico/diario ===== */}
        {resultado.parseError && (
          <div style={{ background: '#FFF0F0', border: '1px solid #CC0000', padding: 10, marginBottom: 12 }}>
            <div style={{ color: '#CC0000', fontWeight: 'bold', marginBottom: 4 }}>
              ⚠ No se pudo interpretar el detalle horario
            </div>
            {resultado.notas.map((n, i) => (
              <div key={i} style={{ fontSize: 12, marginTop: 2 }}>{n}</div>
            ))}
          </div>
        )}

        {/* ===== FLEX: elegí el diario (candidatos, no autocompletable) ===== */}
        {resultado.flex && (
          <div className="sap-panel" style={{ marginBottom: 12 }}>
            <div className="sap-panel-title" style={{ gap: 10, background: '#9E5000' }}>
              <span style={stepStyle}>2·3</span>
              <span>DIARIO / PERIÓDICO&nbsp;&nbsp;(FLEX — elegí el diario)</span>
              <span style={{ marginLeft: 'auto' }}><Badge v={BADGE.revisar} /></span>
            </div>
            <div style={{ padding: 8 }}>
              <p style={{ fontSize: 12, margin: '0 0 8px', color: '#444' }}>
                Turno FLEX: no trae horario fijo, así que no se puede armar un diario solo.
                Estos son los diarios FLEX del agrupador que coinciden en horas — elegí uno.
                El periódico y el correlativo se resuelven una vez elegido.
              </p>
              {resultado.flexCandidatos && resultado.flexCandidatos.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="alv-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Código</th><th>Texto SAP</th><th style={{ textAlign: 'center' }}>Horas</th></tr>
                    </thead>
                    <tbody>
                      {resultado.flexCandidatos.map((d, i) => (
                        <tr key={i}>
                          <td style={{ ...mono, fontWeight: 'bold' }}>{d.codigo}</td>
                          <td>{d.texto}</td>
                          <td style={{ ...mono, textAlign: 'center' }}>{d.horas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9E5000' }}>
                  No hay diarios FLEX en este agrupador; cargar el diario a mano.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PERIÓDICO + DIARIO normales (turno con horario) ===== */}
        {!resultado.parseError && !resultado.flex && (<>
        {/* ===== 2. PERIÓDICO ===== */}
        <div className="sap-panel" style={{ marginBottom: 12 }}>
          <div className="sap-panel-title" style={{ gap: 10 }}>
            <span style={stepStyle}>2</span>
            <span>PERIÓDICO&nbsp;&nbsp;(grilla semanal)</span>
            <span style={{ marginLeft: 'auto' }}>
              <Badge v={periodicoBadge} />
            </span>
          </div>
          <div style={{ padding: 8 }}>
            {/* Código del periódico, prominente (como el turno y el diario) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px',
              background: '#E1DED4', border: '1px solid #C5C2BB', marginBottom: 8 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#444' }}>
                Código periódico
              </span>
              <span style={{ ...mono, fontSize: 14, fontWeight: 'bold' }}>{periodicoCodigo ?? '—'}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="sap-btn"
                  onClick={copiarPeriodico}
                  title="Copiar la grilla del periódico para pegarla al crearlo en SAP"
                  style={{ minWidth: 'auto', padding: '1px 9px' }}
                >
                  {copiado ? '✓ Copiado' : '⧉ Copiar'}
                </button>
                <Badge v={periodicoBadge} extra={resultado.periodico.accion === 'crear' ? 'proponer' : undefined} />
              </span>
            </div>
            {resultado.periodico.compartido && (
              <div style={{ fontSize: 11, color: '#0A5C0A', background: '#E9F5E9',
                border: '1px solid #7FB07F', padding: '4px 8px', margin: '0 0 7px' }}>
                ✓ Compartido: mismo periódico <b style={mono}>{periodicoCodigo}</b> que otro turno del lote (mismo horario). Crealo <b>una sola vez</b>.
              </div>
            )}
            {resultado.periodico.accion === 'crear' && !resultado.periodico.compartido && rotativo && (
              <p style={{ fontSize: 11, color: '#444', margin: '0 0 7px' }}>
                Un solo periódico <b style={mono}>{periodicoCodigo}</b> para toda la rotación.
              </p>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ background: '#BDB9B3', border: '1px solid #888', width: 32, padding: '4px 0' }}>#</th>
                    {resultado.dias.map(d => (
                      <th key={d} style={{ background: '#BDB9B3', border: '1px solid #888', width: 64, padding: '4px 0', textAlign: 'center' }}>
                        {d.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.semanas_codigos.map((sem, i) => (
                    <tr key={i}>
                      <td style={{ ...mono, background: '#BDB9B3', border: '1px solid #888', fontWeight: 'bold', textAlign: 'center', width: 32 }}>
                        {i + 1}
                      </td>
                      {sem.map((cod, j) => (
                        <td key={j} style={{ ...cellStyle(cod), border: '1px solid #888', width: 64 }}>
                          {cod === CODIGO_REVISAR ? '⚠' : cod}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===== 3. DIARIO ===== */}
        <div className="sap-panel">
          <div className="sap-panel-title" style={{ gap: 10 }}>
            <span style={stepStyle}>3</span>
            <span>DIARIO&nbsp;&nbsp;(los "ladrillos" — un horario cada uno)</span>
            <span style={{ marginLeft: 'auto' }}>
              {nAcrear > 0
                ? <Badge v={BADGE.crear} extra={`${nAcrear} a crear`} />
                : <Badge v={BADGE.creado} />}
            </span>
          </div>
          <div style={{ padding: 8 }}>
            {diariosDelTurno.map(([horario, d]) => {
              const esCrear = d.accion === 'crear';
              const codigo = esCrear
                ? d.codigo_propuesto
                : (d.duplicado ? d.todos?.map(t => t.codigo).join(', ') : d.codigo);
              const horas = d.todos?.[0]?.horas ?? horasDeRango(horario);
              const tol = d.tolerancia;
              return (
                <div key={horario} style={{ border: '1px solid #C5C2BB', background: '#ECE9E0', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', background: '#E1DED4', borderBottom: '1px solid #C5C2BB' }}>
                    <span style={{ ...mono, fontSize: 14, fontWeight: 'bold' }}>{codigo}</span>
                    <span style={{ ...mono, color: '#444' }}>{horarioTexto(horario)}</span>
                    {horas != null && <span style={{ color: '#444' }}>· {horas} h</span>}
                    {d.duplicado && <span style={{ color: '#CC6600', fontSize: 11 }}>(duplicado — respetar todos)</span>}
                    {d.compartido && <span style={{ color: '#0A5C0A', fontSize: 11 }}>✓ compartido — crear una sola vez</span>}
                    <span style={{ marginLeft: 'auto' }}>
                      {esCrear
                        ? <Badge v={BADGE.crear} extra={d.compartido ? 'compartido' : `propone ${d.codigo_propuesto}`} />
                        : <Badge v={BADGE.creado} />}
                    </span>
                  </div>
                  {tol && (
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#444', marginBottom: 5 }}>
                        Tiempos de tolerancia
                      </div>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                          <tr>
                            <td style={{ background: '#BDB9B3', border: '1px solid #D0CEC8', fontWeight: 'bold', padding: '3px 12px', whiteSpace: 'nowrap' }}>Inicio tolerancia</td>
                            <td style={{ ...mono, border: '1px solid #D0CEC8', padding: '3px 14px', textAlign: 'center' }}>{tol.inicio_tolerancia}</td>
                            <td style={{ ...mono, border: '1px solid #D0CEC8', padding: '3px 14px', textAlign: 'center' }}>{tol.inicio_tolerancia_fin}</td>
                          </tr>
                          <tr>
                            <td style={{ background: '#BDB9B3', border: '1px solid #D0CEC8', fontWeight: 'bold', padding: '3px 12px', whiteSpace: 'nowrap' }}>Tolerancia final</td>
                            <td style={{ ...mono, border: '1px solid #D0CEC8', padding: '3px 14px', textAlign: 'center' }}>{tol.final_teorico}</td>
                            <td style={{ ...mono, border: '1px solid #D0CEC8', padding: '3px 14px', textAlign: 'center' }}>{tol.fin_tolerancia}</td>
                          </tr>
                        </tbody>
                      </table>
                      {esCrear && d.detalle?.ultimo_existente && (
                        <p style={{ fontSize: 11, color: '#444', margin: '6px 0 0' }}>
                          Último de la familia en el agrupador: <b style={mono}>{d.detalle.ultimo_existente}</b>
                          {' '}→ siguiente correlativo: <b style={mono}>{d.codigo_propuesto}</b>.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </>)}

        {/* Notas */}
        {resultado.notas.length > 0 && (
          <div className="result-section" style={{ marginTop: 8 }}>
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
