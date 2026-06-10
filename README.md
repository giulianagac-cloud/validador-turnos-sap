# Validador de Turnos SAP HCM — Trenes Argentinos

Herramienta interna para automatizar la validación y armado de turnos en SAP HCM.
Cruza los pedidos de RRHH contra exports de SAP para determinar qué existe, qué crear
y cuál es el correlativo correcto.

## Cómo levantar

### Backend (FastAPI)

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Disponible en: http://localhost:8000

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Disponible en: http://localhost:5173

## Levantar en modo unificado (una sola terminal)

Compila el frontend y deja que el backend lo sirva en la misma URL. Es la forma
recomendada para uso normal (no desarrollo).

```bash
# 1. Compilar el frontend (genera frontend/dist/)
cd frontend && npm run build

# 2. Desde la raíz del proyecto, levantar el backend (sin --reload)
cd ..
python -m uvicorn backend.main:app
```

Abrir: http://localhost:8000 — la app completa se sirve desde ahí.

> El modo desarrollo (dos terminales: `uvicorn --reload` + `npm run dev` en :5173)
> sigue funcionando igual; en dev, Vite redirige las llamadas `/api` al backend.

## Generar el ejecutable (.exe)

Empaqueta todo (backend + frontend compilado + dependencias) en un único `.exe`
que se usa sin tener Python instalado. La usuaria solo hace doble clic.

```bash
# 1. Compilar el frontend (genera frontend/dist/, que se embebe en el .exe)
cd frontend && npm run build && cd ..

# 2. Instalar PyInstaller (una sola vez)
pip install pyinstaller

# 3. Empaquetar usando el .spec del repo
python -m pyinstaller validador.spec --noconfirm
```

El ejecutable queda en `dist/ValidadorTurnos.exe`.

**Uso:** doble clic en `ValidadorTurnos.exe`. Abre una ventana de consola (muestra
la URL y sirve para cerrar la app) y automáticamente abre el navegador en
`http://localhost:8000`. Si el 8000 está ocupado, usa otro puerto libre y abre el
navegador en ese. La primera vez tarda unos segundos en arrancar (descomprime).

> **onefile vs onedir:** el `.spec` está en modo **onefile** (un solo `.exe`,
> ideal para repartir por mail o pendrive). A cambio, el arranque es algo más lento
> porque descomprime a una carpeta temporal en cada ejecución. Si se prefiere
> arranque más rápido a costa de distribuir una carpeta entera, se puede pasar a
> **onedir** (separando `EXE`/`COLLECT` en el `.spec`).

### Dónde guarda los datos

Las tablas SAP cargadas se persisten en **`Documentos\ValidadorTurnos\`** del usuario
actual (no junto al `.exe`, que puede estar en una carpeta de solo lectura). La
carpeta se crea sola. Esto aplica tanto al `.exe` como al modo desarrollo.

## Seguridad

1. **Sin persistencia de datos de empleados**: los archivos Excel se procesan
   íntegramente en memoria RAM y se descartan al finalizar el request. Ningún dato
   de empleado se escribe en disco ni en base de datos.

2. **Sin conexión a SAP**: la app solo lee exports manuales (archivos .XLSX).
   No tiene credenciales ni abre ningún tipo de sesión o conexión con el sistema SAP.

3. **Solo para red interna**: está diseñada para correr en la computadora del operador
   o en la red interna de Trenes Argentinos. No exponer a internet.

## Uso

1. Exportar manualmente de SAP: `Diarios.XLSX`, `Periódicos.XLSX`, `Turnos.XLSX`.
2. Cargarlos en la pestaña **Carga de Tablas**.
3. Ingresar los pedidos de RRHH en la pestaña **Pedidos**.
4. Ver los resultados (correlativos, horas, cuadrito) en la pestaña **Resultados**.
