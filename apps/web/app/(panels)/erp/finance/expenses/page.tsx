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
  type FinanceAnalyticsBucket,
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
  /** Folio contable: la API lo escribe al generar la póliza. Puede no existir aún. */
  contabilidadRef?: string | null;
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
const statusPanelStyle: CSSProperties = {
  padding: 24,
  textAlign: "center",
  fontSize: 13,
  color: "var(--text-tertiary)",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Por debajo de este ancho la fecha deja de ser columna y baja bajo el concepto
 * (regla 2: si una columna no se lee en móvil se colapsa, no se hace scroll
 * horizontal). Se resuelve con `matchMedia` porque `DataTable` fija las
 * columnas en JS y no hay forma de ocultarlas con CSS.
 */
const NARROW_QUERY = "(max-width: 900px)";

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

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
    contabilidadRef: (raw.contabilidadRef as string | null | undefined) ?? null,
    creadoPor: (raw.usuario ?? raw.creadoPor ?? raw.createdBy) as Expense["creadoPor"],
  };
}

type FormErrors = { concepto?: string; monto?: string; evidencia?: string };

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  concepto: "Concepto",
  monto: "Monto",
  evidencia: "Comprobante",
};

/** Desglose de analytics como tabla real: son datos tabulares, no una lista pintada. */
function BreakdownTable({
  title,
  rows,
  limit = 12,
}: {
  title: string;
  rows: FinanceAnalyticsBucket[];
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  return (
    <div style={breakdownPanelStyle}>
      <div style={breakdownTitleStyle}>{title}</div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {title}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Concepto
                </th>
                <th scope="col" style={{ textAlign: "right", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Registros
                </th>
                <th scope="col" style={{ textAlign: "right", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.name}>
                  <th
                    scope="row"
                    style={{
                      textAlign: "left",
                      fontWeight: 400,
                      padding: "6px 8px 6px 0",
                      borderBottom: i === shown.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    }}
                  >
                    {r.name}
                  </th>
                  <td
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      fontVariantNumeric: "tabular-nums",
                      padding: "6px 12px",
                      borderBottom: i === shown.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    }}
                  >
                    {r.count}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      padding: "6px 0",
                      borderBottom: i === shown.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    }}
                  >
                    <Money value={r.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
              Se muestran los {limit} primeros de {rows.length}. El PDF trae el desglose completo.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const { user, isContextReady } = useUser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const cfg = useMemo(() => getErpExpensesSectionConfig(user), [user]);
  const token = user?.token ?? "";
  const narrow = useNarrowViewport();

  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Fallo de una acción de fila: sobrevive al cierre del diálogo que lo provocó. */
  const [actionError, setActionError] = useState<string | null>(null);
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
  const [rejecting, setRejecting] = useState(false);
  const [rejectErr, setRejectErr] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<ExpensesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isContextReady) return;
    if (!token) {
      // Antes salía en silencio y la pantalla se quedaba en «Cargando gastos…»
      // para siempre. Ahora dice qué pasa y qué hacer.
      setLoading(false);
      setItems([]);
      setError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión para ver los gastos.");
      return;
    }
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
  }, [token, isContextReady]);

  const loadAnalytics = useCallback(async () => {
    if (!token) {
      setAnalyticsError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión.");
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await fetchExpensesAnalytics(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setAnalytics(data);
    } catch (e) {
      // Antes solo salía un toast y la pestaña quedaba en blanco sin explicación.
      setAnalyticsError(formatApiError(e, "No se pudo calcular el resumen del periodo"));
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
          (e.categoria ?? "").toLowerCase().includes(q) ||
          (e.contabilidadRef ?? "").toLowerCase().includes(q),
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

  const closeForm = () => {
    setShowForm(false);
    setSaveErr(null);
    setFormErrors({});
  };

  const save = async () => {
    if (saving) return;
    if (!token) {
      // Pulsar «Registrar gasto» sin token ya no es un no-op mudo.
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    // Regla 5: la validación se contesta bajo el campo, no en un aviso suelto.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Escribe de qué es el gasto.";
    if (!form.monto || form.monto <= 0) errors.monto = "Captura el monto; tiene que ser mayor que cero.";
    if (!editing && !evidenceFile) errors.evidencia = "Adjunta el comprobante del gasto.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveErr(null);
      return;
    }

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
      danger: false,
      fn: async () => {
        setActionError(null);
        try {
          const updated = await approveExpense(token, e.id, "approve");
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Gasto autorizado");
        } catch (err) {
          setActionError(
            `No se pudo autorizar "${e.concepto}": ${formatApiError(err, "el servidor no respondió")}`,
          );
        }
      },
    });
  };

  const submitReject = async () => {
    if (rejecting) return;
    if (!token || !rejectTarget) {
      setRejectErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    setRejecting(true);
    setRejectErr(null);
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
      setRejectErr(formatApiError(err, "No se pudo rechazar el gasto"));
    } finally {
      setRejecting(false);
    }
  };

  const runMarkPagado = (e: Expense) => {
    setConfirmState({
      message: `¿Marcar como pagado "${e.concepto}"? Se registra la salida de dinero.`,
      confirmLabel: "Marcar pagado",
      danger: false,
      fn: async () => {
        setActionError(null);
        try {
          const updated = await markExpensePagado(token, e.id);
          setItems((prev) =>
            prev.map((x) => (x.id === e.id ? mapExpenseRow(updated as Record<string, unknown>) : x)),
          );
          toast.success("Marcado como pagado");
        } catch (err) {
          setActionError(
            `No se pudo marcar pagado "${e.concepto}": ${formatApiError(err, "el servidor no respondió")}`,
          );
        }
      },
    });
  };

  const remove = (e: Expense) => {
    setConfirmState({
      message: `¿Eliminar el gasto "${e.concepto}"?`,
      confirmLabel: "Eliminar",
      fn: async () => {
        setActionError(null);
        try {
          await deleteExpense(token, e.id);
          setItems((prev) => prev.filter((x) => x.id !== e.id));
          toast.success("Gasto eliminado");
        } catch (err) {
          setActionError(
            `No se pudo eliminar "${e.concepto}": ${formatApiError(err, "el servidor no respondió")}`,
          );
        }
      },
    });
  };

  const downloadPdf = async () => {
    if (pdfBusy) return;
    if (!token) {
      setAnalyticsError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión.");
      return;
    }
    setPdfBusy(true);
    try {
      await downloadExpensesReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      toast.success("PDF generado");
    } catch (e) {
      setAnalyticsError(formatApiError(e, "No se pudo generar el PDF"));
    } finally {
      setPdfBusy(false);
    }
  };

  const exportExcel = () =>
    exportToExcel(
      visibleItems,
      [
        { key: "concepto", label: "Concepto" },
        { key: "monto", label: "Monto", format: (v) => `${Number(v).toFixed(2)}` },
        { key: "categoria", label: "Categoría" },
        { key: "estado", label: "Estado" },
        { key: "fecha", label: "Fecha" },
        { key: "contabilidadRef", label: "Ref. contable" },
      ],
      "gastos",
    );

  const columns: Column<Expense>[] = [
    {
      key: "concepto",
      label: "Concepto",
      render: (e) => {
        const href = assetUrl(e.ticketEvidenciaUrl);
        const meta: string[] = [e.categoria ?? "Sin categoría"];
        if (e.creadoPor?.nombre) meta.push(e.creadoPor.nombre);
        if (e.esRecurrente) meta.push("Recurrente");
        // La fecha es columna propia salvo en pantallas estrechas, donde baja aquí.
        if (narrow) meta.push(formatFecha(e.fecha));
        // Folio contable: solo si la API ya lo asignó; no se inventa.
        if (e.contabilidadRef) meta.push(`Ref. ${e.contabilidadRef}`);
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
              {e.concepto ?? "—"}
            </div>
            <div style={rowMetaStyle}>
              <span>{meta.join(" · ")}</span>
              {href ? (
                <span>
                  ·{" "}
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Ver comprobante de ${e.concepto ?? "el gasto"}`}
                    style={{ color: "var(--primary)", textDecoration: "none" }}
                  >
                    Ver comprobante
                  </a>
                </span>
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
    ...(narrow
      ? []
      : ([
          {
            key: "fecha",
            label: "Fecha",
            render: (e: Expense) => (
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {formatFecha(e.fecha)}
              </span>
            ),
            width: 110,
          },
        ] as Column<Expense>[])),
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
      render: (e) => {
        const nombre = e.concepto ?? `gasto #${e.id}`;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {cfg.canEdit && e.estado === "Pendiente" && (
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
                aria-label={`Editar ${nombre}`}
                onClick={() => openEdit(e)}
              >
                Editar
              </Button>
            )}
            {cfg.canApprove && e.estado === "Pendiente" && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  style={rowButtonStyle}
                  aria-label={`Autorizar ${nombre}`}
                  onClick={() => runApprove(e)}
                >
                  Autorizar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  style={rowButtonStyle}
                  aria-label={`Rechazar ${nombre}`}
                  onClick={() => {
                    setRejectTarget(e);
                    setRejectNote("");
                    setRejectErr(null);
                  }}
                >
                  Rechazar
                </Button>
              </>
            )}
            {cfg.canApprove && e.estado === "Aprobado" && (
              <Button
                size="sm"
                variant="secondary"
                style={rowButtonStyle}
                aria-label={`Marcar como pagado ${nombre}`}
                onClick={() => runMarkPagado(e)}
              >
                Marcar pagado
              </Button>
            )}
            {cfg.canDelete && (
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
                aria-label={`Eliminar ${nombre}`}
                onClick={() => remove(e)}
              >
                Eliminar
              </Button>
            )}
          </div>
        );
      },
      width: 260,
    },
  ];

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);

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
            <Button
              size="sm"
              variant="ghost"
              style={toolbarButtonStyle}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Actualizando…" : "Actualizar"}
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
              <Button
                size="sm"
                variant="secondary"
                style={toolbarButtonStyle}
                onClick={() => void loadAnalytics()}
                disabled={analyticsLoading}
              >
                {analyticsLoading ? "Calculando…" : "Aplicar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                style={toolbarButtonStyle}
                onClick={() => void downloadPdf()}
                disabled={pdfBusy}
              >
                {pdfBusy ? "Generando…" : "Descargar PDF"}
              </Button>
            </div>
            {analyticsError && (
              <InlineAlert
                message={analyticsError}
                variant="danger"
                style={{ marginBottom: 0 }}
                onDismiss={() => setAnalyticsError(null)}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void loadAnalytics()}>
                    Reintentar
                  </Button>
                }
              />
            )}
            {analyticsLoading && (
              <div style={statusPanelStyle} role="status" aria-live="polite">
                Calculando el resumen del periodo…
              </div>
            )}
            {!analyticsLoading && !analytics && !analyticsError && (
              <div style={statusPanelStyle}>
                Elige un rango y pulsa «Aplicar» para calcular el resumen.
              </div>
            )}
            {!analyticsLoading && analytics && (
              <>
                <MetricStrip
                  ariaLabel="Resumen del periodo"
                  metrics={[
                    { label: "Registros", value: analytics.count, hint: analytics.periodLabel || "en el periodo" },
                    {
                      label: "Por autorizar",
                      value: analytics.pendientes,
                      hint: plural(analytics.pendientes, "gasto esperando", "gastos esperando"),
                      tone: analytics.pendientes > 0 ? "warning" : "default",
                    },
                    { label: "Solicitado", value: <Money value={analytics.totalSolicitado} />, hint: "capturado en el periodo" },
                    { label: "Autorizado", value: <Money value={analytics.totalAprobado} />, hint: "sin pagar aún" },
                    { label: "Pagado", value: <Money value={analytics.totalPagado} />, hint: "liquidado en el periodo" },
                  ]}
                />
                <BreakdownTable title="Por categoría" rows={analytics.byCategory} />
                <BreakdownTable title="Por persona" rows={analytics.byPerson} />
              </>
            )}
          </div>
        ) : (
          <>
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por concepto, persona o ref. contable…" }}
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
                  onExcel={exportExcel}
                  excelDisabled={visibleItems.length === 0}
                />
              }
            />
            {actionError && (
              <InlineAlert
                message={actionError}
                variant="danger"
                onDismiss={() => setActionError(null)}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void load()}>
                    Recargar
                  </Button>
                }
              />
            )}
            {error && (
              <InlineAlert
                message={error}
                variant="danger"
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              />
            )}
            {loading ? (
              <div style={{ ...statusPanelStyle, padding: 32 }} role="status" aria-live="polite">
                Cargando gastos…
              </div>
            ) : !error ? (
              <DataTable
                columns={columns}
                rows={visibleItems}
                rowKey={(e) => e.id}
                density="compact"
                ariaLabel="Gastos administrativos"
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
        onClose={closeForm}
        title={editing ? "Editar gasto" : "Registrar gasto"}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              style={toolbarButtonStyle}
              onClick={() => void save()}
              disabled={saving}
              loading={saving}
            >
              {saving ? "Guardando…" : editing ? "Guardar" : "Registrar gasto"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          {invalidFields.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                variant="warning"
                style={{ marginBottom: 0 }}
                message={`Falta por capturar: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
              />
            </div>
          )}
          <FinanceField
            label="Concepto"
            fullWidth
            hint="Así aparece en el reporte y en el PDF de cierre."
            error={formErrors.concepto}
          >
            <input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
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
              aria-invalid={Boolean(formErrors.monto)}
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
              <div role="alert" style={{ fontSize: 11, color: "var(--state-danger-text, #b91c1c)", marginTop: 6 }}>
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
          {editing?.contabilidadRef && (
            <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-tertiary)" }}>
              Folio contable: {editing.contabilidadRef}
            </div>
          )}
          {saveErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                message={saveErr}
                variant="danger"
                style={{ marginBottom: 0 }}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void save()} disabled={saving}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => {
          setRejectTarget(null);
          setRejectErr(null);
        }}
        title="Rechazar gasto"
        footer={
          <>
            <Button
              variant="ghost"
              style={toolbarButtonStyle}
              onClick={() => {
                setRejectTarget(null);
                setRejectErr(null);
              }}
              disabled={rejecting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              style={toolbarButtonStyle}
              onClick={() => void submitReject()}
              disabled={rejecting}
              loading={rejecting}
            >
              {rejecting ? "Rechazando…" : "Rechazar"}
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
          {rejectErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert message={rejectErr} variant="danger" style={{ marginBottom: 0 }} />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
