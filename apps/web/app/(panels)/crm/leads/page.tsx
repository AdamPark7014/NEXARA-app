"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Lead = {
  id: string;
  empresa: string;
  contacto: string;
  email: string;
  telefono: string;
  fuente: "Web" | "Referido" | "LinkedIn" | "Llamada" | "Feria";
  interes: "CCTV" | "Redes" | "Cómputo" | "Mantenimiento" | "Multiple";
  potencial: number;
  estado: "Nuevo" | "Contactado" | "Calificado" | "Descartado";
  asignado: string;
  capturado: string;
};

const LEADS: Lead[] = [
  { id: "L-2104", empresa: "Hotel Camino Real", contacto: "Mariana Suárez", email: "msuarez@caminoreal.com", telefono: "222 555 1010", fuente: "Web", interes: "Redes", potencial: 480000, estado: "Calificado", asignado: "Karina M.", capturado: "Hoy 09:14" },
  { id: "L-2103", empresa: "Familia Garza", contacto: "Roberto Garza", email: "rgarza@gmail.com", telefono: "55 8821 4422", fuente: "Web", interes: "CCTV", potencial: 18500, estado: "Calificado", asignado: "Karina M.", capturado: "Hoy 08:02" },
  { id: "L-2102", empresa: "Constructora Reyes", contacto: "Ing. Felipe Reyes", email: "freyes@constreyes.mx", telefono: "222 412 8800", fuente: "Referido", interes: "Multiple", potencial: 850000, estado: "Contactado", asignado: "Karina M.", capturado: "Ayer 16:45" },
  { id: "L-2101", empresa: "Escuela San José", contacto: "Director Académico", email: "direccion@sanjose.edu.mx", telefono: "222 224 7700", fuente: "Llamada", interes: "Cómputo", potencial: 220000, estado: "Nuevo", asignado: "Karina M.", capturado: "Ayer 14:10" },
  { id: "L-2100", empresa: "Polos del Bienestar (Gob)", contacto: "Lic. Adriana Pérez", email: "aperez@cdmx.gob.mx", telefono: "55 5567 8800", fuente: "LinkedIn", interes: "CCTV", potencial: 3200000, estado: "Calificado", asignado: "Karen E.", capturado: "Ayer 11:22" },
  { id: "L-2099", empresa: "TechParts SA", contacto: "Gerente IT", email: "it@techparts.com", telefono: "222 880 1100", fuente: "Feria", interes: "Mantenimiento", potencial: 95000, estado: "Descartado", asignado: "Karina M.", capturado: "2 días" },
  { id: "L-2098", empresa: "UDLA Cholula", contacto: "Coord. Cómputo", email: "computo@udla.mx", telefono: "222 229 2000", fuente: "Web", interes: "Cómputo", potencial: 1850000, estado: "Calificado", asignado: "Karina M.", capturado: "3 días" },
];

export default function LeadsPage() {
  const [filter, setFilter] = useState<Lead["estado"] | "all">("all");

  const filteredLeads = filter === "all" ? LEADS : LEADS.filter((l) => l.estado === filter);

  const columns: Column<Lead>[] = [
    {
      key: "empresa",
      label: "Lead",
      render: (l) => (
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{l.empresa}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {l.contacto} · {l.id}
          </div>
        </div>
      ),
    },
    {
      key: "contacto",
      label: "Contacto",
      render: (l) => (
        <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          <div style={{ color: "var(--text-secondary)" }}>📧 {l.email}</div>
          <div style={{ color: "var(--text-tertiary)" }}>📱 {l.telefono}</div>
        </div>
      ),
    },
    { key: "fuente", label: "Fuente", render: (l) => <Tag variant="neutral">{l.fuente}</Tag> },
    { key: "interes", label: "Interés", render: (l) => <Tag variant="accent">{l.interes}</Tag> },
    {
      key: "potencial",
      label: "Potencial",
      align: "right",
      render: (l) => <Money value={l.potencial} compact />,
    },
    {
      key: "estado",
      label: "Estado",
      render: (l) => (
        <Tag
          variant={
            l.estado === "Calificado"
              ? "positive"
              : l.estado === "Nuevo"
                ? "accent"
                : l.estado === "Contactado"
                  ? "warning"
                  : "neutral"
          }
        >
          {l.estado}
        </Tag>
      ),
    },
    { key: "asignado", label: "Asignado", accessor: (l) => l.asignado, width: 120 },
    {
      key: "capturado",
      label: "Capturado",
      render: (l) => <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>{l.capturado}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Captación"
        title="Leads"
        subtitle="Prospectos sin calificar. De casa habitación a licitaciones de gobierno — todos entran por aquí."
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Importar
            </Button>
            <Button variant="primary" iconLeft="✨">
              Nuevo lead
            </Button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["all", "Nuevo", "Contactado", "Calificado", "Descartado"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            style={{
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 999,
              border: filter === p ? "1px solid var(--primary)" : "1px solid var(--border)",
              background: filter === p ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
              color: filter === p ? "var(--primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {p === "all" ? "Todos" : p}
            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>
              {p === "all" ? LEADS.length : LEADS.filter((l) => l.estado === p).length}
            </span>
          </button>
        ))}
      </div>

      <Section
        title={`${filteredLeads.length} leads`}
        subtitle="Clic en cualquier lead para abrir su ficha completa"
      >
        <DataTable
          columns={columns}
          rows={filteredLeads}
          rowKey={(l) => l.id}
          onRowClick={(l) => alert(`Abrir lead ${l.id} (siguiente fase)`)}
          emptyTitle="Sin leads en este estado"
          emptyDescription="Cuando llegue un prospecto desde el sitio o redes, aparecerá aquí."
        />
      </Section>
    </>
  );
}
