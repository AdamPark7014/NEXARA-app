"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getErpViaticsAdminSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { buildApiUrl } from "@/lib/api-base";
import { approveViatico, markViaticoPagado, postViatico } from "@/lib/viatics-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FileDropzone from "@/components/ui/FileDropzone";

interface Viatico {
  id: number;
  concepto?: string;
  motivo?: string;
  montoSolicitado?: number;
  estatus?: string;
  fechaSolicitud?: string;
  comprobante?: string;
  ticketEvidenciaUrl?: string;
  usuario?: { id: number; nombre: string; email?: string };
  actividad?: { id: number; titulo?: string; folio?: string } | null;
  aprobadoCoordinador?: boolean;
  aprobadoAdmin?: boolean;
  contabilidadRef?: string;
  approvalStep?: number;
}

const ESTATUS = ["Pendiente", "Aprobado_Coordinador", "Aprobado", "Rechazado", "Pagado"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = {
  concepto: "",
  montoSolicitado: 0,
  comprobante: "",
  categoria: "OTROS",
  projectId: "",
  actividadId: "",
  vehicleId: "",
};

type FormMode = "create" | "approve" | "edit" | null;

type AnalyticsBucket = { name: string; total: number; count: number };
type AnalyticsPayload = {
  totals: {
    count: number;
    pendientes: number;
    totalSolicitado: number;
    totalAprobado: number;
    totalPagado: number;
  };
  byProject: AnalyticsBucket[];
  byPerson: AnalyticsBucket[];
  byCategory: AnalyticsBucket[];
};

export default function ViaticosPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpViaticsAdminSectionConfig(user), [user]);
  const canViewAll = cfg.defaultScope === "team";
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const tabParam = searchParams.get("tab");

  const [items, setItems] = useState<Viatico[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<Viatico | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [approveForm, setApproveForm] = useState({ estatus: "Aprobado", comentariosAdmin: "" });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"todos" | "contabilidad" | "analytics">(
    tabParam === "analytics" || tabParam === "todos" || tabParam === "contabilidad"
      ? tabParam
      : "contabilidad",
  );
  const [filter, setFilter] = useState("");
  const [filterEstatus, setFilterEstatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null }[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("viatics", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((v: Record<string, unknown>) => ({
        ...v,
        concepto: (v.motivo as string | undefined) ?? (v.concepto as string | undefined),
        comprobante: (v.ticketEvidenciaUrl as string | undefined) ?? (v.comprobante as string | undefined),
      })) as Viatico[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar viáticos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      const data = await apiFetch(`viatics/analytics?${qs}`, token);
      setAnalytics(data as AnalyticsPayload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (tabParam === "analytics" || tabParam === "todos" || tabParam === "contabilidad") {
      setTab(tabParam);
    }
  }, [tabParam]);
  useEffect(() => {
    if (tab === "analytics") void loadAnalytics();
  }, [tab, loadAnalytics]);

  useEffect(() => {
    if (!token) return;
    void apiFetch("ventas/proyectos", token)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setProjects(rows.map((p: { id: number; name?: string }) => ({ id: p.id, name: p.name || `#${p.id}` })));
      })
      .catch(() => setProjects([]));
    void apiFetch("vehicles/inventory", token)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setVehicles(
          rows.map((v: { id: number; nombre?: string; placas?: string | null }) => ({
            id: v.id,
            nombre: v.nombre || `Vehículo #${v.id}`,
            placas: v.placas,
          })),
        );
      })
      .catch(() => setVehicles([]));
  }, [token]);

  const visibleItems = useMemo(
    () => filterRowsByScope(items, user, cfg.defaultScope),
    [items, user, cfg.defaultScope],
  );

  const filtered = useMemo(() => {
    if (tab === "analytics") return [];
    let rows = tab === "contabilidad"
      ? visibleItems.filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado")
      : visibleItems;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    if (filterEstatus) rows = rows.filter((v) => v.estatus === filterEstatus);
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (v) =>
        (v.concepto ?? "").toLowerCase().includes(q) ||
        (v.usuario?.nombre ?? "").toLowerCase().includes(q) ||
        (v.actividad?.folio ?? "").toLowerCase().includes(q) ||
        (v.estatus ?? "").toLowerCase().includes(q) ||
        (v.contabilidadRef ?? "").toLowerCase().includes(q),
    );
  }, [visibleItems, filter, filterEstatus, highlightId, tab]);

  const pendientes = visibleItems.filter((v) => v.estatus === "Pendiente").length;
  const contabilidadItems = visibleItems.filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado");
  const aprobados = contabilidadItems.length;
  const totalMonto = visibleItems.reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);
  const pendienteMonto = visibleItems
    .filter((v) => v.estatus !== "Rechazado")
    .reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEvidenceFile(null);
    setMode("create");
  };
  const openApprove = (v: Viatico) => {
    setSelected(v);
    setApproveForm({ estatus: "Aprobado", comentariosAdmin: "" });
    setMode("approve");
  };
  const openEdit = (v: Viatico) => {
    setSelected(v);
    setForm({
      concepto: v.concepto ?? v.motivo ?? "",
      montoSolicitado: Number(v.montoSolicitado) || 0,
      comprobante: v.comprobante ?? v.ticketEvidenciaUrl ?? "",
      categoria: (v as { categoria?: string }).categoria || "OTROS",
      projectId: (v as { projectId?: number }).projectId ? String((v as { projectId?: number }).projectId) : "",
      actividadId: v.actividad?.id ? String(v.actividad.id) : "",
      vehicleId: (v as { vehicleId?: number }).vehicleId ? String((v as { vehicleId?: number }).vehicleId) : "",
    });
    setMode("edit");
  };

  const submitEdit = async () => {
    if (!token || !selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`viatics/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          motivo: form.concepto.trim(),
          montoSolicitado: form.montoSolicitado,
          ticketEvidenciaUrl: form.comprobante.trim() || undefined,
          categoria: form.categoria,
          projectId: form.projectId ? Number(form.projectId) : null,
          actividadId: form.actividadId ? Number(form.actividadId) : null,
          vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
        }),
      });
      setItems((prev) => prev.map((v) => (v.id === selected.id ? {
        ...v,
        ...(updated ?? {}),
        concepto: updated?.motivo ?? form.concepto,
        comprobante: updated?.ticketEvidenciaUrl ?? form.comprobante,
      } : v)));
      setMode(null);
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const submitCreate = async () => {
    if (!token || !user?.id || !form.concepto.trim() || !form.montoSolicitado) return;
    if (!form.projectId && !form.actividadId) {
      toast.error("Liga la solicitud a un proyecto o una actividad.");
      return;
    }
    if (!evidenceFile && !form.comprobante.trim()) {
      toast.error("Adjunta el comprobante (archivo o URL).");
      return;
    }
    setSaving(true);
    try {
      const created = await postViatico(
        token,
        {
          usuarioId: user.id,
          motivo: form.concepto.trim(),
          montoSolicitado: form.montoSolicitado,
          comprobanteUrl: form.comprobante.trim() || undefined,
          categoria: form.categoria,
          projectId: form.projectId ? Number(form.projectId) : null,
          actividadId: form.actividadId ? Number(form.actividadId) : null,
          vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
        },
        evidenceFile,
      );
      if (created) {
        setItems((prev) => [{
          ...created,
          concepto: created.motivo ?? form.concepto,
          comprobante: created.ticketEvidenciaUrl ?? form.comprobante,
        }, ...prev]);
      }
      setMode(null);
      setEvidenceFile(null);
      toast.success("Solicitud enviada");
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    if (!token) return;
    try {
      const { downloadViaticsReportPdf } = await import("@/lib/viatics-api");
      await downloadViaticsReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    }
  };

  const submitApprove = async () => {
    if (!token || !selected) return;
    setSaving(true);
    try {
      if (approveForm.estatus === "Pagado") {
        await markViaticoPagado(token, selected.id);
      } else if (approveForm.estatus === "Rechazado") {
        await approveViatico(token, selected.id, "reject", approveForm.comentariosAdmin || undefined);
      } else {
        await approveViatico(token, selected.id, "approve", approveForm.comentariosAdmin || undefined);
      }
      void load();
      setMode(null);
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const softDelete = async (v: Viatico) => {
    if (!token) return;
    setConfirmState({ message: `¿Cancelar viático "${v.concepto ?? v.motivo}"?`, confirmLabel: "Cancelar viático", fn: async () => {
    try {
      await apiFetch(`viatics/${v.id}`, token, { method: "PATCH", body: JSON.stringify({ estatus: "Rechazado" }) });
      setItems((prev) => prev.map((i) => (i.id === v.id ? { ...i, estatus: "Rechazado" } : i)));
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  } });
  };

  const estatusVariant = (e?: string): "positive" | "warning" | "danger" | "accent" | "default" => {
    if (e === "Aprobado" || e === "Pagado") return "positive";
    if (e === "Rechazado") return "danger";
    if (e === "Aprobado_Coordinador") return "accent";
    return "warning";
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13,
  };

  const columns: Column<Viatico>[] = [
    {
      key: "id", label: "ID",
      render: (v) => <code style={{ fontSize: 11 }}>V-{String(v.id).padStart(4, "0")}</code>,
      width: 80,
    },
    ...(canViewAll ? [{
      key: "usuario" as keyof Viatico,
      label: "Solicitante",
      render: (v: Viatico) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{v.usuario?.nombre ?? "—"}</div>
          {v.actividad && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{v.actividad.folio ?? `Act-${v.actividad.id}`}</div>}
        </div>
      ),
      width: 160,
    }] : []),
    {
      key: "concepto", label: "Concepto",
      accessor: (v) => v.concepto ?? "—",
    },
    {
      key: "montoSolicitado", label: "Monto",
      align: "right" as const,
      render: (v) => <Money value={Number(v.montoSolicitado) || 0} />,
      width: 110,
    },
    {
      key: "fechaSolicitud", label: "Fecha",
      render: (v) => <span style={{ fontSize: 12 }}>{v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX") : "—"}</span>,
      width: 100,
    },
    {
      key: "estatus", label: "Estado",
      render: (v) => <Tag variant={estatusVariant(v.estatus)}>{(v.estatus ?? "Pendiente").replace(/_/g, " ")}</Tag>,
      width: 140,
    },
    {
      key: "contabilidadRef" as keyof Viatico, label: "Ref. contabilidad",
      render: (v) => <code style={{ fontSize: 11 }}>{v.contabilidadRef ?? "—"}</code>,
      width: 140,
    },
    {
      key: "acciones" as keyof Viatico, label: "",
      render: (v) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {v.estatus === "Pendiente" && (cfg.canCreate || v.usuario?.id === user?.id) && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(v); }}>Editar</Button>
          )}
          {cfg.canApprove && v.estatus === "Pendiente" && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openApprove(v); }}>Autorizar</Button>
          )}
          {cfg.canApprove && v.estatus === "Aprobado" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(v); setApproveForm({ estatus: "Pagado", comentariosAdmin: "" }); setMode("approve"); }}>Marcar pagado</Button>
          )}
          {cfg.canDelete && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void softDelete(v); }}>✕</Button>
          )}
        </div>
      ),
      width: 180,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        actions={
          <>
            <Button variant="ghost" iconLeft="📄" onClick={() => void downloadPdf()}>PDF control</Button>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="💸" onClick={openCreate}>Solicitar viático</Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Aprobados" value={aprobados} variant="positive" icon="✅" />
        <KpiCard label="Total registros" value={items.length} variant="default" icon="📋" />
        {canViewAll && (
          <KpiCard label="Monto pendiente" value={<Money value={pendienteMonto} compact />} variant={pendienteMonto > 10000 ? "warning" : "default"} icon="💰" />
        )}
      </div>

      {items.length > 0 && (() => {
        const byStatus: Record<string, number> = {};
        for (const v of items) { const s = v.estatus ?? "Sin estatus"; byStatus[s] = (byStatus[s] ?? 0) + 1; }
        const statusColors: Record<string, string> = {
          Pendiente: "var(--warning)", Aprobado: "var(--success)", Pagado: "var(--primary)",
          Rechazado: "var(--danger)", Aprobado_Coordinador: "color-mix(in srgb, var(--success) 60%, var(--warning))",
        };
        const total = items.length;
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estatus</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
                <div key={s} style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{s.replace("_", " ")}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: statusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant={tab === "contabilidad" ? "primary" : "secondary"} onClick={() => setTab("contabilidad")}>Contabilidad (aprobados)</Button>
        <Button size="sm" variant={tab === "todos" ? "primary" : "secondary"} onClick={() => setTab("todos")}>Todos</Button>
        <Button size="sm" variant={tab === "analytics" ? "primary" : "secondary"} onClick={() => setTab("analytics")}>Analytics</Button>
      </div>
      <FilterToolbar
        search={{ value: filter, onChange: setFilter, placeholder: "Buscar por concepto, solicitante, folio…" }}
        selects={tab === "todos" ? [{
          label: "Estatus",
          value: filterEstatus,
          onChange: setFilterEstatus,
          options: ESTATUS.map((s) => ({ value: s, label: s.replace("_", " ") })),
          allowAll: true,
        }] : []}
        onClear={() => { setFilter(""); setFilterEstatus(""); }}
        resultCount={loading ? null : filtered.length}
        rightActions={filtered.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(filtered, [
            { key: "id", label: "ID" },
            { key: "concepto", label: "Concepto" },
            { key: "usuario", label: "Solicitante", format: (v) => (v as Viatico["usuario"])?.nombre ?? "—" },
            { key: "montoSolicitado", label: "Monto" },
            { key: "estatus", label: "Estatus" },
            { key: "fechaSolicitud", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "viaticos")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : tab === "analytics" ? "Control de gastos" : `${filtered.length} viáticos`}>
        {tab === "analytics" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Desde</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Hasta</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
              </label>
              <Button size="sm" variant="secondary" onClick={() => void loadAnalytics()}>Aplicar</Button>
              <Button size="sm" variant="primary" onClick={() => void downloadPdf()}>Descargar PDF</Button>
            </div>
            {analyticsLoading && <EmptyState icon="⏳" title="Calculando…" description="Agregando gastos de viáticos." />}
            {!analyticsLoading && analytics && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  <KpiCard label="Registros" value={analytics.totals.count} />
                  <KpiCard label="Pendientes" value={analytics.totals.pendientes} variant="warning" />
                  <KpiCard label="Aprobado" value={<Money value={analytics.totals.totalAprobado} compact />} variant="positive" />
                  <KpiCard label="Pagado" value={<Money value={analytics.totals.totalPagado} compact />} />
                </div>
                {([
                  ["Por proyecto", analytics.byProject],
                  ["Por persona", analytics.byPerson],
                  ["Por categoría", analytics.byCategory],
                ] as const).map(([title, rows]) => (
                  <div key={title} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)" }}>{title}</div>
                    {!rows.length && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>}
                    {rows.slice(0, 10).map((r) => (
                      <div key={r.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                        <span>{r.name}</span>
                        <span style={{ color: "var(--text-tertiary)" }}>{r.count} reg.</span>
                        <Money value={r.total} />
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando viático <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando viáticos…" description="Consultando solicitudes desde la API." />}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(v) => v.id}
            emptyTitle="Sin viáticos"
            emptyDescription={cfg.canCreate ? "Solicita tu primer viático con el botón de arriba." : "No hay viáticos registrados."}
          />
        )}
          </>
        )}
      </Section>

      {/* Modal crear */}
      {mode === "create" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setMode(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Solicitar viático</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
                  {["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Proyecto (ventas)</span>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={inp}>
                  <option value="">— Opcional si hay actividad —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>ID actividad OPS</span>
                <input value={form.actividadId} onChange={(e) => setForm((f) => ({ ...f, actividadId: e.target.value }))}
                  placeholder="Ej. 128" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vehículo (opcional)</span>
                <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
                  <option value="">— Sin vehículo —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto / descripción</span>
                <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Hospedaje 1 noche + viáticos Puebla" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado ($)</span>
                <input type="number" min={0} value={form.montoSolicitado}
                  onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))} style={inp} />
              </label>
              <FileDropzone
                file={evidenceFile}
                onFile={setEvidenceFile}
                label="Ticket / comprobante"
                required
                hint="Obligatorio · PDF o imagen"
              />
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL comprobante (alternativa)</span>
                <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))}
                  placeholder="Solo si no subes archivo" style={inp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitCreate()} disabled={saving || !form.concepto || (!evidenceFile && !form.comprobante.trim())}>
                {saving ? "Enviando…" : "Enviar solicitud"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pendiente */}
      {mode === "edit" && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setMode(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Editar viático #{selected.id}</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto / descripción</span>
                <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado ($)</span>
                <input type="number" min={0} value={form.montoSolicitado} onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL comprobante</span>
                <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} style={inp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitEdit()} disabled={saving || !form.concepto.trim()}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aprobar */}
      {mode === "approve" && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setMode(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Revisar viático</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>
              {selected.usuario?.nombre} — <strong>{selected.concepto}</strong>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", marginBottom: 20 }}>
              ${Number(selected.montoSolicitado || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Decisión</span>
                <select value={approveForm.estatus} onChange={(e) => setApproveForm((f) => ({ ...f, estatus: e.target.value }))} style={inp}>
                  <option value="Aprobado">✅ Aprobar</option>
                  <option value="Rechazado">❌ Rechazar</option>
                  <option value="Pagado">💳 Marcar como pagado</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Comentarios</span>
                <textarea value={approveForm.comentariosAdmin}
                  onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                  placeholder="Motivo del rechazo, notas de pago, etc."
                  rows={3}
                  style={{ ...inp, resize: "vertical" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
              <Button
                variant={approveForm.estatus === "Rechazado" ? "danger" : "primary"}
                onClick={() => void submitApprove()}
                disabled={saving}
              >
                {saving ? "Guardando…" : approveForm.estatus === "Rechazado" ? "Rechazar" : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
