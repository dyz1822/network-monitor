from sqlalchemy import Column, Integer, String
from app.database import Base


class Device(Base):

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String)

    ip_address = Column(String)

    status = Column(String, default="offline")