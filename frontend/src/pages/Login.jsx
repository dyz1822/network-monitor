import { useState } from "react"
import { login } from "../api/api"

export default function Login({ onLogin }) {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [showPw, setShowPw] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault(); setLoading(true); setError("")
        try {
            const data = await login(username, password)
            localStorage.setItem("token", data.access_token)
            localStorage.setItem("username", data.username)
            onLogin(data.username)
        } catch { setError("Username atau password salah") }
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-end sm:items-center justify-center bg-gray-900 p-0 sm:p-4">
            <div className="bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-8 w-full sm:max-w-sm border-t sm:border border-gray-700">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">🌐</div>
                    <div className="text-2xl font-bold tracking-widest text-white">
                        JLB <span className="text-blue-400">NETWORK</span>
                    </div>
                    <div className="text-gray-400 text-sm mt-1">Network Monitor — Login</div>
                </div>
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Username</label>
                        <input
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="admin"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoCapitalize="none"
                            autoFocus required
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Password</label>
                        <div className="relative">
                            <input
                                type={showPw ? "text" : "password"}
                                className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-blue-500"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                            <button type="button" onClick={() => setShowPw(!showPw)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-lg">
                                {showPw ? "🙈" : "👁️"}
                            </button>
                        </div>
                    </div>
                    {error && (
                        <div className="bg-red-900/50 border border-red-600 text-red-300 text-sm px-4 py-3 rounded-xl">
                            ⚠️ {error}
                        </div>
                    )}
                    <button type="submit" disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold text-sm mt-1">
                        {loading ? "⟳ Logging in..." : "🔐 Login"}
                    </button>
                </form>
                <div className="text-center text-xs text-gray-600 mt-6">
                    Default: admin / admin123
                </div>
            </div>
        </div>
    )
}
