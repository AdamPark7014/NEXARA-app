"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import FileDropzone from "@/components/ui/FileDropzone";
import InlineAlert from "@/components/ui/InlineAlert";
import ListExportActions from "@/components/ui/ListExportActions";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import {
  FinanceField,
  FinanceFormGrid,
  FinanceModuleShell,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { getApiAssetOrigin } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { exportToExcel } from "@/lib/export-excel";
import { filterRowsByScope, getErpExpensesSectionConfig } from "@/lib/section-views";
import {
  EXPENSE_CATEGORIES,
  approveExpense,
  deleteExpense,
  downloadExpensesReportPdf,
  fetchExpensesAnalytics,
  financeFetch,
  markExpensePagado,
  patchExpenseAdmin,
  postExpenseAdmin,
  type ExpensesAnalytics,
} from "@/lib/finance-api";

type ExpenseEstado = "Pendiente" | "Aprobado" | "Pagado" | "Rechazado";

interface Expense {
  id: number;
  concepto?: string;
  monto?: number;
  categoria?: string;
  estado?: ExpenseEstado | string;
  fecha?: string;
  esRecurrente?: boolean;
  ticketEvidenciaUrl?: string | null;
  isAdministrative?: boolean;
  creadoPor?: { id?: number; nombre?: string };
}

const ESTADOS: ExpenseEstado[] = ["Pendiente", "Aprobado", "Pagado", "Rechazado"];

const emptyForm = {
  concepto: "",
  monto: 0,
  categoria: "Servicios",
  esRecurrente: false,
  fecha: new Date().toISOString().slice(0, 10),
};

/* ── Estilos locales del contrato de diseño (.ai/DISENO-FINANZAS.md) ──────── */

/** Regla 4: acciones de pantalla a 32px / 13px. El único primario es «Registrar gasto». */
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Regla 3: tono neutral para el flujo normal; el color solo entra cuando el
 * renglón pide acción («Pendiente») o algo salió mal («Rechazado»).
 */
function estadoTone(estado?: string): StatusTone {
  if (estado === "Pagado") return "success";
  if (estado === "Rechazado") return "danger";
  if (estado === "Pendiente") return "warning";
  return "neutral";
}

function assetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiAssetOrigin().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatFecha(fecha?: string) {
  if (!fecha) return "—";
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function mapExpenseRow(raw: Record<string, unknown>): Expense {
  const fechaRaw = raw.fechaGasto ?? raw.fechaSolicitud ?? raw.fecha;
  return {
    id: Number(raw.id),
    concepto: String(raw.concepto ?? raw.razonGasto ?? "—"),
    monto: Number(raw.montoSolicitado ?? raw.monto ?? 0),
    categoria: raw.categoria ? String(raw.categoria) : undefined,
    estado: String(raw.estatusPago ?? raw.estado ?? "Pendiente"),
    fecha: fechaRaw ? String(fechaRaw).slice(0, 10) : undefined,
    esRecurrente: Boolean(raw.esRecurrente),
    ticketEvidenciaUrl: (raw.ticketEvidenciaUrl as string | null | undefined) ?? null,
    isAdministrative: Boolean(raw.isAdministrative),
    creadoPor: (raw.usuario ?? raw.creadoPor ?? raw.createdBy) as Expense["creadoPor"],
  };
}

type FormErrors = { concepto?: string; monto?: string; evidencia?: string };

export default function ExpensesPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getErpExpensesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lista" | "analytics">("lista");
  const [searchQ, setSearchQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<ExpensesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await financeFetch("expenses", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapExpenseRow(r)));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los gastos"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadAnalytics = useCallback(async () => {
    if (!token) return;
    setAnalyticsLoading(true);
    try {
      const data = await fetchExpensesAnalytics(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setAnalytics(data);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar analytics"));
    } finally {
      setAnalyticsLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "analytics") void loadAnalytics();
  }, [tab, loadAnalytics]);

  const visibleItems = useMemo(() => {
    let result = filterRowsByScope(items, user, cfg.defaultScope);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(
        (e) =>
          (e.concepto ?? "").toLowerCase().includes(q) ||
          (e.creadoPor?.nombre ?? "").toLowerCase().includes(q) ||
          (e.categoria ?? "").toLowerCase().includes(q),
      );
    }
    if (filterCat) result = result.filter((e) => e.categoria === filterCat);
    if (filterEstado) result = result.filter((e) => e.estado === filterEstado);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) result = [...result].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return result;
  }, [items, user, cfg.defaultScope, searchQ, filterCat, filterEstado, highlightId]);

  /**
   * Regla 1: la tira responde a lo que la persona viene a saber — cuánto falta
   * por autorizar, cuánto está autorizado esperando pago, cuánto ya se pagó y
   * qué bloquea el cierre contable.
   */
  const metrics = useMemo<Metric[]>(() => {
    const sum = (rows: Expense[]) => rows.reduce((s, e) => s + (e.monto ?? 0), 0);
    const porAutorizar = visibleItems.filter((e) => e.estado === "Pendiente");
    const autorizados = visibleItems.filter((e) => e.estado === "Aprobado");
    const pagados = visibleItems.filter((e) => e.estado === "Pagado");
    const sinComprobante = visibleItems.filter(
      (e) => !e.ticketEvidenciaUrl && e.estado !== "Rechazado",
    );
    const toggleEstado = (estado: string) => setFilterEstado((prev) => (prev === estado ? "" : estado));

    return [
      {
        label: "Por autorizar",
        value: <Money value={sum(porAutorizar)} />,
        hint: plural(porAutorizar.length, "gasto esperando", "gastos esperando"),
        tone: porAutorizar.length > 0 ? "warning" : "default",
        onClick: () => toggleEstado("Pendiente"),
      },
      {
        label: "Autorizado sin pagar",
        value: <Money value={sum(autorizados)} />,
        hint: plural(autorizados.length, "gasto listo para pago", "gastos listos para pago"),
        onClick: () => toggleEstado("Aprobado"),
      },
      {
        label: "Pagado",
        value: <Money value={sum(pagados)} />,
        hint: plural(pagados.length, "gasto liquidado", "gastos liquidados"),
        onClick: () => toggleEstado("Pagado"),
      },
      {
        label: "Sin comprobante",
        value: sinComprobante.length,
        hint: sinComprobante.length > 0 ? "bloquean el cierre" : "todo comprobado",
        tone: sinComprobante.length > 0 ? "danger" : "default",
      },
    ];
  }, [visibleItems]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setEvidenceFile(null);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      concepto: e.concepto ?? "",
      monto: e.monto ?? 0,
      categoria: e.categoria ?? "Servicios",
      esRecurrente: e.esRecurrente ?? false,
      fecha: e.fecha?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    });
    setEvidenceFile(null);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    // Regla 5: la validación se contesta bajo el campo, no en un aviso suelto.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Escribe de qué es el gasto.";
    if (!form.monto) errors.monto = "Captura el monto; tiene que ser mayor que cero.";
    if (!editing && !evidenceFile) errors.evidencia = "Adjunta el comprobante del gasto.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveErr(null);
    try {
      const fields = {
        concepto: form.concepto.trim(),
        monto: form.monto,
        categoria: form.categoria,
        esRecurrente: form.esRecurrente,
        fecha: form.fecha,
        usuarioId: user?.id,
      };
      const row = editing
        ? await patchExpenseAdmin(token, editing.id, fields, evidenceFile)
        : await postExpenseAdmin(token, fields, evidenceFile);
      const mapped = mapExpenseRow(row as Record<string, unknown>);
      setItems((prev) =>
        editing ? prev.map((x) => (x.id === editing.id ? mapped : x)) : [mapped, ...prev],
      );
      setShowForm(false);
      toast.success(editing ? "Gasto actualizado" : "Gasto registrado");
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el gasto"));
    } finally {
      setSaving(false);
    }
  };

  const runApprove = (e: Expense) => {
    setConfirmState({
      message: `¿Autorizar el gasto "${e.concepto}"?`,
      confirmLabel: "Autorizar",
      fn: async () => {
        try {
          const updated = await approveExpense(token, e.id, "approve");
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Gasto autorizado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo autorizar"));
        }
      },
    });
  };

  const submitReject = async () => {
    if (!token || !rejectTarget) return;
    setSaving(true);
    try {
      const updated = await approveExpense(token, rejectTarget.id, "reject", rejectNote.trim() || undefined);
      setItems((prev) =>
        prev.map((x) =>
          x.id === rejectTarget.id ? mapExpenseRow(updated as Record<string, unknown>) : x,
        ),
      );
      setRejectTarget(null);
      setRejectNote("");
      toast.success("Gasto rechazado");
    } catch (err) {
      toast.error(formatApiError(err, "No se pudo rechazar"));
    } finally {
      setSaving(false);
    }
  };

  const runMarkPagado = (e: Expense) => {
    setConfirmState({
      message: `¿Marcar como pagado "${e.concepto}"?`,
      confirmLabel: "Marcar pagado",
      fn: async () => {
        try {
          const updated = await markExpensePagado(token, e.id);
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Marcado como pagado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo marcar pagado"));
        }
      },
    });
  };

  const remove = (e: Expense) => {
    setConfirmState({
      message: `¿Eliminar el gasto "${e.concepto}"?`,
      confirmLabel: "Eliminar",
      fn: async () => {
        try {
          await deleteExpense(token, e.id);
          setItems((prev) => prev.filter((x) => x.id !== e.id));
          toast.success("Gasto eliminado");
        } catch (err) {
          toast.error(formatApiError(err, "No se pudo eliminar"));
        }
      },
    });
  };

  const downloadPdf = async () => {
    if (!token) return;
    try {
      await downloadExpensesReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF"));
    }
  };

  const columns: Column<Expense>[] = [
    {
      key: "concepto",
      label: "Concepto",
      render: (e) => {
        const href = assetUrl(e.ticketEvidenciaUrl);
        const meta: string[] = [e.categoria ?? "Sin categoría"];
        if (e.creadoPor?.nombre) meta.push(e.creadoPor.nombre);
        if (e.esRecurrente) meta.push("Recurrente");
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
              {e.concepto ?? "—"}
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
      key: "monto",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (e) => <Money value={e.monto ?? 0} />,
      width: 120,
    },
    {
      key: "fecha",
      label: "Fecha",
      render: (e) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {formatFecha(e.fecha)}
        </span>
      ),
      width: 110,
    },
    {
      key: "estado",
      label: "Estado",
      render: (e) => <StatusDot label={e.estado ?? "—"} tone={estadoTone(e.estado)} />,
      width: 110,
    },
    {
      key: "id",
      label: "",
      align: "right",
      render: (e) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {cfg.canEdit && e.estado === "Pendiente" && (
            <Button size="sm" variant="ghost" style={rowButtonStyle} onClick={() => openEdit(e)}>
              Editar
            </Button>
          )}
          {cfg.canApprove && e.estado === "Pendiente" && (
            <>
              <Button size="sm" variant="secondary" style={rowButtonStyle} onClick={() => runApprove(e)}>
                Autorizar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
                onClick={() => {
                  setRejectTarget(e);
                  setRejectNote("");
                }}
              >
                Rechazar
              </Button>
            </>
          )}
          {cfg.canApprove && e.estado === "Aprobado" && (
            <Button size="sm" variant="secondary" style={rowButtonStyle} onClick={() => runMarkPagado(e)}>
              Marcar pagado
            </Button>
          )}
          {cfg.canDelete && (
            <Button size="sm" variant="ghost" style={rowButtonStyle} onClick={() => remove(e)}>
              Eliminar
            </Button>
          )}
        </div>
      ),
      width: 260,
    },
  ];

  return (
    <>
      {highlightId && (
        <InlineAlert
          variant="info"
          message={`Mostrando el gasto #${highlightId} desde un enlace directo.`}
        />
      )}
      <FinanceModuleShell
        eyebrow="ERP · Finanzas"
        title={cfg.title || "Gastos · Admin"}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button size="sm" variant="ghost" style={toolbarButtonStyle} onClick={() => void load()}>
              Actualizar
            </Button>
            {cfg.canCreate && (
              <Button size="sm" variant="primary" style={toolbarButtonStyle} onClick={openNew}>
                Registrar gasto
              </Button>
            )}
          </>
        }
        kpis={
          <div style={{ gridColumn: "1 / -1" }}>
            <MetricStrip metrics={metrics} ariaLabel="Resumen de gastos" />
          </div>
        }
        tabs={[
          { id: "lista", label: "Lista" },
          { id: "analytics", label: "Analytics" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as "lista" | "analytics")}
      >
        {tab === "analytics" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              <FinanceField label="Desde" hint="Deja vacío para incluir todo el histórico." optional>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={financeInputStyle} />
              </FinanceField>
              <FinanceField label="Hasta" optional>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={financeInputStyle} />
              </FinanceField>
              <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void loadAnalytics()}>
                Aplicar
              </Button>
              <Button size="sm" variant="ghost" style={toolbarButtonStyle} onClick={() => void downloadPdf()}>
                Descargar PDF
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
                    { label: "Registros", value: analytics.count, hint: "en el periodo" },
                    {
                      label: "Por autorizar",
                      value: analytics.pendientes,
                      hint: plural(analytics.pendientes, "gasto esperando", "gastos esperando"),
                      tone: analytics.pendientes > 0 ? "warning" : "default",
                    },
                    { label: "Autorizado", value: <Money value={analytics.totalAprobado} />, hint: "sin pagar aún" },
                    { label: "Pagado", value: <Money value={analytics.totalPagado} />, hint: "liquidado en el periodo" },
                  ]}
                />
                {(
                  [
                    ["Por categoría", analytics.byCategory],
                    ["Por persona", analytics.byPerson],
                  ] as const
                ).map(([title, rows]) => (
                  <div key={title} style={breakdownPanelStyle}>
                    <div style={breakdownTitleStyle}>{title}</div>
                    {!rows.length && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
                    )}
                    {rows.slice(0, 12).map((r, i) => (
                      <div
                        key={r.name}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          alignItems: "baseline",
                          gap: 12,
                          padding: "6px 0",
                          borderBottom:
                            i === Math.min(rows.length, 12) - 1
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
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto…" }}
              selects={[
                {
                  label: "Categoría",
                  value: filterCat,
                  onChange: setFilterCat,
                  options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
                  allowAll: true,
                },
                {
                  label: "Estado",
                  value: filterEstado,
                  onChange: setFilterEstado,
                  options: ESTADOS.map((s) => ({ value: s, label: s })),
                  allowAll: true,
                },
              ]}
              onClear={() => {
                setSearchQ("");
                setFilterCat("");
                setFilterEstado("");
              }}
              resultCount={loading ? null : visibleItems.length}
              rightActions={
                <ListExportActions
                  onExcel={
                    visibleItems.length > 0
                      ? () =>
                          exportToExcel(
                            visibleItems,
                            [
                              { key: "concepto", label: "Concepto" },
                              { key: "monto", label: "Monto", format: (v) => `${Number(v).toFixed(2)}` },
                              { key: "categoria", label: "Categoría" },
                              { key: "estado", label: "Estado" },
                              { key: "fecha", label: "Fecha" },
                            ],
                            "gastos",
                          )
                      : undefined
                  }
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
                Cargando gastos…
              </div>
            ) : !error ? (
              <DataTable
                columns={columns}
                rows={visibleItems}
                rowKey={(e) => e.id}
                density="compact"
                emptyTitle="Sin gastos"
                emptyDescription={
                  searchQ || filterCat || filterEstado
                    ? "Ningún gasto coincide con los filtros aplicados."
                    : "Registra el primer gasto administrativo."
                }
                emptyAction={
                  cfg.canCreate && !searchQ && !filterCat && !filterEstado ? (
                    <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={openNew}>
                      Registrar gasto
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
          </>
        )}
      </FinanceModuleShell>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Editar gasto" : "Registrar gasto"}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" style={toolbarButtonStyle} onClick={() => void save()} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar" : "Registrar gasto"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField
            label="Concepto"
            fullWidth
            hint="Así aparece en el reporte y en el PDF de cierre."
            error={formErrors.concepto}
          >
            <input
              value={form.concepto}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
              placeholder="Renta oficinas, internet, SaaS…"
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Categoría" hint="Define en qué rubro suma dentro del reporte.">
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              style={financeInputStyle}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FinanceField>
          <FinanceField label="Monto" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <input
              type="number"
              min={0}
              value={form.monto}
              onChange={(e) => {
                setForm((f) => ({ ...f, monto: Number(e.target.value) }));
                setFormErrors((prev) => ({ ...prev, monto: undefined }));
              }}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Fecha" hint="El día en que se realizó el gasto, no el de captura.">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              style={financeInputStyle}
            />
          </FinanceField>
          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="recurrente"
                checked={form.esRecurrente}
                onChange={(e) => setForm((f) => ({ ...f, esRecurrente: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: "var(--primary)" }}
              />
              <label htmlFor="recurrente" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                Gasto recurrente mensual
              </label>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", paddingLeft: 23, lineHeight: 1.4 }}>
              Se repite cada mes; sirve para proyectar el gasto fijo.
            </span>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={evidenceFile}
              onFile={(f) => {
                setEvidenceFile(f);
                setFormErrors((prev) => ({ ...prev, evidencia: undefined }));
              }}
              label="Comprobante"
              required={!editing}
              hint={editing ? "Opcional · reemplaza el archivo actual" : "PDF o imagen del ticket o la factura"}
            />
            {formErrors.evidencia && (
              <div style={{ fontSize: 11, color: "var(--state-danger-text, #b91c1c)", marginTop: 6 }}>
                {formErrors.evidencia}
              </div>
            )}
            {editing?.ticketEvidenciaUrl && !evidenceFile && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                Actual:{" "}
                <a href={assetUrl(editing.ticketEvidenciaUrl) ?? "#"} target="_blank" rel="noreferrer">
                  ver comprobante
                </a>
              </div>
            )}
          </div>
          {saveErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert message={saveErr} variant="danger" style={{ marginBottom: 0 }} />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Rechazar gasto"
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" style={toolbarButtonStyle} onClick={() => void submitReject()} disabled={saving}>
              {saving ? "Guardando…" : "Rechazar"}
            </Button>
          </>
        }
      >
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
          <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
            {rejectTarget?.concepto}
          </span>
          <span style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
            <Money value={rejectTarget?.monto ?? 0} />
          </span>
        </div>
        <FinanceFormGrid>
          <FinanceField
            label="Nota para quien lo solicitó"
            fullWidth
            optional
            hint="Si explicas el motivo, se corrige a la primera."
          >
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Motivo del rechazo"
              style={{ ...financeInputStyle, resize: "vertical" }}
            />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
