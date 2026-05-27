"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Viatic = {
  id: string;
  ingeniero: string;
  ot: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: "Pendiente coord." | "Pendiente admin." | "Aprobado" | "Rechazado";
};

const ITEMS: Viatic[] = [
  { id: "V-4521", ingeniero: "Brandon C.", ot: "OT-3422", concepto: "Gasolina ruta Puebla–CDMX", monto: 850, fecha: "Hoy", estado: "Pendiente coord." },
  { id: "V-4520", ingeniero: "Brandon C.", ot: "OT-3421", concepto: "Comida + casetas", monto: 320, fecha: "Hoy", estado: "Aprobado" },
  { id: "V-4519", ingeniero: "Ronaldo H.", ot: "OT-3420", concepto: "Hospedaje 1 noche Cholula", monto: 1450, fecha: "Ayer", estado: "Pendiente admin." },
  { id: "V-4518", ingeniero: "Ronaldo H.", ot: "OT-3418", concepto: "Refacciones de emergencia", monto: 2800, fecha: "Ayer", estado: "Rechazado" },
];

export default function OpsViaticsPage() {
  const columns: Column<Viatic>[] = [
    { key: "id", label: "ID", render: (v) => <Tag variant="accent">{v.id}</Tag>, width: 90 },
    { key: "ingeniero", label: "Ingeniero", accessor: (v) => v.ingeniero, width: 130 },
    { key: "ot", label: "OT", accessor: (v) => v.ot, width: 100 },
    { key: "concepto", label: "Concepto", render: (v) => <span style={{ fontSize: 13 }}>{v.concepto}</span> },
    { key: "monto", label: "Monto", align: "right", render: (v) => <Money value={v.monto} /> },
    { key: "fecha", label: "Fecha", accessor: (v) => v.fecha, width: 90 },
    {
      key: "estado", label: "Estado",
      render: (v) => (
        <Tag
          variant={
            v.estado === "Aprobado" ? "positive"
              : v.estado === "Rechazado" ? "danger"
                : "warning"
          }
        >
          {v.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Coordinación"
        title="Viáticos del equipo"
        subtitle="Aprueba o devuelve viáticos antes de que pasen a Administración para reembolso."
        actions={<Button variant="primary" iconLeft="✓">Aprobar lote</Button>}
      />
      <Section title="Cola de aprobación">
        <DataTable columns={columns} rows={ITEMS} rowKey={(v) => v.id} onRowClick={(v) => alert(`Abrir ${v.id}`)} />
      </Section>
    </>
  );
}
