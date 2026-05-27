"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";

type Inbound = {
  id: string;
  fecha: string;
  nombre: string;
  empresa: string;
  email: string;
  telefono: string;
  mensaje: string;
  fuente: "Formulario web" | "WhatsApp" | "Instagram DM" | "Email directo";
  estado: "Sin atender" | "Asignado a ventas" | "En seguimiento" | "Descartado";
};

const ITEMS: Inbound[] = [
  { id: "WL-9821", fecha: "Hoy 11:42", nombre: "Mariana Suárez", empresa: "Hotel Camino Real Puebla", email: "msuarez@caminoreal.com", telefono: "222 555 1010", mensaje: "Necesitamos cotizar cableado y WiFi 6 para 180 habitaciones.", fuente: "Formulario web", estado: "Asignado a ventas" },
  { id: "WL-9820", fecha: "Hoy 09:30", nombre: "Roberto Garza", empresa: "—", email: "rgarza@gmail.com", telefono: "55 8821 4422", mensaje: "Quiero 4 cámaras + NVR en casa habitación. ¿Hacen instalación?", fuente: "WhatsApp", estado: "Asignado a ventas" },
  { id: "WL-9819", fecha: "Ayer 18:00", nombre: "Coord. Cómputo UDLA", empresa: "Universidad de las Américas", email: "computo@udla.mx", telefono: "222 229 2000", mensaje: "Información sobre licitación equipo cómputo Q3.", fuente: "Email directo", estado: "En seguimiento" },
  { id: "WL-9818", fecha: "Ayer 14:22", nombre: "Anónimo", empresa: "—", email: "—", telefono: "—", mensaje: "DM en Instagram: '¿manejan kits económicos para casa?'", fuente: "Instagram DM", estado: "Sin atender" },
];

export default function StudioContactsPage() {
  const columns: Column<Inbound>[] = [
    { key: "id", label: "ID", render: (i) => <Tag variant="accent">{i.id}</Tag>, width: 90 },
    {
      key: "nombre", label: "Contacto",
      render: (i) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{i.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{i.empresa}</div>
        </div>
      ),
    },
    { key: "mensaje", label: "Mensaje", render: (i) => <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{i.mensaje.length > 80 ? i.mensaje.slice(0, 80) + "…" : i.mensaje}</span> },
    { key: "fuente", label: "Canal", render: (i) => <Tag variant="neutral">{i.fuente}</Tag> },
    { key: "fecha", label: "Recibido", accessor: (i) => i.fecha, width: 110 },
    {
      key: "estado", label: "Estado",
      render: (i) => (
        <Tag variant={i.estado === "Asignado a ventas" || i.estado === "En seguimiento" ? "accent" : i.estado === "Descartado" ? "neutral" : "warning"}>
          {i.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Captación"
        title="Contactos web"
        subtitle="Formularios y mensajes que llegan por el sitio público y redes sociales. De aquí pasan al CRM."
        actions={<Button variant="primary" iconLeft="→">Enviar lote a CRM</Button>}
      />
      <Section title={`${ITEMS.length} mensajes recientes`}>
        <DataTable columns={columns} rows={ITEMS} rowKey={(i) => i.id} onRowClick={(i) => alert(`Abrir ${i.id}`)} />
      </Section>
    </>
  );
}
