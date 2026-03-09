const API = window.location.origin

const authHeader = () => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
}

const apiFetch = async (url, options = {}) => {
    const res = await fetch(API + url, {
        ...options,
        headers: { "Content-Type": "application/json", ...authHeader(), ...(options.headers || {}) }
    })
    if (res.status === 401) {
        localStorage.removeItem("token")
        localStorage.removeItem("username")
        window.location.href = "/login"
        return null
    }
    return res
}

export const login = async (username, password) => {
    const form = new URLSearchParams()
    form.append("username", username)
    form.append("password", password)
    const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        body: form
    })
    if (!res.ok) throw new Error("Username atau password salah")
    return res.json()
}

export const getMe = async () => {
    const res = await apiFetch("/auth/me")
    return res?.json()
}

export const changePassword = async (old_password, new_password) => {
    const res = await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password, new_password })
    })
    if (!res?.ok) throw new Error("Password lama salah")
    return res.json()
}

export const getDevices = async () => {
    const res = await apiFetch("/devices")
    return res?.json()
}

export const addDevice = async (name, ip) => {
    const res = await apiFetch("/devices", { method: "POST", body: JSON.stringify({ name, ip }) })
    return res?.json()
}

export const updateDevice = async (id, name, ip) => {
    const res = await apiFetch(`/devices/${id}`, { method: "PATCH", body: JSON.stringify({ name, ip }) })
    return res?.json()
}

export const deleteManyDevices = async (ids) => {
    await apiFetch("/devices/delete-many", { method: "POST", body: JSON.stringify({ ids }) })
}

export const scanNetwork = async (network) => {
    const res = await apiFetch("/scan", { method: "POST", body: JSON.stringify({ network }) })
    return res?.json()
}

export const getDeviceLogs = async (deviceId, limit = 20) => {
    const res = await apiFetch(`/devices/${deviceId}/logs?limit=${limit}`)
    return res?.json()
}

export const getDeviceUptime = async (deviceId) => {
    const res = await apiFetch(`/devices/${deviceId}/uptime`)
    return res?.json()
}

export const getExportReport = async () => {
    const res = await apiFetch("/export/report")
    return res?.json()
}

// BUG FIX: gunakan Authorization header, bukan query parameter token
export const downloadBackup = async () => {
    try {
        const res = await apiFetch("/backup")
        if (!res) return
        if (!res.ok) {
            alert("Gagal download backup: " + res.status)
            return
        }
        const data = await res.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const tanggal = new Date().toISOString().slice(0, 10)
        a.download = `jlb-backup-${tanggal}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    } catch (e) {
        alert("Gagal download backup")
    }
}

export const restoreConfig = async (data) => {
    const res = await apiFetch("/restore", { method: "POST", body: JSON.stringify(data) })
    return res?.json()
}
