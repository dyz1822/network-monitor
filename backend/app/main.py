import asyncio
import os
import sys
import subprocess
import mimetypes
import ipaddress
import concurrent.futures
import re
import time
from datetime import datetime, timedelta

mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

from fastapi import FastAPI, WebSocket, Query, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from jose import JWTError, jwt
from passlib.context import CryptContext

from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app import models

from app.device_detector import detect_device
from app.snmp_monitor import snmp_traffic

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
# PATH FIX
# =========================

def get_base_path():
    if getattr(sys, "frozen", False):
        return sys._MEIPASS
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))

BASE_PATH = get_base_path()
FRONTEND_DIST = os.path.join(BASE_PATH, "frontend", "dist")

# =========================
# AUTH CONFIG
# =========================

SECRET_KEY = "jlb-network-monitor-secret-2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("admin123"),
        "role": "admin"
    }
}

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None or username not in USERS_DB:
            raise HTTPException(status_code=401, detail="Token tidak valid")
        return USERS_DB[username]
    except JWTError:
        raise HTTPException(status_code=401, detail="Token tidak valid")

# =========================
# SCHEMAS
# =========================

class DeviceCreate(BaseModel):
    name: str
    ip: str

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip: Optional[str] = None

class DeleteMany(BaseModel):
    ids: list[int]

class ScanRequest(BaseModel):
    network: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# =========================
# AUTH ENDPOINTS
# =========================

