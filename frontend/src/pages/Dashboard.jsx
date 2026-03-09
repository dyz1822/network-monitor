import { useEffect, useState, useRef } from "react"

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` })

function formatTime(raw) {
    if (!raw) return "—"
    try {
        const d = new Date(raw)
        if (!isNaN(d)) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch (e) { }
    return raw
}

function PieChart({ online, offline }) {
    const total = online + offline
    if (total === 0) return <div className="text-gray-400 text-xs text-center py-4">Belum ada device</div>
    const r = 60, cx = 70, cy = 70
    const onlineAngle = (online / total) * 360
    const toRad = (deg) => (deg - 90) * (Math.PI / 180)
    const x1 = cx + r * Math.cos(toRad(0))
    const y1 = cy + r * Math.sin(toRad(0))
    const x2 = cx + r * Math.cos(toRad(onlineAngle))
    const y2 = cy + r * Math.sin(toRad(onlineAngle))
    const largeArc = onlineAngle > 180 ? 1 : 0

    if (online === 0) return (
        <svg width="140" height="140">
            <circle cx={cx} cy={cy} r={r} fill="#ef4444" />
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#1f2937" />
        </svg>
    )
    if (offline === 0) return (
        <svg width="140" height="140">
            <circle cx={cx} cy={cy} r={r} fill="#22c55e" />
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#1f2937" />
        </svg>
    )
    return (
        <svg width="140" height="140">
            <circle cx={cx} cy={cy} r={r} fill="#ef4444" />
            <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill="#22c55e" />
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#1f2937" />
            <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="18" fontWeight="bold">
                {Math.round((online / total) * 100)}%
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="#9ca3af" fontSize="10">Available</text>
        </svg>
    )
}

function MiniLineChart({ data, color = "#3b82f6", height = 60 }) {
    if (!data || data.length < 2) return <div className="text-gray-500 text-xs text-center py-4">Belum ada data</div>
    const vals = data.map(d => d.value)
    const max = Math.max(...vals, 1)
    const min = Math.min(...vals, 0)
    const range = max - min || 1
    const W = 300, H = height
    const pts = vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * W
        const y = H - ((v - min) / range) * (H - 8) - 4
        return `${x},${y}`
    }).join(" ")

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
            <defs>
                <linearGradient id="grad-line" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d={`M 0,${H} ${pts.split(" ").map(p => `L ${p}`).join(" ")} L ${W},${H} Z`}
                fill="url(#grad-line)"
            />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
    )
}

function BarChart({ data }) {
    if (!data || data.length === 0) return <div className="text-gray-500 text-xs text-center py-4">Belum ada data</div>
    const max = Math.max(...data.map(d => d.latency), 1)
    const H = 80, W = 280
    const barW = Math.floor((W / data.length) * 0.6)
    const gap = W / data.length

    return (
        <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: "100%", height: H + 20 }}>
            {data.map((d, i) => {
                const barH = Math.max((d.latency / max) * H, 2)
                const x = i * gap + gap / 2 - barW / 2
                const y = H - barH
                const color = d.latency < 20 ? "#22c55e" : d.latency < 80 ? "#eab308" : "#ef4444"
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
                        <text x={x + barW / 2} y={H + 14} textAnchor="middle" fill="#9ca3af" fontSize="9">
                            {d.name.length > 6 ? d.name.slice(0, 6) + "…" : d.name}
                        </text>
                        <text x={x + barW / 2} y={y - 3} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold">
                            {d.latency}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

export default function Dashboard() {
    const [devices, setDevices] = useState([])
    const [alertHistory, setAlertHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem("alertHistory") || "[]") } catch { return [] }
    })
    const [availHistory, setAvailHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem("availHistory") || "[]") } catch { return [] }
    })
    const [loading, setLoading] = useState(true)

    const onlineRef = useRef(0)
    const totalRef = useRef(0)

    // ✅ FIX: Guard Array.isArray + catch 401
    const online = Array.isArray(devices) ? devices.filter(d => d.status === "online").length : 0
    const offline = Array.isArray(devices) ? devices.filter(d => d.status === "offline").length : 0

    useEffect(() => { onlineRef.current = online }, [online])
    useEffect(() => { totalRef.current = devices.length }, [devices.length])

    const avgLatency = (() => {
        if (!Array.isArray(devices)) return null
        const ol = devices.filter(d => d.latency != null && d.status === "online")
        if (!ol.length) return null
        return Math.round(ol.reduce((a, b) => a + b.latency, 0) / ol.length)
    })()

    const topLatency = Array.isArray(devices)
        ? [...devices]
            .filter(d => d.latency != null && d.status === "online")
            .sort((a, b) => b.latency - a.latency)
            .slice(0, 6)
            .map(d => ({ name: d.name, latency: d.latency }))
        : []

    useEffect(() => {
        // ✅ FIX: Guard Array.isArray + handle 401 redirect ke login
        fetch(`${window.location.origin}/devices`, { headers: authHeader() })
            .then(r => {
                if (r.status === 401) {
                    localStorage.removeItem("token")
                    window.location.href = "/login"
                    return []
                }
                return r.json()
            })
            .then(data => {
                if (Array.isArray(data)) setDevices(data)
                else setDevices([])
                setLoading(false)
            })
            .catch(() => {
                setDevices([])
                setLoading(false)
            })
    }, [])

    useEffect(() => {
        if (!Array.isArray(devices) || devices.length === 0) return

        const snap = () => {
            const pct = totalRef.current > 0
                ? Math.round((onlineRef.current / totalRef.current) * 100)
                : 0
            setAvailHistory(prev => {
                const updated = [...prev, { value: pct, t: Date.now() }].slice(-60)
                try { localStorage.setItem("availHistory", JSON.stringify(updated)) } catch (e) { }
                return updated
            })
        }

        snap()
        const interval = setInterval(snap, 60000)
        return () => clearInterval(interval)
    }, [devices.length])

    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === "alertHistory") {
                try { setAlertHistory(JSON.parse(e.newValue || "[]")) } catch (err) { }
            }
        }
        window.addEventListener("storage", onStorage)
        return () => window.removeEventListener("storage", onStorage)
    }, [])

    if (loading) return (
        <div className="flex items-center justify-center h-full text-gray-400 text-lg gap-3">
            <span className="animate-spin text-2xl">⟳</span> Memuat dashboard...
        </div>
    )

    return (
        <div className="h-full overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">

                {/* ===== SUMMARY CARDS ===== */}
                <div className="md:col-span-2 lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: "Total Device", value: devices.length, color: "text-blue-400", icon: "🌐", bg: "from-blue-900/30 to-transparent" },
                        { label: "Online", value: online, color: "text-green-400", icon: "✅", bg: "from-green-900/30 to-transparent" },
                        { label: "Offline", value: offline, color: "text-red-400", icon: "❌", bg: "from-red-900/30 to-transparent" },
                        {
                            label: "Avg Latency",
                            value: avgLatency !== null ? `${avgLatency}ms` : "—",
                            color: avgLatency === null ? "text-gray-400" : avgLatency < 20 ? "text-green-400" : avgLatency < 80 ? "text-yellow-400" : "text-red-400",
                            icon: "⚡", bg: "from-purple-900/30 to-transparent"
                        }
                    ].map((s, i) => (
                        <div key={i} className={`bg-gradient-to-br ${s.bg} bg-gray-800 rounded-xl p-4 border border-gray-700 shadow`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-2xl">{s.icon}</span>
                                <span className="text-xs text-gray-500">{s.label}</span>
                            </div>
                            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ===== PIE CHART ===== */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow flex flex-col">
                    <div className="text-sm font-semibold text-gray-300 mb-3">📊 Status Overview</div>
                    <div className="flex items-center justify-center gap-6 flex-1">
                        <PieChart online={online} offline={offline} />
                        <div className="flex flex-col gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
                                <span className="text-gray-300">Online</span>
                                <span className="ml-auto font-bold text-green-400">{online}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
                                <span className="text-gray-300">Offline</span>
                                <span className="ml-auto font-bold text-red-400">{offline}</span>
                            </div>
                            <div className="border-t border-gray-600 pt-2 text-xs text-gray-400">
                                Total: <strong className="text-white">{devices.length}</strong> device
                            </div>
                            <div className={`text-xs font-semibold px-2 py-1 rounded-full text-center
                                ${offline === 0 ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                                {offline === 0 ? "✅ Semua Online" : `⚠️ ${offline} Device Down`}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ===== BAR CHART LATENCY ===== */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow flex flex-col">
                    <div className="text-sm font-semibold text-gray-300 mb-3">⚡ Latency per Device (ms)</div>
                    {topLatency.length === 0
                        ? <div className="text-gray-500 text-xs text-center py-8">Semua device offline atau belum ada data</div>
                        : <div className="flex-1 flex items-end"><BarChart data={topLatency} /></div>
                    }
                    <div className="flex gap-3 mt-2 text-[10px]">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span>{"<20ms Baik"}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-400 rounded-full"></span>{"<80ms Normal"}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full"></span>{">80ms Tinggi"}</span>
                    </div>
                </div>

                {/* ===== AVAILABILITY HISTORY ===== */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow flex flex-col">
                    <div className="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
                        📈 Availability History
                        <span className="text-[10px] text-gray-500 ml-auto">60 menit terakhir</span>
                    </div>
                    {availHistory.length < 2 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs">
                            <span className="text-3xl">⏳</span>
                            <span>Data dikumpulkan setiap menit</span>
                            <span className="text-[10px]">({availHistory.length}/2 titik terkumpul)</span>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-end">
                            <MiniLineChart data={availHistory} color="#22c55e" height={80} />
                            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                <span>60 mnt lalu</span>
                                <span className="text-green-400 font-bold">
                                    {availHistory[availHistory.length - 1]?.value ?? 0}% now
                                </span>
                                <span>Sekarang</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== DEVICE STATUS TABLE ===== */}
                <div className="md:col-span-2 bg-gray-800 rounded-xl p-4 border border-gray-700 shadow flex flex-col">
                    <div className="text-sm font-semibold text-gray-300 mb-3">🌐 Status Semua Device</div>
                    <div className="flex-1 overflow-auto">
                        {devices.length === 0 ? (
                            <div className="text-gray-500 text-xs text-center py-8">
                                <div className="text-3xl mb-2">🌐</div>
                                <div>Belum ada device terdaftar</div>
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-700">
                                        <th className="text-left pb-2">Device</th>
                                        <th className="text-left pb-2">IP</th>
                                        <th className="text-center pb-2">Status</th>
                                        <th className="text-center pb-2">Latency</th>
                                        <th className="text-center pb-2 hidden sm:table-cell">Last Seen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map(d => (
                                        <tr key={d.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                            <td className="py-2 font-medium text-gray-200">{d.name}</td>
                                            <td className="py-2 font-mono text-gray-400">{d.ip_address}</td>
                                            <td className="py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold
                                                    ${d.status === "online" ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                                                    {d.status}
                                                </span>
                                            </td>
                                            <td className={`py-2 text-center font-mono font-bold
                                                ${d.latency === null ? "text-gray-500"
                                                    : d.latency < 20 ? "text-green-400"
                                                        : d.latency < 80 ? "text-yellow-400" : "text-red-400"}`}>
                                                {d.latency !== null ? `${d.latency}ms` : "—"}
                                            </td>
                                            <td className="py-2 text-center text-gray-500 hidden sm:table-cell">
                                                {formatTime(d.last_seen)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* ===== RECENT ALERTS ===== */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow flex flex-col">
                    <div className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                        🔔 Recent Alerts
                        {alertHistory.length > 0 && (
                            <button onClick={() => {
                                setAlertHistory([])
                                localStorage.removeItem("alertHistory")
                            }} className="ml-auto text-[10px] text-gray-500 hover:text-red-400">
                                🗑️ Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto flex flex-col gap-1.5">
                        {alertHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500 text-xs py-8">
                                <span className="text-3xl">✅</span>
                                <span>Tidak ada alert</span>
                            </div>
                        ) : (
                            [...alertHistory].reverse().slice(0, 15).map((a, i) => (
                                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs
                                    ${a.status === "offline"
                                        ? "bg-red-900/30 border border-red-800/50"
                                        : "bg-green-900/30 border border-green-800/50"}`}>
                                    <span className="text-base leading-none mt-0.5">
                                        {a.status === "offline" ? "⚠️" : "✅"}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-semibold truncate ${a.status === "offline" ? "text-red-300" : "text-green-300"}`}>
                                            {a.name}
                                        </div>
                                        <div className="text-gray-400 font-mono text-[10px]">{a.ip}</div>
                                    </div>
                                    <div className="text-gray-500 text-[10px] whitespace-nowrap">{a.time}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
