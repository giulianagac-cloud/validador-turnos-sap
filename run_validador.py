"""Punto de entrada del ejecutable (.exe) y del modo "una sola pieza".

Hace tres cosas:
  1. Elige un puerto libre (prefiere 8000; si está ocupado, pide otro al SO).
  2. Abre el navegador en la URL local apenas el server está por levantar.
  3. Levanta uvicorn sirviendo la app (backend + frontend compilado).

Se usa tanto congelado por PyInstaller (doble clic) como en desarrollo
(`python run_validador.py`). Para desarrollo con autorecarga seguí usando
`uvicorn backend.main:app --reload` aparte.
"""

import socket
import threading
import time
import webbrowser

import uvicorn

from backend.main import app

PUERTO_PREFERIDO = 8000


def _puerto_libre(preferido: int = PUERTO_PREFERIDO) -> int:
    """Devuelve `preferido` si está libre; si no, un puerto libre cualquiera."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferido))
            return preferido
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _abrir_navegador(url: str, demora: float = 1.5) -> None:
    """Abre el navegador tras una breve demora, para dar tiempo a uvicorn."""
    time.sleep(demora)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main() -> None:
    puerto = _puerto_libre()
    url = f"http://localhost:{puerto}"

    print("=" * 60)
    print("  Validador de Turnos SAP HCM — Trenes Argentinos")
    print(f"  Abriendo la app en: {url}")
    print("  (para cerrar, cerrá esta ventana)")
    print("=" * 60)

    threading.Thread(target=_abrir_navegador, args=(url,), daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=puerto, log_level="info")


if __name__ == "__main__":
    main()
