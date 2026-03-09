from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base


class Device(Base):
    __tablename__ = "devices"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String)
    ip_address = Column(String)
    status     = Column(String, default="offline")
    type       = Column(String, default="device")
    latency    = Column(Integer, nullable=True)
    last_seen  = Column(DateTime, nullable=True)


class DeviceLog(Base):
    __tablename__ = "device_logs"

    id         = Column(Integer, primary_key=True, index=True)
    device_id  = Column(Integer)
    ip_address = Column(String)
    status     = Column(String)
    timestamp  = Column(DateTime, default=datetime.now)
