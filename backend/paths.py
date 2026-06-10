"""Resolución de rutas portable: funciona igual en desarrollo y congelado (.exe).

Dos problemas que resuelve PyInstaller y que acá centralizamos:

1. Recursos empaquetados (frontend/dist): al congelar, los datos viven en una
   carpeta temporal que PyInstaller descomprime (sys._MEIPASS), no en el árbol
   del proyecto.
2. Datos persistentes (tablas SAP): no pueden ir junto al .exe (puede estar en
   una carpeta protegida como Archivos de Programa). Van a Documentos del usuario.
"""

import sys
from pathlib import Path


def esta_congelado() -> bool:
    """True si corre como .exe empaquetado por PyInstaller."""
    return getattr(sys, "frozen", False)


def _base_recursos() -> Path:
    """Raíz desde donde leer recursos de solo lectura (frontend/dist, etc.).

    Congelado: carpeta temporal de PyInstaller (sys._MEIPASS).
    Desarrollo: raíz del proyecto (un nivel arriba de backend/).
    """
    if esta_congelado():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def frontend_dist() -> Path:
    """Ruta a frontend/dist (el frontend compilado que sirve el backend)."""
    return _base_recursos() / "frontend" / "dist"


def _carpeta_documentos() -> Path:
    """Carpeta Documentos del usuario actual, de forma portable.

    En Windows usa la API de carpetas conocidas (respeta Documentos
    redirigidos, OneDrive, locale en español, etc.). Si falla, cae a
    Path.home()/Documents.
    """
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class _GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", wintypes.DWORD),
                    ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD),
                    ("Data4", ctypes.c_byte * 8),
                ]

            # FOLDERID_Documents = {FDD39AD0-238F-46AF-ADB4-6C85480369C7}
            folderid_documents = _GUID(
                0xFDD39AD0, 0x238F, 0x46AF,
                (ctypes.c_byte * 8)(0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7),
            )

            ptr = ctypes.c_wchar_p()
            res = ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(folderid_documents), 0, None, ctypes.byref(ptr)
            )
            if res == 0 and ptr.value:
                ruta = Path(ptr.value)
                ctypes.windll.ole32.CoTaskMemFree(ptr)
                return ruta
        except Exception:
            pass

    return Path.home() / "Documents"


def data_dir() -> Path:
    """Carpeta de datos persistentes: Documentos/ValidadorTurnos.

    La crea si no existe. Acá se guardan las tablas SAP cargadas, tanto
    corriendo como .exe como en desarrollo.
    """
    d = _carpeta_documentos() / "ValidadorTurnos"
    d.mkdir(parents=True, exist_ok=True)
    return d
