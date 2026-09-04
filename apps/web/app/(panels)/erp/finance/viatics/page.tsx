"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getErpViaticsAdminSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { buildApiUrl } from "@/lib/api-base";
import { approveViatico, markViaticoPagado, patchViatico, postViatico, downloadViaticsReportPdf } from "@/lib/viatics-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import FileDropzone from "@/components/ui/FileDropzone";
import Modal from "@/components/ui/Modal";
import {
  FinanceField,
  FinanceFormGrid,
  FinanceModuleShell,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";

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
  const [pdfBusy, setPdfBusy] = useState(false);

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
    setEvidenceFile(null);
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

  const runApprove = async (action: "approve" | "reject" | "pagado") => {
    if (!token || !selected) return;
    setSaving(true);
    try {
      if (action === "pagado") await markViaticoPagado(token, selected.id);
      else await approveViatico(token, selected.id, action, approveForm.comentariosAdmin || undefined);
      void load();
      setMode(null);
      toast.success(action === "reject" ? "Viático rechazado" : action === "pagado" ? "Marcado como pagado" : "Viático aprobado");
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!token || !selected) return;
    if (!form.projectId && !form.actividadId) {
      toast.error("Liga la solicitud a un proyecto o una actividad.");
      return;
    }
    setSaving(true);
    try {
      const updated = await patchViatico(
        token,
        selected.id,
        {
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
      setItems((prev) =>
        prev.map((v) =>
          v.id === selected.id
            ? {
                ...v,
                ...(updated ?? {}),
                concepto: updated?.motivo ?? form.concepto,
                comprobante: updated?.ticketEvidenciaUrl ?? form.comprobante,
              }
            : v,
        ),
      );
      setMode(null);
      setEvidenceFile(null);
      toast.success("Viático actualizado");
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
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
    setPdfBusy(true);
    try {
      await downloadViaticsReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
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

  const inp = financeInputStyle;

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
            <>
              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openApprove(v); }}>Autorizar</Button>
              <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setSelected(v); setApproveForm({ estatus: "Rechazado", comentariosAdmin: "" }); setMode("approve"); }}>Rechazar</Button>
            </>
          )}
          {cfg.canApprove && v.estatus === "Aprobado" && (
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void (async () => { setSelected(v); try { await markViaticoPagado(token, v.id); void load(); toast.success("Marcado como pagado"); } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); } })(); }}>Marcar pagado</Button>
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
    <FinanceModuleShell
      eyebrow="ERP · Finanzas"
      title={cfg.title}
      subtitle={cfg.subtitle}
      actions={
        <>
          <ListExportActions
            size="md"
            onPdf={token ? () => void downloadPdf() : undefined}
            pdfBusy={pdfBusy}
            onExcel={
              filtered.length > 0 && tab !== "analytics"
                ? () =>
                    exportToExcel(
                      filtered,
                      [
                        { key: "id", label: "ID" },
                        { key: "concepto", label: "Concepto" },
                        { key: "usuario", label: "Solicitante", format: (v) => (v as Viatico["usuario"])?.nombre ?? "—" },
                        { key: "montoSolicitado", label: "Monto" },
                        { key: "estatus", label: "Estatus" },
                        { key: "fechaSolicitud", label: "Fecha", format: (v) => (v ? String(v).slice(0, 10) : "") },
                      ],
                      "viaticos",
                      { title: "Control de viáticos" },
                    )
                : undefined
            }
          />
          <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
          {cfg.canCreate && (
            <Button variant="primary" iconLeft="💸" onClick={openCreate}>Solicitar viático</Button>
          )}
        </>
      }
      kpis={
        <>
          <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
          <KpiCard label="Aprobados" value={aprobados} variant="positive" icon="✅" />
          <KpiCard label="Total registros" value={items.length} icon="📋" />
          {canViewAll ? (
            <KpiCard
              label="Monto pendiente"
              value={<Money value={pendienteMonto} compact />}
              variant={pendienteMonto > 10000 ? "warning" : "default"}
              icon="💰"
            />
          ) : null}
        </>
      }
      tabs={[
        { id: "contabilidad", label: "Contabilidad" },
        { id: "todos", label: "Todos" },
        { id: "analytics", label: "Analytics" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
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
        resultCount={loading || tab === "analytics" ? null : filtered.length}
        rightActions={
          tab !== "analytics" ? (
            <ListExportActions
              onExcel={
                filtered.length > 0
                  ? () =>
                      exportToExcel(
                        filtered,
                        [
                          { key: "id", label: "ID" },
                          { key: "concepto", label: "Concepto" },
                          { key: "usuario", label: "Solicitante", format: (v) => (v as Viatico["usuario"])?.nombre ?? "—" },
                          { key: "montoSolicitado", label: "Monto" },
                          { key: "estatus", label: "Estatus" },
                          { key: "fechaSolicitud", label: "Fecha", format: (v) => (v ? String(v).slice(0, 10) : "") },
                        ],
                        "viaticos",
                        { title: "Control de viáticos" },
                      )
                  : undefined
              }
              onPdf={token ? () => void downloadPdf() : undefined}
              pdfBusy={pdfBusy}
            />
          ) : undefined
        }
      />

      <Section title={loading ? "Cargando…" : tab === "analytics" ? "Control de gastos" : `${filtered.length} viáticos`}>
        {tab === "analytics" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              <FinanceField label="Desde">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
              </FinanceField>
              <FinanceField label="Hasta">
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
              </FinanceField>
              <Button size="sm" variant="secondary" onClick={() => void loadAnalytics()}>Aplicar</Button>
              <Button size="sm" variant="primary" onClick={() => void downloadPdf()} disabled={pdfBusy}>
                {pdfBusy ? "Generando…" : "Exportar PDF"}
              </Button>
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

      <Modal
        open={mode === "create"}
        onClose={() => setMode(null)}
        title="Solicitar viático"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitCreate()} disabled={saving || !form.concepto || (!evidenceFile && !form.comprobante.trim())}>
              {saving ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Categoría">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
              {["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Proyecto (ventas)">
            <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={inp}>
              <option value="">— Opcional si hay actividad —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="ID actividad OPS">
            <input value={form.actividadId} onChange={(e) => setForm((f) => ({ ...f, actividadId: e.target.value }))} placeholder="Ej. 128" style={inp} />
          </FinanceField>
          <FinanceField label="Vehículo (opcional)">
            <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="Concepto / descripción">
            <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} placeholder="Ej: Hospedaje 1 noche + viáticos Puebla" style={inp} />
          </FinanceField>
          <FinanceField label="Monto solicitado ($)">
            <input type="number" min={0} value={form.montoSolicitado} onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))} style={inp} />
          </FinanceField>
          <FileDropzone file={evidenceFile} onFile={setEvidenceFile} label="Ticket / comprobante" required hint="Obligatorio · PDF o imagen" />
          <FinanceField label="URL comprobante (alternativa)">
            <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} placeholder="Solo si no subes archivo" style={inp} />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "edit" && !!selected}
        onClose={() => setMode(null)}
        title={selected ? `Editar viático #${selected.id}` : "Editar"}
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitEdit()} disabled={saving || !form.concepto.trim()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Categoría">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
              {["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Proyecto (ventas)">
            <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} style={inp}>
              <option value="">— Opcional si hay actividad —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="ID actividad OPS">
            <input value={form.actividadId} onChange={(e) => setForm((f) => ({ ...f, actividadId: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="Vehículo (opcional)">
            <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="Concepto / descripción">
            <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="Monto solicitado ($)">
            <input type="number" min={0} value={form.montoSolicitado} onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))} style={inp} />
          </FinanceField>
          <FileDropzone file={evidenceFile} onFile={setEvidenceFile} label="Nuevo comprobante (opcional)" hint="PDF o imagen" />
          <FinanceField label="URL comprobante">
            <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} style={inp} />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "approve" && !!selected}
        onClose={() => setMode(null)}
        title="Revisar viático"
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
            {approveForm.estatus === "Rechazado" ? (
              <Button variant="danger" onClick={() => void runApprove("reject")} disabled={saving}>
                {saving ? "Guardando…" : "Confirmar rechazo"}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void runApprove(approveForm.estatus === "Pagado" ? "pagado" : "approve")} disabled={saving}>
                {saving ? "Guardando…" : approveForm.estatus === "Pagado" ? "Marcar pagado" : "Aprobar"}
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <FinanceFormGrid>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {selected.usuario?.nombre} — <strong>{selected.concepto}</strong>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)" }}>
              ${Number(selected.montoSolicitado || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant={approveForm.estatus === "Aprobado" ? "primary" : "secondary"} onClick={() => setApproveForm((f) => ({ ...f, estatus: "Aprobado" }))}>Aprobar</Button>
              <Button size="sm" variant={approveForm.estatus === "Rechazado" ? "danger" : "secondary"} onClick={() => setApproveForm((f) => ({ ...f, estatus: "Rechazado" }))}>Rechazar</Button>
              <Button size="sm" variant={approveForm.estatus === "Pagado" ? "primary" : "secondary"} onClick={() => setApproveForm((f) => ({ ...f, estatus: "Pagado" }))}>Marcar pagado</Button>
            </div>
            <FinanceField label="Comentarios">
              <textarea
                value={approveForm.comentariosAdmin}
                onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                placeholder="Motivo del rechazo, notas de pago, etc."
                rows={3}
                style={{ ...inp, resize: "vertical" }}
              />
            </FinanceField>
          </FinanceFormGrid>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </FinanceModuleShell>
  );
}
