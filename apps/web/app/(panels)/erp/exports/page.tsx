"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

type ExportFormat = "xlsx" | "pdf";

type ExportCard = {
  key: string;
  label: string;
  icon: string;
  desc: string;
  xlsxPath: (from: string, to: string) => string;
  pdfPath?: (from: string, to: string) => string;
};

const ENTITIES: ExportCard[] = [
  {
    key: "invoices",
    label: "Facturas",
    icon: "🧾",
    desc: "Facturación emitida por periodo (issueDate)",
    xlsxPath: (from, to) => `exports/invoices?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "clients",
    label: "Clientes CRM",
    icon: "🏢",
    desc: "Cuentas comerciales y datos de contacto",
    xlsxPath: (from, to) => `exports/clients?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "leads",
    label: "Leads",
    icon: "🎯",
    desc: "Pipeline de captación comercial",
    xlsxPath: (from, to) => `exports/leads?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "opportunities",
    label: "Oportunidades",
    icon: "📈",
    desc: "Oportunidades abiertas y cerradas",
    xlsxPath: (from, to) => `exports/opportunities?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "projects",
    label: "Proyectos",
    icon: "🗂️",
    desc: "Proyectos de venta e implementación",
    xlsxPath: (from, to) => `exports/projects?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "crm-activities",
    label: "Actividades CRM",
    icon: "📞",
    desc: "Llamadas, visitas y seguimiento comercial",
    xlsxPath: (from, to) => `exports/crm-activities?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "activities",
    label: "Actividades / OT",
    icon: "🧰",
    desc: "Órdenes de trabajo, técnicos, estados y tiempos",
    xlsxPath: () => "activities/export/xlsx",
    pdfPath: (from, to) => `activities/report.pdf?from=${from}&to=${to}`,
  },
  {
    key: "viatics",
    label: "Viáticos",
    icon: "💸",
    desc: "Gastos de viaje aprobados y por aprobar",
    xlsxPath: () => "viatics/export/xlsx",
    pdfPath: (from, to) => `viatics/report.pdf?from=${from}&to=${to}`,
  },
  {
    key: "attendance",
    label: "Asistencia híbrida",
    icon: "🕒",
    desc: "Contraste checador ERP ↔ accesos ACS (día fin = Hasta)",
    xlsxPath: (_from, to) => `attendance/hybrid/export.xlsx?date=${to}`,
  },
  {
    key: "vehicles",
    label: "Vehículos",
    icon: "🚐",
    desc: "Flota activa, asignaciones y mantenimientos",
    xlsxPath: () => "vehicles/export/xlsx",
  },
  {
    key: "evidences",
    label: "Evidencias",
    icon: "📷",
    desc: "Archivos adjuntos y fotos de actividades",
    xlsxPath: () => "evidences/export/xlsx",
  },
  {
    key: "users",
    label: "Usuarios",
    icon: "👥",
    desc: "Personal, roles y datos de RRHH",
    xlsxPath: (from, to) => `exports/users?from=${from}&to=${to}&format=xlsx`,
  },
];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  {
    label: "Esta semana",
    range: () => {
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      return { from: toIso(monday), to: toIso(now) };
    },
  },
  {
    label: "Este mes",
    range: () => {
      const now = new Date();
      return { from: toIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIso(now) };
    },
  },
  {
    label: "Mes anterior",
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
  {
    label: "Último trimestre",
    range: () => {
      const now = new Date();
      return { from: toIso(new Date(now.getFullYear(), now.getMonth() - 3, 1)), to: toIso(now) };
    },
  },
  {
    label: "Este año",
    range: () => {
      const now = new Date();
      return { from: toIso(new Date(now.getFullYear(), 0, 1)), to: toIso(now) };
    },
  },
];

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m?.[1] ? decodeURIComponent(m[1]) : fallback;
}

