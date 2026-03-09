import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import Monitoring from "./pages/Monitoring"
import Scanner from "./pages/Scanner"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import DeviceDetail from "./pages/DeviceDetail"
import { getExportReport, downloadBackup, restoreConfig, changePassword } from "./api/api"
import LOGO from "./logoBase64"


// ============ EXPORT MODAL ============
function ExportModal({ onClose }) {
  const [devices, setDevices] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetch(`${window.location.origin}/devices`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then(r => r.json())
      .then(data => { setDevices(data); setSelected(data.map(d => d.id)); setLoading(false) })
  }, [])

  const toggleDevice = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleExport = async (format) => {
    if (!selected.length) return alert("Pilih minimal 1 device")
    setExporting(true)
    try {
      const data = await getExportReport()
      const filteredDevices = data.devices.filter(d => selected.includes(d.id))
      const filteredData = {
        ...data, devices: filteredDevices,
        total_devices: filteredDevices.length,
        online_count: filteredDevices.filter(d => d.status === "online").length,
        offline_count: filteredDevices.filter(d => d.status === "offline").length,
      }
      const isPartial = selected.length < devices.length
      if (format === "csv") {
        const headers = ["ID", "Nama", "IP Address", "Status", "Type", "Latency (ms)", "Uptime (%)", "Last Seen"]
        const rows = filteredDevices.map(d => [d.id, d.name, d.ip_address, d.status, d.type, d.latency ?? "-", d.uptime_percent ?? "-", d.last_seen ?? "-"])
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `jlb-network-${isPartial ? "partial" : "all"}-${data.generated_at.replace(/[: ]/g, "-")}.csv`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
        onClose()
      } else {
        const win = window.open("", "_blank")
        win.document.write(generatePDFHTML(filteredData, isPartial, devices.length))
        win.document.close()
        onClose()
      }
    } catch (e) { alert("Gagal export") }
    setExporting(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700 w-full sm:w-96 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <div className="font-bold text-gray-800 dark:text-white">📤 Export Laporan</div>
            <div className="text-xs text-gray-400 mt-0.5">Pilih device yang ingin diexport</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? <div className="text-center text-gray-400 py-8">Memuat...</div> : (
            <>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setSelected(devices.map(d => d.id))}
                  className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-lg">✓ Semua</button>
                <button onClick={() => setSelected([])}
                  className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg">✕ Clear</button>
                <span className="ml-auto text-xs text-gray-400 self-center">{selected.length}/{devices.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {devices.map(d => (
                  <label key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition
                                        ${selected.includes(d.id) ? "border-blue-400 bg-blue-50 dark:bg-blue-950" : "border-gray-200 dark:border-gray-700"}`}>
                    <input type="checkbox" checked={selected.includes(d.id)}
                      onChange={() => toggleDevice(d.id)} className="w-5 h-5 accent-blue-500" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm dark:text-gray-100 truncate">{d.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{d.ip_address}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full
                                            ${d.status === "online" ? "bg-green-100 dark:bg-green-900 text-green-600" : "bg-red-100 dark:bg-red-900 text-red-500"}`}>
                      {d.status}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-400 mb-2 text-center">Pilih format:</div>
          <div className="flex gap-2">
            <button onClick={() => handleExport("pdf")} disabled={exporting || !selected.length}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white py-3 rounded-xl font-medium text-sm">
              🖨️ PDF
            </button>
            <button onClick={() => handleExport("csv")} disabled={exporting || !selected.length}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-3 rounded-xl font-medium text-sm">
              📊 CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ PDF GENERATOR ============
function generatePDFHTML(data, isPartial, totalAll) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>JLB Network Monitor - Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px}
.logo{font-size:22px;font-weight:bold;color:#2563eb;letter-spacing:2px}.logo span{color:#1a1a1a}
.meta{text-align:right;color:#666;font-size:12px;line-height:1.6}
.partial-badge{display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:bold;margin-top:4px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.summary-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
.summary-card .val{font-size:28px;font-weight:bold}.summary-card .lbl{font-size:11px;color:#666;margin-top:2px}
.blue{color:#2563eb}.green{color:#16a34a}.red{color:#dc2626}.yellow{color:#ca8a04}
h2{font-size:14px;font-weight:bold;margin-bottom:12px;color:#374151;border-left:4px solid #2563eb;padding-left:8px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{background:#2563eb;color:white;padding:8px 10px;text-align:left;font-size:12px}
td{padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:12px}
tr:nth-child(even) td{background:#f9fafb}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:bold}
.online{background:#dcfce7;color:#16a34a}.offline{background:#fee2e2;color:#dc2626}
@media print{button{display:none!important}}
</style></head><body>
<div class="header">
    <div>
        <div class="logo">🌐 JLB <span>NETWORK MONITOR</span></div>
        ${isPartial ? `<div class="partial-badge">⚠️ Partial — ${data.total_devices} dari ${totalAll} device</div>` : ""}
    </div>
    <div class="meta"><div><strong>Generated:</strong> ${data.generated_at}</div></div>
</div>
<div class="summary">
    <div class="summary-card"><div class="val blue">${data.total_devices}</div><div class="lbl">Device</div></div>
    <div class="summary-card"><div class="val green">${data.online_count}</div><div class="lbl">Online</div></div>
    <div class="summary-card"><div class="val red">${data.offline_count}</div><div class="lbl">Offline</div></div>
    <div class="summary-card"><div class="val ${data.online_count === data.total_devices ? "green" : "yellow"}">${data.total_devices > 0 ? Math.round((data.online_count / data.total_devices) * 100) : 0}%</div><div class="lbl">Availability</div></div>
</div>
<h2>Device Status</h2>
<table><thead><tr><th>#</th><th>Nama</th><th>IP</th><th>Status</th><th>Latency</th><th>Uptime</th><th>Last Seen</th></tr></thead>
<tbody>${data.devices.map((d, i) => `<tr><td>${i + 1}</td><td><strong>${d.name}</strong></td><td style="font-family:monospace">${d.ip_address}</td><td><span class="badge ${d.status}">${d.status}</span></td><td>${d.latency !== null ? d.latency + "ms" : "—"}</td><td>${d.uptime_percent !== null ? d.uptime_percent + "%" : "—"}</td><td>${d.last_seen ?? "—"}</td></tr>`).join("")}</tbody></table>
<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:bold">🖨️ Print / Save as PDF</button></div>
</body></html>`
}

// ============ SETTINGS MODAL ============
function SettingsModal({ onClose, username }) {
  const [tab, setTab] = useState("account")
  const [oldPw, setOldPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwMsg, setPwMsg] = useState("")
  const [pwError, setPwError] = useState("")
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState("")
  const [interval, setIntervalVal] = useState(localStorage.getItem("pingInterval") || "2")

  const saveInterval = (val) => { setIntervalVal(val); localStorage.setItem("pingInterval", val) }

  const handleChangePassword = async (e) => {
    e.preventDefault(); setPwMsg(""); setPwError("")
    if (newPw !== confirmPw) return setPwError("Password baru tidak cocok")
    if (newPw.length < 6) return setPwError("Password minimal 6 karakter")
    try {
      await changePassword(oldPw, newPw)
      setPwMsg("✅ Password berhasil diubah")
      setOldPw(""); setNewPw(""); setConfirmPw("")
    } catch { setPwError("❌ Password lama salah") }
  }

  const handleRestore = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setRestoring(true); setRestoreMsg("")
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = await restoreConfig(json)
      setRestoreMsg(`✅ Berhasil tambah ${result.added} device (${result.skipped} di-skip)`)
    } catch { setRestoreMsg("❌ File tidak valid") }
    setRestoring(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl shadow-2xl border-t sm:border border-gray-200 dark:border-gray-700 w-full sm:w-96 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="font-bold text-gray-800 dark:text-white">⚙️ Settings</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[["account", "👤 Akun"], ["backup", "💾 Backup"], ["monitor", "⏱️ Monitor"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 text-xs font-medium transition
                                ${tab === key ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-5 overflow-auto">
          {tab === "account" && (
            <div>
              <div className="text-xs text-gray-400 mb-3">Login sebagai: <strong className="text-blue-400">{username}</strong></div>
              <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                {["Password Lama", "Password Baru", "Konfirmasi Password Baru"].map((label, i) => (
                  <div key={i}>
                    <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                    <input type="password"
                      value={i === 0 ? oldPw : i === 1 ? newPw : confirmPw}
                      onChange={e => i === 0 ? setOldPw(e.target.value) : i === 1 ? setNewPw(e.target.value) : setConfirmPw(e.target.value)}
                      className="w-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 p-3 rounded-xl text-sm"
                      required />
                  </div>
                ))}
                {pwMsg && <div className="text-xs text-green-500">{pwMsg}</div>}
                {pwError && <div className="text-xs text-red-500">{pwError}</div>}
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium">
                  🔑 Ubah Password
                </button>
              </form>
            </div>
          )}
          {tab === "backup" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-400">Export daftar device ke JSON untuk backup atau migrasi server.</p>
              <button onClick={downloadBackup} className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium">
                ⬇️ Download Backup (JSON)
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-xs text-gray-400 mb-2">Restore dari file backup JSON:</p>
                <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-400 dark:border-gray-600 rounded-xl py-5 cursor-pointer hover:border-blue-400 text-sm text-gray-500 ${restoring ? "opacity-50 pointer-events-none" : ""}`}>
                  <span>📂 {restoring ? "Memproses..." : "Pilih file .json"}</span>
                  <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
                </label>
                {restoreMsg && <div className={`text-xs mt-2 ${restoreMsg.startsWith("✅") ? "text-green-500" : "text-red-500"}`}>{restoreMsg}</div>}
              </div>
            </div>
          )}
          {tab === "monitor" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-2 block font-medium">⏱️ Interval Ping</label>
                <div className="grid grid-cols-4 gap-2">
                  {[["2", "2s"], ["5", "5s"], ["10", "10s"], ["30", "30s"]].map(([val, label]) => (
                    <button key={val} onClick={() => saveInterval(val)}
                      className={`py-3 rounded-xl text-sm font-medium transition
                                                ${interval === val ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ LAYOUT ============
function Layout({ username, onLogout }) {
  const [dark, setDark] = useState(localStorage.getItem("theme") !== "light")
  const [wsStatus, setWsStatus] = useState("connecting")
  const [showExport, setShowExport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (dark) { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark") }
    else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light") }
  }, [dark])

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    ws.onopen = () => setWsStatus("connected")
    ws.onclose = () => setWsStatus("disconnected")
    ws.onerror = () => setWsStatus("disconnected")
    return () => ws.close()
  }, [])

  // Tutup mobile menu saat navigasi
  useEffect(() => { setMobileMenu(false) }, [location.pathname])

  const handleLogout = () => {
    localStorage.removeItem("token"); localStorage.removeItem("username"); onLogout()
  }

  const navLinks = [
    { to: "/", label: "🏠 Dashboard" },
    { to: "/monitoring", label: "📊 Monitoring" },
    { to: "/scanner", label: "🔍 Scanner" },
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">

      {/* NAVBAR */}
      <div className="bg-gray-900 dark:bg-gray-950 shadow-lg">
        <div className="flex justify-between items-center px-4 py-2">

          {/* LEFT — Nav Links (desktop) */}
          <div className="hidden sm:flex gap-2 text-sm">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to}
                className={`px-3 py-1.5 rounded font-medium transition
                                    ${location.pathname === link.to ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* LEFT — Hamburger (mobile) */}
          <button onClick={() => setMobileMenu(!mobileMenu)}
            className="sm:hidden bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-lg">
            {mobileMenu ? "✕" : "☰"}
          </button>

          {/* CENTER */}
          <div className="flex items-center gap-2">
            <img src={LOGO} alt="JLB Logo"
              className="h-8 sm:h-9 w-auto object-contain"
            />
            <span className="text-sm sm:text-base font-bold tracking-widest text-white hidden sm:inline">
              NETWORK <span className="text-blue-400">MONITOR</span>
            </span>
          </div>


          {/* RIGHT */}
          <div className="flex items-center gap-1.5 text-sm">
            {/* WS Status — hidden on small */}
            <div className="hidden sm:flex items-center gap-1 text-xs">
              <span className={`w-2 h-2 rounded-full animate-pulse ${wsStatus === "connected" ? "bg-green-400" : "bg-red-500"}`}></span>
              <span className="text-gray-400">{wsStatus === "connected" ? "Live" : "Off"}</span>
            </div>

            <button onClick={() => setShowExport(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded text-xs sm:text-sm flex items-center gap-1">
              📤 <span className="hidden sm:inline">Export</span>
            </button>

            <button onClick={() => setShowSettings(true)}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2.5 py-1.5 rounded text-sm">
              ⚙️
            </button>

            {/* USER MENU */}
            <div className="relative">
              <button onClick={() => setUserMenu(!userMenu)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2.5 py-1.5 rounded text-xs sm:text-sm flex items-center gap-1">
                👤 <span className="hidden sm:inline">{username}</span>
                <span className="text-[10px] opacity-60">▼</span>
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 w-40 overflow-hidden">
                    <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">{username}</div>
                    <button onClick={() => { setShowSettings(true); setUserMenu(false) }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-800 dark:text-gray-200">
                      ⚙️ Settings
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700" />
                    <button onClick={handleLogout}
                      className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900 text-sm text-red-500">
                      🚪 Logout
                    </button>
                  </div>
                </>
              )}
            </div>

            <button onClick={() => setDark(!dark)}
              className="bg-gray-700 hover:bg-gray-600 text-yellow-400 px-2.5 py-1.5 rounded text-sm">
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>

        {/* MOBILE MENU DROPDOWN */}
        {mobileMenu && (
          <div className="sm:hidden border-t border-gray-700 py-2 px-4 flex flex-col gap-1">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to}
                className={`px-4 py-3 rounded-xl font-medium text-sm transition
                                    ${location.pathname === link.to ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 mt-1">
              <span className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-green-400" : "bg-red-500"}`}></span>
              {wsStatus === "connected" ? "WebSocket Live" : "Disconnected"}
            </div>
          </div>
        )}
      </div>

      {/* CONTENT */}
      {/* CONTENT */}
      <div className="flex-1 overflow-hidden p-3 sm:p-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/device/:id" element={<DeviceDetail />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {/* FOOTER */}
      <div className="bg-gray-900 dark:bg-gray-950 border-t border-gray-700 py-1.5 px-4 flex items-center justify-center">
        <span className="text-[11px] text-gray-500">
          Copyright © 2026 <span className="text-gray-400 font-medium">IT-JLB</span>. All rights reserved.
        </span>
      </div>


      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} username={username} />}
    </div>
  )
}

// ============ APP ROOT ============
export default function App() {
  const [username, setUsername] = useState(localStorage.getItem("username"))
  if (!username) return <Login onLogin={(u) => setUsername(u)} />
  return (
    <BrowserRouter>
      <Layout username={username} onLogout={() => setUsername(null)} />
    </BrowserRouter>
  )
}
