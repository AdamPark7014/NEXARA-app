"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Contract = {
  id: string;
  cliente: string;
  alcance: string;
  modalidad: "Mensual" | "Trimestral" | "Bajo demanda" | "Anual";
  inicio: string;
  vencimiento: string;
  montoMensual: number;
  proximaVisita: string;
  estado: "Vigente" | "Por renovar" | "Expira pronto";
};

const CONTRACTS: Contract[] = [
  { id: "MTO-2024-014", cliente: "Soriana (Plaza Reforma)", alcance: "POS x12 + 18 cámaras + red", modalidad: "Mensual", inicio: "Ene 2024", vencimiento: "Dic 2026", montoMensual: 45000, proximaVisita: "Hoy", estado: "Vigente" },
  { id: "MTO-2024-009", cliente: "TOKS (Centro Histórico)", alcance: "POS x4 + 4 cámaras", modalidad: "Mensual", inicio: "Mar 2024", vencimiento: "Feb 2027", montoMensual: 18000, proximaVisita: "Hoy", estado: "Vigente" },
  { id: "MTO-2024-022", cliente: "UDLA Cholula", alcance: "Red campus + 120 PCs lab", modalidad: "Trimestral", inicio: "May 2024", vencimiento: "Abr 2027", montoMensual: 80000, proximaVisita: "Próx. mes", estado: "Vigente" },
  { id: "MTO-2023-031", cliente: "Hotel Camino Real Puebla", alcance: "WiFi + 6 cámaras pasillos", modalidad: "Mensual", inicio: "Ago 2023", vencimiento: "Jul 2026", montoMensual: 22000, proximaVisita: "+15d", estado: "Expira pronto" },
  { id: "MTO-2023-017", cliente: "Comercializadora Lima", alcance: "Soporte cómputo 20 equipos", modalidad: "Bajo demanda", inicio: "Jun 2023", vencimiento: "May 2026", montoMensual: 12000, proximaVisita: "Bajo demanda", estado: "Por renovar" },
];

export default function MaintenancePage() {
  const totalMRR = CONTRACTS.reduce((s, c) => s + c.montoMensual, 0);

  const columns: Column<Contract>[] = [
    { key: "id", label: "Contrato", render: (c) => <code style={{ fontSize: 11.5 }}>{c.id}</code>, width: 130 },
    {
      key: "cliente", label: "Cliente / Alcance",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cliente}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.alcance}</div>
        </div>
      ),
    },
    { key: "modalidad", label: "Modalidad", render: (c) => <Tag variant="neutral">{c.modalidad}</Tag> },
    { key: "monto", label: "MRR", align: "right", render: (c) => <Money value={c.montoMensual} compact /> },
    { key: "vencimiento", label: "Vence", accessor: (c) => c.vencimiento, width: 110 },
    { key: "proximaVisita", label: "Próx. visita", accessor: (c) => c.proximaVisita, width: 130 },
    {
      key: "estado", label: "Estado",
      render: (c) => (
        <Tag variant={c.estado === "Vigente" ? "positive" : c.estado === "Por renovar" ? "warning" : "danger"}>
          {c.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Contratos"
        title="Contratos de mantenimiento"
        subtitle="Cuentas recurrentes (MRR): SLA, visitas programadas y renovaciones."
        actions={
          <>
            <Button variant="secondary" iconLeft="📊">Reporte SLA</Button>
            <Button variant="primary" iconLeft="📄">Nuevo contrato</Button>
          </>
        }
      />

      <div
        style={{
          marginBottom: 18, padding: 18,
          background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))",
          border: "1px solid var(--border)", borderRadius: 14,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
          Monthly Recurring Revenue
        </div>
        <div style={{ fontFamily: "var(--nx-font-display)", fontSize: 36, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1, marginTop: 6 }}>
          <Money value={totalMRR} />
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>
          {CONTRACTS.length} contratos vigentes · <Money value={totalMRR * 12} compact /> anualizado
        </div>
      </div>

      <Section title="Cartera de contratos">
        <DataTable columns={columns} rows={CONTRACTS} rowKey={(c) => c.id} onRowClick={(c) => alert(`Abrir ${c.id}`)} />
      </Section>
    </>
  );
}
