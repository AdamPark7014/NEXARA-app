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
  const [pdfBusy, setPdfBusy] = useState(false);

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

  const exportExcel = () => {
    exportToExcel(
      visible,
      [
        { key: "anNumber", label: "AN" },
        { key: "titulo", label: "Título" },
        { key: "estatus", label: "Estatus" },
        { key: "prioridad", label: "Prioridad" },
        { key: "client", label: "Cliente", format: (r) => r.client?.name || "" },
        { key: "responsable", label: "Responsable", format: (r) => r.responsable?.nombre || "" },
        { key: "fechaInicio", label: "Fecha de Inicio", format: (r) => r.fechaInicio || "" },
        { key: "fechaEntregaEsperada", label: "Fecha de Entrega Esperada", format: (r) => r.fechaEntregaEsperada || "" },
        { key: "activityEvidence", label: "Evidencia", format: (r) => evidenceLabel(r) },
      ],
      "OTs",
    );
  };

  const exportPdf = useCallback(async () => {
    if (!token) return;
    setPdfBusy(true);
    try {
      const res = await downloadActivitiesReportPdf(token, visible);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "OTs.pdf");
      document.body.appendChild(link);
      link.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al descargar el PDF");
    } finally {
      setPdfBusy(false);
    }
  }, [token, visible]);

  const columns: Column<ActivityRow>[] = [
    { title: "AN", key: "anNumber" },
    { title: "Título", key: "titulo" },
    { title: "Estatus", key: "estatus", render: (r) => <Tag variant={statusVariant(r.estatus)}>{r.estatus}</Tag> },
    { title: "Prioridad", key: "prioridad" },
    { title: "Cliente", key: "client", render: (r) => r.client?.name || "-" },
    { title: "Responsable", key: "responsable", render: (r) => r.responsable?.nombre || "-" },
    { title: "Fecha de Inicio", key: "fechaInicio", render: (r) => r.fechaInicio || "-" },
    { title: "Fecha de Entrega Esperada", key: "fechaEntregaEsperada", render: (r) => r.fechaEntregaEsperada || "-" },
    { title: "Evidencia", key: "activityEvidence", render: (r) => evidenceLabel(r) },
    {
      title: "Acciones",
      key: "actions",
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
            <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
            <ListExportActions
              onExcel={rows.length > 0 ? exportExcel : undefined}
              onPdf={token ? exportPdf : undefined}
              pdfBusy={pdfBusy}
            />
            <Link href="/ops/dispatch" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">Despacho</Button>
            </Link>
            <Link href="/ops/activities/new" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="sm">Nueva OT</Button>
            </Link>
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        emptyTitle="Sin actividades"
        emptyDescription="No hay OT que coincidan con los filtros. Crea una nueva o limpia los filtros."
        emptyAction={
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Button size="sm" variant="secondary" onClick={() => { setSearch(""); setFilterStatus(""); setFilterPriority(""); }}>
              Limpiar filtros
            </Button>
            <Link href="/ops/activities/new" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="primary">Nueva OT</Button>
            </Link>
          </div>
        }
      />
    </>
  );
}