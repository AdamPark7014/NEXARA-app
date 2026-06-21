"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface Quote {
  id: number;
  folio?: string;
  concepto?: string;
  montoTotal?: number;
  estado?: string;
  fechaEmision?: string;
  vigencia?: string;
  cliente?: { razonSocial?: string };
  createdBy?: { nombre?: string };
}

const ESTADOS = ["Borrador", "Enviada", "Firmada", "Rechazada", "Vencida"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function QuotesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("ventas/cotizaciones", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const total = items.reduce((s, q) => s + (q.montoTotal ?? 0), 0);
  const firmadas = items.filter(q => q.estado === "Firmada").reduce((s, q) => s + (q.montoTotal ?? 0), 0);
  const pendientes = items.filter(q => ["Borrador", "Enviada"].includes(q.estado ?? "")).length;

  const estadoVariant = (e?: string): "accent" | "warning" | "neutral" | "danger" =>
    e === "Firmada" ? "neutral" : e === "Rechazada" || e === "Vencida" ? "danger" : e === "Enviada" ? "accent" : "warning";

  const columns: Column<Quote>[] = [
    { key: "folio", label: "Folio", render: q => <code style={{ fontSize: 11.5 }}>{q.folio ?? `COT-${q.id}`}</code>, width: 120 },
    { key: "cliente", label: "Cliente / Concepto", render: q => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{q.cliente?.razonSocial ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.concepto?.slice(0, 50)}</div>
      </div>
    )},
    { key: "montoTotal", label: "Monto", render: q => <Money value={q.montoTotal ?? 0} />, width: 120 },
    { key: "estado", label: "Estado", render: q => <Tag variant={estadoVariant(q.estado)}>{q.estado ?? "—"}</Tag>, width: 100 },
    { key: "fechaEmision", label: "Emitida", accessor: q => q.fechaEmision ? new Date(q.fechaEmision).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "createdBy", label: "Ejecutivo", accessor: q => q.createdBy?.nombre ?? "—", width: 130 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Ventas"
        title="Cotizaciones"
        subtitle="Registro de propuestas comerciales emitidas. Para generar una nueva, hazlo desde una Oportunidad."
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Total cotizado" value={`$${(total / 1000000).toFixed(1)}M`} />
        <KpiCard label="Firmado / ganado" value={`$${(firmadas / 1000000).toFixed(1)}M`} />
        <KpiCard label="Pendientes" value={pendientes} />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} cotizaciones`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={q => q.id} emptyTitle="Sin cotizaciones" emptyDescription="Las cotizaciones se generan desde una oportunidad." />
        )}
      </Section>
    </>
  );
}
