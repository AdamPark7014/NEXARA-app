"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { buildApiUrl } from "@/lib/api-base";

interface HrEmpleado {
  id: number;
  nombre: string;
  estadoRRHH?: string | null;
  isActive?: boolean;
  fechaIngreso?: string | null;
  fechaCreacion?: string;
}

interface EngineerRow {
  engineerId: number;
  engineerName: string;
  totalActivities: number;
  completed: number;
  completionRate: number;
  avgDurationMin: number | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function HrKpisPage() {
  const { user } = useUser();
  const cfg = useHrManagementGuard();
  const token = user?.token ?? "";

  const [staff, setStaff] = useState<HrEmpleado[]>([]);
  const [engineers, setEngineers] = useState<EngineerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [staffData, engData] = await Promise.all([
        apiFetch("users/hr-staff?limit=200", token),
        apiFetch("analytics/bi/engineers?limit=15", token).catch(() => []),
      ]);
      setStaff(Array.isArray(staffData) ? staffData : (staffData?.data ?? []));
      setEngineers(Array.isArray(engData) ? engData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar KPIs de personas");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const rotacion = useMemo(() => {
    const total = staff.length;
    const bajas = staff.filter((e) => e.estadoRRHH === "Baja" || e.isActive === false).length;
    const since12m = new Date();
    since12m.setMonth(since12m.getMonth() - 12);
    const ingresos12m = staff.filter((e) => {
      const d = e.fechaIngreso ?? e.fechaCreacion;
      return d && new Date(d) >= since12m;
    }).length;
    return {
      total,
      bajas,
      tasaRotacion: total > 0 ? +((bajas / total) * 100).toFixed(1) : 0,
      ingresos12m,
    };
  }, [staff]);

  const avgCompletion = engineers.length ? Math.round(engineers.reduce((s, e) => s + e.completionRate, 0) / engineers.length) : 0;

  const columns: Column<EngineerRow>[] = [
    { key: "engineerName", label: "Ingeniero" },
    { key: "totalActivities", label: "OT (90d)", width: 90 },
    { key: "completed", label: "Cerradas", width: 90 },
    { key: "completionRate", label: "% cierre", render: (r) => `${r.completionRate}%`, width: 90 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={cfg.title}
        subtitle="Productividad operativa y rotación del equipo — la salud humana de NEXARA, no solo la financiera."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando KPIs…" description="Calculando métricas de personas." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Plantilla total" value={rotacion.total} icon="🧑‍💼" />
            <KpiCard label="Rotación 12m" value={`${rotacion.tasaRotacion}%`} variant={rotacion.tasaRotacion > 15 ? "warning" : "positive"} icon="📉" />
            <KpiCard label="Altas 12m" value={rotacion.ingresos12m} icon="📈" />
            <KpiCard label="% cierre OT promedio" value={`${avgCompletion}%`} icon="🚀" />
          </div>

          <Section title="Productividad operativa · últimos 90 días">
            <DataTable columns={columns} rows={engineers} rowKey={(r) => r.engineerId} emptyTitle="Sin datos" emptyDescription="No hay actividades cerradas en los últimos 90 días." />
          </Section>

          <Section title="eNPS y capacitación" subtitle="Estos indicadores aún no tienen un módulo de captura en NEXARA.">
            <div style={{ padding: 16, background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12, fontSize: 13, color: "var(--text-secondary)" }}>
              Para activar eNPS (encuestas de clima) y horas de capacitación certificadas se requiere un módulo nuevo de encuestas y un catálogo de cursos — no existen aún en la base de datos. El resto de esta página (rotación y productividad) ya está conectado en vivo.
            </div>
          </Section>
        </>
      )}
    </>
  );
}
