from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .paths import frontend_dist
from .routers import analizar, auth_router

# Ruta al frontend compilado. El helper resuelve el caso congelado (.exe ->
# sys._MEIPASS) y el de desarrollo (árbol del proyecto).
FRONTEND_DIST = frontend_dist()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    analizar._cargar_desde_disco()
    yield


app = FastAPI(title="Validador Turnos SAP HCM — Trenes Argentinos", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Los routers de /api van PRIMERO: tienen prioridad sobre el catch-all del SPA.
app.include_router(auth_router.router, prefix="/api")
app.include_router(analizar.router, prefix="/api")


# --- Modo unificado: servir el frontend compilado desde el mismo origen ---
# Solo si existe frontend/dist (es decir, si se corrió `npm run build`).
# En modo dev no hace falta: el frontend lo sirve Vite en :5173.
if FRONTEND_DIST.is_dir():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # El index.html NO se cachea (siempre se baja fresco, así toma el bundle
    # nuevo sin hard-refresh). Los assets con hash sí se cachean fuerte.
    _NO_CACHE = {"Cache-Control": "no-store, must-revalidate"}
    _INMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

    @app.get("/{full_path:path}")
    def servir_spa(full_path: str):
        # Si llega un /api/... hasta acá es porque ningún router lo resolvió: 404 real.
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Si pide un archivo estático concreto que existe, servirlo.
        archivo = FRONTEND_DIST / full_path
        if full_path and archivo.is_file():
            headers = _NO_CACHE if full_path.endswith(".html") else _INMUTABLE
            return FileResponse(archivo, headers=headers)
        # Cualquier otra ruta -> index.html (fallback de single-page app).
        return FileResponse(FRONTEND_DIST / "index.html", headers=_NO_CACHE)
else:
    @app.get("/")
    def root():
        return {
            "app": "Validador Turnos SAP HCM",
            "estado": "activo (sin frontend compilado — corré 'npm run build')",
        }
