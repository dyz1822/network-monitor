from pydantic import BaseModel


class DeviceCreate(BaseModel):
    name: str
    ip: str


class DeviceOut(BaseModel):
    id: int
    name: str
    ip_address: str
    status: str
    latency: float

    class Config:
        from_attributes = True