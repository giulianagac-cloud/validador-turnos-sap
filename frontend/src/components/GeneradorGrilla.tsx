import { useState } from 'react';
import { generarTurno } from '../api';
import GrillaResultado from './GrillaResultado';
import type {
  GenerarTurnoInput, ResultadoGrilla, TablasState,
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
        <GrillaResultado resultado={resultado} />
      )}
    </>
  );
}
