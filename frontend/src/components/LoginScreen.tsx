import { useState } from 'react';
import { login } from '../api';

interface Props {
  onLoginOk: () => void;
}

export default function LoginScreen({ onLoginOk }: Props) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario || !contrasena) return;
    setLoading(true);
    setError(null);
    try {
      await login(usuario, contrasena);
      onLoginOk();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-root">
      <div className="sap-header">
        <span style={{ fontSize: 16 }}>&#9632;</span>
        Validador de Turnos SAP HCM &mdash; Trenes Argentinos
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit} className="sap-panel" style={{ width: 300 }}>
          <div className="sap-panel-title">Iniciar sesión</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, display: 'block' }}>
              Usuario
              <input
                type="text"
                className="sap-input"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoFocus
                style={{ width: '100%', marginTop: 3, display: 'block' }}
              />
            </label>
            <label style={{ fontSize: 12, display: 'block' }}>
              Contraseña
              <input
                type="password"
                className="sap-input"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                style={{ width: '100%', marginTop: 3, display: 'block' }}
              />
            </label>
            {error && (
              <div style={{ color: '#CC0000', fontSize: 11 }}>{error}</div>
            )}
            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              disabled={loading || !usuario || !contrasena}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
      <div className="sap-statusbar">Acceso restringido al equipo de Trenes Argentinos.</div>
    </div>
  );
}
