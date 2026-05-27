"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Client = {
  id: string;
  razonSocial: string;
  tipo: "Corporativo" | "Gobierno" | "PyME" | "Hogar";
  rfc: string;
  contacto: string;
  contratos: number;
  facturadoYTD: number;
  estado: "Activo" | "Inactivo" | "Prospecto";
  desde: string;
};

const CLIENTS: Client[] = [
  { id: "CL-101", razonSocial: "Soriana S.A.B. de C.V.", tipo: "Corporativo", rfc: "OPS980715N12", contacto: "Ing. Mario Lozano", contratos: 4, facturadoYTD: 2840000, estado: "Activo", desde: "2022" },
  { id: "CL-102", razonSocial: "Operadora TOKS", tipo: "Corporativo", rfc: "OTK820301A12", contacto: "Lic. Eva Robles", contratos: 1, facturadoYTD: 1620000, estado: "Activo", desde: "2023" },
  { id: "CL-103", razonSocial: "Gobierno CDMX (Polos)", tipo: "Gobierno", rfc: "GCD970401XX9", contacto: "Lic. Adriana Pérez", contratos: 1, facturadoYTD: 0, estado: "Prospecto", desde: "2026" },
  { id: "CL-104", razonSocial: "Universidad de las Américas", tipo: "Gobierno", rfc: "UDL400915ZZ1", contacto: "Coord. Cómputo", contratos: 0, facturadoYTD: 0, estado: "Prospecto", desde: "2026" },
  { id: "CL-105", razonSocial: "Hotel Camino Real Puebla", tipo: "Corporativo", rfc: "HCR910612J88", contacto: "Mariana Suárez", contratos: 0, facturadoYTD: 0, estado: "Prospecto", desde: "2026" },
  { id: "CL-106", razonSocial: "Constructora Reyes S.A.", tipo: "PyME", rfc: "CRE040518A22", contacto: "Ing. Felipe Reyes", contratos: 0, facturadoYTD: 0, estado: "Prospecto", desde: "2026" },
  { id: "CL-107", razonSocial: "Roberto Garza (persona física)", tipo: "Hogar", rfc: "GARO850712XYZ", contacto: "Roberto Garza", contratos: 0, facturadoYTD: 0, estado: "Prospecto", desde: "2026" },
  { id: "CL-108", razonSocial: "Comercializadora Lima", tipo: "PyME", rfc: "CLI120504A55", contacto: "C.P. Lima", contratos: 0, facturadoYTD: 285000, estado: "Activo", desde: "2025" },
];

export default function ClientsPage() {
  const columns: Column<Client>[] = [
    {
      key: "razonSocial", label: "Cliente",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.razonSocial}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>RFC: {c.rfc} · {c.id}</div>
        </div>
      ),
    },
    {
      key: "tipo", label: "Tipo",
      render: (c) => (
        <Tag
          variant={
            c.tipo === "Gobierno" ? "warning"
              : c.tipo === "Corporativo" ? "accent"
                : c.tipo === "PyME" ? "neutral"
                  : "positive"
          }
        >
          {c.tipo}
        </Tag>
      ),
    },
    { key: "contacto", label: "Contacto principal", accessor: (c) => c.contacto },
    { key: "contratos", label: "Contratos activos", align: "center", render: (c) => (
      <span style={{ fontWeight: 700, color: c.contratos > 0 ? "var(--success)" : "var(--text-tertiary)" }}>
        {c.contratos}
      </span>
    ) },
    { key: "facturadoYTD", label: "Facturado YTD", align: "right", render: (c) => <Money value={c.facturadoYTD} compact /> },
    {
      key: "estado", label: "Estado",
      render: (c) => (
        <Tag variant={c.estado === "Activo" ? "positive" : c.estado === "Inactivo" ? "neutral" : "accent"}>
          {c.estado}
        </Tag>
      ),
    },
    { key: "desde", label: "Cliente desde", accessor: (c) => c.desde, width: 100 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo y clientes"
        title="Clientes"
        subtitle="Cuentas y contactos: desde casa habitación hasta licitaciones de gobierno."
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Importar
            </Button>
            <Button variant="primary" iconLeft="🤝">
              Nuevo cliente
            </Button>
          </>
        }
      />
      <Section title={`${CLIENTS.length} clientes`}>
        <DataTable columns={columns} rows={CLIENTS} rowKey={(c) => c.id} onRowClick={(c) => alert(`Abrir ${c.id}`)} />
      </Section>
    </>
  );
}
