import subprocess
from app.snmp_monitor import snmp_is_available


def ping(ip):
    try:
        result = subprocess.run(
            ["ping", "-n", "2", "-w", "1000", ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except:
        return False


def detect_device(ip):
    online = ping(ip)

    if not online:
        return {
            "ip": ip,
            "status": "offline",
            "type": "unknown"
        }

    if snmp_is_available(ip):
        device_type = "router"
    else:
        device_type = "device"

    return {
        "ip": ip,
        "status": "online",
        "type": device_type
    }
