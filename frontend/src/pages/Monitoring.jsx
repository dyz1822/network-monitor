import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { getDeviceLogs, updateDevice, getDeviceUptime } from "../api/api"

// ============ LATENCY SPARKLINE ============
function LatencyChart({ data }) {
    if (!data || data.length < 2) return null
    const max = Math.max(...data, 1)
    const w = 100, h = 28
    const pts = data.map((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - (v / max) * h
        return `${x},${y}`
    }).join(" ")
    const color = data[data.length - 1] < 20 ? "#22c55e" : data[data.length - 1] < 80 ? "#eab308" : "#ef4444"
    return (
        <svg width={w} height={h} className="overflow-visible">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    )
}

// ============ TRAFFIC SPARKLINE ============
function TrafficChart({ data }) {
    if (!data || data.length < 2) return null
    const max = Math.max(...data.map(d => d.value), 1)
    const w = 120, h = 36
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - (d.value / max) * h
        return `${x},${y}`
    }).join(" ")
    return (
        <svg width={w} height={h} className="overflow-visible">
            <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    )
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = "square"
        o.frequency.setValueAtTime(880, ctx.currentTime)
        g.gain.setValueAtTime(0.3, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4)
    } catch (e) { }
}

function requestNotifPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission()
    }
}

function sendWindowsNotif(title, body, isOffline) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body,
            icon: isOffline
                ? "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚠️</text></svg>"
                : "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✅</text></svg>"
        })
    }
}

function LatencyBadge({ latency }) {
    if (latency === null || latency === undefined)
        return <span className="text-gray-400 text-[10px]">— ms</span>
    const color = latency < 20 ? "text-green-400" : latency < 80 ? "text-yellow-400" : "text-red-400"
    return <span className={`text-[10px] font-mono font-bold ${color}`}>{latency} ms</span>
}

