"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { getSocketBaseUrl } from "@/lib/api-base";
import OpsActivitiesImport from "@/components/ops/OpsActivitiesImport";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

type ActivityRow = {
  id: number;
  anNumber?: string | null;
  titulo: string;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  branchName?: string | null;
  client?: { id?: number; name?: string } | null;
  responsable?: { id?: number; nombre?: string } | null;
  activityEvidence?: {
    status?: string;
    reviewStatus?: string;
    reviewedBy?: { nombre?: string };
  } | null;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
};

function evidenceLabel(row: ActivityRow): string {
  const ev = row.activityEvidence;
  if (!ev) return "Sin iniciar";
  if (ev.reviewStatus === "APPROVED") return `✅ ${ev.reviewedBy?.nombre ?? "Admin"}`;
  if (ev.reviewStatus === "REJECTED") return `❌ Rechazado`;
  const map: Record<string, string> = {
    ENTRY_PHOTO: "📸 Entrada",
    EVIDENCE_PHOTOS: "📷 Evidencias",
    SERVICE_SHEET_PDF: "📄 PDF",
    COMPLETED: "✅ Completado",
  };
  return map[ev.status ?? ""] ?? ev.status ?? "En curso";
}

function statusVariant(estatus: string): "positive" | "warning" | "danger" | "accent" | "neutral" {
  if (estatus === "Finalizada" || estatus === "Aprobada") return "positive";
  if (estatus === "Pendiente") return "warning";
  if (/rechaz|cancel/i.test(estatus)) return "danger";
  if (estatus === "En Proceso") return "accent";
  return "neutral";
}

export default function OpsActivitiesBoard() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("activities"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Error al cargar"));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar actividades");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { auth: { token } });
    const refresh = () => void load();
    socket.on("entity:updated", refresh);
    socket.on("activity:updated", refresh);
    return () => { socket.disconnect(); };
  }, [token, load]);

  const visible = useMemo(() => {
    let list = rows;
    if (filterStatus) list = list.filter((r) => r.estatus === filterStatus);
    if (filterPriority) list = list.filter((r) => r.prioridad === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.anNumber ?? "").toLowerCase().includes(q) ||
        r.titulo.toLowerCase().includes(q) ||
        (r.client?.name ?? "").toLowerCase().includes(q) ||
        (r.branchName ?? "").toLowerCase().includes(q) ||
        (r.responsable?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, filterStatus, filterPriority]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.estatus).filter(Boolean));
    return Array.from(set).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const priorityOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.prioridad).filter(Boolean) as string[]);
    return Array.from(set).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const columns: Column<ActivityRow>[] = [
    {
      key: "anNumber",
      label: "AN",
      width: 88,
      render: (r) => (
        <Link href={`/ops/activities/${r.id}`} style={{ fontWeight: 700, color: "var(--primary)", textDecoration: "none" }}>
          {r.anNumber ?? `#${r.id}`}
        </Link>
      ),
    },
    {
      key: "titulo",
      label: "Título",
      render: (r) => (
        <Link href={`/ops/activities/${r.id}`} style={{ fontWeight: 600, fontSize: 13, color: "var(--foreground)", textDecoration: "none" }}>
          {r.titulo}
        </Link>
      ),
    },
    { key: "client", label: "Cliente", render: (r) => r.client?.name ?? "Interna", width: 140 },
    { key: "branchName", label: "Sucursal", render: (r) => r.branchName ?? "—", width: 120 },
    {
      key: "estatus",
      label: "Estatus",
      render: (r) => <Tag variant={statusVariant(r.estatus)}>{r.estatus}</Tag>,
      width: 110,
    },
    { key: "responsable", label: "Responsable", render: (r) => r.responsable?.nombre ?? "—", width: 130 },
    { key: "prioridad", label: "Prioridad", width: 90 },
    {
      key: "evidence",
      label: "Evidencias",
      render: (r) => <span style={{ fontSize: 12 }}>{evidenceLabel(r)}</span>,
      width: 140,
    },
    {
      key: "actions",
      label: "",
      width: 120,
      render: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/ops/activities/${r.id}`)}>
            Abrir
          </Button>
          {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
            <Button size="sm" variant="ghost" onClick={() => router.push(`/ops/activities/${r.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return <EmptyState icon="⏳" title="Cargando OT…" description="Sincronizando actividades de campo." />;
  }

  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title="No se pudieron cargar las OT"
        description={error}
        action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
      />
    );
  }

  return (
    <>
      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Buscar AN, título, cliente, sucursal…" }}
        selects={[
          { label: "Estatus", value: filterStatus, onChange: setFilterStatus, options: statusOptions, allowAll: true },
          { label: "Prioridad", value: filterPriority, onChange: setFilterPriority, options: priorityOptions, allowAll: true },
        ]}
        onClear={() => { setSearch(""); setFilterStatus(""); setFilterPriority(""); }}
        resultCount={visible.length}
        rightActions={
          <>
            {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
              <OpsActivitiesImport token={token} onImported={() => void load()} />
            )}
            <Link href="/ops/activities/new" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm">Nueva OT</Button>
            </Link>
            <Button variant="ghost" size="sm" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft="⬇"
              onClick={() => exportToExcel(visible, [
                { key: "anNumber", label: "AN" },
                { key: "titulo", label: "Título" },
                { key: "estatus", label: "Estatus" },
                { key: "prioridad", label: "Prioridad" },
              ], "ops-actividades")}
            >
              Excel
            </Button>
            <Link href="/ops/dispatch" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">Despacho</Button>
            </Link>
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        emptyTitle="Sin actividades"
        emptyDescription="No hay OT que coincidan con los filtros."
      />
    </>
  );
}
