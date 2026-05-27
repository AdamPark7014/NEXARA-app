"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";

type OT = {
  id: string;
  cliente: string;
  ingeniero: string;
  tipo: "Instalación" | "Mantenimiento" | "Correctivo" | "Auditoría";
  fecha: string;
  estado: "Programada" | "En curso" | "Completada" | "Reprogramar";
  evidencias: number;
  evidenciasReq: number;
};

const ALL_OT: OT[] = [
  { id: "OT-3422", cliente: "Soriana Plaza Reforma", ingeniero: "Brandon C.", tipo: "Mantenimiento", fecha: "Hoy 12:00", estado: "En curso", evidencias: 3, evidenciasReq: 8 },
  { id: "OT-3421", cliente: "TOKS Centro Histórico", ingeniero: "Brandon C.", tipo: "Correctivo", fecha: "Hoy 09:00", estado: "Completada", evidencias: 4, evidenciasReq: 4 },
  { id: "OT-3425", cliente: "Familia Garza", ingeniero: "Brandon C.", tipo: "Instalación", fecha: "Hoy 16:30", estado: "Programada", evidencias: 0, evidenciasReq: 6 },
  { id: "OT-3426", cliente: "Polos del Bienestar (Iztapalapa)", ingeniero: "Ronaldo H.", tipo: "Instalación", fecha: "Mañana 08:00", estado: "Programada", evidencias: 0, evidenciasReq: 32 },
  { id: "OT-3420", cliente: "UDLA Cholula", ingeniero: "Ronaldo H.", tipo: "Auditoría", fecha: "Ayer", estado: "Completada", evidencias: 12, evidenciasReq: 12 },
  { id: "OT-3419", cliente: "Hotel Camino Real", ingeniero: "Brandon C.", tipo: "Mantenimiento", fecha: "Ayer", estado: "Completada", evidencias: 8, evidenciasReq: 8 },
  { id: "OT-3418", cliente: "Constructora Reyes", ingeniero: "Ronaldo H.", tipo: "Correctivo", fecha: "Ayer", estado: "Reprogramar", evidencias: 1, evidenciasReq: 4 },
];

export default function ActivitiesPage() {
  const columns: Column<OT>[] = [
    { key: "id", label: "OT", render: (o) => <Tag variant="accent">{o.id}</Tag>, width: 100 },
    { key: "cliente", label: "Cliente", render: (o) => <span style={{ fontWeight: 600 }}>{o.cliente}</span> },
    { key: "ingeniero", label: "Ingeniero", accessor: (o) => o.ingeniero, width: 130 },
    { key: "tipo", label: "Tipo", render: (o) => <Tag variant="neutral">{o.tipo}</Tag> },
    { key: "fecha", label: "Fecha", render: (o) => <span style={{ fontSize: 12 }}>{o.fecha}</span> },
    {
      key: "estado", label: "Estado",
      render: (o) => (
        <Tag
          variant={
            o.estado === "Completada" ? "positive"
              : o.estado === "En curso" ? "warning"
                : o.estado === "Reprogramar" ? "danger"
                  : "accent"
          }
        >
          {o.estado}
        </Tag>
      ),
    },
    {
      key: "evidencias", label: "Evidencias", align: "center",
      render: (o) => (
        <span
          style={{
            fontWeight: 700,
            color:
              o.evidencias === o.evidenciasReq
                ? "var(--success)"
                : o.evidencias > 0
                  ? "var(--warning)"
                  : "var(--text-tertiary)",
          }}
        >
          {o.evidencias}/{o.evidenciasReq}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Coordinación"
        title="Todas las OT"
        subtitle="Vista de coordinación: programación, asignación y supervisión de todas las órdenes de trabajo."
        actions={
          <>
            <Button variant="secondary" iconLeft="🗓️">
              Calendario
            </Button>
            <Button variant="primary" iconLeft="➕">
              Nueva OT
            </Button>
          </>
        }
      />
      <Section title={`${ALL_OT.length} OT en sistema`}>
        <DataTable columns={columns} rows={ALL_OT} rowKey={(o) => o.id} onRowClick={(o) => alert(`Abrir ${o.id}`)} />
      </Section>
    </>
  );
}