@app.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = USERS_DB.get(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    token = create_access_token(
        {"sub": user["username"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@app.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["username"], "role": current_user["role"]}

@app.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    if not verify_password(payload.old_password, USERS_DB[username]["hashed_password"]):
        raise HTTPException(status_code=400, detail="Password lama salah")
    USERS_DB[username]["hashed_password"] = pwd_context.hash(payload.new_password)
    return {"success": True}

# =========================
# CRUD (protected)
# =========================

@app.get("/devices")
def get_devices(current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    devices = db.query(models.Device).all()
    db.close()
    return devices

@app.post("/devices")
def add_device(device: DeviceCreate, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    detected = detect_device(device.ip)
    new_device = models.Device(
        name=device.name,
        ip_address=device.ip,
        status=detected.get("status", "offline"),
        type=detected.get("type", "device")
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    db.close()
    return new_device

@app.patch("/devices/{device_id}")
def update_device(device_id: int, payload: DeviceUpdate, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        db.close()
        return {"error": "Device tidak ditemukan"}
    if payload.name is not None:
        device.name = payload.name
    if payload.ip is not None:
        device.ip_address = payload.ip
        detected = detect_device(payload.ip)
        device.type = detected.get("type", "device")
    db.commit()
    db.refresh(device)
    db.close()
    return device

@app.delete("/devices/{device_id}")
def delete_device(device_id: int, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    db.query(models.Device).filter(models.Device.id == device_id).delete(synchronize_session=False)
    db.query(models.DeviceLog).filter(models.DeviceLog.device_id == device_id).delete(synchronize_session=False)
    db.commit()
    db.close()
    return {"deleted": True}

@app.post("/devices/delete-many")
def delete_many(payload: DeleteMany, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    db.query(models.Device).filter(models.Device.id.in_(payload.ids)).delete(synchronize_session=False)
    db.query(models.DeviceLog).filter(models.DeviceLog.device_id.in_(payload.ids)).delete(synchronize_session=False)
    db.commit()
    db.close()
    return {"deleted": True}

# =========================
# LOGS & UPTIME
# =========================

@app.get("/devices/{device_id}/logs")
def get_logs(device_id: int, limit: int = Query(default=20), current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    logs = (
        db.query(models.DeviceLog)
        .filter(models.DeviceLog.device_id == device_id)
        .order_by(models.DeviceLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    db.close()
    return [{"status": l.status, "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S")} for l in logs]

_uptime_cache = {}
_uptime_cache_ttl = 60

@app.get("/devices/{device_id}/uptime")
def get_uptime(device_id: int, current_user: dict = Depends(get_current_user)):
    now = time.time()
    if device_id in _uptime_cache:
        cached_time, cached_data = _uptime_cache[device_id]
        if now - cached_time < _uptime_cache_ttl:
            return cached_data

    db: Session = SessionLocal()
    logs = (
        db.query(models.DeviceLog)
        .filter(models.DeviceLog.device_id == device_id)
        .order_by(models.DeviceLog.timestamp.asc())
        .all()
    )
    db.close()

    if len(logs) < 2:
        result = {"uptime_percent": None}
        _uptime_cache[device_id] = (now, result)
        return result

    total = (logs[-1].timestamp - logs[0].timestamp).total_seconds()
    if total == 0:
        result = {"uptime_percent": 100.0}
        _uptime_cache[device_id] = (now, result)
        return result

    online_dur = sum(
        (logs[i+1].timestamp - logs[i].timestamp).total_seconds()
        for i in range(len(logs)-1)
        if logs[i].status == "online"
    )
    result = {"uptime_percent": round((online_dur / total) * 100, 1)}
    _uptime_cache[device_id] = (now, result)
    return result

@app.delete("/devices/{device_id}/logs")
def clear_device_logs(device_id: int, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    db.query(models.DeviceLog).filter(models.DeviceLog.device_id == device_id).delete(synchronize_session=False)
    db.commit()
    db.close()
    if device_id in _uptime_cache:
        del _uptime_cache[device_id]
    return {"message": f"Log device {device_id} berhasil dihapus"}

# =========================
# EXPORT
# =========================

@app.get("/export/csv")
def export_csv(current_user: dict = Depends(get_current_user)):
    import io, csv
    db: Session = SessionLocal()
    devices = db.query(models.Device).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Nama", "IP Address", "Status", "Type", "Latency (ms)", "Last Seen"])
    for d in devices:
        writer.writerow([
            d.id, d.name, d.ip_address, d.status, d.type,
            d.latency if d.latency is not None else "-",
            d.last_seen.strftime("%Y-%m-%d %H:%M:%S") if d.last_seen else "-"
        ])
    db.close()
    output.seek(0)
    filename = f"jlb-network-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/export/report")
def export_report(current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    devices = db.query(models.Device).all()
    report_devices = []
    for d in devices:
        logs = (
            db.query(models.DeviceLog)
            .filter(models.DeviceLog.device_id == d.id)
            .order_by(models.DeviceLog.timestamp.desc())
            .limit(5).all()
        )
        all_logs = (
            db.query(models.DeviceLog)
            .filter(models.DeviceLog.device_id == d.id)
            .order_by(models.DeviceLog.timestamp.asc()).all()
        )
        uptime_pct = None
        if len(all_logs) >= 2:
            total = (all_logs[-1].timestamp - all_logs[0].timestamp).total_seconds()
            online_dur = sum(
                (all_logs[i+1].timestamp - all_logs[i].timestamp).total_seconds()
                for i in range(len(all_logs)-1) if all_logs[i].status == "online"
            )
            if total > 0:
                uptime_pct = round((online_dur / total) * 100, 1)
        report_devices.append({
            "id": d.id, "name": d.name, "ip_address": d.ip_address,
            "status": d.status, "type": d.type, "latency": d.latency,
            "last_seen": d.last_seen.strftime("%Y-%m-%d %H:%M:%S") if d.last_seen else None,
            "uptime_percent": uptime_pct,
            "recent_logs": [{"status": l.status, "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S")} for l in logs]
        })
    db.close()
    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_devices": len(report_devices),
        "online_count": sum(1 for d in report_devices if d["status"] == "online"),
        "offline_count": sum(1 for d in report_devices if d["status"] == "offline"),
        "devices": report_devices
    }

# =========================
# BACKUP & RESTORE
# =========================

@app.get("/backup")
def backup_config(current_user: dict = Depends(get_current_user)):
    import json
    db: Session = SessionLocal()
    devices = db.query(models.Device).all()
    data = [{"name": d.name, "ip_address": d.ip_address, "type": d.type} for d in devices]
    db.close()
    content = json.dumps({"exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "devices": data}, indent=2)
    filename = f"jlb-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

class RestorePayload(BaseModel):
    devices: list[dict]

@app.post("/restore")
def restore_config(payload: RestorePayload, current_user: dict = Depends(get_current_user)):
    db: Session = SessionLocal()
    added = 0
    for d in payload.devices:
        exists = db.query(models.Device).filter(models.Device.ip_address == d["ip_address"]).first()
        if not exists:
            new_device = models.Device(
                name=d.get("name", "Unknown"),
                ip_address=d["ip_address"],
                type=d.get("type", "device"),
                status="offline"
            )
            db.add(new_device)
            added += 1
    db.commit()
    db.close()
    return {"added": added, "skipped": len(payload.devices) - added}

# =========================
# PING + LATENCY
# =========================

def ping_ip(ip):
    try:
        result = subprocess.run(
            ["ping", "-n", "1", "-w", "500", ip],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
        output = result.stdout
        if result.returncode == 0:
            match = re.search(r"Average = (\d+)ms", output)
            if not match:
                match = re.search(r"time[=<](\d+)ms", output)
            latency = int(match.group(1)) if match else 0
            return "online", latency
        return "offline", None
    except:
        return "offline", None

# =========================
# SCAN
# =========================

def ping_single(ip):
    status, _ = ping_ip(str(ip))
    return str(ip) if status == "online" else None

@app.post("/scan")
def scan_network(payload: ScanRequest, current_user: dict = Depends(get_current_user)):
    try:
        net = ipaddress.ip_network(payload.network, strict=False)
    except ValueError:
        return {"error": "Format network tidak valid"}
    hosts = list(net.hosts())
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        results = list(executor.map(ping_single, hosts))
    return [ip for ip in results if ip is not None]

# =========================
# ✅ BACKGROUND MONITOR — DENGAN THRESHOLD COUNTER
# =========================

PING_INTERVAL = 2          # detik antar ping
CONFIRM_THRESHOLD = 3      # butuh N kali berturut-turut untuk ubah status

# Dict untuk menyimpan counter konfirmasi per device_id
# Format: { device_id: { "count": int, "candidate": "online"/"offline" } }
_confirm_counter: dict = {}

async def monitor_devices():
    while True:
        db: Session = SessionLocal()
        try:
            devices = db.query(models.Device).all()
            for d in devices:
                new_status, latency = ping_ip(d.ip_address)

                # Selalu update latency jika online
                if new_status == "online":
                    d.latency = latency
                    d.last_seen = datetime.now()
                else:
                    d.latency = None

                # ✅ LOGIKA THRESHOLD COUNTER
                if new_status == d.status:
                    # Status sama → reset counter kandidat
                    _confirm_counter[d.id] = {"count": 0, "candidate": new_status}
                else:
                    # Status berbeda dari DB → mulai / lanjutkan counter
                    state = _confirm_counter.get(d.id, {"count": 0, "candidate": new_status})

                    if state["candidate"] != new_status:
                        # Kandidat berubah arah → reset dari 1
                        _confirm_counter[d.id] = {"count": 1, "candidate": new_status}
                    else:
                        # Kandidat sama → tambah counter
                        state["count"] += 1
                        _confirm_counter[d.id] = state

                    # Jika counter sudah mencapai threshold → ubah status resmi
                    if _confirm_counter[d.id]["count"] >= CONFIRM_THRESHOLD:
                        old_status = d.status
                        d.status = new_status

                        # Tulis log perubahan status
                        log = models.DeviceLog(
                            device_id=d.id,
                            ip_address=d.ip_address,
                            status=new_status,
                            timestamp=datetime.now()
                        )
                        db.add(log)

                        # Invalidate cache uptime
                        if d.id in _uptime_cache:
                            del _uptime_cache[d.id]

                        # Reset counter setelah status resmi berubah
                        _confirm_counter[d.id] = {"count": 0, "candidate": new_status}

                        print(f"[MONITOR] {d.name} ({d.ip_address}): {old_status} → {new_status}")

            db.commit()
        except Exception as e:
            print(f"[MONITOR ERROR] {e}")
        finally:
            db.close()

        await asyncio.sleep(PING_INTERVAL)

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
            data = [{
                "id": d.id, "name": d.name, "ip_address": d.ip_address,
                "status": d.status, "type": d.type,
                "latency": getattr(d, "latency", None),
                "last_seen": d.last_seen.strftime("%H:%M:%S") if getattr(d, "last_seen", None) else None
            } for d in devices]
            await websocket.send_json({"type": "devices", "data": data})
            db.close()
            await asyncio.sleep(2)
    except:
        pass

# =========================
# SNMP & DETECT
# =========================

@app.get("/snmp/{ip}")
def snmp_router(ip: str, interface_index: int = Query(default=6)):
    return {"traffic": snmp_traffic(ip, interface_index=interface_index)}

@app.get("/detect/{ip}")
def detect(ip: str):
    return detect_device(ip)

# =========================
# DISK MONITOR
# =========================

import httpx

@app.get("/disk/{ip}")
async def get_disk(ip: str, current_user: dict = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"http://{ip}:9999")
            return res.json()
    except:
        return []

# =========================
# SERVE FRONTEND
# =========================

app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

@app.get("/vite.svg")
async def vite_logo():
    return FileResponse(os.path.join(FRONTEND_DIST, "vite.svg"))

@app.get("/")
async def root():
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

@app.get("/{full_path:path}")
async def spa(full_path: str):
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
