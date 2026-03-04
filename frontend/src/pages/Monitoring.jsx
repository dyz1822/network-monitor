import { useEffect, useState } from "react";
import axios from "axios";

export default function Monitoring() {
    const [devices, setDevices] = useState([]);
    const [selected, setSelected] = useState([]);
    const [name, setName] = useState("");
    const [ip, setIp] = useState("");

    // ================= ICON DETECTION =================
    const getDeviceIcon = (deviceName) => {
        if (!deviceName) return "🖥️";

        const nameLower = deviceName.toLowerCase();

        if (
            nameLower.includes("router") ||
            nameLower.includes("gateway") ||
            nameLower.includes("mikrotik") ||
            nameLower.includes("modem")
        ) {
            return "📡";
        }

        return "🖥️";
    };

    // ================= ADD DEVICE =================
    const addDevice = async () => {
        if (!name || !ip) return;

        await axios.post("http://localhost:8000/devices", {
            name,
            ip,
        });

        setName("");
        setIp("");
    };

    // ================= OPEN VNC VIA FILE DOWNLOAD =================
    const openVNC = (ip) => {
        const content = `\
[connection]
host=${ip}
port=5900
`;

        const blob = new Blob([content], { type: "application/x-vnc" });
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${ip}.vnc`;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const toggleSelect = (id) => {
        setSelected((prev) =>
            prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id]
        );
    };

    const deleteSelected = async () => {
        if (!selected.length) return;

        await axios.post("http://localhost:8000/devices/delete-many", {
            ids: selected,
        });

        setSelected([]);
    };

    // ================= REALTIME WS =================
    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000/ws");

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "devices") {
                setDevices(msg.data);
            }
        };

        return () => ws.close();
    }, []);

    return (
        <div className="h-full flex flex-col">

            {/* TOOLBAR */}
            <div className="flex items-center gap-2 mb-4 text-sm">
                <input
                    className="bg-gray-800 p-1 px-2 rounded"
                    placeholder="Nama"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <input
                    className="bg-gray-800 p-1 px-2 rounded"
                    placeholder="IP"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                />

                <button
                    onClick={addDevice}
                    className="bg-green-600 px-3 py-1 rounded"
                >
                    +
                </button>

                <button
                    onClick={deleteSelected}
                    className="bg-red-600 px-3 py-1 rounded"
                >
                    Delete ({selected.length})
                </button>
            </div>

            {/* DEVICE GRID */}
            <div className="flex-1 overflow-auto">
                <div
                    className="grid gap-3"
                    style={{
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(140px,1fr))",
                    }}
                >
                    {devices.map((d) => (
                        <div
                            key={d.id}
                            className="bg-gray-800 rounded p-3 text-center text-xs hover:bg-gray-700 transition"
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(d.id)}
                                onChange={() => toggleSelect(d.id)}
                            />

                            <div className="text-3xl mt-1">
                                {getDeviceIcon(d.name)}
                            </div>

                            <div
                                className="font-semibold mt-1 truncate cursor-pointer hover:underline"
                                onClick={() => openVNC(d.ip_address)}
                            >
                                {d.name}
                            </div>

                            <div className="opacity-70 truncate">
                                {d.ip_address}
                            </div>

                            <div
                                className={
                                    d.status === "online"
                                        ? "text-green-400"
                                        : "text-red-500 offline-alert"
                                }
                            >
                                ● {d.status}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}