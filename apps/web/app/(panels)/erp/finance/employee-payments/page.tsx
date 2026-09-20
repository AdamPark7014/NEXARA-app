"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
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
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import {
  deleteEmployeePayment,
  downloadEmployeePaymentsReportPdf,
  fetchEmployeePaymentsAnalytics,
  financeFetch,
  markEmployeePaymentPagado,
  patchEmployeePayment,
  postEmployeePayment,
  type EmployeePaymentsAnalytics,
  type FinanceAnalyticsBucket,
} from "@/lib/finance-api";
import {
  appendDraftApprovalNote,
  draftGateConfirmCopy,
  needsDraftApprovalConfirm,
} from "@/lib/prenomina-draft-gate";

type PaymentStatus = "Borrador" | "Pagado" | "Anulado";

interface Payment {
  id: number;
  userId: number;
  concepto?: string | null;
  periodFrom: string;
  periodTo: string;
  amount: number;
  totalMinutes?: number;
  note?: string | null;
  status?: PaymentStatus | string;
  evidenceUrls?: string[];
  paidAt?: string | null;
  /** Folio contable: la API lo escribe al generar la póliza. Puede no existir aún. */
  contabilidadRef?: string | null;
  user?: { id?: number; nombre?: string };
  /** Quién capturó el registro (la API lo incluye como `createdBy`). */
  createdBy?: { id?: number; nombre?: string } | null;
}

interface ApiUserLite {
  id: number;
  nombre: string;
}

const STATUSES: PaymentStatus[] = ["Borrador", "Pagado", "Anulado"];

const emptyForm = {
  userId: "",
  concepto: "",
  periodFrom: "",
  periodTo: "",
  amount: 0,
  totalMinutes: 0,
  note: "",
  status: "Borrador" as PaymentStatus,
};

/* ── Estilos locales del contrato de diseño (.ai/DISENO-FINANZAS.md) ──────── */

/** Regla 4: acciones de pantalla a 32px / 13px. El único primario es «Registrar pago». */
const toolbarButtonStyle: CSSProperties = { height: 32, fontSize: 13 };
/** Regla 2: las acciones de fila no deben engordar el renglón. */
const rowButtonStyle: CSSProperties = { height: 28, fontSize: 12, padding: "0 9px" };
/** Regla 2: el contexto secundario va en 11px gris bajo el nombre. */
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
const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Por debajo de este ancho el periodo deja de ser columna y baja bajo el
 * nombre (regla 2: si una columna no se lee en móvil se colapsa, no se hace
 * scroll horizontal). Va con `matchMedia` porque `DataTable` fija las columnas
 * en JS y no hay forma de ocultarlas con CSS.
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
 * Regla 3: neutral para el flujo normal; color solo cuando el renglón pide
 * acción (un borrador esperando aprobación) o algo salió mal.
 */
function statusTone(status?: string): StatusTone {
  if (status === "Pagado") return "success";
  if (status === "Anulado") return "danger";
  if (status === "Borrador") return "warning";
  return "neutral";
}

function assetUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiAssetOrigin().replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatDay(value?: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

function formatFechaHora(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHoras(totalMinutes?: number) {
  if (!totalMinutes) return null;
  const hrs = Math.round((totalMinutes / 60) * 100) / 100;
  return `${hrs} h`;
}

function mapPaymentRow(raw: Record<string, unknown>): Payment {
  return {
    id: Number(raw.id),
    userId: Number(raw.userId),
    concepto: (raw.concepto as string | null | undefined) ?? null,
    periodFrom: String(raw.periodFrom ?? "").slice(0, 10),
    periodTo: String(raw.periodTo ?? "").slice(0, 10),
    amount: Number(raw.amount ?? 0),
    totalMinutes: Number(raw.totalMinutes ?? 0),
    note: (raw.note as string | null | undefined) ?? null,
    status: String(raw.status ?? "Borrador"),
    evidenceUrls: Array.isArray(raw.evidenceUrls) ? (raw.evidenceUrls as string[]) : [],
    paidAt: raw.paidAt ? String(raw.paidAt) : null,
    contabilidadRef: (raw.contabilidadRef as string | null | undefined) ?? null,
    user: raw.user as Payment["user"],
    createdBy: (raw.createdBy as Payment["createdBy"]) ?? null,
  };
}

type FormErrors = {
  userId?: string;
  periodFrom?: string;
  periodTo?: string;
  amount?: string;
};

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  userId: "Empleado",
  periodFrom: "Periodo desde",
  periodTo: "Periodo hasta",
  amount: "Monto",
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
  const cellBorder = (i: number) =>
    i === shown.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 55%, transparent)";
  return (
    <div style={breakdownPanelStyle}>
      <div style={breakdownTitleStyle}>{title}</div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sin datos en el periodo.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <caption style={srOnlyStyle}>{title}</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", fontWeight: 600, color: "var(--text-tertiary)", fontSize: 11, paddingBottom: 4 }}>
                  Empleado
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
                  <th scope="row" style={{ textAlign: "left", fontWeight: 400, padding: "6px 8px 6px 0", borderBottom: cellBorder(i) }}>
                    {r.name}
                  </th>
                  <td
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      fontVariantNumeric: "tabular-nums",
                      padding: "6px 12px",
                      borderBottom: cellBorder(i),
                    }}
                  >
                    {r.count}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "6px 0", borderBottom: cellBorder(i) }}>
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

