import { useState } from 'react';
import TablasLoader from './components/TablasLoader';
import PedidoForm from './components/PedidoForm';
import ResultadoCard from './components/ResultadoCard';
import type { TablasState, ResultadoAnalisis } from './types';
import { formatLoadTime, formatElapsed } from './utils';

// Horas tras las cuales se muestra la advertencia de tablas desactualizadas
const STALE_HOURS = 8;

type Tab = 'tablas' | 'pedido' | 'resultados';

export default function App() {
  const [tab, setTab] = useState<Tab>('tablas');
  const [tablas, setTablas] = useState<TablasState | null>(null);
  const [resultados, setResultados] = useState<ResultadoAnalisis[]>([]);
  const [statusMsg, setStatusMsg] = useState('Listo. Cargá los 3 Excels de SAP para comenzar.');
  const [statusType, setStatusType] = useState<'ok' | 'error' | 'info'>('info');

  const setStatus = (msg: string, type: 'ok' | 'error' | 'info' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
  };

  const gotoTab = (t: Tab) => {
    if (t === 'pedido' && !tablas) return;
    if (t === 'resultados' && resultados.length === 0) return;
    setTab(t);
  };

  const isStale = tablas
    ? Date.now() - tablas.loadedAt > STALE_HOURS * 3600 * 1000
    : false;

  return (
    <div className="app-root">
      {/* Header */}
      <div className="sap-header">
        <span style={{ fontSize: 16 }}>&#9632;</span>
        Validador de Turnos SAP HCM &mdash; Trenes Argentinos
        {tablas && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 11,
              color: isStale ? '#FFD080' : '#CCD6F6',
              whiteSpace: 'nowrap',
            }}>
              {isStale && '⚠ '}
              Diarios: {tablas.n_diarios} &middot; Periódicos: {tablas.n_periodicos} &middot; Turnos: {tablas.n_turnos}
              {' '}—{' '}
              cargado {formatLoadTime(tablas.loadedAt)}
              {isStale && ` (hace ${formatElapsed(Date.now() - tablas.loadedAt)})`}
            </span>
            <button
              onClick={() => gotoTab('tablas')}
              style={{
                fontSize: 11,
                background: isStale ? 'rgba(255,190,0,0.25)' : 'rgba(255,255,255,0.15)',
                border: `1px solid ${isStale ? 'rgba(255,200,0,0.5)' : 'rgba(255,255,255,0.35)'}`,
                color: '#FFFFFF',
                padding: '1px 10px',
                cursor: 'pointer',
                fontFamily: 'Arial, Tahoma, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              Actualizar tablas
            </button>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="sap-tabs">
        <div
          className={`sap-tab${tab === 'tablas' ? ' active' : ''}`}
          onClick={() => gotoTab('tablas')}
        >
          1. Carga de Tablas
        </div>
        <div
          className={`sap-tab${tab === 'pedido' ? ' active' : ''}${!tablas ? ' disabled' : ''}`}
          onClick={() => gotoTab('pedido')}
          title={!tablas ? 'Primero cargá las tablas SAP' : undefined}
        >
          2. Pedidos
        </div>
        <div
          className={`sap-tab${tab === 'resultados' ? ' active' : ''}${resultados.length === 0 ? ' disabled' : ''}`}
          onClick={() => gotoTab('resultados')}
          title={resultados.length === 0 ? 'Analizá al menos un pedido primero' : undefined}
        >
          3. Resultados {resultados.length > 0 && `(${resultados.length})`}
        </div>
      </div>

      {/* Content — todos los tabs renderizados, mostrados/ocultos via display */}
      <div className="sap-content">
        <div style={{ display: tab === 'tablas' ? 'block' : 'none' }}>
          <TablasLoader
            current={tablas}
            onCargado={(t) => {
              const state: TablasState = {
                n_diarios: t.n_diarios,
                n_periodicos: t.n_periodicos,
                n_turnos: t.n_turnos,
                loadedAt: Date.now(),
              };
              setTablas(state);
              setStatus(
                `Tablas cargadas: ${t.n_diarios} diarios, ${t.n_periodicos} periódicos, ${t.n_turnos} turnos.`,
                'ok',
              );
              setTab('pedido');
            }}
            onError={(msg) => setStatus(`Error: ${msg}`, 'error')}
          />
        </div>

        <div style={{ display: tab === 'pedido' ? 'block' : 'none' }}>
          <PedidoForm
            tablasState={tablas}
            staleHours={STALE_HOURS}
            onResultados={(r) => {
              setResultados(r);
              setStatus(`Análisis completado: ${r.length} pedido(s) procesado(s).`, 'ok');
              setTab('resultados');
            }}
            onError={(msg) => setStatus(`Error: ${msg}`, 'error')}
            onGoToTablas={() => setTab('tablas')}
          />
        </div>

        <div style={{ display: tab === 'resultados' ? 'block' : 'none' }}>
          {resultados.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button className="sap-btn" onClick={() => setTab('pedido')}>
                &#8592; Volver a Pedidos
              </button>
            </div>
          )}
          {resultados.map((r, i) => (
            <ResultadoCard key={i} resultado={r} />
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="sap-statusbar">
        <span style={{
          color: statusType === 'ok' ? '#006600' : statusType === 'error' ? '#CC0000' : '#555555',
          fontWeight: 'bold',
        }}>
          {statusType === 'ok' ? '●' : statusType === 'error' ? '●' : '○'}
        </span>
        {statusMsg}
      </div>
    </div>
  );
}
