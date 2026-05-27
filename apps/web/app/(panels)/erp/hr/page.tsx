"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";

type Empleado = {
  id: string;
  nombre: string;
  puesto: string;
  area: "Comercial" | "Operaciones" | "Administración" | "Diseño" | "Dirección";
  ingreso: string;
  tipo: "Planta" | "Honorarios" | "Contratista";
  estado: "Activo" | "Vacaciones" | "Incidencia" | "Baja";
};

const EMPLEADOS: Empleado[] = [
  { id: "EMP-001", nombre: "Adrián Pozos", puesto: "CEO / Developer", area: "Dirección", ingreso: "2022", tipo: "Planta", estado: "Activo" },
  { id: "EMP-002", nombre: "Karen Estrada", puesto: "Directora Comercial", area: "Comercial", ingreso: "2023", tipo: "Planta", estado: "Activo" },
  { id: "EMP-003", nombre: "Karina Méndez", puesto: "Ejecutiva de Ventas Senior", area: "Comercial", ingreso: "2023", tipo: "Planta", estado: "Activo" },
  { id: "EMP-004", nombre: "Brandon Castillo", puesto: "Ingeniero de Campo Senior", area: "Operaciones", ingreso: "2023", tipo: "Planta", estado: "Activo" },
  { id: "EMP-005", nombre: "Ronaldo Hernández", puesto: "Project Manager", area: "Operaciones", ingreso: "2024", tipo: "Planta", estado: "Activo" },
  { id: "EMP-006", nombre: "Sandra López", puesto: "Ingeniera de Campo", area: "Operaciones", ingreso: "2024", tipo: "Planta", estado: "Vacaciones" },
  { id: "EMP-007", nombre: "Eduardo Mendoza", puesto: "Ingeniero de Campo", area: "Operaciones", ingreso: "2024", tipo: "Planta", estado: "Activo" },
  { id: "EMP-008", nombre: "Karla Ruiz", puesto: "Contadora", area: "Administración", ingreso: "2024", tipo: "Planta", estado: "Activo" },
  { id: "EMP-009", nombre: "Vania Salgado", puesto: "Diseñadora", area: "Diseño", ingreso: "2025", tipo: "Honorarios", estado: "Activo" },
  { id: "EMP-010", nombre: "Luis Aguilar", puesto: "Soporte / NOC", area: "Operaciones", ingreso: "2025", tipo: "Planta", estado: "Activo" },
];

export default function HrPage() {
  const activos = EMPLEADOS.filter((e) => e.estado === "Activo").length;
  const vacaciones = EMPLEADOS.filter((e) => e.estado === "Vacaciones").length;

  const columns: Column<Empleado>[] = [
    { key: "id", label: "ID", render: (e) => <code style={{ fontSize: 11.5 }}>{e.id}</code>, width: 90 },
    {
      key: "nombre", label: "Persona",
      render: (e) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{e.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.puesto}</div>
        </div>
      ),
    },
    { key: "area", label: "Área", render: (e) => <Tag variant="neutral">{e.area}</Tag> },
    {
      key: "tipo", label: "Tipo",
      render: (e) => (
        <Tag variant={e.tipo === "Planta" ? "positive" : e.tipo === "Honorarios" ? "accent" : "warning"}>
          {e.tipo}
        </Tag>
      ),
    },
    { key: "ingreso", label: "Ingreso", accessor: (e) => e.ingreso, width: 90 },
    {
      key: "estado", label: "Estado",
      render: (e) => (
        <Tag variant={e.estado === "Activo" ? "positive" : e.estado === "Vacaciones" ? "accent" : e.estado === "Incidencia" ? "warning" : "danger"}>
          {e.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Recursos Humanos"
        subtitle="Plantilla, vacaciones, incidencias y onboarding. Es la fuente de verdad del personal NEXARA."
        actions={
          <>
            <Button variant="secondary" iconLeft="📅">Vacaciones</Button>
            <Button variant="primary" iconLeft="👤">Alta de personal</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Plantilla total" value={EMPLEADOS.length} hint={`${activos} activos`} variant="default" icon="🧑‍💼" />
        <KpiCard label="En vacaciones" value={vacaciones} hint="Esta semana" variant="accent" icon="🏖️" />
        <KpiCard label="Incidencias abiertas" value="0" hint="Sin sanciones vivas" variant="positive" icon="🛡️" />
        <KpiCard label="Cumpleaños del mes" value="2" hint="Karen E. y Sandra L." variant="default" icon="🎂" />
      </div>

      <Section title="Plantilla activa">
        <DataTable columns={columns} rows={EMPLEADOS} rowKey={(e) => e.id} onRowClick={(e) => alert(`Abrir ficha ${e.id}`)} />
      </Section>
    </>
  );
}
