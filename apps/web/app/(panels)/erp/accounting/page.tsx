"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Poliza = {
  folio: string;
  fecha: string;
  concepto: string;
  cargo: number;
  abono: number;
  tipo: "Diario" | "Egresos" | "Ingresos" | "Ajuste";
  estado: "Borrador" | "Validada" | "Contabilizada";
  capturada: string;
};

const POLIZAS: Poliza[] = [
  { folio: "P-2026-0214", fecha: "26/05/26", concepto: "Cobranza Soriana mensualidad mayo", cargo: 0, abono: 45000, tipo: "Ingresos", estado: "Contabilizada", capturada: "Karla R." },
  { folio: "P-2026-0213", fecha: "26/05/26", concepto: "Compra cámaras Hikvision lote 80 piezas", cargo: 276000, abono: 0, tipo: "Egresos", estado: "Validada", capturada: "Karla R." },
  { folio: "P-2026-0212", fecha: "25/05/26", concepto: "Pago nómina 2da quincena mayo", cargo: 480000, abono: 0, tipo: "Egresos", estado: "Contabilizada", capturada: "Karla R." },
  { folio: "P-2026-0211", fecha: "25/05/26", concepto: "Cobranza UDLA proyecto laboratorios fase 1", cargo: 0, abono: 1850000, tipo: "Ingresos", estado: "Contabilizada", capturada: "Karla R." },
  { folio: "P-2026-0210", fecha: "24/05/26", concepto: "Renta oficinas Puebla mayo", cargo: 42000, abono: 0, tipo: "Egresos", estado: "Contabilizada", capturada: "Karla R." },
  { folio: "P-2026-0209", fecha: "24/05/26", concepto: "Ajuste IVA acreditable abril", cargo: 18450, abono: 0, tipo: "Ajuste", estado: "Borrador", capturada: "Karla R." },
];

export default function AccountingPage() {
  const ingresos = POLIZAS.filter((p) => p.tipo === "Ingresos").reduce((s, p) => s + p.abono, 0);
  const egresos = POLIZAS.filter((p) => p.tipo === "Egresos").reduce((s, p) => s + p.cargo, 0);

  const columns: Column<Poliza>[] = [
    { key: "folio", label: "Folio", render: (p) => <code style={{ fontSize: 11.5 }}>{p.folio}</code>, width: 130 },
    { key: "fecha", label: "Fecha", accessor: (p) => p.fecha, width: 90 },
    { key: "concepto", label: "Concepto", render: (p) => <span style={{ fontSize: 13 }}>{p.concepto}</span> },
    { key: "tipo", label: "Tipo", render: (p) => <Tag variant="neutral">{p.tipo}</Tag> },
    { key: "cargo", label: "Cargo", align: "right", render: (p) => p.cargo > 0 ? <Money value={p.cargo} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span> },
    { key: "abono", label: "Abono", align: "right", render: (p) => p.abono > 0 ? <Money value={p.abono} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span> },
    {
      key: "estado", label: "Estado",
      render: (p) => (
        <Tag variant={p.estado === "Contabilizada" ? "positive" : p.estado === "Validada" ? "accent" : "warning"}>
          {p.estado}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Contabilidad"
        subtitle="Pólizas del periodo, balanza y estados financieros. Cierre mensual y reportes SAT."
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">Exportar XML</Button>
            <Button variant="primary" iconLeft="➕">Nueva póliza</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Ingresos del mes" value={<Money value={ingresos} />} hint="2 cobros relevantes" variant="positive" icon="💰" />
        <KpiCard label="Egresos del mes" value={<Money value={egresos} />} hint="Nómina + compras" variant="default" icon="📉" />
        <KpiCard label="Utilidad operativa" value={<Money value={ingresos - egresos} />} variant="accent" icon="📊" />
        <KpiCard label="Pólizas en borrador" value="1" hint="Por validar" variant="warning" icon="📝" />
      </div>

      <Section
        title="Pólizas del periodo"
        subtitle="Mayo 2026 · todas las cuentas"
        actions={
          <>
            <Button variant="ghost" iconLeft="📊" size="sm">Balanza</Button>
            <Button variant="ghost" iconLeft="📋" size="sm">Estado de resultados</Button>
          </>
        }
      >
        <DataTable columns={columns} rows={POLIZAS} rowKey={(p) => p.folio} onRowClick={(p) => alert(`Abrir ${p.folio}`)} />
      </Section>
    </>
  );
}
