"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";

type Ticket = {
  id: string;
  cliente: string;
  asunto: string;
  prioridad: "Crítica" | "Alta" | "Media" | "Baja";
  estado: "Nuevo" | "Asignado" | "En curso" | "Esperando cliente" | "Resuelto";
  abierto: string;
  asignado: string;
  slaRestante: string;
  slaVencido?: boolean;
};

const TICKETS: Ticket[] = [
  { id: "T-8821", cliente: "Soriana Plaza Reforma", asunto: "POS-3 no imprime tickets", prioridad: "Crítica", estado: "En curso", abierto: "Hoy 11:20", asignado: "Brandon C.", slaRestante: "1h 40m" },
  { id: "T-8820", cliente: "TOKS Centro", asunto: "Cámara pasillo 2 no graba", prioridad: "Alta", estado: "Asignado", abierto: "Hoy 09:45", asignado: "Sandra L.", slaRestante: "3h 15m" },
  { id: "T-8819", cliente: "UDLA Cholula", asunto: "Solicitan ampliación de red en biblioteca", prioridad: "Media", estado: "Esperando cliente", abierto: "Ayer 16:00", asignado: "Ronaldo H.", slaRestante: "—" },
  { id: "T-8818", cliente: "Hotel Camino Real", asunto: "WiFi lobby intermitente", prioridad: "Alta", estado: "Resuelto", abierto: "Ayer 14:20", asignado: "Brandon C.", slaRestante: "Cumplido" },
  { id: "T-8817", cliente: "Constructora Reyes", asunto: "Sin enlace en obra Cholula", prioridad: "Crítica", estado: "En curso", abierto: "Ayer 16:20", asignado: "Ronaldo H.", slaRestante: "VENCIDO", slaVencido: true },
];

export default function SupportInboxPage() {
  const columns: Column<Ticket>[] = [
    { key: "id", label: "Ticket", render: (t) => <Tag variant="accent">{t.id}</Tag>, width: 90 },
    {
      key: "cliente", label: "Cliente / Asunto",
      render: (t) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.cliente}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.asunto}</div>
        </div>
      ),
    },
    {
      key: "prioridad", label: "Prioridad",
      render: (t) => (
        <Tag variant={t.prioridad === "Crítica" ? "danger" : t.prioridad === "Alta" ? "warning" : t.prioridad === "Media" ? "accent" : "neutral"}>
          {t.prioridad}
        </Tag>
      ),
    },
    {
      key: "estado", label: "Estado",
      render: (t) => (
        <Tag variant={t.estado === "Resuelto" ? "positive" : t.estado === "Esperando cliente" ? "neutral" : "accent"}>
          {t.estado}
        </Tag>
      ),
    },
    { key: "asignado", label: "Asignado", accessor: (t) => t.asignado, width: 110 },
    { key: "abierto", label: "Abierto", accessor: (t) => t.abierto, width: 110 },
    {
      key: "sla", label: "SLA",
      render: (t) => (
        <span style={{ fontWeight: 700, color: t.slaVencido ? "var(--danger)" : t.slaRestante === "Cumplido" ? "var(--success)" : "var(--text-primary)" }}>
          {t.slaRestante}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title="Bandeja de soporte"
        subtitle="Tickets de clientes con contrato. Prioridad y SLA visibles en todo momento."
        actions={
          <>
            <Button variant="secondary" iconLeft="📊">SLA report</Button>
            <Button variant="primary" iconLeft="🆘">Nuevo ticket</Button>
          </>
        }
      />
      <Section title={`${TICKETS.length} tickets activos`}>
        <DataTable columns={columns} rows={TICKETS} rowKey={(t) => t.id} onRowClick={(t) => alert(`Abrir ${t.id}`)} />
      </Section>
    </>
  );
}