export default function ExportsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "exports"), [user]);
  const token = user?.token ?? "";

  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadLog, setDownloadLog] = useState<
    { entity: string; format: string; from: string; to: string; ts: string }[]
  >([]);

  const download = async (entity: ExportCard, format: ExportFormat) => {
    if (!token) return;
    const path =
      format === "pdf"
        ? entity.pdfPath?.(from, to)
        : entity.xlsxPath(from, to);
    if (!path) {
      setError("Este reporte no tiene PDF disponible aún");
      return;
    }
    const jobKey = `${entity.key}:${format}`;
    setDownloading(jobKey);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "pdf" ? "pdf" : "xlsx";
      a.download = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        `${entity.key}-${from}-${to}.${ext}`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadLog((prev) => [
        {
          entity: entity.label,
          format: format.toUpperCase(),
          from,
          to,
          ts: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev.slice(0, 4),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setDownloading(null);
    }
  };

  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  const pdfCount = ENTITIES.filter((e) => e.pdfPath).length;

  const inp: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
  };

  return (
    <>
      <PageHeader eyebrow="ERP · Auditoría" title={cfg.title} subtitle={cfg.subtitle} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <KpiCard label="Reportes disponibles" value={ENTITIES.length} icon="📦" />
        <KpiCard
          label="Periodo seleccionado"
          value={`${days}d`}
          icon="📅"
          hint={`${from} → ${to}`}
          variant={days > 0 ? "accent" : "warning"}
        />
        <KpiCard
          label="Exportaciones en sesión"
          value={downloadLog.length}
          icon="⬇"
          variant={downloadLog.length > 0 ? "positive" : "default"}
        />
        <KpiCard
          label="Formatos"
          value="XLSX / PDF"
          icon="📊"
          hint={`${ENTITIES.length} Excel · ${pdfCount} PDF`}
        />
      </div>

      {cfg.viewMode !== "manage" && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--state-warning-bg)",
            border: "1px solid var(--state-warning-border)",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            color: "var(--state-warning-text)",
          }}
        >
          Las exportaciones solo incluyen los datos a los que tienes acceso según tu rol.
        </div>
      )}

      <Section title="Rango de fechas" subtitle="Aplica a packs contables/CRM, PDF de viáticos y usuarios">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {PRESETS.map((p) => {
            const r = p.range();
            const active = r.from === from && r.to === to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: active ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                  background: active
                    ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                    : "var(--surface)",
                  color: active ? "var(--primary)" : "var(--text-secondary)",
                  transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
          </label>
        </div>
      </Section>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--state-danger-bg)",
            border: "1px solid var(--state-danger-border)",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            color: "var(--state-danger-text)",
          }}
        >
          {error}
        </div>
      )}

      <Section title="Reportes disponibles" subtitle="Solo Excel y PDF — CSV deshabilitado">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {ENTITIES.map((e) => {
            const xlsxBusy = downloading === `${e.key}:xlsx`;
            const pdfBusy = downloading === `${e.key}:pdf`;
            return (
              <div
                key={e.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--surface)",
                  border: `1px solid ${xlsxBusy || pdfBusy ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: 12,
                  transition: "border-color 0.15s",
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1, marginTop: 2 }}>{e.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.4 }}>
                    {e.desc}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                    Excel{e.pdfPath ? " · PDF" : ""} · {days} días
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      variant={xlsxBusy ? "primary" : "secondary"}
                      onClick={() => void download(e, "xlsx")}
                      disabled={!!downloading}
                    >
                      {xlsxBusy ? "Generando…" : "Excel"}
                    </Button>
                    {e.pdfPath ? (
                      <Button
                        size="sm"
                        variant={pdfBusy ? "primary" : "secondary"}
                        onClick={() => void download(e, "pdf")}
                        disabled={!!downloading}
                      >
                        {pdfBusy ? "Generando…" : "PDF"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {downloadLog.length > 0 && (
        <Section title="Exportaciones recientes" subtitle="En esta sesión">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {downloadLog.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: "var(--success)", fontWeight: 700 }}>✓</span>
                <span style={{ fontWeight: 600 }}>{l.entity}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{l.format}</span>
                <span style={{ color: "var(--text-tertiary)", flex: 1 }}>
                  {l.from} → {l.to}
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>{l.ts}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
