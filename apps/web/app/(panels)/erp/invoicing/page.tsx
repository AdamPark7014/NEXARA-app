"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type CFDI = {
  uuid: string;
  folio: string;
  cliente: string;
  tipo: "Ingreso" | "Egreso" | "Nómina" | "Pago";
  monto: number;
  fecha: string;
  estado: "Timbrada" | "Cancelada" | "Pendiente";
};

const FACTURAS: CFDI[] = [
  { uuid: "5F2A...8B91", folio: "F-2026-0421", cliente: "UDLA Cholula", tipo: "Ingreso", monto: 1850000, fecha: "26/05/26", estado: "Timbrada" },
  { uuid: "3D1C...7A22", folio: "F-2026-0420", cliente: "Soriana S.A.B.", tipo: "Ingreso", monto: 45000, fecha: "26/05/26", estado: "Timbrada" },
  { uuid: "8E4F...9C33", folio: "F-2026-0419", cliente: "Operadora TOKS", tipo: "Ingreso", monto: 18000, fecha: "25/05/26", estado: "Timbrada" },
  { uuid: "2B5A...4D77", folio: "P-2026-0118", cliente: "Comercializadora Lima", tipo: "Pago", monto: 142500, fecha: "25/05/26", estado: "Timbrada" },
  { uuid: "9F7E...1B45", folio: "F-2026-0418", cliente: "Hotel Camino Real", tipo: "Ingreso", monto: 22000, fecha: "24/05/26", estado: "Timbrada" },
  { uuid: "1A2B...3C44", folio: "C-2026-0014", cliente: "TechParts SA", tipo: "Egreso", monto: 95000, fecha: "23/05/26", estado: "Cancelada" },
];

export default function InvoicingPage() {
  const timbradas = FACTURAS.filter((f) => f.estado === "Timbrada");
  const ingresos = timbradas.filter((f) => f.tipo === "Ingreso").reduce((s, f) => s + f.monto, 0);

  const columns: Column<CFDI>[] = [
    { key: "folio", label: "Folio", render: (f) => <Tag variant="accent">{f.folio}</Tag>, width: 120 },
    { key: "uuid", label: "UUID", render: (f) => <code style={{ fontSize: 11 }}>{f.uuid}</code>, width: 130 },
    { key: "cliente", label: "Cliente", accessor: (f) => f.cliente },
    {
      key: "tipo", label: "Tipo",
      render: (f) => (
        <Tag variant={f.tipo === "Ingreso" ? "positive" : f.tipo === "Egreso" ? "danger" : "neutral"}>
          {f.tipo}
        </Tag>
      ),
    },
    { key: "monto", label: "Monto", align: "right", render: (f) => <Money value={f.monto} /> },
    { key: "fecha", label: "Fecha", accessor: (f) => f.fecha, width: 100 },
    {
      key: "estado", label: "Estado",
      render: (f) => (
        <Tag variant={f.estado === "Timbrada" ? "positive" : f.estado === "Cancelada" ? "danger" : "warning"}>
          {f.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Facturación CFDI"
        subtitle="Timbrado, cancelaciones y complementos de pago en línea con el SAT."
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">Descargar XML masivo</Button>
            <Button variant="primary" iconLeft="🧾">Nueva factura</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Facturado del mes" value={<Money value={ingresos} />} hint={`${timbradas.length} CFDI timbrados`} variant="positive" icon="🧾" />
        <KpiCard label="Por timbrar" value="2" hint="Pendientes desde ayer" variant="warning" icon="⏳" />
        <KpiCard label="Canceladas (mes)" value="1" hint="$95k impacto neto" variant="danger" icon="✗" />
        <KpiCard label="Próximas a cancelar" value="0" hint="Plazo SAT 72h" variant="default" icon="🛡️" />
      </div>

      <Section title="CFDI del periodo">
        <DataTable columns={columns} rows={FACTURAS} rowKey={(f) => f.uuid} onRowClick={(f) => alert(`Abrir ${f.folio}`)} />
      </Section>
    </>
  );
}
