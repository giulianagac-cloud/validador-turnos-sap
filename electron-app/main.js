'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let backendProc = null;
let mainWindow = null;

// Mismo path que PORT_FILE en run_validador.py
const PORT_FILE = path.join(os.tmpdir(), 'validador_turnos_port.txt');

function exePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ValidadorTurnos.exe')
    : path.join(__dirname, '..', 'dist', 'ValidadorTurnos.exe');
}

// Lanza el backend y resuelve con el puerto escrito en PORT_FILE.
// Nota: PyInstaller onefile en Windows lanza un proceso hijo interno que no
// hereda los pipes del padre, así que no podemos leer stdout. El exe escribe
// el puerto a un archivo temporal que nosotros polleamos.
function lanzarBackend() {
  return new Promise((resolve, reject) => {
    // Borrar archivo viejo antes de spawnear para evitar leer un puerto stale
    try { fs.unlinkSync(PORT_FILE); } catch { /* no existía, está bien */ }

    backendProc = spawn(exePath(), [], {
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
      env: { ...process.env, VALIDADOR_NO_BROWSER: '1' },
    });

    backendProc.on('error', (err) => {
      reject(new Error(`No se pudo iniciar el backend:\n${err.message}`));
    });

    backendProc.on('exit', (code) => {
      reject(new Error(`El backend terminó inesperadamente (código ${code})`));
    });

    // Pollear PORT_FILE hasta que el exe lo escriba.
    // PyInstaller onefile necesita ~25-30s de arranque en frío (descompresión).
    let intentos = 0;
    const MAX_INTENTOS = 180; // 90s con intervalos de 500ms
    const interval = setInterval(() => {
      intentos++;
      try {
        const contenido = fs.readFileSync(PORT_FILE, 'utf8').trim();
        const puerto = parseInt(contenido, 10);
        if (!isNaN(puerto) && puerto > 0) {
          clearInterval(interval);
          resolve(puerto);
          return;
        }
      } catch { /* archivo todavía no existe */ }

      if (intentos >= MAX_INTENTOS) {
        clearInterval(interval);
        reject(new Error(
          'El backend no arrancó en 90 segundos.\n' +
          'Verificá que dist/ValidadorTurnos.exe exista y sea ejecutable.'
        ));
      }
    }, 500);
  });
}

// Pollean /api/estado-tablas hasta que el backend responde HTTP 200
async function esperarBackend(puerto, timeoutMs = 60_000) {
  const url = `http://localhost:${puerto}/api/estado-tablas`;
  const fin = Date.now() + timeoutMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* el backend todavía no aceptó conexiones */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`El backend no respondió en ${timeoutMs / 1000}s`);
}

// Mata el proceso del backend y todo su árbol de procesos hijos.
// PyInstaller onefile spawns procesos internos; taskkill /T los liquida todos.
function matarBackend() {
  if (!backendProc) return;
  const proc = backendProc;
  backendProc = null;
  try {
    execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
  } catch {
    try { proc.kill(); } catch { /* ya terminó */ }
  }
  try { fs.unlinkSync(PORT_FILE); } catch { /* no importa */ }
}

function crearVentana(puerto) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Validador de Turnos SAP HCM — Trenes Argentinos',
    // Para agregar ícono propio: icon: path.join(__dirname, 'assets', 'icon.ico')
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://localhost:${puerto}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    const puerto = await lanzarBackend();
    await esperarBackend(puerto);
    crearVentana(puerto);
  } catch (err) {
    dialog.showErrorBox('Error al iniciar el Validador de Turnos', err.message);
    matarBackend();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  matarBackend();
  app.quit();
});

// Red de seguridad: si la app se cierra de otra forma (SIGTERM, tarea del SO)
app.on('before-quit', matarBackend);
