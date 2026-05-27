"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";

type Opp = {
  id: string;
  cliente: string;
  concepto: string;
  monto: number;
  prob: number;
  etapa: string;
  segmento: "Gobierno" | "Corporativo" | "PyME" | "Hogar";
};

const OPPS: Opp[] = [
  { id: "OP-602", cliente: "UDLA Cholula", concepto: "120 laptops + 40 monitores", monto: 1850000, prob: 80, etapa: "Cotización enviada", segmento: "Corporativo" },
  { id: "OP-541", cliente: "Polos del Bienestar (Gob CDMX)", concepto: "CCTV 12 polos · 384 cámaras + control central", monto: 3200000, prob: 60, etapa: "Negociación", segmento: "Gobierno" },
  { id: "OP-487", cliente: "Soriana Querétaro", concepto: "Mantenimiento anual POS + cámaras", monto: 720000, prob: 90, etapa: "Cierre", segmento: "Corporativo" },
  { id: "OP-590", cliente: "Hotel Camino Real", concepto: "Cableado estructurado + WiFi 6 enterprise", monto: 480000, prob: 50, etapa: "Discovery", segmento: "Corporativo" },
  { id: "OP-612", cliente: "Familia Garza (casa)", concepto: "4 cámaras Hikvision + NVR + instalación", monto: 18500, prob: 95, etapa: "Cierre", segmento: "Hogar" },
];

const SEG_COLOR: Record<Opp["segmento"], string> = {
  Gobierno: "#a855f7",
  Corporativo: "#10b981",
  PyME: "#0ea5e9",
  Hogar: "#f59e0b",
};

const AGENDA = [
  { hora: "09:00", titulo: "Llamada · Soriana QRO", tipo: "Llamada", color: "#10b981" },
  { hora: "11:30", titulo: "Demo CCTV remoto · Hotel Camino Real", tipo: "Demo", color: "#f59e0b" },
  { hora: "14:00", titulo: "Visita técnica · UDLA Cholula", tipo: "Visita", color: "#0ea5e9" },
  { hora: "16:00", titulo: "Cierre · Familia Garza", tipo: "Cierre", color: "#22c55e" },
];

export default function CrmDashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline comercial"
        title="Cierra el mes"
        subtitle="Tu pipeline, tus cuotas y los próximos cierres en un solo lugar. De casa habitación hasta licitaciones de gobierno."
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>62% de cuota</Tag>
            <Tag variant="positive">8 días restantes</Tag>
            <Tag variant="neutral">32 oportunidades activas</Tag>
          </>
        }
        actions={
          <>
            <Link href="/crm/leads" style={{ textDecoration: "none" }}>
              <Button variant="secondary" iconLeft="✨">
                Nuevo lead
              </Button>
            </Link>
            <Link href="/crm/quotes" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📝" iconRight="→">
                Nueva cotización
              </Button>
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label="Pipeline total"
          value={<Money value={4_800_000} compact />}
          hint="32 oportunidades activas"
          icon="🎯"
          variant="accent"
          trend={{ value: "+12% MoM", direction: "up" }}
          sparkline={[3.4, 3.7, 3.9, 4.1, 4.2, 4.5, 4.8]}
        />
        <KpiCard
          label="Cierre del mes"
          value={<Money value={1_600_000} compact />}
          hint="62% de cuota · 8 días restantes"
          icon="📈"
          variant="positive"
          sparkline={[0.4, 0.6, 0.9, 1.0, 1.3, 1.5, 1.6]}
        />
        <KpiCard
          label="Cotizaciones enviadas"
          value="24"
          hint="9 pendientes de firma"
          icon="📝"
          sparkline={[15, 17, 19, 21, 22, 23, 24]}
        />
        <KpiCard
          label="Velocidad promedio"
          value={<>18<span style={{ fontSize: "0.55em", marginLeft: 2, opacity: 0.7 }}>d</span></>}
          hint="Lead → cierre"
          icon="⚡"
          trend={{ value: "-2d", direction: "up" }}
        />
        <KpiCard
          label="Licitaciones activas"
          value="6"
          hint="2 gobierno · 4 corporativo"
          icon="📜"
          variant="accent"
        />
        <KpiCard
          label="Tasa de conversión"
          value="32%"
          hint="vs 28% mes pasado"
          icon="🎯"
          variant="positive"
          trend={{ value: "+4pp", direction: "up" }}
          sparkline={[24, 25, 27, 28, 30, 31, 32]}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <Section
          eyebrow="Hotseat"
          title="Oportunidades calientes 🔥"
          subtitle="Por monto × probabilidad — ordenadas por valor esperado"
          tone="accent"
          actions={
            <Link href="/crm/pipeline" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost" iconRight="→">
                Ver kanban
              </Button>
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OPPS.map((o) => (
              <article
                key={o.id}
                className="nx-opp"
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 16px 14px 18px",
                  borderRadius: 14,
                  background: "var(--surface)",
                  border: "1px solid var(--nx-panel-hairline)",
                  boxShadow: "var(--nx-panel-elev-1)",
                  transition: "transform 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 12,
                    bottom: 12,
                    width: 3,
                    borderRadius: "0 3px 3px 0",
                    background: SEG_COLOR[o.segmento],
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: `color-mix(in srgb, ${SEG_COLOR[o.segmento]} 16%, transparent)`,
                        color: SEG_COLOR[o.segmento],
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      {o.segmento}
                    </span>
                    <code style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{o.id}</code>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    {o.cliente}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {o.concepto}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "color-mix(in srgb, var(--surface-2) 80%, transparent)",
                        borderRadius: 999,
                        overflow: "hidden",
                        minWidth: 80,
                      }}
                    >
                      <div
                        style={{
                          width: `${o.prob}%`,
                          height: "100%",
                          background: `linear-gradient(90deg, color-mix(in srgb, var(--primary) 70%, transparent) 0%, var(--primary) 100%)`,
                          borderRadius: 999,
                          transition: "width 600ms var(--nx-ease-out)",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {o.prob}% · {o.etapa}
                    </span>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--nx-font-display)", fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em" }}>
                  <Money value={o.monto} compact />
                </span>
                <Button size="sm" variant="secondary" iconRight="→">
                  Abrir
                </Button>
              </article>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Hoy"
          title="Tu agenda comercial"
          subtitle="Llamadas, demos y visitas del día"
        >
          <div style={{ position: "relative", paddingLeft: 26 }}>
            <div
              style={{
                position: "absolute",
                left: 11,
                top: 6,
                bottom: 6,
                width: 2,
                background: "linear-gradient(180deg, var(--nx-panel-hairline) 0%, transparent 100%)",
                borderRadius: 1,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {AGENDA.map((t) => (
                <article
                  key={t.titulo}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 12px",
                    borderRadius: 11,
                    background: "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: -22,
                      top: 16,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--surface)",
                      border: `2px solid ${t.color}`,
                      boxShadow: `0 0 0 4px color-mix(in srgb, ${t.color} 14%, transparent)`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: `color-mix(in srgb, ${t.color} 16%, transparent)`,
                          color: t.color,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {t.tipo}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: "var(--nx-font-display)", fontWeight: 600, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {t.hora}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{t.titulo}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <style jsx>{`
        :global(.nx-opp:hover) {
          transform: translateY(-1px);
          box-shadow: var(--nx-panel-elev-2);
        }
      `}</style>
    </>
  );
}
