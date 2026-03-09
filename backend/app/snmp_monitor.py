from pysnmp.hlapi import *

community = "public"
INTERFACE_INDEX = 6


def snmp_get(ip, oid):
    iterator = getCmd(
        SnmpEngine(),
        CommunityData(community),
        UdpTransportTarget((ip, 161), timeout=1, retries=1),
        ContextData(),
        ObjectType(ObjectIdentity(oid))
    )
    errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
    if errorIndication or errorStatus:
        return None
    for varBind in varBinds:
        try:
            return int(varBind[1])
        except:
            # Jika tidak bisa dikonversi ke int (misal string sysDescr), tetap return True marker
            return -1


def snmp_traffic(ip, interface_index=None):
    idx = interface_index if interface_index else INTERFACE_INDEX

    in_oid  = f"1.3.6.1.2.1.31.1.1.1.6.{idx}"
    out_oid = f"1.3.6.1.2.1.31.1.1.1.10.{idx}"

    in1  = snmp_get(ip, in_oid)
    out1 = snmp_get(ip, out_oid)

    if in1 is None:
        return {"in": 0, "out": 0}

    import time
    time.sleep(1)

    in2  = snmp_get(ip, in_oid)
    out2 = snmp_get(ip, out_oid)

    if in2 is None:
        return {"in": 0, "out": 0}

    in_mbps  = round(((in2 - in1) * 8) / 1_000_000, 2)
    out_mbps = round(((out2 - out1) * 8) / 1_000_000, 2)

    return {"in": in_mbps, "out": out_mbps}


def snmp_is_available(ip):
    """
    Cek SNMP dengan beberapa OID fallback.
    Return True jika salah satu OID berhasil direspons.
    """
    oids_to_try = [
        "1.3.6.1.2.1.1.1.0",                          # sysDescr
        "1.3.6.1.2.1.1.3.0",                          # sysUpTime
        f"1.3.6.1.2.1.31.1.1.1.6.{INTERFACE_INDEX}",  # ifHCInOctets (traffic counter)
    ]

    for oid in oids_to_try:
        result = snmp_get(ip, oid)
        if result is not None:
            return True

    return False
