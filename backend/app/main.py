import asyncio
import os
import sys
import subprocess
import mimetypes

mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app import models


models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# PATH FIX FOR EXE
# =========================

def get_base_path():

    if getattr(sys, "frozen", False):
        return sys._MEIPASS

    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))


BASE_PATH = get_base_path()

FRONTEND_DIST = os.path.join(BASE_PATH, "frontend", "dist")


# =========================
# DATABASE MODELS
# =========================

class DeviceCreate(BaseModel):
    name: str
    ip: str


class DeleteMany(BaseModel):
    ids: list[int]


# =========================
# CRUD
# =========================

@app.post("/devices")
def add_device(device: DeviceCreate):

    db: Session = SessionLocal()

    new_device = models.Device(
        name=device.name,
        ip_address=device.ip,
        status="offline"
    )

    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    db.close()

    return new_device


@app.post("/devices/delete-many")
def delete_many(payload: DeleteMany):

    db: Session = SessionLocal()

    db.query(models.Device).filter(
        models.Device.id.in_(payload.ids)
    ).delete(synchronize_session=False)

    db.commit()
    db.close()

    return {"deleted": True}


# =========================
# PING FUNCTION
# =========================

def ping_ip(ip):

    try:

        result = subprocess.run(
            ["ping", "-n", "1", "-w", "500", ip],
            stdout=subprocess.DEVNULL
        )

        if result.returncode == 0:
            return "online"

        return "offline"

    except:
        return "offline"


# =========================
# BACKGROUND MONITOR
# =========================

async def monitor_devices():

    while True:

        db: Session = SessionLocal()

        devices = db.query(models.Device).all()

        for d in devices:

            status = ping_ip(d.ip_address)

            d.status = status

        db.commit()
        db.close()

        await asyncio.sleep(2)


@app.on_event("startup")
async def startup_event():

    asyncio.create_task(monitor_devices())


# =========================
# WEBSOCKET
# =========================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await websocket.accept()

    try:

        while True:

            db: Session = SessionLocal()

            devices = db.query(models.Device).all()

            data = []

            for d in devices:
                data.append({
                    "id": d.id,
                    "name": d.name,
                    "ip_address": d.ip_address,
                    "status": d.status
                })

            await websocket.send_json({
                "type": "devices",
                "data": data
            })

            db.close()

            await asyncio.sleep(2)

    except:
        pass


# =========================
# SERVE FRONTEND
# =========================

app.mount(
    "/assets",
    StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
    name="assets"
)


@app.get("/vite.svg")
async def vite_logo():
    return FileResponse(os.path.join(FRONTEND_DIST, "vite.svg"))


@app.get("/")
async def root():
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


@app.get("/{full_path:path}")
async def spa(full_path: str):
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))