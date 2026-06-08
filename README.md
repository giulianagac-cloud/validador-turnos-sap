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
