"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

interface Snapshot {
  id: number;
  title?: string | null;
  status: string;
  previousCount?: number | null;
  currentCount?: number | null;
  deltaCount?: number | null;
  updatedAt?: string;
  client?: { id: number; name: string };
  branch?: { id: number; name: string; branchNumber?: string };
  activity?: { id: number; anNumber?: string; titulo?: string } | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function AssetsPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";

  // ing_campo no gestiona activos en campo — redirigir al dashboard
  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) router.replace("/ops/dashboard");
  }, [user, router]);

  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("inventories?limit=100", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar activos en campo");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pendientes = items.filter((i) => i.status === "PENDING").length;
  const conDiferencia = items.filter((i) => (i.deltaCount ?? 0) !== 0).length;

  const statusVariant = (s: string): "positive" | "warning" | "danger" => s === "COMPLETED" ? "positive" : s === "PENDING" ? "warning" : "danger";

  const columns: Column<Snapshot>[] = [
    {
      key: "client", label: "Cliente / Sucursal",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.client?.name ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.branch?.name ?? s.branch?.branchNumber ?? ""}</div>
        </div>
      ),
    },
    { key: "currentCount", label: "Equipo actual", render: (s) => s.currentCount ?? "—", width: 110 },
    { key: "deltaCount", label: "Diferencia", render: (s) => {
      const d = s.deltaCount ?? 0;
      if (d === 0) return <Tag variant="positive">Sin cambios</Tag>;
      return <Tag variant="danger">{d > 0 ? `+${d}` : d}</Tag>;
    }, width: 120 },
    { key: "status", label: "Estado", render: (s) => <Tag variant={statusVariant(s.status)}>{s.status}</Tag>, width: 110 },
    { key: "updatedAt", label: "Actualizado", render: (s) => <span style={{ fontSize: 12 }}>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("es-MX") : "—"}</span>, width: 110 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Servicio continuo"
        title="Activos en campo"
        subtitle="Inventario por cliente y sucursal: equipo desplegado, diferencias detectadas en cada visita de mantenimiento."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Inventarios totales" value={items.length} icon="📡" />
        <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Con diferencia detectada" value={conDiferencia} variant={conDiferencia > 0 ? "danger" : "positive"} icon="⚠️" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} inventarios`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando inventarios de campo." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(s) => s.id} emptyTitle="Sin inventarios" emptyDescription="Los inventarios se generan desde visitas de mantenimiento o solicitudes de cliente." />}
      </Section>
    </>
  );
}
