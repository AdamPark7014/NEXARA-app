"use client";

import { useDeferredValue, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { saveBlob, todayStamp } from "@/components/finance/download";

type ExportFormat = "xlsx" | "pdf";

type Grupo = "Finanzas" | "Comercial" | "Operación" | "Personas";

type ExportCard = {
  key: string;
  label: string;
  grupo: Grupo;
  desc: string;
  xlsxPath: (from: string, to: string) => string;
  pdfPath?: (from: string, to: string) => string;
  /** Cómo usa el Excel el rango elegido; por omisión, el periodo completo. */
  xlsxRango?: "sin-rango" | "dia-final";
  /** Días máximos que acepta el servidor. */
  maxDias?: number;
};

const ENTITIES: ExportCard[] = [
  {
    key: "invoices",
    label: "Facturas",
    grupo: "Finanzas",
    desc: "Facturación emitida en el periodo, por fecha de emisión.",
    xlsxPath: (from, to) => `exports/invoices?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "viatics",
    label: "Viáticos",
    grupo: "Finanzas",
    desc: "Gastos de viaje aprobados y por aprobar.",
    xlsxPath: () => "viatics/export/xlsx",
    pdfPath: (from, to) => `viatics/report.pdf?from=${from}&to=${to}`,
    xlsxRango: "sin-rango",
  },
  {
    key: "cotizaciones",
    label: "Cotizaciones",
    grupo: "Comercial",
    desc: "Folios, cliente, segmento, importes y firma.",
    xlsxPath: (from, to) => `exports/cotizaciones?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "clients",
    label: "Clientes",
    grupo: "Comercial",
    desc: "Cuentas comerciales y datos de contacto.",
    xlsxPath: (from, to) => `exports/clients?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "leads",
    label: "Prospectos",
    grupo: "Comercial",
    desc: "Prospectos en seguimiento comercial.",
    xlsxPath: (from, to) => `exports/leads?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "opportunities",
    label: "Oportunidades",
    grupo: "Comercial",
    desc: "Oportunidades abiertas y cerradas.",
    xlsxPath: (from, to) => `exports/opportunities?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "projects",
    label: "Proyectos",
    grupo: "Comercial",
    desc: "Proyectos de venta e implementación.",
    xlsxPath: (from, to) => `exports/projects?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "crm-activities",
    label: "Actividades comerciales",
    grupo: "Comercial",
    desc: "Llamadas, visitas y seguimiento comercial.",
    xlsxPath: (from, to) => `exports/crm-activities?from=${from}&to=${to}&format=xlsx`,
  },
  {
    key: "activities",
    label: "Actividades y órdenes de trabajo",
    grupo: "Operación",
    desc: "Órdenes de trabajo, técnicos, estados y tiempos.",
    xlsxPath: () => "activities/export/xlsx",
    pdfPath: (from, to) => `activities/report.pdf?from=${from}&to=${to}`,
    xlsxRango: "sin-rango",
  },
  {
    key: "vehicles",
    label: "Vehículos",
    grupo: "Operación",
    desc: "Flota activa, asignaciones y mantenimientos.",
    xlsxPath: () => "vehicles/export/xlsx",
    xlsxRango: "sin-rango",
  },
  {
    key: "evidences",
    label: "Evidencias",
    grupo: "Operación",
    desc: "Archivos adjuntos y fotos de actividades.",
    xlsxPath: () => "evidences/export/xlsx",
    xlsxRango: "sin-rango",
  },
  {
    key: "kpis-equipo",
    label: "Indicadores del equipo",
    grupo: "Personas",
    desc: "Retardos, uniforme, horas laboradas contra productivas y tiempo extra.",
    xlsxPath: (from, to) => `me/kpis/equipo/export.xlsx?desde=${from}&hasta=${to}`,
    maxDias: 93,
  },
  {
    key: "attendance",
    label: "Asistencia híbrida",
    grupo: "Personas",
    desc: "Checador del ERP contra los accesos del control de acceso.",
    xlsxPath: (_from, to) => `attendance/hybrid/export.xlsx?date=${to}`,
    xlsxRango: "dia-final",
  },
  {
    key: "users",
    label: "Usuarios",
    grupo: "Personas",
    desc: "Personal, roles y datos de RRHH.",
    xlsxPath: (from, to) => `exports/users?from=${from}&to=${to}&format=xlsx`,
  },
];

const GRUPOS: Grupo[] = ["Finanzas", "Comercial", "Operación", "Personas"];

const PRESETS = [
  {
    label: "Esta semana",
    range: () => {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: todayStamp(monday), to: todayStamp(now) };
    },
  },
  {
    label: "Este mes",
    range: () => {
      const now = new Date();
      return { from: todayStamp(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayStamp(now) };
    },
  },
  {
    label: "Mes anterior",
    range: () => {
      const now = new Date();
      return {
        from: todayStamp(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: todayStamp(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: "Último trimestre",
    range: () => {
      const now = new Date();
      return { from: todayStamp(new Date(now.getFullYear(), now.getMonth() - 3, 1)), to: todayStamp(now) };
    },
  },
  {
    label: "Este año",
    range: () => {
      const now = new Date();
      return { from: todayStamp(new Date(now.getFullYear(), 0, 1)), to: todayStamp(now) };
    },
  },
];

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m?.[1] ? decodeURIComponent(m[1]) : fallback;
}

function formatFecha(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function problemaRango(from: string, to: string): string | null {
  if (!from || !to) return "Elige las dos fechas para poder exportar.";
  if (from > to) return "La fecha final es anterior a la inicial. Ponla en el mismo día o después.";
  return null;
}

type Job = { entity: ExportCard; format: ExportFormat };

export default function ExportsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "exports"), [user]);
  const token = user?.token ?? "";

  const [from, setFrom] = useState(() => todayStamp(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => todayStamp());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; job: Job } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [downloadLog, setDownloadLog] = useState<
    { id: number; entity: string; format: string; from: string; to: string; ts: string }[]
  >([]);

  const rangoInvalido = problemaRango(from, to);
  const dias = rangoInvalido
    ? 0
    : Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000) + 1;

  const download = async (entity: ExportCard, format: ExportFormat) => {
    if (!token || rangoInvalido) return;
    const path = format === "pdf" ? entity.pdfPath?.(from, to) : entity.xlsxPath(from, to);
    if (!path) return;
    const jobKey = `${entity.key}:${format}`;
    setDownloading(jobKey);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const ext = format === "pdf" ? "pdf" : "xlsx";
      saveBlob(
        await res.blob(),
        filenameFromDisposition(res.headers.get("Content-Disposition"), `${entity.key}-${from}-${to}.${ext}`),
      );
      setDownloadLog((prev) => [
        {
          id: Date.now(),
          entity: entity.label,
          format: format === "pdf" ? "PDF" : "Excel",
          from,
          to,
          ts: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev.slice(0, 4),
      ]);
    } catch (e) {
      setError({
        text: `No se pudo generar ${entity.label} (${format === "pdf" ? "PDF" : "Excel"}). ${formatApiError(e, "Intenta de nuevo en un momento.")}`,
        job: { entity, format },
      });
    } finally {
      setDownloading(null);
    }
  };

  const q = useDeferredValue(busqueda).trim().toLowerCase();
  const porGrupo = useMemo(() => {
    const visibles = q
      ? ENTITIES.filter((e) => `${e.label} ${e.desc} ${e.grupo}`.toLowerCase().includes(q))
      : ENTITIES;
    return GRUPOS.map((g) => ({ grupo: g, items: visibles.filter((e) => e.grupo === g) })).filter(
      (g) => g.items.length > 0,
    );
  }, [q]);

  const metrics: Metric[] = [
    {
      label: "Reportes disponibles",
      value: ENTITIES.length,
      hint: `${ENTITIES.filter((e) => e.pdfPath).length} también en PDF`,
    },
    {
      label: "Periodo",
      value: rangoInvalido ? "—" : `${dias} ${dias === 1 ? "día" : "días"}`,
      hint: rangoInvalido ? "Rango incompleto" : `${formatFecha(from)} – ${formatFecha(to)}`,
      tone: rangoInvalido ? "warning" : "default",
    },
    {
      label: "Descargados",
      value: downloadLog.length,
      hint: "en esta sesión",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        density="ops"
      />

      <div style={{ marginBottom: 18 }}>
        <MetricStrip metrics={metrics} ariaLabel="Resumen de exportaciones" />
      </div>

      {cfg.viewMode !== "manage" && (
        <InlineAlert
          variant="info"
          message="Las exportaciones solo incluyen los datos a los que tienes acceso según tu rol."
        />
      )}

      <Section title="Periodo" subtitle="Aplica a los reportes que filtran por fecha. Los que no lo usan lo indican en su tarjeta.">
        <div role="group" aria-label="Periodos rápidos" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {PRESETS.map((p) => {
            const r = p.range();
            const active = r.from === from && r.to === to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                className="nx-export-preset"
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                }}
                style={{
                  minHeight: 32,
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: active ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                  background: active ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                  color: active ? "var(--primary)" : "var(--text-secondary)",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Desde</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-invalid={rangoInvalido && !from ? true : undefined}
              style={{ width: "auto" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Hasta</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={rangoInvalido ? true : undefined}
              aria-describedby={rangoInvalido ? "export-rango-error" : undefined}
              style={{ width: "auto" }}
            />
          </label>
        </div>
        {rangoInvalido && (
          <p id="export-rango-error" role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--state-danger-text)" }}>
            {rangoInvalido}
          </p>
        )}
      </Section>

      {error && (
        <InlineAlert
          variant="danger"
          message={error.text}
          onDismiss={() => setError(null)}
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={!!downloading || !!rangoInvalido}
              onClick={() => void download(error.job.entity, error.job.format)}
            >
              Reintentar
            </Button>
          }
        />
      )}

      <Section
        title="Reportes"
        subtitle="Excel o PDF según el reporte."
        actions={
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar reporte…"
            aria-label="Buscar reporte"
            style={{ width: 220, maxWidth: "100%" }}
          />
        }
      >
        {porGrupo.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Ningún reporte coincide"
            description={`No hay reportes que contengan «${busqueda.trim()}».`}
            action={<Button size="sm" variant="secondary" onClick={() => setBusqueda("")}>Limpiar búsqueda</Button>}
          />
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {porGrupo.map(({ grupo, items }) => (
              <section key={grupo} aria-labelledby={`export-grupo-${grupo}`}>
                <h3
                  id={`export-grupo-${grupo}`}
                  style={{
                    margin: "0 0 8px",
                    fontSize: 11,
                    fontWeight: 650,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {grupo}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 10 }}>
                  {items.map((e) => (
                    <ReportCard
                      key={e.key}
                      entity={e}
                      dias={dias}
                      downloading={downloading}
                      rangoInvalido={!!rangoInvalido}
                      onDownload={(format) => void download(e, format)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Section>

      {downloadLog.length > 0 && (
        <Section title="Descargas recientes" subtitle="En esta sesión">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {downloadLog.map((l) => (
              <li
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "4px 12px",
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--success)", fontWeight: 700 }}>✓</span>
                <span style={{ fontWeight: 600 }}>{l.entity}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{l.format}</span>
                <span style={{ color: "var(--text-tertiary)", flex: 1, fontVariantNumeric: "tabular-nums" }}>
                  {formatFecha(l.from)} – {formatFecha(l.to)}
                </span>
                <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{l.ts}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <style>{`
        .nx-export-preset:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
      `}</style>
    </>
  );
}

function ReportCard({
  entity: e,
  dias,
  downloading,
  rangoInvalido,
  onDownload,
}: {
  entity: ExportCard;
  dias: number;
  downloading: string | null;
  rangoInvalido: boolean;
  onDownload: (format: ExportFormat) => void;
}) {
  const xlsxBusy = downloading === `${e.key}:xlsx`;
  const pdfBusy = downloading === `${e.key}:pdf`;
  const excedeMax = e.maxDias != null && dias > e.maxDias;
  const bloqueado = !!downloading || rangoInvalido;

  const notaRango =
    e.xlsxRango === "sin-rango"
      ? e.pdfPath
        ? "El Excel trae todo el histórico; el PDF usa el periodo."
        : "Trae todo el histórico; no usa el periodo."
      : e.xlsxRango === "dia-final"
        ? "Usa solo el día final del periodo."
        : e.maxDias
          ? `Máximo ${e.maxDias} días.`
          : null;

  return (
    <div
      aria-busy={xlsxBusy || pdfBusy || undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 14px",
        background: "var(--surface)",
        border: `1px solid ${xlsxBusy || pdfBusy ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 12,
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ fontWeight: 650, fontSize: 13.5, color: "var(--text-primary)" }}>{e.label}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>{e.desc}</div>
      {notaRango && (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color: excedeMax ? "var(--state-danger-text)" : "var(--text-tertiary)",
          }}
        >
          {excedeMax ? `El periodo tiene ${dias} días y este reporte acepta máximo ${e.maxDias}. Acórtalo para exportar.` : notaRango}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Button
          size="sm"
          variant="secondary"
          loading={xlsxBusy}
          onClick={() => onDownload("xlsx")}
          disabled={bloqueado || excedeMax}
          aria-label={`Descargar ${e.label} en Excel`}
        >
          {xlsxBusy ? "Generando…" : "Excel"}
        </Button>
        {e.pdfPath ? (
          <Button
            size="sm"
            variant="secondary"
            loading={pdfBusy}
            onClick={() => onDownload("pdf")}
            disabled={bloqueado}
            aria-label={`Descargar ${e.label} en PDF`}
          >
            {pdfBusy ? "Generando…" : "PDF"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