function formatTime(raw) {
    if (!raw) return "—"
    try {
        const d = new Date(raw)
        if (!isNaN(d)) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch (e) { }
    return raw
}

export default function Monitoring() {
    const navigate = useNavigate()

    const [devices, setDevices] = useState([])
    const [selected, setSelected] = useState([])
    const [snmpData, setSnmpData] = useState({})
    const [snmpHistory, setSnmpHistory] = useState({})
    const [latencyHistory, setLatencyHistory] = useState({})
    const [logModal, setLogModal] = useState(null)
    const [logs, setLogs] = useState([])
    const [alerts, setAlerts] = useState([])
    const [muteAlert, setMuteAlert] = useState(false)
    const [editModal, setEditModal] = useState(null)
    const [editName, setEditName] = useState("")
    const [editIp, setEditIp] = useState("")
    const [loadingEdit, setLoadingEdit] = useState(false)
    const [addModal, setAddModal] = useState(false)
    const [addName, setAddName] = useState("")
    const [addIp, setAddIp] = useState("")
    const [loadingAdd, setLoadingAdd] = useState(false)
    const [uptime, setUptime] = useState({})
    const [search, setSearch] = useState("")
    const [filterStatus, setFilterStatus] = useState("all")
    const [filterType, setFilterType] = useState("all")
    const [sortBy, setSortBy] = useState("name")
    const [trafficThreshold, setTrafficThreshold] = useState(
        Number(localStorage.getItem("trafficThreshold") || 900)
    )
    const [showThresholdInput, setShowThresholdInput] = useState(false)
    const [thresholdInput, setThresholdInput] = useState("")

    const prevStatusRef = useRef({})
    const muteAlertRef = useRef(false)
    const addAlertRef = useRef(null)

    useEffect(() => { muteAlertRef.current = muteAlert }, [muteAlert])
    useEffect(() => { requestNotifPermission() }, [])

    const filteredDevices = devices
        .filter(d => {
            const q = search.toLowerCase()
            const matchSearch = !q || d.name.toLowerCase().includes(q) || d.ip_address.includes(q)
            const matchStatus = filterStatus === "all" || d.status === filterStatus
            const matchType = filterType === "all" || d.type === filterType
            return matchSearch && matchStatus && matchType
        })
        .sort((a, b) => {
            if (sortBy === "latency") return (a.latency ?? 9999) - (b.latency ?? 9999)
            if (sortBy === "status") return a.status.localeCompare(b.status)
            return a.name.localeCompare(b.name)
        })

    const uniqueTypes = [...new Set(devices.map(d => d.type))]
    const totalDevices = devices.length
    const totalOnline = devices.filter(d => d.status === "online").length
    const totalOffline = devices.filter(d => d.status === "offline").length
    const avgLatency = (() => {
        const online = devices.filter(d => d.latency != null && d.status === "online")
        if (!online.length) return null
        return Math.round(online.reduce((a, b) => a + b.latency, 0) / online.length)
    })()

    const getDeviceIcon = (type, name) => {
        if (type === "router") return "📡"
        if (!name) return "🖥️"
        const n = name.toLowerCase()
        if (n.includes("router") || n.includes("gateway") || n.includes("mikrotik") || n.includes("modem")) return "📡"
        if (n.includes("switch")) return "🔀"
        if (n.includes("server")) return "🗄️"
        if (n.includes("cctv") || n.includes("cam")) return "📷"
        if (n.includes("phone") || n.includes("mobile")) return "📱"
        if (n.includes("wifi") || n.includes("ap") || n.includes("access")) return "📶"
        return "🖥️"
    }

    const loadSNMP = async (ip) => {
        try {
            const token = localStorage.getItem("token")
            const res = await fetch(`${window.location.origin}/snmp/${ip}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            const inVal = data?.traffic?.in ?? 0
            setSnmpData(prev => ({ ...prev, [ip]: data }))
            setSnmpHistory(prev => {
                const hist = prev[ip] || []
                return { ...prev, [ip]: [...hist, { value: inVal, t: Date.now() }].slice(-20) }
            })
        } catch (e) { }
    }

    const openAdd = () => { setAddModal(true); setAddName(""); setAddIp("") }
    const closeAdd = () => { setAddModal(false); setAddName(""); setAddIp("") }

    const saveAdd = async () => {
        if (!addName || !addIp) return
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
        if (!ipRegex.test(addIp)) { alert("Format IP tidak valid. Contoh: 192.168.1.1"); return }
        setLoadingAdd(true)
        const token = localStorage.getItem("token")
        await fetch(`${window.location.origin}/devices`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: addName, ip: addIp })
        })
        setLoadingAdd(false)
        closeAdd()
        try {
            const res = await fetch(`${window.location.origin}/devices`, { headers: { Authorization: `Bearer ${token}` } })
            const data = await res.json()
            if (Array.isArray(data)) setDevices(data)
        } catch (e) { }
    }

    const openEdit = () => {
        if (selected.length !== 1) return
        const device = devices.find(d => d.id === selected[0])
        if (!device) return
        setEditModal(device); setEditName(device.name); setEditIp(device.ip_address)
    }
    const closeEdit = () => { setEditModal(null); setEditName(""); setEditIp("") }
    const saveEdit = async () => {
        if (!editName || !editIp) return
        setLoadingEdit(true)
        await updateDevice(editModal.id, editName, editIp)
        setLoadingEdit(false); setSelected([]); closeEdit()
    }

    const deleteSelected = async () => {
        if (!selected.length) return
        if (!confirm(`Hapus ${selected.length} device?`)) return
        const token = localStorage.getItem("token")
        const deletedIps = devices.filter(d => selected.includes(d.id)).map(d => d.ip_address)
        await fetch(`${window.location.origin}/devices/delete-many`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: selected })
        })
        setLatencyHistory(prev => { const n = { ...prev }; selected.forEach(id => delete n[id]); return n })
        setSnmpData(prev => { const n = { ...prev }; deletedIps.forEach(ip => delete n[ip]); return n })
        setSnmpHistory(prev => { const n = { ...prev }; deletedIps.forEach(ip => delete n[ip]); return n })
        setUptime(prev => { const n = { ...prev }; selected.forEach(id => delete n[id]); return n })
        selected.forEach(id => delete prevStatusRef.current[id])
        setSelected([])
    }

    const toggleSelect = (id) =>
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const openLog = async (device) => {
        setLogModal(device)
        try {
            const data = await getDeviceLogs(device.id, 30)
            if (Array.isArray(data)) setLogs(data)
            else setLogs([])
        } catch (e) { setLogs([]) }
    }
    const closeLog = () => { setLogModal(null); setLogs([]) }

    const clearLog = async (deviceId) => {
        if (!confirm("Hapus semua log device ini?")) return
        const token = localStorage.getItem("token")
        await fetch(`${window.location.origin}/devices/${deviceId}/logs`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        })
        setLogs([])
    }

    const addAlert = useCallback((device, status) => {
        const id = Date.now()
        const msg = status === "offline"
            ? `⚠️ ${device.name} (${device.ip_address}) went OFFLINE`
            : `✅ ${device.name} (${device.ip_address}) is back ONLINE`
        setAlerts(prev => [{ id, msg, status }, ...prev.slice(0, 4)])
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 8000)
        try {
            const newAlert = { name: device.name, ip: device.ip_address, status, time: new Date().toLocaleTimeString("id-ID") }
            const existing = JSON.parse(localStorage.getItem("alertHistory") || "[]")
            localStorage.setItem("alertHistory", JSON.stringify([...existing, newAlert].slice(-50)))
        } catch (e) { }
    }, [])

    useEffect(() => { addAlertRef.current = addAlert }, [addAlert])

    const loadUptime = async (deviceId) => {
        try {
            const data = await getDeviceUptime(deviceId)
            setUptime(prev => ({ ...prev, [deviceId]: data?.uptime_percent }))
        } catch (e) { }
    }

    useEffect(() => {
        let ws, retryTimer
        const connect = () => {
            ws = new WebSocket(`ws://${window.location.host}/ws`)
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type === "devices") {
                        const incoming = msg.data
                        if (!Array.isArray(incoming)) return
                        incoming.forEach(d => {
                            const prev = prevStatusRef.current[d.id]
                            if (prev !== undefined && prev !== d.status) {
                                addAlertRef.current?.(d, d.status)
                                if (!muteAlertRef.current) playBeep()
                                sendWindowsNotif(
                                    d.status === "offline" ? `⚠️ ${d.name} OFFLINE` : `✅ ${d.name} ONLINE`,
                                    `IP: ${d.ip_address}`, d.status === "offline"
                                )
                            }
                            prevStatusRef.current[d.id] = d.status
                            if (d.latency !== null && d.latency !== undefined) {
                                setLatencyHistory(prev => {
                                    const hist = prev[d.id] || []
                                    return { ...prev, [d.id]: [...hist, d.latency].slice(-20) }
                                })
                            }
                        })
                        setDevices(incoming)
                        incoming.forEach(d => { if (d.type === "router" && d.status === "online") loadSNMP(d.ip_address) })
                    }
                } catch (e) { }
            }
            ws.onclose = () => { retryTimer = setTimeout(connect, 3000) }
            ws.onerror = () => { if (ws.readyState !== WebSocket.CLOSED) ws.close() }
        }
        connect()
        return () => {
            clearTimeout(retryTimer)
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close()
        }
    }, [])

    useEffect(() => {
        if (devices.length === 0) return
        const unloaded = devices.filter(d => uptime[d.id] === undefined)
        unloaded.forEach((d, i) => { setTimeout(() => loadUptime(d.id), i * 300) })
    }, [devices.length])

    useEffect(() => {
        const interval = setInterval(() => {
            devices.filter(d => d.type === "router" && d.status === "online")
                .forEach(d => loadSNMP(d.ip_address))
        }, 5000)
        return () => clearInterval(interval)
    }, [devices])

    return (
        <div className="h-full flex flex-col gap-3">

            {/* ALERT BAR */}
            {alerts.length > 0 && (
                <div className="flex flex-col gap-1">
                    {alerts.map(a => (
                        <div key={a.id} className={`flex items-center justify-between px-4 py-2 rounded text-sm font-semibold
                            ${a.status === "offline" ? "bg-red-700 text-white" : "bg-green-700 text-white"}`}>
                            <span>{a.msg}</span>
                            <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} className="ml-4 text-lg opacity-70 hover:opacity-100">✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* SUMMARY BAR */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                    { label: "Total Device", value: totalDevices, color: "text-blue-500" },
                    { label: "Online", value: totalOnline, color: "text-green-500" },
                    { label: "Offline", value: totalOffline, color: "text-red-500" },
                    {
                        label: "Avg Latency",
                        value: avgLatency !== null ? `${avgLatency}ms` : "—",
                        color: avgLatency === null ? "text-gray-400" : avgLatency < 20 ? "text-green-500" : avgLatency < 80 ? "text-yellow-500" : "text-red-500"
                    }
                ].map((s, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* TOOLBAR */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
                <button onClick={openAdd} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded">➕ Add Device</button>
                <button onClick={openEdit} disabled={selected.length !== 1} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white px-3 py-1.5 rounded">✏️ Edit</button>
                <button onClick={deleteSelected} disabled={!selected.length} className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white px-3 py-1.5 rounded">🗑️ Delete ({selected.length})</button>
                {selected.length > 0 && (
                    <button onClick={() => setSelected([])} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-xs">✕ Clear</button>
                )}
                <div className="ml-auto">
                    <button onClick={() => setMuteAlert(!muteAlert)}
                        className={`px-3 py-1.5 rounded text-xs ${muteAlert ? "bg-gray-300 dark:bg-gray-700 text-gray-500" : "bg-yellow-500 text-white"}`}>
                        {muteAlert ? "🔇 Muted" : "🔔 Sound ON"}
                    </button>
                </div>
            </div>

            {/* SEARCH + FILTER + SORT */}
            <div className="flex flex-wrap gap-2 items-center text-sm">
                <div className="relative flex-1 min-w-[160px]">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 pl-8 pr-3 py-1.5 rounded text-sm"
                        placeholder="Cari nama atau IP..."
                        value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
                    )}
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1.5 rounded text-sm">
                    <option value="all">🔘 Semua Status</option>
                    <option value="online">🟢 Online</option>
                    <option value="offline">🔴 Offline</option>
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1.5 rounded text-sm">
                    <option value="all">📦 Semua Type</option>
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1.5 rounded text-sm">
                    <option value="name">🔤 Sort: Nama</option>
                    <option value="latency">⚡ Sort: Latency</option>
                    <option value="status">🟢 Sort: Status</option>
                </select>
                <div className="flex items-center gap-1 text-xs">
                    {showThresholdInput ? (
                        <div className="flex gap-1 items-center">
                            <input
                                className="w-20 bg-white dark:bg-gray-800 border border-orange-400 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-xs"
                                placeholder="Mbps" value={thresholdInput}
                                onChange={e => setThresholdInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        const v = Number(thresholdInput)
                                        if (v > 0) { setTrafficThreshold(v); localStorage.setItem("trafficThreshold", v) }
                                        setShowThresholdInput(false)
                                    }
                                }} autoFocus
                            />
                            <button onClick={() => setShowThresholdInput(false)} className="text-gray-400">✕</button>
                        </div>
                    ) : (
                        <button onClick={() => { setThresholdInput(trafficThreshold); setShowThresholdInput(true) }}
                            className="bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 px-2 py-1 rounded text-xs hover:bg-orange-200">
                            ⚠️ Threshold: {trafficThreshold} Mbps
                        </button>
                    )}
                </div>
                <span className="text-xs text-gray-400 ml-auto hidden sm:block">
                    {filteredDevices.length} dari {totalDevices} device
                </span>
            </div>

            {/* DEVICE GRID */}
            <div className="flex-1 overflow-auto">
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                    {filteredDevices.map((d) => {
                        const snmp = snmpData[d.ip_address]
                        const trafficIn = snmp?.traffic?.in ?? 0
                        const isTrafficAlert = snmp && trafficIn > trafficThreshold
                        return (
                            <div key={d.id}
                                className={`rounded-xl p-4 text-sm transition-all relative cursor-pointer
                                    ${d.status === "offline" ? "bg-red-50 dark:bg-red-950 border-2 border-red-400 animate-pulse"
                                        : isTrafficAlert ? "bg-orange-50 dark:bg-orange-950 border-2 border-orange-400"
                                            : selected.includes(d.id) ? "bg-blue-50 dark:bg-gray-700 border-2 border-blue-500 shadow-lg"
                                                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600"}`}
                                onClick={() => toggleSelect(d.id)}>

                                {selected.includes(d.id) && (
                                    <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>
                                )}
                                {isTrafficAlert && (
                                    <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">⚠️ HIGH</div>
                                )}

                                <div className="text-4xl text-center mb-2 select-none mt-1">{getDeviceIcon(d.type, d.name)}</div>
                                <div className="font-bold text-center truncate text-gray-800 dark:text-gray-100" title={d.name}>{d.name}</div>
                                <div className="text-center text-gray-500 dark:text-gray-400 text-xs font-mono truncate">{d.ip_address}</div>

                                <div className="flex items-center justify-center gap-2 mt-2">
                                    <span className={`text-xs font-semibold ${d.status === "online" ? "text-green-500" : "text-red-500"}`}>● {d.status}</span>
                                    {d.status === "online" && <LatencyBadge latency={d.latency} />}
                                </div>

                                {latencyHistory[d.id]?.length >= 2 && d.status === "online" && (
                                    <div className="flex justify-center mt-1">
                                        <LatencyChart data={latencyHistory[d.id]} />
                                    </div>
                                )}

                                <div className="text-center text-[10px] text-gray-400 mt-0.5">
                                    {d.status === "online" ? `Last seen: ${formatTime(d.last_seen)}` : d.last_seen ? `Last online: ${formatTime(d.last_seen)}` : "Never seen"}
                                </div>

                                <div className="flex justify-center items-center gap-2 mt-1.5 flex-wrap">
                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">{d.type}</span>
                                    {uptime[d.id] !== undefined && uptime[d.id] !== null && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                                            ${uptime[d.id] >= 95 ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
                                                : uptime[d.id] >= 80 ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400"
                                                    : "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400"}`}>
                                            ↑ {uptime[d.id]}%
                                        </span>
                                    )}
                                </div>

                                {snmp && (
                                    <div className={`mt-3 rounded-lg p-2 ${isTrafficAlert ? "bg-orange-100 dark:bg-orange-900" : "bg-gray-50 dark:bg-gray-700"}`}>
                                        <div className={`text-[11px] font-semibold text-center mb-1 ${isTrafficAlert ? "text-orange-500" : "text-blue-500"}`}>
                                            {isTrafficAlert ? "⚠️ Traffic HIGH" : "Traffic (Mbps)"}
                                        </div>
                                        <TrafficChart data={snmpHistory[d.ip_address] || []} />
                                        <div className="flex justify-between text-[11px] mt-1">
                                            <span><span className="text-gray-400">IN </span><span className={`font-mono font-bold ${isTrafficAlert ? "text-orange-500" : "text-green-500"}`}>{trafficIn}</span></span>
                                            <span><span className="text-gray-400">OUT </span><span className="text-blue-500 font-mono font-bold">{snmp.traffic?.out ?? 0}</span></span>
                                        </div>
                                    </div>
                                )}

                                {/* ===== TOMBOL AKSI ===== */}
                                <div className="flex gap-1 mt-2">
                                    <button onClick={e => { e.stopPropagation(); navigate(`/device/${d.id}`) }}
                                        className="flex-1 text-[11px] bg-blue-900/40 hover:bg-blue-900/70 text-blue-400 rounded py-1 text-center transition">
                                        🔍 Detail
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); openLog(d) }}
                                        className="flex-1 text-[11px] bg-gray-700/40 hover:bg-gray-700/70 text-yellow-500 rounded py-1 text-center transition">
                                        📋 Log
                                    </button>
                                </div>

                                {/* ===== TOMBOL VNC ===== */}
                                <button
                                    onClick={e => {
                                        e.stopPropagation()
                                        if (d.status !== "online") { alert(`${d.name} sedang offline, tidak dapat remote.`); return }
                                        window.open(`vnc://${d.ip_address.trim()}`, "_blank")
                                    }}
                                    disabled={d.status !== "online"}
                                    title={d.status === "online" ? `VNC Remote ke ${d.ip_address}` : "Device offline"}
                                    className={`w-full mt-1 text-[11px] rounded py-1 text-center transition font-medium
                                        ${d.status === "online"
                                            ? "bg-purple-900/40 hover:bg-purple-900/70 text-purple-400 cursor-pointer"
                                            : "bg-gray-800/40 text-gray-600 cursor-not-allowed opacity-40"}`}>
                                    🖥️ VNC Remote
                                </button>
                            </div>
                        )
                    })}

                    {filteredDevices.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                            <div className="text-5xl">{devices.length === 0 ? "🌐" : "🔍"}</div>
                            <div className="text-lg font-semibold">{devices.length === 0 ? "Belum ada device" : "Tidak ada hasil"}</div>
                            <div className="text-sm">{devices.length === 0 ? "Klik ➕ Add Device untuk menambahkan" : "Coba ubah filter atau kata kunci pencarian"}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== ADD MODAL ===== */}
            {addModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl p-6 w-full sm:w-80 shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <div className="font-bold text-gray-800 dark:text-white text-lg">➕ Add Device</div>
                            <button onClick={closeAdd} className="text-gray-400 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Nama Device</label>
                                <input className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm"
                                    placeholder="contoh: Router Utama" value={addName} onChange={e => setAddName(e.target.value)} autoFocus />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">IP Address</label>
                                <input className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-mono"
                                    placeholder="192.168.1.1" value={addIp} onChange={e => setAddIp(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && saveAdd()} />
                            </div>
                            <div className="flex gap-2 mt-1">
                                <button onClick={saveAdd} disabled={loadingAdd} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl">
                                    {loadingAdd ? "Menambahkan..." : "➕ Tambah"}
                                </button>
                                <button onClick={closeAdd} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl">Batal</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== EDIT MODAL ===== */}
            {editModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl p-6 w-full sm:w-80 shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <div className="font-bold text-gray-800 dark:text-white text-lg">✏️ Edit Device</div>
                            <button onClick={closeEdit} className="text-gray-400 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Nama</label>
                                <input className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm"
                                    value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">IP Address</label>
                                <input className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-mono"
                                    value={editIp} onChange={e => setEditIp(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && saveEdit()} />
                            </div>
                            <div className="flex gap-2 mt-1">
                                <button onClick={saveEdit} disabled={loadingEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl">
                                    {loadingEdit ? "Menyimpan..." : "💾 Simpan"}
                                </button>
                                <button onClick={closeEdit} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl">Batal</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== LOG MODAL ===== */}
            {logModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl p-5 w-full sm:w-96 max-h-[80vh] flex flex-col shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <div className="font-bold text-gray-800 dark:text-white text-lg">📋 {logModal.name}</div>
                                <div className="text-xs text-gray-400 font-mono">{logModal.ip_address}</div>
                            </div>
                            <button onClick={closeLog} className="text-gray-400 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="overflow-auto flex-1">
                            {logs.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <div className="text-4xl mb-2">📭</div>
                                    <div className="text-sm">Belum ada log tersedia</div>
                                </div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white dark:bg-gray-900">
                                        <tr className="text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                            <th className="text-left pb-2">#</th>
                                            <th className="text-left pb-2">Status</th>
                                            <th className="text-left pb-2">Waktu</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((l, i) => (
                                            <tr key={i} className="border-b border-gray-100 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                <td className="py-1.5 text-gray-400">{i + 1}</td>
                                                <td className="py-1.5">
                                                    <span className={`font-semibold flex items-center gap-1
                                                        ${l.status === "online" ? "text-green-500" : "text-red-500"}`}>
                                                        {l.status === "online" ? "▲" : "▼"} {l.status}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 font-mono text-gray-500">{formatTime(l.timestamp)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                            <button
                                onClick={() => clearLog(logModal.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-medium">
                                🗑️ Clear Log
                            </button>
                            <button
                                onClick={() => { closeLog(); navigate(`/device/${logModal.id}`) }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium">
                                🔍 Detail Lengkap
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
