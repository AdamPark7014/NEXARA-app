"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";

const REPORTS = [
  { href: "/erp/accounting", title: "Pólizas y DIOT", desc: "Libro diario, catálogo y export contable." },
  { href: "/erp/exports", title: "Exportaciones", desc: "Excel / CSV de módulos financieros." },
  { href: "/erp/contabilidad/cuentas-por-cobrar", title: "Aging CxC", desc: "Saldos de clientes." },
  { href: "/erp/contabilidad/cuentas-por-pagar", title: "Aging CxP", desc: "Saldos de proveedores." },
  { href: "/erp/contabilidad/proyectos", title: "P&L proyecto", desc: "Ingresos − costos por proyecto." },
  { href: "/erp/contabilidad", title: "Dashboard KPIs", desc: "Resumen del periodo." },
];

export default function ReportesPage() {
  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Reportes"
        subtitle="Biblioteca de reportes: wrappers sobre accounting exports existentes."
        density="ops"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {REPORTS.map((r) => (
          <Section key={r.href} title={r.title} dense>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)" }}>{r.desc}</p>
            <Link href={r.href} style={{ fontSize: 12, color: "var(--primary)" }}>
              Abrir →
            </Link>
          </Section>
        ))}
      </div>
    </>
  );
}
