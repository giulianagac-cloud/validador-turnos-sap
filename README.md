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

## Despliegue en Vercel (solución transitoria de equipo)

Mientras se gestiona un servidor interno de Trenes Argentinos, la app se puede
desplegar en Vercel para que el equipo la use en conjunto. Es un modo de
despliegue **adicional** — el modo local/`.exe` sigue funcionando exactamente
igual, sin login y con persistencia en disco.

En Vercel, la persistencia de las 3 tablas SAP pasa a **Vercel Blob Storage**
(en vez de disco local) y se agrega una **pantalla de login compartida por el
equipo** (usuario/contraseña únicos, no individual) que protege todos los
endpoints de `/api/*`. Esto se activa solo/automáticamente al correr como
función de Vercel (detecta la variable de entorno `VERCEL` que Vercel setea
sola) — no hay ningún flag para tocar a mano.

### Variables de entorno a configurar en el dashboard de Vercel

Nunca van en el código ni en el repo — se cargan en **Project Settings →
Environment Variables**:

| Variable | Para qué es | Cómo se obtiene |
|---|---|---|
| `APP_USERNAME` | Usuario del login compartido del equipo | La define la usuaria |
| `APP_PASSWORD` | Contraseña del login compartido del equipo | La define la usuaria |
| `APP_SECRET_KEY` | Clave para firmar la cookie de sesión (HMAC) | Generarla una vez, ej.: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `BLOB_READ_WRITE_TOKEN` | Acceso a Vercel Blob Storage | La agrega Vercel automáticamente al crear el Blob store y conectarlo al proyecto — no hace falta cargarla a mano |

### Pasos generales de deploy

1. Conectar el repositorio de GitHub desde el dashboard de Vercel (Add New →
   Project → Import Git Repository), dejando el **Root Directory** en la raíz
   del repo (no en `frontend/`) — el build y las funciones serverless lo
   necesitan así.
2. Crear un Blob store desde la pestaña **Storage** del proyecto y conectarlo
   (esto agrega `BLOB_READ_WRITE_TOKEN` solo).
3. Cargar `APP_USERNAME`, `APP_PASSWORD` y `APP_SECRET_KEY` en Environment
   Variables.
4. Deploy (automático al pushear a la rama conectada, o `vercel deploy` desde
   la CLI).
5. Entrar a la URL del proyecto, loguearse con las credenciales del equipo, y
   cargar los 3 Excels de SAP una sola vez en la pantalla de Carga de Tablas
   — quedan disponibles para todo el equipo sin que cada quien los vuelva a
   subir.

## Seguridad

1. **Sin persistencia de datos de empleados**: los archivos Excel se procesan
   íntegramente en memoria RAM y se descartan al finalizar el request. Ningún dato
   de empleado se escribe en disco ni en base de datos.

2. **Sin conexión a SAP**: la app solo lee exports manuales (archivos .XLSX).
   No tiene credenciales ni abre ningún tipo de sesión o conexión con el sistema SAP.

3. **Solo para red interna**: está diseñada para correr en la computadora del operador
   o en la red interna de Trenes Argentinos. No exponer a internet.

   > **Excepción consciente — despliegue transitorio en Vercel:** el modo Vercel
   > (ver sección de despliegue más arriba) sí queda accesible por internet,
   > detrás de un login compartido del equipo. Es una decisión evaluada: las 3
   > tablas SAP que procesa la app (Diarios, Periódicos, Turnos) fueron
   > verificadas por la usuaria y no contienen datos personales de empleados
   > (legajo, nombre, DNI) — solo códigos de horario y configuración
   > organizativa. Si en el futuro se incorporan tablas o pedidos que sí
   > contengan datos personales, esta arquitectura debe reevaluarse antes de
   > subirlos a Vercel.

## Uso

1. Exportar manualmente de SAP: `Diarios.XLSX`, `Periódicos.XLSX`, `Turnos.XLSX`.
2. Cargarlos en la pestaña **Carga de Tablas**.
3. Ingresar los pedidos de RRHH en la pestaña **Pedidos**.
4. Ver los resultados (correlativos, horas, cuadrito) en la pestaña **Resultados**.
