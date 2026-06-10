# -*- mode: python ; coding: utf-8 -*-
"""Empaquetado del Validador de Turnos SAP en un .exe autónomo.

Genera un único ejecutable (onefile) que levanta el backend FastAPI sirviendo
el frontend ya compilado. Construir con:

    pyinstaller validador.spec

El .exe queda en dist/ValidadorTurnos.exe

Requisito previo: tener el frontend compilado (cd frontend && npm run build),
porque acá se empaqueta frontend/dist dentro del bundle.
"""

from PyInstaller.utils.hooks import collect_submodules

# uvicorn carga sus loops/protocolos por nombre en runtime -> hidden imports.
hidden = collect_submodules("uvicorn")

# Módulos del proyecto en la raíz (el motor y los generadores). Se importan de
# forma dinámica en algunos puntos, así que los declaramos explícitamente.
hidden += [
    "turnos_engine",
    "generador_grillas",
    "puente_grilla_motor",
]

# Recursos de solo lectura embebidos en el bundle. Se leen vía sys._MEIPASS.
datas = [
    ("frontend/dist", "frontend/dist"),
]


a = Analysis(
    ["run_validador.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ValidadorTurnos",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # deja la consola visible: muestra la URL y sirve para cerrar
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