export default function EmployeePaymentsPage() {
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "employee-payments"), [user]);
  const token = user?.token ?? "";
  const narrow = useNarrowViewport();

  const [items, setItems] = useState<Payment[]>([]);
  const [users, setUsers] = useState<ApiUserLite[]>([]);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Fallo de una acción de fila: sobrevive al diálogo que lo provocó. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lista" | "analytics">("lista");
  const [searchQ, setSearchQ] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  /** Id del renglón con una acción en vuelo: sin esto, doble clic = doble pago. */
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<EmployeePaymentsAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isContextReady) return;
    if (!token) {
      // Antes salía en silencio y la pantalla se quedaba en «Cargando pagos…»
      // para siempre. Ahora dice qué pasa y qué hacer.
      setLoading(false);
      setItems([]);
      setError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión para ver los pagos.");
      return;
    }
    setLoading(true);
    setError(null);
    // Se limpia en cada intento: si no, un fallo viejo del catálogo se quedaba
    // pegado aunque la recarga siguiente hubiera funcionado.
    setUsersErr(null);
    try {
      const [data, usersData] = await Promise.all([
        financeFetch("employee-payments", token),
        financeFetch("users", token).catch((e) => {
          setUsersErr(formatApiError(e, "No se pudo cargar el catálogo de empleados"));
          return [];
        }),
      ]);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapPaymentRow(r)));
      const userRows = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
      setUsers(
        userRows.map((u: { id: number; nombre?: string }) => ({
          id: u.id,
          nombre: u.nombre || `#${u.id}`,
        })),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los pagos"));
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
      const data = await fetchEmployeePaymentsAnalytics(token, {
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
    let result = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(
        (p) =>
          (p.user?.nombre ?? "").toLowerCase().includes(q) ||
          (p.concepto ?? "").toLowerCase().includes(q) ||
          (p.note ?? "").toLowerCase().includes(q) ||
          (p.contabilidadRef ?? "").toLowerCase().includes(q),
      );
    }
    if (filterUser) result = result.filter((p) => String(p.userId) === filterUser);
    if (filterStatus) result = result.filter((p) => p.status === filterStatus);
    return result;
  }, [items, searchQ, filterUser, filterStatus]);

  /**
   * Regla 1: lo que la persona viene a saber — qué falta por aprobar, cuánto se
   * pagó, a cuánta gente, y qué registros quedan sin comprobante para el cierre.
   */
  const metrics = useMemo<Metric[]>(() => {
    const sum = (rows: Payment[]) => rows.reduce((s, p) => s + p.amount, 0);
    const borradores = visibleItems.filter((p) => p.status === "Borrador");
    const pagados = visibleItems.filter((p) => p.status === "Pagado");
    const empleados = new Set(visibleItems.map((p) => p.userId)).size;
    const sinComprobante = visibleItems.filter(
      (p) => (p.evidenceUrls?.length ?? 0) === 0 && p.status !== "Anulado",
    );

    return [
      {
        label: "Por aprobar",
        value: <Money value={sum(borradores)} />,
        hint: plural(borradores.length, "borrador esperando", "borradores esperando"),
        tone: borradores.length > 0 ? "warning" : "default",
        onClick: () => setFilterStatus((prev) => (prev === "Borrador" ? "" : "Borrador")),
      },
      {
        label: "Pagado",
        value: <Money value={sum(pagados)} />,
        hint: plural(pagados.length, "pago liquidado", "pagos liquidados"),
        onClick: () => setFilterStatus((prev) => (prev === "Pagado" ? "" : "Pagado")),
      },
      {
        label: "Empleados",
        value: empleados,
        hint: "con registros en la vista",
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
    setEvidenceFiles([]);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditing(p);
    setForm({
      userId: String(p.userId),
      concepto: p.concepto ?? "",
      periodFrom: p.periodFrom.slice(0, 10),
      periodTo: p.periodTo.slice(0, 10),
      amount: p.amount,
      totalMinutes: p.totalMinutes ?? 0,
      note: p.note ?? "",
      status: (p.status as PaymentStatus) || "Borrador",
    });
    setEvidenceFiles([]);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setSaveErr(null);
    setFormErrors({});
    setEditing(null);
    setEvidenceFiles([]);
  };

  const [calculatingAttendance, setCalculatingAttendance] = useState(false);
  const canCalcAttendance = Boolean(token && form.userId && form.periodFrom && form.periodTo);

  const calcularDesdeAsistencia = async () => {
    if (calculatingAttendance || !canCalcAttendance) return;
    setCalculatingAttendance(true);
    try {
      const result = await financeFetch(
        `employee-payments/calculate-from-attendance?userId=${form.userId}&from=${form.periodFrom}&to=${form.periodTo}`,
        token,
      );
      const totalMinutes = Number((result as { totalMinutes?: number })?.totalMinutes ?? 0);
      setForm((f) => ({ ...f, totalMinutes }));
      const hrs = Math.round((totalMinutes / 60) * 100) / 100;
      toast.success(`Asistencia: ${hrs}h en el periodo (${(result as { daysWithAttendance?: number })?.daysWithAttendance ?? 0} día(s) con registro).`);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo calcular desde asistencia"));
    } finally {
      setCalculatingAttendance(false);
    }
  };

  const submit = async () => {
    if (saving) return;
    if (!token) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    // Regla 5: la validación se contesta bajo el campo, no en un aviso suelto.
    const errors: FormErrors = {};
    if (!form.userId) errors.userId = "Elige a quién se le paga.";
    if (!form.periodFrom) errors.periodFrom = "Indica el primer día del periodo.";
    if (!form.periodTo) errors.periodTo = "Indica el último día del periodo.";
    if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) {
      errors.periodTo = "El último día del periodo no puede ser anterior al primero.";
    }
    if (!form.amount || form.amount <= 0) errors.amount = "Captura el monto; tiene que ser mayor que cero.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveErr(null);
      return;
    }

    setSaving(true);
    setSaveErr(null);
    try {
      if (editing) {
        const updated = await patchEmployeePayment(
          token,
          editing.id,
          {
            concepto: form.concepto.trim() || undefined,
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            amount: form.amount,
            totalMinutes: form.totalMinutes || undefined,
            note: form.note.trim() || undefined,
            status: form.status,
          },
          evidenceFiles.length ? evidenceFiles : undefined,
        );
        setItems((prev) =>
          prev.map((p) => (p.id === editing.id ? mapPaymentRow(updated as Record<string, unknown>) : p)),
        );
        toast.success("Pago actualizado");
      } else {
        const created = await postEmployeePayment(
          token,
          {
            userId: Number(form.userId),
            concepto: form.concepto.trim() || undefined,
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            amount: form.amount,
            totalMinutes: form.totalMinutes || undefined,
            note: form.note.trim() || undefined,
            status: form.status,
          },
          evidenceFiles,
        );
        setItems((prev) => [mapPaymentRow(created as Record<string, unknown>), ...prev]);
        toast.success("Pago registrado");
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...emptyForm });
      setEvidenceFiles([]);
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el pago"));
    } finally {
      setSaving(false);
    }
  };

  const runMarkPagado = (p: Payment) => {
    if (rowBusyId != null) return;
    const fromDraft = needsDraftApprovalConfirm(p.status);
    const nombre = p.user?.nombre ?? `empleado #${p.userId}`;
    setConfirmState({
      message: fromDraft
        ? `${draftGateConfirmCopy.CONFIRM_MESSAGE} (${nombre})`
        : `¿Marcar como pagado el registro de ${nombre}?`,
      confirmLabel: fromDraft ? draftGateConfirmCopy.CONFIRM_LABEL : "Marcar pagado",
      danger: false,
      fn: async () => {
        setRowBusyId(p.id);
        setActionError(null);
        try {
          if (fromDraft) {
            const actor =
              user?.nombre?.trim() || user?.email?.trim() || `user#${user?.id ?? 0}`;
            await patchEmployeePayment(token, p.id, {
              note: appendDraftApprovalNote(p.note, actor),
            });
          }
          const updated = await markEmployeePaymentPagado(token, p.id);
          setItems((prev) =>
            prev.map((x) => (x.id === p.id ? mapPaymentRow(updated as Record<string, unknown>) : x)),
          );
          toast.success(fromDraft ? "Borrador aprobado y marcado como pagado" : "Marcado como pagado");
        } catch (e) {
          setActionError(
            `No se pudo marcar pagado el registro de ${nombre}: ${formatApiError(e, "el servidor no respondió")}`,
          );
        } finally {
          setRowBusyId(null);
        }
      },
    });
  };

  const remove = (p: Payment) => {
    if (rowBusyId != null) return;
    const nombre = p.user?.nombre ?? `empleado #${p.userId}`;
    setConfirmState({
      message: `¿Anular el pago a ${nombre}? Deja de contar para el cierre y no se puede deshacer desde aquí.`,
      confirmLabel: "Anular",
      fn: async () => {
        setRowBusyId(p.id);
        setActionError(null);
        try {
          await deleteEmployeePayment(token, p.id);
          setItems((prev) => prev.filter((x) => x.id !== p.id));
          toast.success("Pago anulado");
        } catch (e) {
          setActionError(
            `No se pudo anular el pago a ${nombre}: ${formatApiError(e, "el servidor no respondió")}`,
          );
        } finally {
          setRowBusyId(null);
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
      await downloadEmployeePaymentsReportPdf(token, {
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
        {
          key: "user",
          label: "Empleado",
          format: (v) => (v as Payment["user"])?.nombre ?? "—",
        },
        { key: "concepto", label: "Concepto" },
        { key: "periodFrom", label: "Desde" },
        { key: "periodTo", label: "Hasta" },
        { key: "amount", label: "Monto ($)" },
        { key: "status", label: "Estado" },
        { key: "paidAt", label: "Pagado el", format: (v) => (v ? String(v).slice(0, 10) : "") },
        { key: "contabilidadRef", label: "Ref. contable" },
        { key: "note", label: "Nota" },
      ],
      "pagos-empleados",
    );

  const columns: Column<Payment>[] = [
    {
      key: "user",
      label: "Empleado",
      render: (p) => {
        const urls = p.evidenceUrls ?? [];
        const nombre = p.user?.nombre ?? `#${p.userId}`;
        const meta: string[] = [];
        if (p.concepto) meta.push(p.concepto);
        // El periodo es columna propia salvo en pantallas estrechas.
        if (narrow) meta.push(`${formatDay(p.periodFrom)} – ${formatDay(p.periodTo)}`);
        // Horas del periodo: venían de la API y no se mostraban.
        const horas = formatHoras(p.totalMinutes);
        if (horas) meta.push(horas);
        // Cuándo se pagó y con qué folio contable: ambos de la API, nunca inventados.
        if (p.paidAt) meta.push(`Pagado ${formatFechaHora(p.paidAt)}`);
        if (p.contabilidadRef) meta.push(`Ref. ${p.contabilidadRef}`);
        if (p.createdBy?.nombre) meta.push(`Capturó ${p.createdBy.nombre}`);
        if (p.note) meta.push(p.note);
        return (
          <div style={{ minWidth: 0 }}>
            <Link
              href={`/erp/hr/${p.userId}`}
              style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", textDecoration: "none" }}
            >
              {nombre}
            </Link>
            <div style={rowMetaStyle}>
              {meta.length > 0 ? <span>{meta.join(" · ")}</span> : null}
              {urls.length > 0 ? (
                <>
                  {urls.slice(0, 3).map((u, i) => {
                    const href = assetUrl(u);
                    return href ? (
                      <span key={`${u}-${i}`}>
                        ·{" "}
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Ver comprobante ${i + 1} del pago a ${nombre}`}
                          style={{ color: "var(--primary)", textDecoration: "none" }}
                        >
                          Comprobante {i + 1}
                        </a>
                      </span>
                    ) : null;
                  })}
                  {urls.length > 3 ? <span>· +{urls.length - 3} más</span> : null}
                </>
              ) : (
                <span style={rowMetaWarnStyle}>· Sin comprobante</span>
              )}
            </div>
          </div>
        );
      },
    },
    ...(narrow
      ? []
      : ([
          {
            key: "periodFrom",
            label: "Periodo",
            render: (p: Payment) => (
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {formatDay(p.periodFrom)} – {formatDay(p.periodTo)}
              </span>
            ),
            width: 150,
          },
        ] as Column<Payment>[])),
    {
      key: "amount",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (p) => <Money value={p.amount} />,
      width: 120,
    },
    {
      key: "status",
      label: "Estado",
      render: (p) => <StatusDot label={p.status ?? "—"} tone={statusTone(p.status)} />,
      width: 110,
    },
    {
      key: "id",
      label: "",
      align: "right",
      render: (p) => {
        const nombre = p.user?.nombre ?? `empleado #${p.userId}`;
        const busy = rowBusyId === p.id;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {cfg.canEdit && p.status !== "Anulado" && (
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
                aria-label={`Editar el pago a ${nombre}`}
                disabled={busy}
                onClick={() => openEdit(p)}
              >
                Editar
              </Button>
            )}
            {cfg.canEdit && p.status === "Borrador" && (
              <Button
                size="sm"
                variant="secondary"
                style={rowButtonStyle}
                aria-label={`Aprobar el borrador de ${nombre}`}
                disabled={busy}
                onClick={() => runMarkPagado(p)}
              >
                {busy ? "Pagando…" : "Aprobar borrador"}
              </Button>
            )}
            {cfg.canDelete && p.status !== "Anulado" && (
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
                aria-label={`Anular el pago a ${nombre}`}
                disabled={busy}
                onClick={() => remove(p)}
              >
                Anular
              </Button>
            )}
          </div>
        );
      },
      width: 220,
    },
  ];

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);

  return (
    <>
      <FinanceModuleShell
        eyebrow="ERP · Finanzas"
        title={cfg.title || "Pagos a empleados"}
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
                Registrar pago
              </Button>
            )}
          </>
        }
        kpis={
          <div style={{ gridColumn: "1 / -1" }}>
            <MetricStrip metrics={metrics} ariaLabel="Resumen de pagos a empleados" />
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
              <div style={statusPanelStyle}>Elige un rango y pulsa «Aplicar» para calcular el resumen.</div>
            )}
            {!analyticsLoading && analytics && (
              <>
                <MetricStrip
                  ariaLabel="Resumen del periodo"
                  metrics={[
                    { label: "Pagado", value: <Money value={analytics.totalPagado} />, hint: analytics.periodLabel || "liquidado en el periodo" },
                    {
                      label: "Por aprobar",
                      value: <Money value={analytics.totalBorrador} />,
                      hint: "en borradores",
                      tone: analytics.totalBorrador > 0 ? "warning" : "default",
                    },
                    { label: "Empleados", value: analytics.employees, hint: "con pagos en el periodo" },
                    { label: "Registros", value: analytics.count, hint: "en el periodo" },
                  ]}
                />
                <BreakdownTable title="Por empleado" rows={analytics.byEmployee} />
              </>
            )}
          </div>
        ) : (
          <>
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por empleado, concepto o ref. contable…" }}
              selects={[
                {
                  label: "Empleado",
                  value: filterUser,
                  onChange: setFilterUser,
                  options: users.map((u) => ({ value: String(u.id), label: u.nombre })),
                  allowAll: true,
                },
                {
                  label: "Estado",
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: STATUSES.map((s) => ({ value: s, label: s })),
                  allowAll: true,
                },
              ]}
              onClear={() => {
                setSearchQ("");
                setFilterUser("");
                setFilterStatus("");
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
            {usersErr && (
              <InlineAlert
                message={`${usersErr}. El filtro por empleado saldrá vacío y no podrás registrar un pago nuevo hasta que cargue.`}
                variant="warning"
                onDismiss={() => setUsersErr(null)}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void load()}>
                    Reintentar
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
                Cargando pagos…
              </div>
            ) : !error ? (
              <DataTable
                columns={columns}
                rows={visibleItems}
                rowKey={(p) => p.id}
                density="compact"
                emptyTitle="Sin pagos registrados"
                emptyDescription={
                  searchQ || filterUser || filterStatus
                    ? "Ningún pago coincide con los filtros aplicados."
                    : "Registra el primer pago a empleados."
                }
                emptyAction={
                  cfg.canCreate && !searchQ && !filterUser && !filterStatus ? (
                    <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={openNew}>
                      Registrar pago
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
        title={editing ? "Editar pago" : "Registrar pago"}
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              style={toolbarButtonStyle}
              onClick={() => void submit()}
              disabled={saving}
              loading={saving}
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar pago"}
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
                message={`Revisa: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
              />
            </div>
          )}
          {editing ? (
            <FinanceField label="Empleado" fullWidth hint="El empleado no cambia; registra otro pago si te equivocaste.">
              <input value={editing.user?.nombre ?? `#${editing.userId}`} disabled style={{ ...financeInputStyle, opacity: 0.7 }} />
            </FinanceField>
          ) : (
            <FinanceField
              label="Empleado"
              fullWidth
              error={formErrors.userId}
              hint={users.length === 0 ? "El catálogo de empleados no cargó; recarga la lista para elegir." : undefined}
            >
              <select
                value={form.userId}
                aria-invalid={Boolean(formErrors.userId)}
                onChange={(e) => {
                  setForm((f) => ({ ...f, userId: e.target.value }));
                  setFormErrors((prev) => ({ ...prev, userId: undefined }));
                }}
                style={financeInputStyle}
              >
                <option value="">— Seleccionar —</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </FinanceField>
          )}
          {usersErr && !editing && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                message={usersErr}
                variant="warning"
                style={{ marginBottom: 0 }}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          )}
          <FinanceField label="Concepto" fullWidth optional hint="Así se identifica el pago en el reporte y en el PDF.">
            <input
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Nómina quincenal, bono, finiquito…"
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Periodo desde" hint="Primer día que cubre el pago." error={formErrors.periodFrom}>
            <input
              type="date"
              value={form.periodFrom}
              aria-invalid={Boolean(formErrors.periodFrom)}
              onChange={(e) => {
                setForm((f) => ({ ...f, periodFrom: e.target.value }));
                setFormErrors((prev) => ({ ...prev, periodFrom: undefined, periodTo: undefined }));
              }}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Periodo hasta" hint="Último día que cubre el pago." error={formErrors.periodTo}>
            <input
              type="date"
              value={form.periodTo}
              min={form.periodFrom || undefined}
              aria-invalid={Boolean(formErrors.periodTo)}
              onChange={(e) => {
                setForm((f) => ({ ...f, periodTo: e.target.value }));
                setFormErrors((prev) => ({ ...prev, periodTo: undefined }));
              }}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField label="Monto" hint="Pesos: el neto que se deposita." error={formErrors.amount}>
            <input
              type="number"
              min={0}
              value={form.amount}
              aria-invalid={Boolean(formErrors.amount)}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: Number(e.target.value) }));
                setFormErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              style={financeInputStyle}
            />
          </FinanceField>
          <FinanceField
            label="Horas trabajadas"
            optional
            hint={
              canCalcAttendance
                ? "«Calcular» las trae de los registros de asistencia del periodo."
                : "Elige empleado y periodo para poder calcularlas desde asistencia."
            }
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={Math.round((form.totalMinutes / 60) * 100) / 100}
                onChange={(e) => setForm((f) => ({ ...f, totalMinutes: Math.round(Number(e.target.value) * 60) }))}
                style={financeInputStyle}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={toolbarButtonStyle}
                onClick={() => void calcularDesdeAsistencia()}
                disabled={calculatingAttendance || !canCalcAttendance}
                loading={calculatingAttendance}
              >
                {calculatingAttendance ? "Calculando…" : "Calcular"}
              </Button>
            </div>
          </FinanceField>
          {!editing && (
            <FinanceField label="Estado" hint="Un borrador se revisa antes de aprobarlo y marcarlo pagado.">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))}
                style={financeInputStyle}
              >
                <option value="Borrador">Borrador</option>
                <option value="Pagado">Pagado</option>
              </select>
            </FinanceField>
          )}
          <FinanceField label="Nota" fullWidth optional hint="Referencia interna; se queda en el ERP.">
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Ej. transferencia BBVA 1234"
              style={financeInputStyle}
            />
          </FinanceField>
          <div style={{ gridColumn: "1 / -1" }}>
            <FileDropzone
              file={null}
              onFile={(f) => {
                if (f) setEvidenceFiles((prev) => [...prev, f]);
              }}
              label={editing ? "Agregar comprobantes" : "Comprobantes"}
              hint={
                editing
                  ? "Opcional · se anexan a los existentes"
                  : "Opcional · PDF o imagen · puedes agregar varios"
              }
            />
            {evidenceFiles.length > 0 && (
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {evidenceFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      padding: "4px 0",
                      borderBottom: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${f.name}`}
                      onClick={() => setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-tertiary)",
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {editing?.evidenceUrls && editing.evidenceUrls.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
                Existentes:{" "}
                {editing.evidenceUrls.map((u, i) => {
                  const href = assetUrl(u);
                  return href ? (
                    <a key={`${u}-${i}`} href={href} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                      archivo {i + 1}
                    </a>
                  ) : null;
                })}
              </div>
            )}
          </div>
          {editing && (editing.paidAt || editing.contabilidadRef) && (
            <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-tertiary)" }}>
              {editing.paidAt ? `Pagado el ${formatFechaHora(editing.paidAt)}. ` : ""}
              {editing.contabilidadRef ? `Folio contable: ${editing.contabilidadRef}.` : ""}
            </div>
          )}
          {saveErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                message={saveErr}
                variant="danger"
                style={{ marginBottom: 0 }}
                onDismiss={() => setSaveErr(null)}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void submit()} disabled={saving}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
