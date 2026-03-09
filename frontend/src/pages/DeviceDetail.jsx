import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` })

function LineChart({ data, color = "#3b82f6", unit = "ms", height = 100 }) {
    if (!data || data.length < 2) return (
        <div className="flex items-center justify-center h-24 text-gray-500 text-xs">Belum ada data cukup</div>
    )
    const vals = data.map(d => d.value)
    const max = Math.max(...vals, 1)
    const min = Math.min(...vals, 0)
    const range = max - min || 1
    const W = 400, H = height
    const pts = vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * W
        const y = H - ((v - min) / range) * (H - 12) - 6
        return `${x},${y}`
    }).join(" ")

    return (
        <div className="relative w-full" style={{ height: H + 20 }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H }}>
                <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <line key={i} x1="0" y1={H * v} x2={W} y2={H * v}
                        stroke="#374151" strokeWidth="0.5" strokeDasharray="4,4" />
                ))}
                <path
                    d={`M 0,${H} ${pts.split(" ").map(p => `L ${p}`).join(" ")} L ${W},${H} Z`}
                    fill="url(#lineGrad)"
                />
                <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {(() => {
                    const last = pts.split(" ").pop()
                    const [lx, ly] = last.split(",")
                    return <circle cx={lx} cy={ly} r="4" fill={color} />
                })()}
            </svg>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                <span>Min: {min}{unit}</span>
                <span className="text-center">Avg: {Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}{unit}</span>
                <span>Max: {max}{unit}</span>
            </div>
        </div>
    )
}

function SLABadge({ pct }) {
    if (pct === null || pct === undefined) return <span className="text-gray-400">—</span>
    const color = pct >= 99 ? "text-green-400" : pct >= 95 ? "text-yellow-400" : "text-red-400"
    const label = pct >= 99 ? "Excellent" : pct >= 95 ? "Good" : "Poor"
    return (
        <div className="flex flex-col items-center">
            <div className={`text-4xl font-bold ${color}`}>{pct}%</div>
            <div className={`text-xs mt-1 px-2 py-0.5 rounded-full font-medium
                ${pct >= 99 ? "bg-green-900 text-green-300" : pct >= 95 ? "bg-yellow-900 text-yellow-300" : "bg-red-900 text-red-300"}`}>
                {label}
            </div>
        </div>
    )
}

export default function DeviceDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [device, setDevice] = useState(null)
    const [logs, setLogs] = useState([])
    const [latencyHistory, setLatencyHistory] = useState([])
    const [uptime, setUptime] = useState(null)
    const [pingResult, setPingResult] = useState(null)
    const [pinging, setPinging] = useState(false)
    const [activeTab, setActiveTab] = useState("overview")
    const [clearingLog, setClearingLog] = useState(false)  // ✅ BARU
    const wsRef = useRef(null)

    const loadLogs = () => {
        fetch(`${window.location.origin}/devices/${id}/logs?limit=50`, { headers: authHeader() })
            .then(r => r.json()).then(setLogs)
    }

    const loadUptime = () => {
        fetch(`${window.location.origin}/devices/${id}/uptime`, { headers: authHeader() })
            .then(r => r.json()).then(d => setUptime(d?.uptime_percent))
    }

    useEffect(() => {
        loadLogs()
        loadUptime()

        const ws = new WebSocket(`ws://${window.location.host}/ws`)
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            if (msg.type === "devices") {
                const found = msg.data.find(d => d.id === parseInt(id))
                if (found) {
                    setDevice(found)
                    if (found.latency !== null) {
                        setLatencyHistory(prev => [...prev, {
                            value: found.latency,
                            time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        }].slice(-60))
                    }
                }
            }
        }
        wsRef.current = ws
        return () => ws.close()
    }, [id])

    // ✅ BARU: Fungsi Clear Log
    const clearLog = async () => {
        if (!confirm("Hapus semua log device ini? Data uptime juga akan direset.")) return
        setClearingLog(true)
        try {
            await fetch(`${window.location.origin}/devices/${id}/logs`, {
                method: "DELETE",
                headers: authHeader()
            })
            setLogs([])
            setUptime(null)
        } catch (e) { }
        setClearingLog(false)
    }

    const pingManual = async () => {
        if (!device) return
        setPinging(true); setPingResult(null)
        const start = Date.now()
        try {
            const res = await fetch(`${window.location.origin}/detect/${device.ip_address}`, { headers: authHeader() })
            const data = await res.json()
            const elapsed = Date.now() - start
            setPingResult({
                status: data.status,
                latency: data.latency ?? elapsed,
                time: new Date().toLocaleTimeString("id-ID")
            })
        } catch {
            setPingResult({ status: "error", latency: null, time: new Date().toLocaleTimeString("id-ID") })
        }
        setPinging(false)
    }

    const downtimeEvents = logs.filter(l => l.status === "offline")

    if (!device) return (
        <div className="flex items-center justify-center h-full text-gray-400 text-lg gap-3">
            <span className="animate-spin text-2xl">⟳</span> Memuat detail device...
        </div>
    )

    const getIcon = (name, type) => {
        if (type === "router") return "📡"
        const n = (name || "").toLowerCase()
        if (n.includes("router") || n.includes("gateway")) return "📡"
        if (n.includes("switch")) return "🔀"
        if (n.includes("server")) return "🗄️"
        if (n.includes("cctv") || n.includes("cam")) return "📷"
        if (n.includes("wifi") || n.includes("ap")) return "📶"
        if (n.includes("phone") || n.includes("mobile")) return "📱"
        return "🖥️"
    }

    const tabs = [
        { key: "overview", label: "📊 Overview" },
        { key: "latency", label: "⚡ Latency" },
        { key: "logs", label: `📋 Log (${logs.length})` },
    ]

    return (
        <div className="h-full overflow-auto">

            {/* HEADER */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <button onClick={() => navigate("/monitoring")}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
                    ← Kembali
                </button>
                <div className="text-3xl">{getIcon(device.name, device.type)}</div>
                <div>
                    <div className="text-xl font-bold text-white">{device.name}</div>
                    <div className="text-sm text-gray-400 font-mono">{device.ip_address}</div>
                </div>
                <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold
                        ${device.status === "online" ? "bg-green-900 text-green-300 border border-green-700" : "bg-red-900 text-red-300 border border-red-700"}`}>
                        ● {device.status}
                    </span>
                    <button onClick={pingManual} disabled={pinging}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2">
                        {pinging ? <><span className="animate-spin">⟳</span> Pinging...</> : "📡 Ping Manual"}
                    </button>
                </div>
            </div>

            {/* PING RESULT */}
            {pingResult && (
                <div className={`mb-4 px-4 py-3 rounded-lg border text-sm flex items-center gap-3
                    ${pingResult.status === "online" ? "bg-green-900/30 border-green-700 text-green-300"
                        : pingResult.status === "offline" ? "bg-red-900/30 border-red-700 text-red-300"
                            : "bg-gray-700 border-gray-600 text-gray-300"}`}>
                    <span className="text-xl">{pingResult.status === "online" ? "✅" : "❌"}</span>
                    <div>
                        <div className="font-semibold">
                            Ping {pingResult.status === "online" ? "Berhasil" : "Gagal"} — {pingResult.time}
                        </div>
                        <div className="text-xs opacity-75">
                            {pingResult.latency !== null ? `Latency: ${pingResult.latency}ms` : "Tidak dapat dijangkau"}
                        </div>
                    </div>
                    <button onClick={() => setPingResult(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
                </div>
            )}

            {/* TABS */}
            <div className="flex gap-0 mb-4 bg-gray-800 rounded-xl p-1 w-fit border border-gray-700">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition
                            ${activeTab === t.key ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-gray-200"}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ===== TAB OVERVIEW ===== */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col items-center justify-center gap-2">
                        <div className="text-xs text-gray-400 font-medium">📈 Uptime / SLA</div>
                        <SLABadge pct={uptime} />
                        <div className="text-[10px] text-gray-500 text-center">Berdasarkan {logs.length} perubahan status tercatat</div>
                    </div>

                    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col items-center justify-center gap-2">
                        <div className="text-xs text-gray-400 font-medium">⚡ Latency Sekarang</div>
                        <div className={`text-4xl font-bold ${device.latency === null ? "text-gray-400"
                            : device.latency < 20 ? "text-green-400"
                                : device.latency < 80 ? "text-yellow-400" : "text-red-400"}`}>
                            {device.latency !== null ? `${device.latency}ms` : "—"}
                        </div>
                        <div className={`text-xs px-2 py-0.5 rounded-full
                            ${device.latency === null ? "text-gray-400"
                                : device.latency < 20 ? "bg-green-900 text-green-300"
                                    : device.latency < 80 ? "bg-yellow-900 text-yellow-300"
                                        : "bg-red-900 text-red-300"}`}>
                            {device.latency === null ? "Offline" : device.latency < 20 ? "Excellent" : device.latency < 80 ? "Normal" : "High"}
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col items-center justify-center gap-2">
                        <div className="text-xs text-gray-400 font-medium">⚠️ Total Downtime Event</div>
                        <div className={`text-4xl font-bold ${downtimeEvents.length === 0 ? "text-green-400" : "text-red-400"}`}>
                            {downtimeEvents.length}
                        </div>
                        <div className="text-[10px] text-gray-500">Dari {logs.length} total log terakhir</div>
                    </div>

                    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col items-center justify-center gap-2">
                        <div className="text-xs text-gray-400 font-medium">🕐 Last Seen Online</div>
                        <div className="text-center">
                            <div className="text-lg font-bold text-white">{device.last_seen ?? "—"}</div>
                            <div className="text-xs text-gray-400 mt-1">Type: <span className="text-blue-400">{device.type}</span></div>
                        </div>
                    </div>

                    <div className="sm:col-span-2 bg-gray-800 rounded-xl p-4 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-300 mb-3">
                            ⚡ Latency Real-time (60 titik terakhir)
                            <span className="ml-2 text-gray-500 font-normal">{latencyHistory.length} sampel</span>
                        </div>
                        <LineChart data={latencyHistory} color="#3b82f6" unit="ms" height={80} />
                    </div>

                    <div className="sm:col-span-2 bg-gray-800 rounded-xl p-4 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-300 mb-3">📅 Status Timeline (10 terbaru)</div>
                        <div className="flex flex-col gap-1.5 overflow-auto max-h-36">
                            {logs.slice(0, 10).map((l, i) => (
                                <div key={i} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs
                                    ${l.status === "online" ? "bg-green-900/20 border border-green-900/50" : "bg-red-900/20 border border-red-900/50"}`}>
                                    <span className={`font-bold ${l.status === "online" ? "text-green-400" : "text-red-400"}`}>
                                        {l.status === "online" ? "▲ ONLINE" : "▼ OFFLINE"}
                                    </span>
                                    <span className="text-gray-400 font-mono ml-auto">{l.timestamp}</span>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <div className="text-gray-500 text-center py-4">Belum ada perubahan status tercatat</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ===== TAB LATENCY ===== */}
            {activeTab === "latency" && (
                <div className="flex flex-col gap-4">
                    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                        <div className="text-sm font-semibold text-gray-300 mb-4">
                            ⚡ Latency History — Real-time
                            <span className="ml-2 text-xs text-gray-500 font-normal">{latencyHistory.length} sampel terkumpul</span>
                        </div>
                        <LineChart data={latencyHistory} color="#3b82f6" unit="ms" height={160} />
                    </div>

                    {latencyHistory.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Latency Minimum", value: `${Math.min(...latencyHistory.map(d => d.value))}ms`, color: "text-green-400" },
                                { label: "Latency Rata-rata", value: `${Math.round(latencyHistory.reduce((a, b) => a + b.value, 0) / latencyHistory.length)}ms`, color: "text-blue-400" },
                                { label: "Latency Maksimum", value: `${Math.max(...latencyHistory.map(d => d.value))}ms`, color: "text-red-400" }
                            ].map((s, i) => (
                                <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
                                    <div className="text-xs text-gray-400 mb-1">{s.label}</div>
                                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===== TAB LOGS ===== */}
            {activeTab === "logs" && (
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">

                    {/* ✅ HEADER LOG + TOMBOL CLEAR */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-300">
                            📋 Riwayat Status Lengkap
                            <span className="ml-2 text-xs text-gray-500 font-normal">{logs.length} entri</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={loadLogs}
                                className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                                🔄 Refresh
                            </button>
                            <button
                                onClick={clearLog}
                                disabled={clearingLog || logs.length === 0}
                                className="text-xs bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                                {clearingLog ? "⏳ Menghapus..." : "🗑️ Clear Log"}
                            </button>
                        </div>
                    </div>

                    {logs.length === 0 ? (
                        <div className="text-gray-500 text-center py-12">
                            <div className="text-4xl mb-2">📭</div>
                            <div>Belum ada riwayat status.</div>
                        </div>
                    ) : (
                        <div className="overflow-auto max-h-[60vh]">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-gray-800">
                                    <tr className="text-gray-500 border-b border-gray-700">
                                        <th className="text-left pb-2">#</th>
                                        <th className="text-left pb-2">Status</th>
                                        <th className="text-left pb-2">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((l, i) => (
                                        <tr key={i} className="border-b border-gray-700/40 hover:bg-gray-700/30">
                                            <td className="py-2 text-gray-500">{i + 1}</td>
                                            <td className="py-2">
                                                <span className={`flex items-center gap-1.5 font-semibold
                                                    ${l.status === "online" ? "text-green-400" : "text-red-400"}`}>
                                                    {l.status === "online" ? "▲" : "▼"} {l.status}
                                                </span>
                                            </td>
                                            <td className="py-2 font-mono text-gray-400">{l.timestamp}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
