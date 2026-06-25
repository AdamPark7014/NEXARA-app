"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getAttendanceViewMode } from "@/lib/user-access";
import { buildApiUrl } from "@/lib/api-base";

interface LunchBreak {
  id: number;
  date: string;
  checkinTime: string;
  checkoutTime?: string | null;
  status: string;
  isCheckinLate: boolean;
  isCheckoutLate: boolean;
  notes?: string | null;
  user?: { id: number; nombre: string; department?: { nombre: string } | null };
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function durationMinutes(start: string, end?: string | null): number | null {
  if (!end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export default function LunchBreaksPage() {
  const { user } = useUser();
  const viewMode = useMemo(() => getAttendanceViewMode(user), [user]);
  const canViewAll = viewMode !== "register";
  const token = user?.token ?? "";

  const [items, setItems] = useState<LunchBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(canViewAll ? "lunch-breaks" : "lunch-breaks/my-breaks", token);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar comidas y descansos");
    } finally { setLoading(false); }
  }, [token, canViewAll]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const withDuration = items.map((b) => durationMinutes(b.checkinTime, b.checkoutTime)).filter((d): d is number => d !== null);
    const avg = withDuration.length ? Math.round(withDuration.reduce((s, d) => s + d, 0) / withDuration.length) : 0;
    const over60 = items.filter((b) => { const d = durationMinutes(b.checkinTime, b.checkoutTime); return d !== null && d > 60; }).length;
    const inProgress = items.filter((b) => b.status === "IN_PROGRESS").length;
    return { avg, over60, inProgress };
  }, [items]);

  const columns: Column<LunchBreak>[] = [
    ...(canViewAll ? [{
      key: "user" as keyof LunchBreak, label: "Persona",
      render: (b: LunchBreak) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.user?.nombre ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{b.user?.department?.nombre ?? ""}</div>
        </div>
      ),
      width: 180,
    }] : []),
    { key: "date", label: "Fecha", render: (b) => <span style={{ fontSize: 12 }}>{new Date(b.date).toLocaleDateString("es-MX")}</span>, width: 100 },
    { key: "checkinTime", label: "Entrada", render: (b) => <span style={{ fontSize: 12 }}>{new Date(b.checkinTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}{b.isCheckinLate && " ⚠️"}</span>, width: 100 },
    { key: "checkoutTime", label: "Salida", render: (b) => <span style={{ fontSize: 12 }}>{b.checkoutTime ? new Date(b.checkoutTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) + (b.isCheckoutLate ? " ⚠️" : "") : "—"}</span>, width: 100 },
    {
      key: "duration" as keyof LunchBreak, label: "Duración",
      render: (b) => {
        const d = durationMinutes(b.checkinTime, b.checkoutTime);
        if (d === null) return <Tag variant="warning">En curso</Tag>;
        return <Tag variant={d > 60 ? "danger" : "positive"}>{d} min</Tag>;
      },
      width: 110,
    },
    { key: "notes", label: "Notas", accessor: (b) => b.notes ?? "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Comidas y descansos"
        subtitle={canViewAll ? "Control de horario de comida del personal en campo y oficina." : "Tu historial de comidas registradas desde la app móvil."}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Duración promedio" value={`${stats.avg} min`} icon="🍽️" />
        <KpiCard label="Más de 60 min" value={stats.over60} variant={stats.over60 > 0 ? "warning" : "positive"} icon="⚠️" />
        <KpiCard label="En curso ahora" value={stats.inProgress} icon="⏳" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} registros`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando registros de comida." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(b) => b.id} emptyTitle="Sin registros" emptyDescription="Los checkin/checkout se registran desde la app móvil del ingeniero." />}
      </Section>
    </>
  );
}
