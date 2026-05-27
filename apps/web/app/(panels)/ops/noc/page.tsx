"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

type Site = {
  cliente: string;
  sitio: string;
  estado: "Operativo" | "Degradado" | "Caído";
  uptime: number;
  latencia: number;
  ultimoIncidente: string;
};

const SITES: Site[] = [
  { cliente: "Soriana Plaza Reforma", sitio: "POS + 12 cámaras + red", estado: "Operativo", uptime: 99.98, latencia: 18, ultimoIncidente: "Sin incidentes 30d" },
  { cliente: "TOKS Centro Histórico", sitio: "POS + 4 cámaras", estado: "Degradado", uptime: 98.42, latencia: 95, ultimoIncidente: "POS-3 reportó error hoy 09:00" },
  { cliente: "UDLA Cholula", sitio: "Red campus + 120 PCs", estado: "Operativo", uptime: 99.93, latencia: 12, ultimoIncidente: "Sin incidentes 12d" },
  { cliente: "Hotel Camino Real", sitio: "WiFi habitaciones + admin", estado: "Operativo", uptime: 99.81, latencia: 22, ultimoIncidente: "Sin incidentes 7d" },
  { cliente: "Constructora Reyes (Obra)", sitio: "Red obra + POS móviles", estado: "Caído", uptime: 92.10, latencia: 0, ultimoIncidente: "Sin enlace desde ayer 16:20" },
];

export default function NocPage() {
  const operativos = SITES.filter((s) => s.estado === "Operativo").length;
  const degradados = SITES.filter((s) => s.estado === "Degradado").length;
  const caidos = SITES.filter((s) => s.estado === "Caído").length;

  return (
    <>
      <PageHeader
        eyebrow="OPS · NOC"
        title="Monitoreo de sitios"
        subtitle="Estado en tiempo real de la infraestructura instalada en cada cliente."
        actions={<Button variant="primary" iconLeft="🔔">Alertas</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Sitios monitoreados", value: SITES.length, color: "var(--primary)" },
          { label: "Operativos", value: operativos, color: "var(--success)" },
          { label: "Degradados", value: degradados, color: "var(--warning)" },
          { label: "Caídos", value: caidos, color: "var(--danger)" },
        ].map((k) => (
          <div key={String(k.label)} style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
              {k.label}
            </div>
            <div style={{ marginTop: 6, fontFamily: "var(--nx-font-display)", fontSize: 26, fontWeight: 700, color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <Section title="Estado por sitio">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SITES.map((s, i) => (
            <article
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: 16,
                alignItems: "center",
                padding: 14,
                background: "color-mix(in srgb, var(--surface-2) 40%, transparent)",
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  width: 12, height: 12, borderRadius: 999,
                  background: s.estado === "Operativo" ? "var(--success)" : s.estado === "Degradado" ? "var(--warning)" : "var(--danger)",
                  boxShadow: `0 0 12px ${s.estado === "Operativo" ? "var(--success)" : s.estado === "Degradado" ? "var(--warning)" : "var(--danger)"}`,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.cliente}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.sitio}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{s.ultimoIncidente}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>
                  {s.uptime.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Uptime 30d</div>
              </div>
              <Tag variant={s.estado === "Operativo" ? "positive" : s.estado === "Degradado" ? "warning" : "danger"}>
                {s.estado}
              </Tag>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
