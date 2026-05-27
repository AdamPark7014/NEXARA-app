"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Item = { id: string; ingeniero: string; ot: string; concepto: string; monto: number; coordinador: "✓" | "—"; admin: "✓" | "—" | "✗"; estado: string };

const ITEMS: Item[] = [
  { id: "V-4519", ingeniero: "Ronaldo H.", ot: "OT-3420", concepto: "Hospedaje 1 noche Cholula", monto: 1450, coordinador: "✓", admin: "—", estado: "Pendiente admin." },
  { id: "V-4517", ingeniero: "Sandra L.", ot: "OT-3415", concepto: "Comida + gasolina", monto: 980, coordinador: "✓", admin: "✓", estado: "Aprobado" },
  { id: "V-4516", ingeniero: "Eduardo M.", ot: "OT-3413", concepto: "Casetas CDMX-Puebla redondo", monto: 540, coordinador: "✓", admin: "✓", estado: "Aprobado" },
  { id: "V-4515", ingeniero: "Brandon C.", ot: "OT-3412", concepto: "Cena con cliente", monto: 850, coordinador: "✓", admin: "✗", estado: "Rechazado (sin factura)" },
];

export default function Page() {
  const columns: Column<Item>[] = [
    { key: "id", label: "ID", render: (i) => <Tag variant="accent">{i.id}</Tag>, width: 90 },
    { key: "ingeniero", label: "Solicitante", accessor: (i) => i.ingeniero, width: 130 },
    { key: "ot", label: "OT", accessor: (i) => i.ot, width: 90 },
    { key: "concepto", label: "Concepto", accessor: (i) => i.concepto },
    { key: "monto", label: "Monto", align: "right", render: (i) => <Money value={i.monto} /> },
    { key: "coordinador", label: "Coord.", align: "center", render: (i) => (
      <span style={{ fontWeight: 700, color: i.coordinador === "✓" ? "var(--success)" : "var(--text-tertiary)" }}>{i.coordinador}</span>
    ) },
    { key: "admin", label: "Admin.", align: "center", render: (i) => (
      <span style={{ fontWeight: 700, color: i.admin === "✓" ? "var(--success)" : i.admin === "✗" ? "var(--danger)" : "var(--text-tertiary)" }}>{i.admin}</span>
    ) },
    { key: "estado", label: "Estado", render: (i) => (
      <Tag variant={i.estado === "Aprobado" ? "positive" : i.estado.startsWith("Rechaz") ? "danger" : "warning"}>{i.estado}</Tag>
    ) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Viáticos · Administración"
        subtitle="Aprobación final tras la firma del coordinador de OPS. Aquí se libera el reembolso a banca."
        actions={<Button variant="primary" iconLeft="💸">Liberar reembolsos</Button>}
      />
      <Section title="Cola de aprobación administrativa">
        <DataTable columns={columns} rows={ITEMS} rowKey={(i) => i.id} onRowClick={(i) => alert(`Abrir ${i.id}`)} />
      </Section>
    </>
  );
}
