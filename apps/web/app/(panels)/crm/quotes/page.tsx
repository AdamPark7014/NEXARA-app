"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Quote = {
  folio: string;
  cliente: string;
  concepto: string;
  monto: number;
  estado: "Borrador" | "Enviada" | "Firmada" | "Rechazada" | "Vencida";
  emitida: string;
  vigencia: string;
  ejecutivo: string;
};

const QUOTES: Quote[] = [
  { folio: "COT-1042", cliente: "UDLA Cholula", concepto: "120 laptops + 40 monitores", monto: 1850000, estado: "Enviada", emitida: "Ayer", vigencia: "30 días", ejecutivo: "Karina M." },
  { folio: "COT-1041", cliente: "Soriana Querétaro", concepto: "Mantenimiento anual POS", monto: 720000, estado: "Enviada", emitida: "2 días", vigencia: "15 días", ejecutivo: "Karen E." },
  { folio: "COT-1040", cliente: "Familia Garza", concepto: "4 cámaras + NVR + instalación", monto: 18500, estado: "Firmada", emitida: "3 días", vigencia: "—", ejecutivo: "Karina M." },
  { folio: "COT-1039", cliente: "Hotel Camino Real", concepto: "Cableado + WiFi 6", monto: 480000, estado: "Borrador", emitida: "Hoy", vigencia: "—", ejecutivo: "Karina M." },
  { folio: "COT-1038", cliente: "Polos del Bienestar", concepto: "384 cámaras CCTV (12 polos)", monto: 3200000, estado: "Enviada", emitida: "5 días", vigencia: "60 días", ejecutivo: "Karen E." },
  { folio: "COT-1037", cliente: "TechParts SA", concepto: "Mantenimiento mensual", monto: 95000, estado: "Rechazada", emitida: "1 semana", vigencia: "—", ejecutivo: "Karina M." },
  { folio: "COT-1036", cliente: "Comercializadora Lima", concepto: "20 laptops Lenovo", monto: 285000, estado: "Firmada", emitida: "1 semana", vigencia: "—", ejecutivo: "Karina M." },
];

export default function QuotesPage() {
  const total = QUOTES.reduce((s, q) => s + q.monto, 0);
  const firmadas = QUOTES.filter((q) => q.estado === "Firmada");

  const columns: Column<Quote>[] = [
    { key: "folio", label: "Folio", render: (q) => <Tag variant="accent">{q.folio}</Tag>, width: 110 },
    {
      key: "cliente", label: "Cliente / Concepto",
      render: (q) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{q.cliente}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.concepto}</div>
        </div>
      ),
    },
    { key: "monto", label: "Monto", align: "right", render: (q) => <Money value={q.monto} compact /> },
    {
      key: "estado", label: "Estado",
      render: (q) => (
        <Tag
          variant={
            q.estado === "Firmada" ? "positive"
              : q.estado === "Enviada" ? "accent"
                : q.estado === "Borrador" ? "neutral"
                  : q.estado === "Rechazada" ? "danger"
                    : "warning"
          }
        >
          {q.estado}
        </Tag>
      ),
    },
    { key: "emitida", label: "Emitida", render: (q) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{q.emitida}</span> },
    { key: "vigencia", label: "Vigencia", render: (q) => <span style={{ fontSize: 12 }}>{q.vigencia}</span> },
    { key: "ejecutivo", label: "Ejecutivo", accessor: (q) => q.ejecutivo, width: 110 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo y cotizaciones"
        title="Cotizaciones"
        subtitle="Documentos formales con líneas vinculadas al catálogo (equipos, servicios, mano de obra)."
        actions={
          <>
            <Button variant="secondary" iconLeft="📋">
              Plantillas
            </Button>
            <Button variant="primary" iconLeft="📝">
              Nueva cotización
            </Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { label: "Total cotizado", value: <Money value={total} />, color: "var(--primary)" },
          { label: "Firmadas (mes)", value: `${firmadas.length}`, color: "var(--success)" },
          { label: "Tasa de firma", value: `${Math.round((firmadas.length / QUOTES.length) * 100)}%`, color: "var(--accent)" },
          { label: "Tiempo prom. firma", value: "6.2 días", color: "var(--text-secondary)" },
        ].map((kpi) => (
          <div
            key={String(kpi.label)}
            style={{
              padding: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
              {kpi.label}
            </div>
            <div style={{ marginTop: 8, fontFamily: "var(--nx-font-display)", fontSize: 22, fontWeight: 700, color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <Section title="Todas las cotizaciones">
        <DataTable
          columns={columns}
          rows={QUOTES}
          rowKey={(q) => q.folio}
          onRowClick={(q) => alert(`Abrir ${q.folio}`)}
        />
      </Section>
    </>
  );
}
