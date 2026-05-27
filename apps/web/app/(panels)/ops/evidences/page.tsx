"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";

type EvidenceReview = {
  id: string;
  ot: string;
  ingeniero: string;
  cliente: string;
  tipo: string;
  capturada: string;
  estado: "Pendiente revisión" | "Aprobada" | "Rechazada";
};

const QUEUE: EvidenceReview[] = [
  { id: "E-9826", ot: "OT-3422", ingeniero: "Brandon C.", cliente: "Soriana Plaza Reforma", tipo: "Video", capturada: "Hoy 13:22", estado: "Pendiente revisión" },
  { id: "E-9819", ot: "OT-3420", ingeniero: "Ronaldo H.", cliente: "UDLA Cholula", tipo: "Hoja de servicio", capturada: "Ayer 17:00", estado: "Aprobada" },
  { id: "E-9818", ot: "OT-3420", ingeniero: "Ronaldo H.", cliente: "UDLA Cholula", tipo: "Foto después", capturada: "Ayer 16:50", estado: "Aprobada" },
  { id: "E-9817", ot: "OT-3418", ingeniero: "Ronaldo H.", cliente: "Constructora Reyes", tipo: "Hoja de servicio", capturada: "Ayer 16:20", estado: "Rechazada" },
];

export default function EvidencesReviewPage() {
  const columns: Column<EvidenceReview>[] = [
    { key: "id", label: "ID", render: (e) => <Tag variant="accent">{e.id}</Tag>, width: 90 },
    { key: "ot", label: "OT", accessor: (e) => e.ot, width: 90 },
    { key: "ingeniero", label: "Ingeniero", accessor: (e) => e.ingeniero, width: 130 },
    { key: "cliente", label: "Cliente", accessor: (e) => e.cliente },
    { key: "tipo", label: "Tipo", render: (e) => <Tag variant="neutral">{e.tipo}</Tag> },
    { key: "capturada", label: "Capturada", accessor: (e) => e.capturada, width: 120 },
    {
      key: "estado", label: "Estado",
      render: (e) => (
        <Tag variant={e.estado === "Aprobada" ? "positive" : e.estado === "Rechazada" ? "danger" : "warning"}>
          {e.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Coordinación"
        title="Revisión de evidencias"
        subtitle="Centro de control de calidad: aprueba o rechaza evidencias antes de cerrar OT con el cliente."
        actions={<Button variant="primary" iconLeft="✓">Aprobar lote</Button>}
      />
      <Section title="Cola de revisión">
        <DataTable columns={columns} rows={QUEUE} rowKey={(e) => e.id} onRowClick={(e) => alert(`Revisar ${e.id}`)} />
      </Section>
    </>
  );
}
