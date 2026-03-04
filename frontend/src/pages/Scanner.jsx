import { useState } from "react";
import axios from "axios";

export default function Scanner() {
    const [target, setTarget] = useState("");
    const [result, setResult] = useState(null);

    const scan = async () => {
        const res = await axios.post("http://localhost:8000/scan", {
            target,
        });

        setResult(res.data);
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Targeted Network Scanner</h2>

            <input
                className="border p-2 mr-2"
                placeholder="192.168.1.10 / 192.168.1.0/24 / 192.168.1.10-20"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
            />

            <button
                onClick={scan}
                className="bg-purple-600 text-white px-4 py-2 rounded"
            >
                Scan
            </button>

            {result && (
                <div className="mt-4">
                    <p>Scanned: {result.scanned}</p>
                    <p>Active Found: {result.found}</p>

                    <a
                        href="http://localhost:8000/report"
                        target="_blank"
                        className="text-blue-500 underline"
                    >
                        Download PDF
                    </a>
                </div>
            )}
        </div>
    );
}