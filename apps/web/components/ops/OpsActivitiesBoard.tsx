"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ListExportActions from "@/components/ui/ListExportActions";
import { exportToExcel } from "@/lib/export-excel";
import { downloadActivitiesReportPdf } from "@/lib/activities-export-api";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { getSocketBaseUrl } from "@/lib/api-base";
import OpsActivitiesImport from "@/components/ops/OpsActivitiesImport";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { toast } from "@/components/Toast";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

type ActivityRow = {
  id: number;
  anNumber?: string | null;
  titulo: string;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  projectId?: number | null;
  branchName?: string | null;
  client?: { id?: number; name?: string } | null;
  project?: { id?: number; title?: string } | null;
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
  if (ev.reviewStatus === "APPROVED") return `Aprobado · ${ev.reviewedBy?.nombre ?? "Admin"}`;
  if (ev.reviewStatus === "REJECTED") return "Rechazado";
  const map: Record<string, string> = {
    ENTRY_PHOTO: "Foto de entrada",
    EVIDENCE_PHOTOS: "Evidencias",
    SERVICE_SHEET_PDF: "Hoja de servicio",
    COMPLETED: "Completado",
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

export type ActivityBucket = "daily" | "projects" | "services";

/** daily = sin projectId ni clientId; projects = con projectId; services = con clientId (servicio). */
function matchesBucket(row: ActivityRow, bucket?: ActivityBucket): boolean {
  if (!bucket) return true;
  const hasProject = row.projectId != null || row.project?.id != null;
  const hasClient = row.client?.id != null;
  if (bucket === "daily") return !hasProject && !hasClient;
  if (bucket === "projects") return hasProject;
  if (bucket === "services") return hasClient && !hasProject;
  return true;
}

export default function OpsActivitiesBoard({
  bucket,
  hideProjectSegments = false,
  newHref = "/ops/activities/new",
}: {
  bucket?: ActivityBucket;
  /** Cuando true (páginas ERP 3-buckets) oculta el toggle Todas/Con/Sin proyecto. */
  hideProjectSegments?: boolean;
  newHref?: string;
} = {}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterProject, setFilterProject] = useState<"all" | "with" | "without">("all");
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("activities"), {
        credentials: "include",
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
    let list = rows.filter((r) => matchesBucket(r, bucket));
    if (!bucket) {
      if (filterProject === "with") list = list.filter((r) => r.projectId != null || r.project?.id != null);
      if (filterProject === "without") list = list.filter((r) => r.projectId == null && r.project?.id == null);
    }
    if (filterStatus) list = list.filter((r) => r.estatus === filterStatus);
    if (filterPriority) list = list.filter((r) => r.prioridad === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.anNumber ?? "").toLowerCase().includes(q) ||
        r.titulo.toLowerCase().includes(q) ||
        (r.client?.name ?? "").toLowerCase().includes(q) ||
        (r.project?.title ?? "").toLowerCase().includes(q) ||
        (r.branchName ?? "").toLowerCase().includes(q) ||
        (r.responsable?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, filterStatus, filterPriority, filterProject, bucket]);

  const emptyCopy = useMemo(() => {
    if (bucket === "daily") {
      return {
        title: "Sin tareas",
        description: "No hay tareas con estos filtros.",
      };
    }
    if (bucket === "projects") {
      return {
        title: "Sin OT de proyecto",
        description: "No hay órdenes ligadas a un proyecto operativo con estos filtros.",
      };
    }
    if (bucket === "services") {
      return {
        title: "Sin OT de servicio",
        description: "No hay órdenes con cliente de servicio (sin proyecto) con estos filtros.",
      };
    }
    if (filterProject === "with") {
      return {
        title: "Sin OT con proyecto",
        description: "No hay órdenes ligadas a un proyecto operativo con estos filtros.",
      };
    }
    if (filterProject === "without") {
      return {
        title: "Sin OT sin proyecto",
        description: "No hay órdenes internas o ad-hoc con estos filtros.",
      };
    }
    return {
      title: "Sin órdenes de trabajo",
      description: "No hay OT que coincidan con los filtros. Crea una nueva o limpia los filtros.",
    };
  }, [filterProject, bucket]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.estatus).filter(Boolean));
    return Array.from(set).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const priorityOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.prioridad).filter(Boolean) as string[]);
    return Array.from(set).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const exportExcel = () => {
    exportToExcel(
      visible,
      [
        { key: "anNumber", label: "AN" },
        { key: "titulo", label: "Título" },
        { key: "estatus", label: "Estatus" },
        { key: "prioridad", label: "Prioridad" },
        { key: "client", label: "Cliente", format: (v) => (v as ActivityRow["client"])?.name ?? "Interna" },
        { key: "branchName", label: "Sucursal" },
        { key: "responsable", label: "Responsable", format: (v) => (v as ActivityRow["responsable"])?.nombre ?? "—" },
      ],
      "ops-actividades",
      { title: "Actividades OPS", subtitle: `${visible.length} OT visibles` },
    );
  };

  const exportPdf = async () => {
    if (!token) return;
    setPdfBusy(true);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      await downloadActivitiesReportPdf(token, { from, to });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  };

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
    {
      key: "project",
      label: "Proyecto",
      width: 150,
      render: (r) =>
        r.project?.title ? (
          <Link href={`/ops/projects/${r.project.id ?? r.projectId}`} style={{ color: "var(--primary)", textDecoration: "none", fontSize: 12 }}>
            {r.project.title}
          </Link>
        ) : (
          <Tag variant="neutral">Sin proyecto</Tag>
        ),
    },
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
    return <EmptyState icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />} title="Cargando OT…" description="Sincronizando actividades de campo." />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<ErrorOutlineIcon fontSize="inherit" aria-hidden="true" />}
        title="No se pudieron cargar las OT"
        description={error}
        action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
      />
    );
  }

  return (
    <>
      {!bucket && !hideProjectSegments && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
        {(
          [
            { key: "all" as const, label: "Todas" },
            { key: "with" as const, label: "Con proyecto" },
            { key: "without" as const, label: "Sin proyecto" },
          ] as const
        ).map((seg) => {
          const on = filterProject === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => setFilterProject(seg.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                color: on ? "var(--primary)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {seg.label}
            </button>
          );
        })}
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          Aquí asignas y das seguimiento. El técnico ejecuta en Mis OT.
        </span>
      </div>
      )}
      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Buscar AN, título, cliente, proyecto…" }}
        selects={[
          { label: "Estatus", value: filterStatus, onChange: setFilterStatus, options: statusOptions, allowAll: true },
          { label: "Prioridad", value: filterPriority, onChange: setFilterPriority, options: priorityOptions, allowAll: true },
        ]}
        onClear={() => { setSearch(""); setFilterStatus(""); setFilterPriority(""); setFilterProject("all"); }}
        resultCount={visible.length}
        rightActions={
          <>
            {hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && (
              <OpsActivitiesImport token={token} onImported={() => void load()} />
            )}
            <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
            <ListExportActions
              onExcel={rows.length > 0 ? exportExcel : undefined}
              onPdf={token ? () => void exportPdf() : undefined}
              pdfBusy={pdfBusy}
            />
            <Link href="/ops/dispatch" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">Despacho</Button>
            </Link>
            <Link href={newHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm">Nueva OT</Button>
            </Link>
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
        emptyAction={
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Button size="sm" variant="secondary" onClick={() => { setSearch(""); setFilterStatus(""); setFilterPriority(""); setFilterProject("all"); }}>
              Limpiar filtros
            </Button>
            <Link href={newHref} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="primary">Nueva OT</Button>
            </Link>
          </div>
        }
      />
    </>
  );
}
