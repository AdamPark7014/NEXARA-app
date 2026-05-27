"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Opp = {
  id: string;
  cliente: string;
  concepto: string;
  monto: number;
  prob: number;
  etapa: string;
  cierreEsperado: string;
  owner: string;
};

const OPPS: Opp[] = [
  { id: "OP-410", cliente: "Hotel Camino Real", concepto: "Cableado estructurado + WiFi 6", monto: 480000, prob: 30, etapa: "Discovery", cierreEsperado: "Jun 30", owner: "Karina M." },
  { id: "OP-411", cliente: "Escuela San José", concepto: "30 PCs + impresoras", monto: 220000, prob: 25, etapa: "Discovery", cierreEsperado: "Jul 15", owner: "Karina M." },
  { id: "OP-405", cliente: "Polos del Bienestar (Gob CDMX)", concepto: "384 cámaras CCTV multi-sitio", monto: 3200000, prob: 60, etapa: "Calificado", cierreEsperado: "Jun 20", owner: "Karen E." },
  { id: "OP-407", cliente: "Constructora Reyes", concepto: "POS + red empresarial en obra", monto: 850000, prob: 45, etapa: "Calificado", cierreEsperado: "Jul 02", owner: "Karina M." },
  { id: "OP-402", cliente: "UDLA Cholula", concepto: "120 laptops + 40 monitores", monto: 1850000, prob: 80, etapa: "Cotización", cierreEsperado: "Jun 10", owner: "Karina M." },
  { id: "OP-403", cliente: "Telcel Distribuidor", concepto: "Mantenimiento 6 sucursales", monto: 360000, prob: 55, etapa: "Cotización", cierreEsperado: "Jun 18", owner: "Karen E." },
  { id: "OP-398", cliente: "Soriana Querétaro", concepto: "Mantenimiento anual POS + cámaras", monto: 720000, prob: 90, etapa: "Negociación", cierreEsperado: "Jun 02", owner: "Karen E." },
  { id: "OP-390", cliente: "Familia Garza", concepto: "4 cámaras + NVR + instalación", monto: 18500, prob: 95, etapa: "Cierre", cierreEsperado: "Hoy", owner: "Karina M." },
  { id: "OP-391", cliente: "TOKS Centro", concepto: "Renovación mantenimiento mensual", monto: 540000, prob: 92, etapa: "Cierre", cierreEsperado: "Jun 05", owner: "Karen E." },
];

export default function OpportunitiesPage() {
  const columns: Column<Opp>[] = [
    { key: "id", label: "ID", render: (o) => <Tag variant="accent">{o.id}</Tag>, width: 90 },
    {
      key: "cliente", label: "Cliente / Concepto",
      render: (o) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{o.cliente}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{o.concepto}</div>
        </div>
      ),
    },
    { key: "monto", label: "Monto", align: "right", render: (o) => <Money value={o.monto} compact /> },
    {
      key: "prob", label: "Probabilidad", align: "center",
      render: (o) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 60, height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${o.prob}%`, height: "100%", background: "var(--primary)" }} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700 }}>{o.prob}%</span>
        </div>
      ),
    },
    { key: "etapa", label: "Etapa", render: (o) => <Tag variant="neutral">{o.etapa}</Tag> },
    { key: "cierre", label: "Cierre", render: (o) => <span style={{ fontSize: 12 }}>{o.cierreEsperado}</span> },
    { key: "owner", label: "Owner", accessor: (o) => o.owner, width: 110 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title="Oportunidades"
        subtitle="Listado completo de oportunidades activas. Para vista kanban, usa Pipeline."
        actions={
          <>
            <Button variant="secondary" iconLeft="📊">
              Ver kanban
            </Button>
            <Button variant="primary" iconLeft="🎯">
              Nueva
            </Button>
          </>
        }
      />
      <Section title={`${OPPS.length} oportunidades activas`}>
        <DataTable
          columns={columns}
          rows={OPPS}
          rowKey={(o) => o.id}
          onRowClick={(o) => alert(`Abrir ${o.id}`)}
        />
      </Section>
    </>
  );
}
