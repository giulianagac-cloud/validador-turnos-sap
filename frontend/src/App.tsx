import { useEffect, useState } from 'react';
import TablasLoader from './components/TablasLoader';
import PedidoForm from './components/PedidoForm';
import FiltrosTablas from './components/FiltrosTablas';
import GrillaResultado from './components/GrillaResultado';
import LoginScreen from './components/LoginScreen';
import type { TablasState, AnyResultado, PedidoDisplay } from './types';
import { esRotativo, esExistente } from './types';
import { simpleToGrilla } from './simpleToGrilla';
import { estadoTablas, whoami } from './api';
import { formatLoadTime, formatElapsed } from './utils';

// Horas tras las cuales se muestra la advertencia de tablas desactualizadas
const STALE_HOURS = 8;

type Tab = 'tablas' | 'pedido' | 'resultados' | 'filtros';
type AuthState = 'checking' | 'needed' | 'ok';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [tab, setTab] = useState<Tab>('tablas');
  const [tablas, setTablas] = useState<TablasState | null>(null);
  const [resultados, setResultados] = useState<AnyResultado[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDisplay[]>([]);
  const [statusMsg, setStatusMsg] = useState('Consultando estado del servidor...');
  const [statusType, setStatusType] = useState<'ok' | 'error' | 'info'>('info');

  const cargarEstadoInicial = () => {
    estadoTablas()
      .then(estado => {
        if (estado.cargadas && estado.timestamp_ms) {
          const state: TablasState = {
            n_diarios: estado.n_diarios,
            n_periodicos: estado.n_periodicos,
            n_turnos: estado.n_turnos,
            loadedAt: estado.timestamp_ms,
          };
          setTablas(state);
          setStatusMsg(`Tablas cargadas el ${formatLoadTime(estado.timestamp_ms)} — listo para analizar.`);
          setStatusType('ok');
          setTab('pedido');
        } else {
          setStatusMsg('Listo. Cargá los 3 Excels de SAP para comenzar.');
          setStatusType('info');
        }
      })
      .catch(() => {
        setStatusMsg('No se pudo conectar con el backend. Verificá que esté corriendo.');
        setStatusType('error');
      });
  };

  useEffect(() => {
    // whoami() siempre existe y no requiere sesión: en modo local (sin login)
    // devuelve authenticated=true directo, así que acá nunca se muestra el
    // login. En Vercel refleja si hay o no una cookie de sesión válida.
    whoami()
      .then(w => {
        if (w.authenticated) {
          setAuthState('ok');
          cargarEstadoInicial();
        } else {
          setAuthState('needed');
        }
      })
      .catch(() => {
        // Si ni siquiera whoami responde, seguimos igual: estadoTablas()
        // va a mostrar el error de conexión real en la barra de estado.
        setAuthState('ok');
        cargarEstadoInicial();
      });
  }, []);

  if (authState === 'needed') {
    return (
      <LoginScreen
        onLoginOk={() => {
          setAuthState('ok');
          cargarEstadoInicial();
        }}
      />
    );
  }

  if (authState === 'checking') {
    return (
      <div className="app-root">
        <div className="sap-header">
          <span style={{ fontSize: 16 }}>&#9632;</span>
          Validador de Turnos SAP HCM &mdash; Trenes Argentinos
        </div>
        <div className="sap-statusbar">Consultando estado del servidor...</div>
      </div>
    );
  }

  const setStatus = (msg: string, type: 'ok' | 'error' | 'info' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
  };

  const gotoTab = (t: Tab) => {
    if (t === 'pedido' && !tablas) return;
    if (t === 'resultados' && resultados.length === 0) return;
    if (t === 'filtros' && !tablas) return;
    setTab(t);
  };

  const isStale = tablas
    ? Date.now() - tablas.loadedAt > STALE_HOURS * 3600 * 1000
    : false;

  // Índice código → datos del Excel, para unir cada turno con su fila original.
  const pedidosPorCodigo: Record<string, PedidoDisplay> = {};
  for (const p of pedidos) {
    if (p.codigo) pedidosPorCodigo[p.codigo] = p;
  }

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
        <div
          className={`sap-tab${tab === 'filtros' ? ' active' : ''}${!tablas ? ' disabled' : ''}`}
          onClick={() => gotoTab('filtros')}
          title={!tablas ? 'Primero cargá las tablas SAP' : undefined}
        >
          4. Filtros
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
            onResultados={(r, p) => {
              setResultados(r);
              setPedidos(p);
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
          {(() => {
            // La aclaración del correlativo (REVISAR + nota "mirá Filtros") va SOLO
            // en el PRIMER turno con colisión de correlativo. Los demás muestran
            // directo el turno a crear, sin repetir el cartel.
            const esColision = (r: unknown): boolean => {
              const x = r as { ya_existe?: boolean; turno?: { estado?: string } };
              return !x.ya_existe && !!x.turno
                && ['duplicado', 'salto', 'retroactivo', 'revisar'].includes(x.turno.estado ?? '');
            };
            const primerColisionIdx = resultados.findIndex(esColision);
            return resultados.map((r, i) => (
              esRotativo(r) || esExistente(r)
                ? <GrillaResultado key={i} resultado={r} pedidos={pedidosPorCodigo} esPrimerAviso={i === primerColisionIdx} />
                : <GrillaResultado key={i} resultado={simpleToGrilla(r)} pedidos={pedidosPorCodigo} esPrimerAviso={i === primerColisionIdx} />
            ));
          })()}
        </div>

        <div style={{ display: tab === 'filtros' ? 'block' : 'none' }}>
          <FiltrosTablas
            tablasState={tablas}
            onError={(msg) => setStatus(`Error: ${msg}`, 'error')}
          />
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
