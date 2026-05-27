"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type OC = {
  folio: string;
  proveedor: string;
  concepto: string;
  monto: number;
  emitida: string;
  entregaEstimada: string;
  estado: "Solicitada" | "Aprobada" | "En tránsito" | "Recibida" | "Rechazada";
};

const OCS: OC[] = [
  { folio: "OC-2026-0072", proveedor: "Hikvision MX", concepto: "80 cámaras DS-2CD2143G2-I + accesorios", monto: 276000, emitida: "Hoy", entregaEstimada: "+3d", estado: "Aprobada" },
  { folio: "OC-2026-0071", proveedor: "Panduit Distribuidor", concepto: "10 bobinas Cat6 305m", monto: 28000, emitida: "Ayer", entregaEstimada: "+5d", estado: "En tránsito" },
  { folio: "OC-2026-0070", proveedor: "Lenovo Mayorista", concepto: "10 laptops ThinkPad T14", monto: 182000, emitida: "Hace 3d", entregaEstimada: "Mañana", estado: "En tránsito" },
  { folio: "OC-2026-0069", proveedor: "TP-Link MX", concepto: "20 switches 24p PoE+", monto: 84000, emitida: "Hace 4d", entregaEstimada: "Recibido", estado: "Recibida" },
  { folio: "OC-2026-0068", proveedor: "ELV Soluciones", concepto: "1km cable fibra óptica", monto: 35000, emitida: "Hace 5d", entregaEstimada: "—", estado: "Solicitada" },
];

export default function ProcurementPage() {
  const columns: Column<OC>[] = [
    { key: "folio", label: "OC", render: (o) => <code style={{ fontSize: 11.5 }}>{o.folio}</code>, width: 140 },
    { key: "proveedor", label: "Proveedor", render: (o) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{o.proveedor}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{o.concepto}</div>
      </div>
    ) },
    { key: "monto", label: "Monto", align: "right", render: (o) => <Money value={o.monto} compact /> },
    { key: "emitida", label: "Emitida", accessor: (o) => o.emitida, width: 100 },
    { key: "entrega", label: "Entrega", accessor: (o) => o.entregaEstimada, width: 100 },
    {
      key: "estado", label: "Estado",
      render: (o) => (
        <Tag variant={
          o.estado === "Recibida" ? "positive"
            : o.estado === "Aprobada" || o.estado === "En tránsito" ? "accent"
              : o.estado === "Rechazada" ? "danger"
                : "warning"
        }>
          {o.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Logística"
        title="Compras"
        subtitle="Requisiciones, órdenes de compra y gestión de proveedores. Pasa por aprobaciones jerárquicas."
        actions={
          <>
            <Button variant="secondary" iconLeft="🏪">Proveedores</Button>
            <Button variant="primary" iconLeft="🛒">Nueva OC</Button>
          </>
        }
      />
      <Section title="Órdenes de compra activas">
        <DataTable columns={columns} rows={OCS} rowKey={(o) => o.folio} onRowClick={(o) => alert(`Abrir ${o.folio}`)} />
      </Section>
    </>
  );
}
