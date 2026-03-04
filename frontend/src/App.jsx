import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Monitoring from "./pages/Monitoring";
import Scanner from "./pages/Scanner";

function Layout() {
  const [dark, setDark] = useState(
    localStorage.getItem("theme") === "dark"
  );

  const location = useLocation();

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  const title =
    location.pathname === "/scanner"
      ? "NETWORK SCANNER"
      : "MONITORING IP";

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-200">

      {/* ===== NAVBAR ===== */}
      <div className="flex justify-between items-center px-6 py-2 bg-gray-900">

        {/* LEFT */}
        <div className="flex gap-2 text-sm">
          <Link to="/" className="bg-blue-600 px-3 py-1 rounded">
            Monitoring
          </Link>
          <Link to="/scanner" className="bg-purple-600 px-3 py-1 rounded">
            Scanner
          </Link>
        </div>

        {/* CENTER TITLE */}
        <div className="text-lg font-bold tracking-widest">
          {title}
        </div>

        {/* RIGHT */}
        <button
          onClick={() => setDark(!dark)}
          className="bg-yellow-400 text-black px-3 py-1 rounded text-sm"
        >
          ☀ Light
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden p-4">
        <Routes>
          <Route path="/" element={<Monitoring />} />
          <Route path="/scanner" element={<Scanner />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}