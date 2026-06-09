from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import analizar


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

app.include_router(analizar.router, prefix="/api")


@app.get("/")
def root():
    return {"app": "Validador Turnos SAP HCM", "estado": "activo"}
