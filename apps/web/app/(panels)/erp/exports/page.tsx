"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

const ENTITIES = [
  { key: "activities", label: "Actividades / OT", icon: "🧰" },
  { key: "viatics", label: "Viáticos", icon: "💸" },
  { key: "vehicles", label: "Vehículos", icon: "🚐" },
  { key: "evidences", label: "Evidencias", icon: "📷" },
  { key: "users", label: "Usuarios", icon: "👥" },
];

export default function ExportsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "exports"), [user]);
  const token = user?.token ?? "";

  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (entity: string) => {
    if (!token) return;
    setDownloading(entity); setError(null);
    try {
      const res = await fetch(buildApiUrl(`exports/${entity}?from=${from}&to=${to}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}-${from}-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally { setDownloading(null); }
  };

  const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 };

  return (
    <>
      <PageHeader
        eyebrow="ERP · Auditoría"
        title={cfg.title}
        subtitle={cfg.subtitle}
      />

      {cfg.viewMode !== "manage" && (
        <div style={{ padding: "10px 14px", background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "var(--state-warning-text)" }}>
          ⚠️ Las exportaciones que solicites solo incluirán los datos a los que tienes acceso según tu rol.
        </div>
      )}

      <Section title="Rango de fechas">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></label>
        </div>
      </Section>

      {error && (
        <div style={{ padding: "10px 14px", background: "var(--state-danger-bg)", border: "1px solid var(--state-danger-border)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "var(--state-danger-text)" }}>
          ⚠️ {error}
        </div>
      )}

      <Section title="Reportes disponibles">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {ENTITIES.map((e) => (
            <div key={e.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <span style={{ fontSize: 22 }}>{e.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{e.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Formato CSV (Excel)</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void download(e.key)} disabled={downloading === e.key}>
                {downloading === e.key ? "Generando…" : "Descargar"}
              </Button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
