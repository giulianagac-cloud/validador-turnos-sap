import { useRef, useState } from 'react';
import { cargarTablas } from '../api';
import type { TablasStatus, TablasState } from '../types';
import { formatLoadTime } from '../utils';

interface Props {
  current: TablasState | null;
  onCargado: (t: TablasStatus) => void;
  onError: (msg: string) => void;
}

type FileField = 'diarios' | 'periodicos' | 'turnos';

interface SlotDef {
  field: FileField;
  label: string;
  hint: string;
}

const SLOTS: SlotDef[] = [
  { field: 'diarios',    label: 'Diarios.XLSX',    hint: 'Export PHTD diarios (Plan hor.tbjo.diario)' },
  { field: 'periodicos', label: 'Periódicos.XLSX',  hint: 'Export PHT por períodos' },
  { field: 'turnos',     label: 'Turnos.XLSX',      hint: 'Export Reglas de plan (LS/LR)' },
];

export default function TablasLoader({ current, onCargado, onError }: Props) {
  const [files, setFiles] = useState<Record<FileField, File | null>>({
    diarios: null, periodicos: null, turnos: null,
  });
  const [dragOver, setDragOver] = useState<FileField | null>(null);
  const [loading, setLoading] = useState(false);

  const refs: Record<FileField, React.RefObject<HTMLInputElement>> = {
    diarios:    useRef<HTMLInputElement>(null),
    periodicos: useRef<HTMLInputElement>(null),
    turnos:     useRef<HTMLInputElement>(null),
  };

  const setFile = (field: FileField, file: File | null) =>
    setFiles(prev => ({ ...prev, [field]: file }));

  const allReady = files.diarios && files.periodicos && files.turnos;

  const handleCargar = async () => {
    if (!allReady) return;
    setLoading(true);
    try {
      const result = await cargarTablas(files.diarios!, files.periodicos!, files.turnos!);
      onCargado(result);
      // Limpiar selección tras cargar exitosamente
      setFiles({ diarios: null, periodicos: null, turnos: null });
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const isReload = current !== null;

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Indicador de tablas actuales */}
      {current && (
        <div className="sap-panel" style={{ marginBottom: 8 }}>
          <div className="sap-panel-title" style={{ background: '#1A5C1A' }}>
            &#10003; Tablas en memoria
          </div>
          <div style={{ padding: '6px 10px', fontSize: 12, display: 'flex', gap: 24, alignItems: 'center' }}>
            <span>
              <strong>Diarios:</strong> {current.n_diarios}
            </span>
            <span>
              <strong>Periódicos:</strong> {current.n_periodicos}
            </span>
            <span>
              <strong>Turnos:</strong> {current.n_turnos}
            </span>
            <span style={{ color: '#555', marginLeft: 'auto' }}>
              Cargadas {formatLoadTime(current.loadedAt)}
            </span>
          </div>
        </div>
      )}

      {/* Panel de carga / recarga */}
      <div className="sap-panel">
        <div className="sap-panel-title">
          {isReload ? 'Reemplazar tablas SAP' : 'Carga de Tablas SAP'}
        </div>

        <div style={{ padding: '8px 8px 4px' }}>
          {isReload ? (
            <div style={{ fontSize: 12, color: '#555', marginBottom: 12, lineHeight: 1.5 }}>
              Seleccioná los 3 exports frescos de SAP para reemplazar las tablas en memoria.
              Los correlativos propuestos se recalcularán con los datos nuevos.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#555', marginBottom: 12, lineHeight: 1.5 }}>
              Los archivos se procesan <strong>en memoria</strong> y se descartan al terminar.
              No se guardan datos de empleados en ningún lado.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {SLOTS.map(({ field, label, hint }) => {
              const file = files[field];
              return (
                <div key={field} style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{label}</div>
                  <div
                    className={[
                      'sap-drop-zone',
                      file ? 'loaded' : '',
                      dragOver === field ? 'drag-over' : '',
                    ].join(' ')}
                    onClick={() => refs[field].current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(field); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const f = e.dataTransfer.files[0];
                      if (f) setFile(field, f);
                    }}
                  >
                    {file ? (
                      <>
                        <span style={{ fontSize: 18 }}>&#10003;</span>
                        <span style={{ fontWeight: 'bold', color: '#006600' }}>{file.name}</span>
                        <span style={{ fontSize: 11, color: '#555' }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                        <span
                          style={{ fontSize: 10, color: '#888', marginTop: 4, cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); setFile(field, null); }}
                        >
                          [cambiar]
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 20 }}>&#128193;</span>
                        <span>Click o arrastrar</span>
                        <span style={{ fontSize: 11, color: '#888' }}>{hint}</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={refs[field]}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={(e) => setFile(field, e.target.files?.[0] ?? null)}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="sap-btn sap-btn-primary"
              onClick={handleCargar}
              disabled={!allReady || loading}
            >
              {loading
                ? (isReload ? 'Actualizando...' : 'Cargando...')
                : (isReload ? 'Reemplazar tablas' : 'Cargar tablas')}
            </button>
            {!allReady && (
              <span style={{ fontSize: 11, color: '#888' }}>
                Seleccioná los 3 archivos Excel de SAP.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
