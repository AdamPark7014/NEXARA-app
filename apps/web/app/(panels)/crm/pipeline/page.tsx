"use client";

import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Money, Tag } from "@/components/ui/DataTable";

type Stage = {
  id: string;
  name: string;
  color: string;
  description: string;
  opportunities: Opportunity[];
};

type Opportunity = {
  id: string;
  cliente: string;
  concepto: string;
  monto: number;
  prob: number;
  owner: string;
  age: string;
  badge?: string;
};

const STAGES: Stage[] = [
  {
    id: "discovery", name: "Discovery", color: "#94a3b8",
    description: "Detectar necesidad real",
    opportunities: [
      { id: "OP-410", cliente: "Hotel Camino Real", concepto: "Cableado + WiFi 6", monto: 480000, prob: 30, owner: "Karina", age: "2d" },
      { id: "OP-411", cliente: "Escuela San José", concepto: "30 PCs + impresoras", monto: 220000, prob: 25, owner: "Karina", age: "5d" },
    ],
  },
  {
    id: "qualified", name: "Calificado", color: "#0ea5e9",
    description: "Hay presupuesto y decisor",
    opportunities: [
      { id: "OP-405", cliente: "Polos del Bienestar", concepto: "384 cámaras CCTV", monto: 3200000, prob: 60, owner: "Karen", age: "12d", badge: "Gov" },
      { id: "OP-407", cliente: "Constructora Reyes", concepto: "POS + red en obra", monto: 850000, prob: 45, owner: "Karina", age: "8d" },
    ],
  },
  {
    id: "proposal", name: "Cotización enviada", color: "#8b5cf6",
    description: "PDF en manos del cliente",
    opportunities: [
      { id: "OP-402", cliente: "UDLA Cholula", concepto: "120 laptops + 40 monitores", monto: 1850000, prob: 80, owner: "Karina", age: "4d" },
      { id: "OP-403", cliente: "Telcel Distribuidor", concepto: "Mantenimiento 6 sucursales", monto: 360000, prob: 55, owner: "Karen", age: "9d" },
    ],
  },
  {
    id: "negotiation", name: "Negociación", color: "#f59e0b",
    description: "Ajuste de precio / scope",
    opportunities: [
      { id: "OP-398", cliente: "Soriana Querétaro", concepto: "Mant. anual POS + cámaras", monto: 720000, prob: 90, owner: "Karen", age: "3d", badge: "Caliente" },
    ],
  },
  {
    id: "closing", name: "Cierre", color: "#10b981",
    description: "Firmando contrato",
    opportunities: [
      { id: "OP-390", cliente: "Familia Garza", concepto: "4 cámaras + NVR + instalación", monto: 18500, prob: 95, owner: "Karina", age: "1d" },
      { id: "OP-391", cliente: "TOKS Centro", concepto: "Renovación mant. mensual", monto: 540000, prob: 92, owner: "Karen", age: "6d" },
    ],
  },
  {
    id: "won", name: "Ganadas", color: "#16a34a",
    description: "Listas para handoff a OPS",
    opportunities: [
      { id: "OP-380", cliente: "Comercializadora Lima", concepto: "20 laptops Lenovo", monto: 285000, prob: 100, owner: "Karina", age: "1d" },
    ],
  },
];

export default function PipelinePage() {
  const totalPipeline = STAGES.reduce(
    (sum, s) => sum + s.opportunities.reduce((acc, o) => acc + o.monto, 0),
    0,
  );
  const weighted = STAGES.reduce(
    (sum, s) =>
      sum + s.opportunities.reduce((acc, o) => acc + (o.monto * o.prob) / 100, 0),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title="Kanban de oportunidades"
        subtitle={
          <span>
            <strong style={{ color: "var(--text-primary)" }}>$ {totalPipeline.toLocaleString("es-MX")}</strong>{" "}
            total en pipeline · <strong>${Math.round(weighted).toLocaleString("es-MX")}</strong> ponderado por
            probabilidad
          </span>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Exportar
            </Button>
            <Button variant="primary" iconLeft="🎯">
              Nueva oportunidad
            </Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STAGES.length}, minmax(260px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          paddingBottom: 12,
        }}
      >
        {STAGES.map((stage) => {
          const stageTotal = stage.opportunities.reduce((acc, o) => acc + o.monto, 0);
          return (
            <div
              key={stage.id}
              style={{
                background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 400,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: stage.color,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--nx-font-display)",
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}
                    >
                      {stage.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {stage.opportunities.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {stage.description}
                  </div>
                </div>
                <Money value={stageTotal} compact />
              </div>

              {stage.opportunities.map((o) => (
                <article
                  key={o.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 11,
                    cursor: "grab",
                    transition: "border-color var(--nx-motion-fast) ease, transform var(--nx-motion-fast) ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>
                      {o.cliente}
                    </div>
                    {o.badge && <Tag variant="warning">{o.badge}</Tag>}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    {o.concepto}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Money value={o.monto} compact />
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {o.prob}%
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 8,
                      fontSize: 10.5,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <span>👤 {o.owner}</span>
                    <span>⏱ {o.age}</span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      marginTop: 8,
                      background: "var(--surface-2)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${o.prob}%`,
                        height: "100%",
                        background: stage.color,
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
