"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";

type Account = { id: string; banco: string; alias: string; cuenta: string; moneda: "MXN" | "USD"; saldo: number };
type Mov = {
  id: string;
  fecha: string;
  cuenta: string;
  tipo: "Cargo" | "Abono";
  concepto: string;
  monto: number;
  estado: "Conciliado" | "Pendiente";
};

const ACCOUNTS: Account[] = [
  { id: "A1", banco: "BBVA", alias: "Operativa MXN", cuenta: "0123 4567 8901", moneda: "MXN", saldo: 1820000 },
  { id: "A2", banco: "Banorte", alias: "Nómina", cuenta: "0234 5678 9012", moneda: "MXN", saldo: 320000 },
  { id: "A3", banco: "Santander", alias: "Inversión", cuenta: "0345 6789 0123", moneda: "MXN", saldo: 270000 },
  { id: "A4", banco: "BBVA", alias: "USD operativa", cuenta: "0456 7890 1234", moneda: "USD", saldo: 12400 },
];

const MOVS: Mov[] = [
  { id: "M1", fecha: "Hoy 09:14", cuenta: "Operativa MXN", tipo: "Abono", concepto: "Cobranza UDLA fase 1", monto: 1850000, estado: "Conciliado" },
  { id: "M2", fecha: "Hoy 08:30", cuenta: "Operativa MXN", tipo: "Cargo", concepto: "Pago proveedor Hikvision", monto: 276000, estado: "Conciliado" },
  { id: "M3", fecha: "Ayer 17:00", cuenta: "Nómina", tipo: "Cargo", concepto: "Dispersión nómina 2da Q mayo", monto: 480000, estado: "Conciliado" },
  { id: "M4", fecha: "Ayer 14:22", cuenta: "Operativa MXN", tipo: "Abono", concepto: "Cobranza Soriana mensualidad", monto: 45000, estado: "Pendiente" },
  { id: "M5", fecha: "Ayer 11:05", cuenta: "Operativa MXN", tipo: "Cargo", concepto: "Renta oficinas Puebla mayo", monto: 42000, estado: "Conciliado" },
];

export default function BankingPage() {
  const totalMXN = ACCOUNTS.filter((a) => a.moneda === "MXN").reduce((s, a) => s + a.saldo, 0);
  const totalUSD = ACCOUNTS.filter((a) => a.moneda === "USD").reduce((s, a) => s + a.saldo, 0);

  const movColumns: Column<Mov>[] = [
    { key: "fecha", label: "Fecha", accessor: (m) => m.fecha, width: 120 },
    { key: "cuenta", label: "Cuenta", render: (m) => <Tag variant="neutral">{m.cuenta}</Tag> },
    { key: "tipo", label: "Tipo", render: (m) => <Tag variant={m.tipo === "Abono" ? "positive" : "warning"}>{m.tipo}</Tag> },
    { key: "concepto", label: "Concepto", accessor: (m) => m.concepto },
    { key: "monto", label: "Monto", align: "right", render: (m) => (
      <span style={{ color: m.tipo === "Abono" ? "var(--success)" : "var(--text-primary)", fontWeight: 700 }}>
        {m.tipo === "Cargo" ? "-" : "+"}<Money value={m.monto} />
      </span>
    ) },
    { key: "estado", label: "Estado", render: (m) => <Tag variant={m.estado === "Conciliado" ? "positive" : "warning"}>{m.estado}</Tag> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Banca y tesorería"
        subtitle="Saldos en tiempo real, movimientos por conciliar y pagos programados."
        actions={
          <>
            <Button variant="secondary" iconLeft="🔄">Conciliar</Button>
            <Button variant="primary" iconLeft="💸">Programar pago</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Saldo total MXN" value={<Money value={totalMXN} />} hint={`${ACCOUNTS.filter(a => a.moneda === "MXN").length} cuentas`} variant="positive" icon="🏦" />
        <KpiCard label="Saldo total USD" value={`$${totalUSD.toLocaleString("en-US")}`} hint="1 cuenta operativa" variant="accent" icon="💵" />
        <KpiCard label="Mov. pendientes" value={MOVS.filter(m => m.estado === "Pendiente").length} hint="Por conciliar" variant="warning" icon="⏳" />
        <KpiCard label="Pagos programados" value="3" hint="Próximos 7 días" variant="default" icon="📅" />
      </div>

      <Section title="Cuentas">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {ACCOUNTS.map((a) => (
            <article
              key={a.id}
              style={{
                padding: 16, background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.alias}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{a.banco}</div>
                </div>
                <Tag variant={a.moneda === "MXN" ? "neutral" : "accent"}>{a.moneda}</Tag>
              </div>
              <div style={{ fontFamily: "var(--nx-font-display)", fontSize: 22, fontWeight: 700 }}>
                {a.moneda === "USD" ? `$${a.saldo.toLocaleString("en-US")}` : <Money value={a.saldo} />}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6, fontFamily: "var(--font-mono, monospace)" }}>
                {a.cuenta}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Movimientos recientes" subtitle="Últimas 48 horas">
        <DataTable columns={movColumns} rows={MOVS} rowKey={(m) => m.id} onRowClick={() => alert("Detalle del movimiento")} />
      </Section>
    </>
  );
}
