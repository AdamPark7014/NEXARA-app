"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

type OT = {
  id: string;
  cliente: string;
  concepto: string;
  ing: string;
  avance: number;
  eta: string;
  tipo: "Instalación" | "Mantenimiento" | "Correctivo";
};

const OTS: OT[] = [
  { id: "OT-3421", cliente: "TOKS Centro Histórico", concepto: "Cambio cabezal impresora térmica", ing: "Julio R.", avance: 60, eta: "13:30", tipo: "Correctivo" },
  { id: "OT-3422", cliente: "Soriana Plaza Reforma", concepto: "Mantenimiento mensual POS x12", ing: "David M.", avance: 30, eta: "16:00", tipo: "Mantenimiento" },
  { id: "OT-3423", cliente: "Polos del Bienestar · Polo 4", concepto: "Instalación 32 cámaras + NVR", ing: "Israel R. + brigada", avance: 75, eta: "Mañana", tipo: "Instalación" },
  { id: "OT-3424", cliente: "Hotel Camino Real", concepto: "Levantamiento cableado estructurado", ing: "Alejandro G. (PM)", avance: 15, eta: "Jueves", tipo: "Instalación" },
];

type Alert = { tipo: string; sitio: string; time: string; sev: "danger" | "warning" | "info" };

const ALERTS: Alert[] = [
  { tipo: "Cámara offline", sitio: "Soriana QRO · Pasillo 4", time: "hace 3 min", sev: "danger" },
  { tipo: "Latencia alta", sitio: "TOKS Polanco · POS-7", time: "hace 12 min", sev: "warning" },
  { tipo: "NVR sin grabación", sitio: "Familia Garza", time: "hace 28 min", sev: "danger" },
  { tipo: "Switch reiniciado", sitio: "UDLA · Edificio Académico", time: "hace 41 min", sev: "info" },
];

const TYPE_COLOR: Record<OT["tipo"], string> = {
  Instalación: "#0ea5e9",
  Mantenimiento: "#10b981",
  Correctivo: "#ef4444",
};

export default function OpsDashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="OPS · Operación de campo"
        title="Hoy en operaciones"
        subtitle="OT abiertas, ingenieros en sitio, evidencias por revisar, alertas NOC y SLA al límite."
        variant="hero"
        meta={
          <>
            <Tag variant="positive" dot>11/14 ingenieros en sitio</Tag>
            <Tag variant="accent">34 OT abiertas</Tag>
            <Tag variant="warning">1 SLA en riesgo</Tag>
          </>
        }
        actions={
          <>
            <Link href="/ops/activities" style={{ textDecoration: "none" }}>
              <Button variant="secondary" iconLeft="📋">
                Todas las OT
              </Button>
            </Link>
            <Link href="/ops/noc" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📡" iconRight="→">
                Centro NOC
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
          label="OT abiertas hoy"
          value="34"
          hint="12 instalación · 18 mantenimiento · 4 correctivas"
          icon="📋"
          variant="accent"
          sparkline={[22, 26, 28, 30, 32, 33, 34]}
        />
        <KpiCard
          label="Ingenieros en campo"
          value="11/14"
          hint="3 en oficina · 0 ausentes"
          icon="🧑‍🔧"
          variant="positive"
        />
        <KpiCard
          label="Evidencias por revisar"
          value="17"
          hint="6 vencen hoy"
          icon="📸"
          variant="warning"
          trend={{ value: "+5 vs ayer", direction: "down" }}
        />
        <KpiCard
          label="Uptime cámaras 24h"
          value="99.6%"
          hint="1,184 / 1,189 nodos OK"
          icon="📡"
          variant="positive"
          sparkline={[98.8, 99.1, 99.3, 99.5, 99.6, 99.6, 99.6]}
        />
        <KpiCard
          label="Tickets críticos"
          value="3"
          hint="2 dentro de SLA · 1 en riesgo"
          icon="🆘"
          variant="danger"
        />
        <KpiCard
          label="Visitas preventivas"
          value="8/12"
          hint="esta semana · TOKS, Soriana"
          icon="🔧"
          sparkline={[2, 3, 4, 5, 6, 7, 8]}
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
          eyebrow="En campo"
          title="OT activas en este momento"
          subtitle="Ubicación, ingeniero asignado y avance — actualizado en vivo desde GPS"
          tone="accent"
          actions={
            <Link href="/ops/gps" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost" iconRight="→">
                Ver GPS en vivo
              </Button>
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OTS.map((ot) => (
              <article
                key={ot.id}
                className="nx-ot"
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "13px 16px 13px 18px",
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
                    background: TYPE_COLOR[ot.tipo],
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--nx-font-display)",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "5px 10px",
                    background:
                      "linear-gradient(180deg, color-mix(in srgb, var(--primary) 92%, white) 0%, var(--primary) 100%)",
                    color: "#fff",
                    borderRadius: 8,
                    letterSpacing: "0.04em",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 8px color-mix(in srgb, var(--primary) 30%, transparent)",
                  }}
                >
                  {ot.id}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: `color-mix(in srgb, ${TYPE_COLOR[ot.tipo]} 16%, transparent)`,
                        color: TYPE_COLOR[ot.tipo],
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      {ot.tipo}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                    {ot.cliente}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {ot.concepto} · {ot.ing}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "color-mix(in srgb, var(--surface-2) 80%, transparent)",
                        borderRadius: 999,
                        overflow: "hidden",
                        maxWidth: 220,
                      }}
                    >
                      <div
                        style={{
                          width: `${ot.avance}%`,
                          height: "100%",
                          background: `linear-gradient(90deg, color-mix(in srgb, ${
                            ot.avance > 70 ? "var(--success)" : ot.avance > 40 ? "var(--primary)" : "var(--warning)"
                          } 70%, transparent) 0%, ${
                            ot.avance > 70 ? "var(--success)" : ot.avance > 40 ? "var(--primary)" : "var(--warning)"
                          } 100%)`,
                          borderRadius: 999,
                          transition: "width 600ms var(--nx-ease-out)",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ot.avance}% · ETA {ot.eta}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="secondary" iconRight="→">
                  Detalle
                </Button>
              </article>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="NOC"
          title="Alertas en vivo"
          subtitle="Últimos 60 minutos · solo no resueltas"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ALERTS.map((a, i) => {
              const color =
                a.sev === "danger" ? "var(--danger)" : a.sev === "warning" ? "var(--warning)" : "var(--primary)";
              return (
                <article
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "11px 12px",
                    borderRadius: 11,
                    border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`,
                    background: `linear-gradient(135deg, color-mix(in srgb, ${color} 8%, var(--surface)) 0%, var(--surface) 100%)`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)`,
                      animation: a.sev === "danger" ? "nxPulse 1.6s ease-in-out infinite" : undefined,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{a.tipo}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {a.sitio}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-tertiary)",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.time}
                  </span>
                </article>
              );
            })}
          </div>
        </Section>
      </div>

      <style jsx>{`
        :global(.nx-ot:hover) {
          transform: translateY(-1px);
          box-shadow: var(--nx-panel-elev-2);
        }
        @keyframes nxPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.18);
            opacity: 0.8;
          }
        }
      `}</style>
    </>
  );
}
