"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getErpViaticsAdminSectionConfig } from "@/lib/section-views";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
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
const CATEGORIAS = ["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"];

/* ── Estilos locales del contrato de diseño (.ai/DISENO-FINANZAS.md) ──────── */

/** Regla 4: acciones de pantalla a 32px / 13px. El único primario es «Solicitar viático». */
const toolbarButtonStyle: CSSProperties = { height: 32, fontSize: 13 };
/** Regla 2: las acciones de fila no deben engordar el renglón. */
const rowButtonStyle: CSSProperties = { height: 28, fontSize: 12, padding: "0 9px" };
/** Regla 2: el contexto secundario va en 11px gris bajo el concepto. */
const rowMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  marginTop: 2,
  fontSize: 11,
  color: "var(--text-tertiary)",
  lineHeight: 1.35,
};
const rowMetaWarnStyle: CSSProperties = { color: "var(--state-danger-text, #b91c1c)" };
const breakdownPanelStyle: CSSProperties = {
  padding: 14,
  border: "1px solid var(--nx-panel-hairline, var(--border))",
  borderRadius: 10,
  background: "var(--surface-2, var(--surface))",
};
const breakdownTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
};
const choiceLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: 6,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Regla 3: neutral para el flujo normal; color solo cuando el renglón pide
 * acción (aún sin autorizar) o algo salió mal.
 */
function estatusTone(estatus?: string): StatusTone {
  if (estatus === "Pagado") return "success";
  if (estatus === "Rechazado") return "danger";
  if (estatus === "Aprobado") return "neutral";
  return "warning";
}

function assetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiAssetOrigin().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

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
type FormErrors = { concepto?: string; monto?: string; enlace?: string; comprobante?: string };

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
  const [formErrors, setFormErrors] = useState<FormErrors>({});
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

  /**
   * Regla 1: lo que la persona viene a saber — cuánto espera autorización,
   * cuánto está autorizado sin pagar, cuánto ya se liquidó y qué bloquea el
   * cierre por falta de comprobante.
   */
  const metrics = useMemo<Metric[]>(() => {
    const sum = (rows: Viatico[]) => rows.reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);
    const porAutorizar = visibleItems.filter(
      (v) => v.estatus === "Pendiente" || v.estatus === "Aprobado_Coordinador",
    );
    const autorizados = visibleItems.filter((v) => v.estatus === "Aprobado");
    const pagados = visibleItems.filter((v) => v.estatus === "Pagado");
    const sinComprobante = visibleItems.filter(
      (v) => !(v.comprobante || v.ticketEvidenciaUrl) && v.estatus !== "Rechazado",
    );

    return [
      {
        label: "Por autorizar",
        value: <Money value={sum(porAutorizar)} />,
        hint: plural(porAutorizar.length, "solicitud esperando", "solicitudes esperando"),
        tone: porAutorizar.length > 0 ? "warning" : "default",
      },
      {
        label: "Autorizado sin pagar",
        value: <Money value={sum(autorizados)} />,
        hint: plural(autorizados.length, "solicitud lista para pago", "solicitudes listas para pago"),
      },
      {
        label: "Pagado",
        value: <Money value={sum(pagados)} />,
        hint: plural(pagados.length, "solicitud liquidada", "solicitudes liquidadas"),
      },
      {
        label: "Sin comprobante",
        value: sinComprobante.length,
        hint: sinComprobante.length > 0 ? "bloquean el cierre" : "todo comprobado",
        tone: sinComprobante.length > 0 ? "danger" : "default",
      },
    ];
  }, [visibleItems]);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormErrors({});
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
    setFormErrors({});
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
    // Regla 5: la validación se contesta bajo el campo, no en un aviso suelto.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Describe el gasto del viaje.";
    if (!form.projectId && !form.actividadId) {
      errors.enlace = "Liga la solicitud a un proyecto o a una actividad.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

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
    if (!token || !user?.id) return;
    // Regla 5: mismos requisitos de siempre, dichos bajo el campo que falta.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Describe el gasto del viaje.";
    if (!form.montoSolicitado) errors.monto = "Captura el monto; tiene que ser mayor que cero.";
    if (!form.projectId && !form.actividadId) {
      errors.enlace = "Liga la solicitud a un proyecto o a una actividad.";
    }
    if (!evidenceFile && !form.comprobante.trim()) {
      errors.comprobante = "Adjunta el comprobante: un archivo o una liga.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

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

  const inp = financeInputStyle;

  const columns: Column<Viatico>[] = [
    {
      key: "concepto",
      label: "Concepto",
      render: (v) => {
        const href = assetUrl(v.comprobante ?? v.ticketEvidenciaUrl);
        const meta: string[] = [`V-${String(v.id).padStart(4, "0")}`];
        if (canViewAll && v.usuario?.nombre) meta.push(v.usuario.nombre);
        if (v.actividad) meta.push(v.actividad.folio ?? `Act-${v.actividad.id}`);
        if (v.contabilidadRef) meta.push(`Ref. ${v.contabilidadRef}`);
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
              {v.concepto ?? "—"}
            </div>
            <div style={rowMetaStyle}>
              <span>{meta.join(" · ")}</span>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--primary)", textDecoration: "none" }}
                >
                  · Ver comprobante
                </a>
              ) : (
                <span style={rowMetaWarnStyle}>· Sin comprobante</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "montoSolicitado",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (v) => <Money value={Number(v.montoSolicitado) || 0} />,
      width: 120,
    },
    {
      key: "fechaSolicitud",
      label: "Fecha",
      render: (v) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX") : "—"}
        </span>
      ),
      width: 100,
    },
    {
      key: "estatus",
      label: "Estado",
      render: (v) => (
        <StatusDot
          label={(v.estatus ?? "Pendiente").replace(/_/g, " ")}
          tone={estatusTone(v.estatus)}
        />
      ),
      width: 150,
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (v) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {v.estatus === "Pendiente" && (cfg.canCreate || v.usuario?.id === user?.id) && (
            <Button size="sm" variant="ghost" style={rowButtonStyle} onClick={(e) => { e.stopPropagation(); openEdit(v); }}>Editar</Button>
          )}
          {cfg.canApprove && v.estatus === "Pendiente" && (
            <>
              <Button size="sm" variant="secondary" style={rowButtonStyle} onClick={(e) => { e.stopPropagation(); openApprove(v); }}>Autorizar</Button>
              <Button size="sm" variant="ghost" style={rowButtonStyle} onClick={(e) => { e.stopPropagation(); setSelected(v); setApproveForm({ estatus: "Rechazado", comentariosAdmin: "" }); setMode("approve"); }}>Rechazar</Button>
            </>
          )}
          {cfg.canApprove && v.estatus === "Aprobado" && (
            <Button size="sm" variant="secondary" style={rowButtonStyle} onClick={(e) => { e.stopPropagation(); void (async () => { setSelected(v); try { await markViaticoPagado(token, v.id); void load(); toast.success("Marcado como pagado"); } catch (err) { toast.error(err instanceof Error ? err.message : "Error"); } })(); }}>Marcar pagado</Button>
          )}
          {cfg.canDelete && (
            <Button size="sm" variant="ghost" style={rowButtonStyle} onClick={(e) => { e.stopPropagation(); void softDelete(v); }}>Cancelar</Button>
          )}
        </div>
      ),
      width: 240,
    },
  ];

  return (
    <FinanceModuleShell
      eyebrow="ERP · Finanzas"
      title={cfg.title}
      subtitle={cfg.subtitle}
      actions={
        <>
          <Button size="sm" variant="ghost" style={toolbarButtonStyle} disabled={pdfBusy} onClick={() => void downloadPdf()}>
            {pdfBusy ? "Generando…" : "Exportar PDF"}
          </Button>
          <Button size="sm" variant="ghost" style={toolbarButtonStyle} onClick={() => void load()}>Actualizar</Button>
          {cfg.canCreate && (
            <Button size="sm" variant="primary" style={toolbarButtonStyle} onClick={openCreate}>Solicitar viático</Button>
          )}
        </>
      }
      kpis={
        <div style={{ gridColumn: "1 / -1" }}>
          <MetricStrip metrics={metrics} ariaLabel="Resumen de viáticos" />
        </div>
      }
      tabs={[
        { id: "contabilidad", label: "Contabilidad" },
        { id: "todos", label: "Todos" },
        { id: "analytics", label: "Analytics" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === "analytics" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <FinanceField label="Desde" hint="Deja vacío para incluir todo el histórico." optional>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
            </FinanceField>
            <FinanceField label="Hasta" optional>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
            </FinanceField>
            <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void loadAnalytics()}>Aplicar</Button>
            <Button size="sm" variant="ghost" style={toolbarButtonStyle} onClick={() => void downloadPdf()} disabled={pdfBusy}>
              {pdfBusy ? "Generando…" : "Exportar PDF"}
            </Button>
          </div>
          {analyticsLoading && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
              Calculando…
            </div>
          )}
          {!analyticsLoading && analytics && (
            <>
              <MetricStrip
                ariaLabel="Resumen del periodo"
                metrics={[
                  { label: "Registros", value: analytics.totals.count, hint: "en el periodo" },
                  {
                    label: "Por autorizar",
                    value: analytics.totals.pendientes,
                    hint: plural(analytics.totals.pendientes, "solicitud esperando", "solicitudes esperando"),
                    tone: analytics.totals.pendientes > 0 ? "warning" : "default",
                  },
                  { label: "Autorizado", value: <Money value={analytics.totals.totalAprobado} />, hint: "sin pagar aún" },
                  { label: "Pagado", value: <Money value={analytics.totals.totalPagado} />, hint: "liquidado en el periodo" },
                ]}
              />
              {([
                ["Por proyecto", analytics.byProject],
                ["Por persona", analytics.byPerson],
                ["Por categoría", analytics.byCategory],
              ] as const).map(([title, rows]) => (
                <div key={title} style={breakdownPanelStyle}>
                  <div style={breakdownTitleStyle}>{title}</div>
                  {!rows.length && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>}
                  {rows.slice(0, 10).map((r, i) => (
                    <div
                      key={r.name}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        alignItems: "baseline",
                        gap: 12,
                        padding: "6px 0",
                        borderBottom:
                          i === Math.min(rows.length, 10) - 1
                            ? "none"
                            : "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                        fontSize: 12.5,
                      }}
                    >
                      <span>{r.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.count} reg.</span>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        <Money value={r.total} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <>
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
            rightActions={
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
            }
          />

          {error && (
            <div style={{ marginBottom: 12 }}>
              <InlineAlert message={error} variant="danger" style={{ marginBottom: 8 }} />
              <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          )}
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
              Cargando viáticos…
            </div>
          ) : !error ? (
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(v) => v.id}
              density="compact"
              emptyTitle="Sin viáticos"
              emptyDescription={
                filter || filterEstatus
                  ? "Ninguna solicitud coincide con los filtros aplicados."
                  : tab === "contabilidad"
                    ? "Aquí aparecen las solicitudes ya autorizadas y las pagadas."
                    : cfg.canCreate
                      ? "Solicita el primer viático con el botón de arriba."
                      : "No hay viáticos registrados."
              }
              emptyAction={
                cfg.canCreate && !filter && !filterEstatus && tab === "todos" ? (
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={openCreate}>
                    Solicitar viático
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </>
      )}

      <Modal
        open={mode === "create"}
        onClose={() => setMode(null)}
        title="Solicitar viático"
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={() => setMode(null)}>Cancelar</Button>
            <Button variant="primary" style={toolbarButtonStyle} onClick={() => void submitCreate()} disabled={saving}>
              {saving ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <input
              value={form.concepto}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
              placeholder="Ej. Hospedaje 1 noche + alimentos, Puebla"
              style={inp}
            />
          </FinanceField>
          <FinanceField label="Categoría" hint="Determina en qué rubro suma el reporte.">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Monto solicitado" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <input
              type="number"
              min={0}
              value={form.montoSolicitado}
              onChange={(e) => {
                setForm((f) => ({ ...f, montoSolicitado: +e.target.value }));
                setFormErrors((prev) => ({ ...prev, monto: undefined }));
              }}
              style={inp}
            />
          </FinanceField>
          <FinanceField
            label="Proyecto (ventas)"
            hint="Proyecto o actividad: hace falta uno de los dos para cargar el gasto."
            error={formErrors.enlace}
          >
            <select
              value={form.projectId}
              onChange={(e) => {
                setForm((f) => ({ ...f, projectId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
              style={inp}
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="ID actividad OPS" hint="El número de la actividad, si el gasto va por ahí.">
            <input
              value={form.actividadId}
              onChange={(e) => {
                setForm((f) => ({ ...f, actividadId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
              placeholder="Ej. 128"
              style={inp}
            />
          </FinanceField>
          <FinanceField label="Vehículo" optional hint="Solo si el gasto es de combustible o casetas.">
            <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </select>
          </FinanceField>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={evidenceFile}
              onFile={(f) => {
                setEvidenceFile(f);
                setFormErrors((prev) => ({ ...prev, comprobante: undefined }));
              }}
              label="Ticket o comprobante"
              required
              hint="PDF o imagen. Si no lo tienes a la mano, pega la liga abajo."
            />
            {formErrors.comprobante && (
              <div style={{ fontSize: 11, color: "var(--state-danger-text, #b91c1c)", marginTop: 6 }}>
                {formErrors.comprobante}
              </div>
            )}
          </div>
          <FinanceField label="URL del comprobante" fullWidth optional hint="Alternativa al archivo: una liga a Drive o al portal del proveedor.">
            <input
              value={form.comprobante}
              onChange={(e) => {
                setForm((f) => ({ ...f, comprobante: e.target.value }));
                setFormErrors((prev) => ({ ...prev, comprobante: undefined }));
              }}
              placeholder="https://…"
              style={inp}
            />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "edit" && !!selected}
        onClose={() => setMode(null)}
        title={selected ? `Editar viático V-${String(selected.id).padStart(4, "0")}` : "Editar"}
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={() => setMode(null)}>Cancelar</Button>
            <Button variant="primary" style={toolbarButtonStyle} onClick={() => void submitEdit()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <input
              value={form.concepto}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
              style={inp}
            />
          </FinanceField>
          <FinanceField label="Categoría" hint="Determina en qué rubro suma el reporte.">
            <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} style={inp}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Monto solicitado" hint="Pesos, con IVA incluido.">
            <input
              type="number"
              min={0}
              value={form.montoSolicitado}
              onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))}
              style={inp}
            />
          </FinanceField>
          <FinanceField
            label="Proyecto (ventas)"
            hint="Proyecto o actividad: hace falta uno de los dos para cargar el gasto."
            error={formErrors.enlace}
          >
            <select
              value={form.projectId}
              onChange={(e) => {
                setForm((f) => ({ ...f, projectId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
              style={inp}
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FinanceField>
          <FinanceField label="ID actividad OPS" hint="El número de la actividad, si el gasto va por ahí.">
            <input
              value={form.actividadId}
              onChange={(e) => {
                setForm((f) => ({ ...f, actividadId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
              style={inp}
            />
          </FinanceField>
          <FinanceField label="Vehículo" optional hint="Solo si el gasto es de combustible o casetas.">
            <select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))} style={inp}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </select>
          </FinanceField>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={evidenceFile}
              onFile={setEvidenceFile}
              label="Nuevo comprobante"
              hint="Opcional · reemplaza el archivo actual (PDF o imagen)"
            />
          </div>
          <FinanceField label="URL del comprobante" fullWidth optional hint="Alternativa al archivo: una liga a Drive o al portal del proveedor.">
            <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} style={inp} />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "approve" && !!selected}
        onClose={() => setMode(null)}
        title="Revisar viático"
        maxWidth={500}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={() => setMode(null)}>Cancelar</Button>
            {approveForm.estatus === "Rechazado" ? (
              <Button variant="danger" style={toolbarButtonStyle} onClick={() => void runApprove("reject")} disabled={saving}>
                {saving ? "Guardando…" : "Confirmar rechazo"}
              </Button>
            ) : (
              <Button variant="primary" style={toolbarButtonStyle} onClick={() => void runApprove(approveForm.estatus === "Pagado" ? "pagado" : "approve")} disabled={saving}>
                {saving ? "Guardando…" : approveForm.estatus === "Pagado" ? "Marcar pagado" : "Aprobar"}
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                paddingBottom: 12,
                marginBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selected.concepto}</div>
                <div style={rowMetaStyle}>
                  <span>
                    {[
                      `V-${String(selected.id).padStart(4, "0")}`,
                      selected.usuario?.nombre,
                      selected.actividad?.folio,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
                <Money value={Number(selected.montoSolicitado) || 0} />
              </span>
            </div>
            <FinanceFormGrid>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={choiceLabelStyle}>Resolución</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(
                    [
                      ["Aprobado", "Aprobar"],
                      ["Rechazado", "Rechazar"],
                      ["Pagado", "Marcar pagado"],
                    ] as const
                  ).map(([value, label]) => {
                    const active = approveForm.estatus === value;
                    return (
                      <Button
                        key={value}
                        size="sm"
                        variant={active ? "secondary" : "ghost"}
                        aria-pressed={active}
                        style={{
                          ...rowButtonStyle,
                          height: 32,
                          fontSize: 12.5,
                          borderColor: active ? "var(--primary)" : undefined,
                          color: active ? "var(--primary)" : undefined,
                        }}
                        onClick={() => setApproveForm((f) => ({ ...f, estatus: value }))}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <FinanceField
                label="Comentarios"
                fullWidth
                optional
                hint="Motivo del rechazo, referencia del pago o nota para contabilidad."
              >
                <textarea
                  value={approveForm.comentariosAdmin}
                  onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                  rows={3}
                  style={{ ...inp, resize: "vertical" }}
                />
              </FinanceField>
            </FinanceFormGrid>
          </>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </FinanceModuleShell>
  );
}
