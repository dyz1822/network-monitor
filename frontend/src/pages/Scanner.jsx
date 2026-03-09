import { useState } from "react"
import { scanNetwork, addDevice } from "../api/api"

export default function Scanner() {

    const [network, setNetwork] = useState("")
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [added, setAdded] = useState([])
    const [progress, setProgress] = useState(0)

    const handleScan = async () => {
        if (!network) return
        setLoading(true)
        setError("")
        setResults([])
        setAdded([])
        setProgress(0)

        // Simulasi progress saat scanning
        const interval = setInterval(() => {
            setProgress(prev => prev < 90 ? prev + 5 : prev)
        }, 400)

        try {
            const data = await scanNetwork(network)
            clearInterval(interval)
            setProgress(100)
            if (data.error) {
                setError(data.error)
            } else {
                setResults(data)
            }
        } catch (err) {
            clearInterval(interval)
            setError("Gagal melakukan scan. Periksa format network.")
        }

        setLoading(false)
        setTimeout(() => setProgress(0), 1000)
    }

    const handleAdd = async (ip) => {
        await addDevice(ip, ip)
        setAdded(prev => [...prev, ip])
    }

    return (
        <div className="h-full flex flex-col gap-4 text-sm">

            {/* TOOLBAR */}
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 p-1.5 px-3 rounded w-52"
                    placeholder="192.168.1.0/24"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                />
                <button
                    onClick={handleScan}
                    disabled={loading}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-1.5 rounded"
                >
                    {loading ? "Scanning..." : "🔍 Scan"}
                </button>
                {results.length > 0 && (
                    <span className="text-gray-500 text-xs">
                        ✅ {results.length} host ditemukan
                    </span>
                )}
            </div>

            {/* PROGRESS BAR */}
            {loading && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* ERROR */}
            {error && (
                <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 px-4 py-2 rounded text-sm">
                    {error}
                </div>
            )}

            {/* LOADING TEXT */}
            {loading && (
                <div className="text-purple-500 text-sm">
                    🔍 Sedang scan <span className="font-mono font-bold">{network}</span>, mohon tunggu...
                </div>
            )}

            {/* RESULTS */}
            {!loading && results.length > 0 && (
                <div className="flex-1 overflow-auto">
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                        {results.map((ip, i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center justify-between gap-2 hover:shadow transition">
                                <div>
                                    <div className="text-green-500 font-semibold text-xs">● online</div>
                                    <div className="text-gray-800 dark:text-gray-200 font-mono">{ip}</div>
                                </div>
                                {added.includes(ip) ? (
                                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">✓ Added</span>
                                ) : (
                                    <button
                                        onClick={() => handleAdd(ip)}
                                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                                    >
                                        + Add
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* EMPTY STATE */}
            {!loading && results.length === 0 && !error && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <div className="text-5xl">🔍</div>
                    <div className="text-lg font-semibold">Belum ada hasil scan</div>
                    <div className="text-sm">Masukkan range network lalu klik Scan</div>
                    <div className="text-xs text-purple-400 font-mono mt-1">Contoh: 192.168.1.0/24</div>
                </div>
            )}

        </div>
    )
}
