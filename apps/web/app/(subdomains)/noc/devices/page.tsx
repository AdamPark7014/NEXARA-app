"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Device = {
  id: string;
  name: string;
  type: string;
  status: string;
  branch: string;
  clientName: string;
  lastSeen: string;
  uptimePct30d: number;
  ipAddress?: string;
  firmwareVersion?: string;
};

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "#16a34a",
  OFFLINE: "#dc2626",
  DEGRADED: "#f59e0b",
  ALERT: "#ef4444",
};

export default function NocDevicesPage() {
  const { user } = useUser();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set("status", filterStatus);
      if (filterType) qs.set("type", filterType);
      const res = await fetch(buildApiUrl(`noc/devices${qs.toString() ? `?${qs.toString()}` : ""}`), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setDevices(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token, filterStatus, filterType]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🖥️ Dispositivos monitoreados</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>{devices.length} dispositivo(s) cumplen los filtros.</p>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Pill active={!filterStatus} onClick={() => setFilterStatus("")}>Todos</Pill>
        {["ONLINE", "OFFLINE", "DEGRADED", "ALERT"].map((s) => (
          <Pill key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)} color={STATUS_COLOR[s]}>{s}</Pill>
        ))}
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
          <option value="">Todos los tipos</option>
          <option value="CCTV">📹 CCTV</option>
          <option value="POS">🛒 POS</option>
          <option value="PRINTER">🖨️ Impresora</option>
          <option value="ROUTER">📶 Router</option>
          <option value="SERVER">🖥️ Server</option>
          <option value="IOT_SENSOR">📟 IoT</option>
          <option value="ACCESS_CONTROL">🔐 Access Control</option>
        </select>
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr><Th>Estado</Th><Th>Dispositivo</Th><Th>Tipo</Th><Th>Cliente</Th><Th>Sucursal</Th><Th>IP</Th><Th>Uptime 30d</Th><Th>Last seen</Th></tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>
                    <span style={{ background: STATUS_COLOR[d.status] + "22", color: STATUS_COLOR[d.status], padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                      ● {d.status}
                    </span>
                  </Td>
                  <Td><strong>{d.name}</strong><div style={{ fontSize: 11, color: "var(--text-secondary)" }}>fw {d.firmwareVersion}</div></Td>
                  <Td>{d.type}</Td>
                  <Td>{d.clientName}</Td>
                  <Td>{d.branch}</Td>
                  <Td style={{ fontFamily: "monospace", fontSize: 11 }}>{d.ipAddress}</Td>
                  <Td style={{ color: d.uptimePct30d >= 99 ? "#16a34a" : d.uptimePct30d >= 95 ? "#f59e0b" : "#dc2626", fontWeight: 700 }}>{d.uptimePct30d}%</Td>
                  <Td style={{ fontSize: 11 }}>{new Date(d.lastSeen).toLocaleString("es-MX")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Pill({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  const bg = color && active ? color : active ? "#0891b2" : "var(--bg-secondary)";
  return <button type="button" onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: bg, color: active ? "#fff" : "var(--text-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{children}</button>;
}
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: "left", padding: 8, background: "var(--bg-secondary)", fontSize: 11, position: "sticky", top: 0 }}>{children}</th>; }
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) { return <td style={{ padding: 8, fontSize: 12, ...style }}>{children}</td>; }
