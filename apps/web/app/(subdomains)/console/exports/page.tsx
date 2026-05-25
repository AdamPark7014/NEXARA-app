"use client";

import { useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

const ENTITIES = [
  { id: "clients", label: "Clientes (CRM)", icon: "🏢", description: "Base de clientes de ventas con datos fiscales" },
  { id: "leads", label: "Leads", icon: "🎯", description: "Prospectos comerciales con score" },
  { id: "opportunities", label: "Oportunidades", icon: "💼", description: "Oportunidades con etapa y valor" },
  { id: "tenders", label: "Licitaciones", icon: "📋", description: "Licitaciones públicas/privadas" },
  { id: "invoices", label: "Facturas", icon: "🧾", description: "Facturas emitidas y recibidas con CFDI" },
  { id: "activities", label: "Actividades / OT", icon: "🛠️", description: "Órdenes de trabajo y tickets" },
  { id: "projects", label: "Proyectos operativos", icon: "🏗️", description: "Proyectos con fechas y estatus" },
  { id: "users", label: "Usuarios", icon: "👤", description: "Empleados activos del sistema" },
  { id: "kb-articles", label: "Artículos KB", icon: "📚", description: "Base de conocimiento" },
  { id: "crm-activities", label: "Tareas CRM", icon: "📅", description: "Llamadas, tareas y reuniones comerciales" },
];

export default function ExportsPage() {
  const { user } = useUser();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const download = async (entity: string) => {
    setBusy(entity);
    setMsg(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const url = `exports/${entity}${qs.toString() ? `?${qs.toString()}` : ""}`;
      const res = await fetch(buildApiUrl(url), { headers: { Authorization: `Bearer ${user?.token}` } });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setMsg(`✅ ${entity} exportado correctamente`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📥 Exportaciones</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Descarga CSV (compatible con Excel) de cualquier módulo del ERP. Incluye BOM UTF-8 para acentos correctos.
      </p>

      <div style={{ marginTop: 16, padding: 14, background: "var(--bg-secondary)", borderRadius: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ fontSize: 12 }}>Filtro por fecha de creación:</strong>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </label>
        {(from || to) && (
          <button type="button" onClick={() => { setFrom(""); setTo(""); }} style={{ padding: "6px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Limpiar</button>
        )}
      </div>

      {msg && <div style={{ marginTop: 12, padding: 10, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", color: msg.startsWith("✅") ? "#166534" : "#7f1d1d", borderRadius: 8 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 16 }}>
        {ENTITIES.map((e) => (
          <div key={e.id} style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong style={{ fontSize: 14 }}>{e.icon} {e.label}</strong>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "4px 0 0" }}>{e.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => download(e.id)}
              disabled={!!busy}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "8px 12px",
                background: busy === e.id ? "#6b7280" : "#0ea5e9",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: busy ? "wait" : "pointer",
                fontWeight: 600,
              }}
            >
              {busy === e.id ? "Generando…" : "📥 Descargar CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)" };
