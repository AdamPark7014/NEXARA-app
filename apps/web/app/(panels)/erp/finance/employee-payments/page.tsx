"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  FilterChip,
  FilterChips,
  Input,
  LinkButton,
  ListCard,
  ModuleToolbar,
  SearchInput,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import FileDropzone from "@/components/ui/FileDropzone";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import SugerenciaNomina from "@/components/finance/SugerenciaNomina";
import { FinanceModuleShell } from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { useHiddenModuleIds } from "@/lib/use-hidden-modules";
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
import s from "./employee-payments.module.css";

/** El control semanal es pesado (dos tablas anchas, menús, panel lateral): se carga al abrir su pestaña. */
const ControlNominaSemanal = dynamic(() => import("@/components/finance/ControlNominaSemanal"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-live="polite" className={s.cargandoControl}>
      Cargando el control semanal…
    </div>
  ),
});

type PaymentsTab = "lista" | "analytics" | "sugerencia" | "control";

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
function statusTone(status?: string): Tone {
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
  const columnas: Column<FinanceAnalyticsBucket>[] = [
    { key: "name", label: "Empleado", render: (r) => r.name },
    {
      key: "count",
      label: "Registros",
      align: "right",
      numeric: true,
      width: 110,
      render: (r) => <span className={s.tenue}>{r.count}</span>,
    },
    { key: "total", label: "Total", align: "right", numeric: true, width: 150, render: (r) => <Money value={r.total} /> },
  ];
  return (
    <Card className={s.tarjeta}>
      <CardHead title={title} />
      {shown.length === 0 ? (
        <p className={s.sinDatos}>Sin datos en el periodo.</p>
      ) : (
        <>
          <DataTable
            flush
            stickyHeader={false}
            density="compact"
            ariaLabel={title}
            columns={columnas}
            rows={shown}
            rowKey={(r) => r.name}
          />
          {rows.length > limit && (
            <p className={s.notaPie}>
              Se muestran los {limit} primeros de {rows.length}. El PDF trae el desglose completo.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * «Nómina» puede estar reservada a la dirección en esta empresa (política del API). Si es
 * así se avisa con claridad en vez de dejar abrir una pantalla cuyas consultas responderían 403.
 */
export default function EmployeePaymentsPage() {
  const { hidden, listo } = useHiddenModuleIds();
  if (listo && hidden.has("employee-payments")) {
    return (
      <div className={s.reservada}>
        <Alert tone="warning" role="alert" title="La nómina está reservada a la dirección">
          En esta empresa solo la dirección general consulta y captura estos pagos. Si necesitas verlos, pídele acceso.
        </Alert>
        <div className={s.volver}>
          <ButtonLink href="/erp">Volver al inicio</ButtonLink>
        </div>
      </div>
    );
  }
  return <EmployeePaymentsContent />;
}

function EmployeePaymentsContent() {
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
  const [tab, setTab] = useState<PaymentsTab>("lista");
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  /** Id del renglón con una acción en vuelo: sin esto, doble clic = doble pago. */
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [initialForm, setInitialForm] = useState(emptyForm);
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
          return null;
        }),
      ]);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setItems(rows.map((r: Record<string, unknown>) => mapPaymentRow(r)));
      if (usersData !== null) {
        const userRows = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
        setUsers(
          userRows.map((u: { id: number; nombre?: string }) => ({
            id: u.id,
            nombre: u.nombre || `#${u.id}`,
          })),
        );
      }
    } catch (e) {
      // Un fallo al refrescar NO borra lo que ya estaba en pantalla: se avisa
      // arriba y la tabla sigue mostrando la última lista buena. Vaciarla
      // convertía un timeout en «no hay pagos», que es mentira.
      setError(formatApiError(e, "No se pudieron cargar los pagos"));
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

  /**
   * La regla 7 distingue «no hay ni un pago» de «los filtros no dejaron pasar
   * ninguno»: son dos pantallas distintas y solo la primera explica de dónde
   * sale el primer registro.
   */
  const hasFilters = Boolean(searchQ.trim() || filterUser || filterStatus);

  /** Búsqueda y empleado; el estado se aplica después para poder contar cada estado en los chips. */
  const porTexto = useMemo(() => {
    let result = items;
    if (deferredQ.trim()) {
      const q = deferredQ.trim().toLowerCase();
      result = result.filter(
        (p) =>
          (p.user?.nombre ?? "").toLowerCase().includes(q) ||
          (p.concepto ?? "").toLowerCase().includes(q) ||
          (p.note ?? "").toLowerCase().includes(q) ||
          (p.contabilidadRef ?? "").toLowerCase().includes(q),
      );
    }
    if (filterUser) result = result.filter((p) => String(p.userId) === filterUser);
    return result;
  }, [items, deferredQ, filterUser]);

  const visibleItems = useMemo(() => {
    if (!filterStatus) return porTexto;
    return porTexto.filter((p) => p.status === filterStatus);
  }, [porTexto, filterStatus]);

  const conteoEstado = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const p of porTexto) cuenta[p.status ?? ""] = (cuenta[p.status ?? ""] ?? 0) + 1;
    return cuenta;
  }, [porTexto]);

  /**
   * Regla 1: lo que la persona viene a saber — qué falta por aprobar, cuánto se
   * pagó, a cuánta gente, y qué registros quedan sin comprobante para el cierre.
   */
  const resumen = useMemo(() => {
    const sum = (rows: Payment[]) => rows.reduce((acc, p) => acc + p.amount, 0);
    const borradores = visibleItems.filter((p) => p.status === "Borrador");
    const pagados = visibleItems.filter((p) => p.status === "Pagado");
    const empleados = new Set(visibleItems.map((p) => p.userId)).size;
    const sinComprobante = visibleItems.filter(
      (p) => (p.evidenceUrls?.length ?? 0) === 0 && p.status !== "Anulado",
    );
    return {
      borradores: { n: borradores.length, total: sum(borradores) },
      pagados: { n: pagados.length, total: sum(pagados) },
      empleados,
      sinComprobante: sinComprobante.length,
    };
  }, [visibleItems]);
  const toggleEstado = (estado: string) => setFilterStatus((prev) => (prev === estado ? "" : estado));

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setInitialForm({ ...emptyForm });
    setEvidenceFiles([]);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    const inicial = {
      userId: String(p.userId),
      concepto: p.concepto ?? "",
      periodFrom: p.periodFrom.slice(0, 10),
      periodTo: p.periodTo.slice(0, 10),
      amount: p.amount,
      totalMinutes: p.totalMinutes ?? 0,
      note: p.note ?? "",
      status: (p.status as PaymentStatus) || "Borrador",
    };
    setEditing(p);
    setForm(inicial);
    setInitialForm(inicial);
    setEvidenceFiles([]);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const formDirty =
    evidenceFiles.length > 0 ||
    (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== initialForm[k]);

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
          <div className={s.celdaEmpleado}>
            <Link href={`/erp/hr/${p.userId}`} className={s.nombre}>
              {nombre}
            </Link>
            <div className={s.meta}>
              {/* En móvil el estado deja de ser columna y baja aquí: antes
                  empujaba la tabla más allá del ancho de la pantalla. */}
              {narrow ? (
                <Badge dot size="sm" tone={statusTone(p.status)}>
                  {p.status ?? "—"}
                </Badge>
              ) : null}
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
                          className={s.enlace}
                        >
                          Comprobante {i + 1}
                        </a>
                      </span>
                    ) : null;
                  })}
                  {urls.length > 3 ? <span>· +{urls.length - 3} más</span> : null}
                </>
              ) : (
                <span className={s.sinComprobante}>· Sin comprobante</span>
              )}
            </div>
            {/* En el teléfono las acciones bajan bajo el nombre: una columna más obligaba a deslizar la tabla. */}
            {narrow ? <div className={s.accionesMovil}>{filaAcciones(p)}</div> : null}
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
              <span className={s.periodoCelda}>
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
    ...(narrow
      ? []
      : ([
          {
            key: "status",
            label: "Estado",
            render: (p: Payment) => (
              <Badge dot size="sm" tone={statusTone(p.status)}>
                {p.status ?? "—"}
              </Badge>
            ),
            width: 110,
          },
        ] as Column<Payment>[])),
  ];

  /** Acciones del renglón, todas en una sola línea (columna de acciones de `DataTable`). */
  const filaAcciones = (p: Payment) => {
    const nombre = p.user?.nombre ?? `empleado #${p.userId}`;
    const busy = rowBusyId === p.id;
    return (
      <>
        {cfg.canEdit && p.status !== "Anulado" && (
          <Button
            size="sm"
            variant="ghost"
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
            variant="danger-ghost"
            aria-label={`Anular el pago a ${nombre}`}
            disabled={busy}
            onClick={() => remove(p)}
          >
            Anular
          </Button>
        )}
      </>
    );
  };

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);

  /**
   * Regla 7: cuatro celdas en `$0` encima de un «Sin pagos» no informan de
   * nada y le quitan el sitio a lo único que ayuda ahí —de dónde sale el
   * primer pago y el botón que lo crea—. La condición es el conteo de filas,
   * no que el importe sea cero.
   */
  const showMetrics = tab === "lista" && visibleItems.length > 0;
  /** Sin un solo pago y sin filtros puestos no hay nada que buscar ni exportar. */
  const showToolbar = items.length > 0 || hasFilters;
  /** La primera carga sí tapa la pantalla; un refresco posterior, no. */
  const firstLoad = loading && items.length === 0;
  /** Sin pagos, sin filtros y sin error: el vacío lleva el botón principal y la cabeza no lo repite. */
  const sinRegistros = !loading && items.length === 0 && !hasFilters;

  const clearFilters = () => {
    setSearchQ("");
    setFilterUser("");
    setFilterStatus("");
  };

  const buscarPlaceholder = "Buscar por empleado, concepto o ref. contable…";

  const exportarPdf = (
    <Button
      size="sm"
      variant="ghost"
      iconStart={<DescriptionOutlinedIcon />}
      disabled={pdfBusy}
      onClick={() => void downloadPdf()}
    >
      {pdfBusy ? "Generando…" : "Exportar PDF"}
    </Button>
  );

  const refreshAction = (
    <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
      {loading ? "Actualizando…" : "Actualizar"}
    </Button>
  );

  /** Regla 4: un solo primario por pantalla, y es la acción a la que se vino. */
  const primaryAction =
    cfg.canCreate && (tab === "lista" || tab === "analytics") && !(tab === "lista" && sinRegistros && !error) ? (
      <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNew}>
        Registrar pago
      </Button>
    ) : null;

  const estadoChip = (estado: PaymentStatus) => (
    <FilterChip
      key={estado}
      active={filterStatus === estado}
      count={conteoEstado[estado] ?? 0}
      dot={statusTone(estado)}
      onClick={() => toggleEstado(estado)}
    >
      {estado}
    </FilterChip>
  );

  return (
    <>
      <FinanceModuleShell
        variant="flat"
        eyebrow="Finanzas"
        title={cfg.title || "Pagos a empleados"}
        subtitle={cfg.subtitle}
        actions={primaryAction}
        tabs={[
          { id: "lista", label: "Lista" },
          { id: "analytics", label: "Análisis" },
          { id: "sugerencia", label: "Sugerencia de nómina" },
          { id: "control", label: "Control semanal" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as PaymentsTab)}
      >
        {tab === "control" ? (
          <ControlNominaSemanal
            token={token}
            canEdit={cfg.canEdit}
            onVerPagos={() => setTab("lista")}
            onPagosGenerados={() => void load()}
          />
        ) : tab === "sugerencia" ? (
          <SugerenciaNomina token={token} />
        ) : tab === "analytics" ? (
          <div className={s.analisis}>
            {/* Regla 8: rango, acción y exportación en una sola fila, sin caja. */}
            <Card as="div" className={s.barra}>
              <ModuleToolbar
                end={
                  <>
                    <Button
                      size="sm"
                      variant="tonal"
                      onClick={() => void loadAnalytics()}
                      disabled={analyticsLoading}
                    >
                      {analyticsLoading ? "Calculando…" : "Aplicar"}
                    </Button>
                    {exportarPdf}
                  </>
                }
              >
                <label className={s.fecha}>
                  <span>Desde</span>
                  <DateInput
                    aria-label="Desde"
                    controlSize="sm"
                    className={s.fechaCtl}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label className={s.fecha}>
                  <span>Hasta</span>
                  <DateInput
                    aria-label="Hasta"
                    controlSize="sm"
                    className={s.fechaCtl}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </label>
                {dateFrom || dateTo ? (
                  <LinkButton
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                  >
                    Limpiar
                  </LinkButton>
                ) : null}
              </ModuleToolbar>
            </Card>
            {analyticsError && (
              <Alert
                tone="danger"
                role="alert"
                onDismiss={() => setAnalyticsError(null)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void loadAnalytics()}>
                    Reintentar
                  </Button>
                }
              >
                {analyticsError}
              </Alert>
            )}
            {analyticsLoading && (
              <Card as="div">
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<InsightsOutlinedIcon />}
                  title="Calculando el resumen del periodo…"
                />
              </Card>
            )}
            {!analyticsLoading && !analytics && !analyticsError && (
              <Card as="div">
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<InsightsOutlinedIcon />}
                  title="Pulsa «Aplicar» para calcular el resumen. Sin fechas cubre todo el histórico."
                />
              </Card>
            )}
            {/* Regla 7 en el periodo: si no hubo ni un pago, la tira de ceros
                no dice nada; la frase sí. Con filas, aunque sumen cero, se
                enseña: un periodo que cerró en cero es información. */}
            {!analyticsLoading && analytics && analytics.count === 0 && (
              <Card as="div">
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<InsightsOutlinedIcon />}
                  title={dateFrom || dateTo ? "En el periodo elegido no hay ningún pago registrado." : "Todavía no hay pagos registrados."}
                  description="El análisis se llena con los pagos que salen al cerrar cada semana en Control semanal."
                  action={
                    <Button size="sm" variant="secondary" onClick={() => setTab("control")}>
                      Ir a Control semanal
                    </Button>
                  }
                />
              </Card>
            )}
            {!analyticsLoading && analytics && analytics.count > 0 && (
              <>
                <StatRow variant="strip" ariaLabel="Resumen del periodo">
                  <Stat
                    label="Pagado"
                    value={<Money value={analytics.totalPagado} />}
                    hint={analytics.periodLabel || "liquidado en el periodo"}
                    icon={<PaymentsOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Por aprobar"
                    value={<Money value={analytics.totalBorrador} />}
                    hint="en borradores"
                    tone={analytics.totalBorrador > 0 ? "warning" : "default"}
                    icon={<PendingActionsOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Empleados"
                    value={analytics.employees}
                    hint="con pago liquidado"
                    icon={<GroupsOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Registros"
                    value={analytics.count}
                    hint="en el periodo"
                    icon={<ReceiptLongOutlinedIcon />}
                    iconTone="neutral"
                  />
                </StatRow>
                <BreakdownTable title="Por empleado" rows={analytics.byEmployee} />
              </>
            )}
          </div>
        ) : (
          <>
            {actionError && (
              <Alert
                tone="danger"
                role="alert"
                onDismiss={() => setActionError(null)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Recargar
                  </Button>
                }
              >
                {actionError}
              </Alert>
            )}
            {usersErr && (
              <Alert
                tone="warning"
                role="alert"
                onDismiss={() => setUsersErr(null)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              >
                {`${usersErr}. El filtro por empleado saldrá vacío y no podrás registrar un pago nuevo hasta que cargue.`}
              </Alert>
            )}
            {error && (
              <Alert
                tone="danger"
                role="alert"
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
            {showMetrics && (
              <StatRow variant="strip" ariaLabel="Resumen de pagos a empleados">
                <Stat
                  label="Por aprobar"
                  value={<Money value={resumen.borradores.total} />}
                  hint={plural(resumen.borradores.n, "borrador esperando", "borradores esperando")}
                  tone={resumen.borradores.n > 0 ? "warning" : "default"}
                  icon={<PendingActionsOutlinedIcon />}
                  iconTone="neutral"
                  onClick={() => toggleEstado("Borrador")}
                  pressed={filterStatus === "Borrador"}
                />
                <Stat
                  label="Pagado"
                  value={<Money value={resumen.pagados.total} />}
                  hint={plural(resumen.pagados.n, "pago liquidado", "pagos liquidados")}
                  icon={<PaymentsOutlinedIcon />}
                  iconTone="neutral"
                  onClick={() => toggleEstado("Pagado")}
                  pressed={filterStatus === "Pagado"}
                />
                <Stat
                  label="Empleados"
                  value={resumen.empleados}
                  hint="con registros en la vista"
                  icon={<GroupsOutlinedIcon />}
                  iconTone="neutral"
                />
                <Stat
                  label="Sin comprobante"
                  value={resumen.sinComprobante}
                  hint={resumen.sinComprobante > 0 ? "bloquean el cierre" : "todo comprobado"}
                  tone={resumen.sinComprobante > 0 ? "danger" : "default"}
                  icon={<AttachFileOutlinedIcon />}
                  iconTone="neutral"
                />
              </StatRow>
            )}
            {/* Regla 8: buscador, filtros, exportación y actualizar en una sola fila
                dentro de la tarjeta de la lista. */}
            <ListCard
              toolbar={
                showToolbar ? (
                  <ModuleToolbar
                    search={
                      <SearchInput
                        aria-label={buscarPlaceholder}
                        placeholder={buscarPlaceholder}
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                      />
                    }
                    chips={
                      <FilterChips ariaLabel="Estado">
                        <FilterChip
                          active={filterStatus === ""}
                          count={porTexto.length}
                          onClick={() => setFilterStatus("")}
                        >
                          Todos
                        </FilterChip>
                        {STATUSES.map(estadoChip)}
                      </FilterChips>
                    }
                    end={
                      <>
                        {!firstLoad && (
                          <span className={s.conteo} role="status">
                            {visibleItems.length} resultado{visibleItems.length === 1 ? "" : "s"}
                          </span>
                        )}
                        {refreshAction}
                        <Button
                          size="sm"
                          variant="ghost"
                          iconStart={<FileDownloadOutlinedIcon />}
                          disabled={visibleItems.length === 0}
                          onClick={exportExcel}
                        >
                          Exportar Excel
                        </Button>
                      </>
                    }
                  >
                    <Select
                      aria-label="Empleado"
                      title="Empleado"
                      controlSize="sm"
                      wrapperClassName={s.filtroSelect}
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                    >
                      <option value="">Todos · Empleado</option>
                      {users.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.nombre}
                        </option>
                      ))}
                    </Select>
                    {hasFilters ? <LinkButton onClick={clearFilters}>Limpiar</LinkButton> : null}
                  </ModuleToolbar>
                ) : undefined
              }
              empty={!firstLoad && visibleItems.length === 0 && !(error && items.length === 0)}
              emptyState={
                hasFilters
                  ? {
                      icon: <FilterAltOffOutlinedIcon />,
                      title: "Ningún pago coincide",
                      description: "Ningún pago coincide con los filtros aplicados.",
                      action: (
                        <Button size="sm" variant="secondary" onClick={clearFilters}>
                          Limpiar filtros
                        </Button>
                      ),
                      tone: "neutral",
                    }
                  : {
                      icon: <PaymentsOutlinedIcon />,
                      title: "Todavía no hay pagos",
                      description: cfg.canCreate
                        ? "Los de cada semana salen al cerrar el Control semanal. También puedes registrar uno suelto: eliges a la persona, el rango de fechas y el neto que se deposita, y queda en borrador hasta que alguien lo aprueba."
                        : "Aquí aparecen los pagos por periodo trabajado que captura el equipo administrativo.",
                      action: cfg.canCreate ? (
                        <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNew}>
                          Registrar pago
                        </Button>
                      ) : undefined,
                      secondaryAction: refreshAction,
                      tone: "neutral",
                    }
              }
            >
              {firstLoad ? (
                <div role="status" aria-label="Cargando pagos">
                  <SkeletonRows rows={6} label="Cargando pagos" />
                </div>
              ) : error && items.length === 0 ? null : (
                <DataTable
                  flush
                  columns={columns}
                  rows={visibleItems}
                  rowKey={(p) => p.id}
                  density="compact"
                  ariaLabel="Pagos a empleados"
                  loading={loading && !firstLoad}
                  rowActionsLabel="Acciones"
                  rowActionsAlwaysVisible
                  rowActions={narrow ? undefined : filaAcciones}
                />
              )}
            </ListCard>
          </>
        )}
      </FinanceModuleShell>

      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={formDirty && !saving}
        title={editing ? "Editar pago" : "Registrar pago"}
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving} loading={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar pago"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          {invalidFields.length > 0 && (
            <div className={s.completo}>
              <Alert tone="warning" role="alert">
                {`Revisa: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
              </Alert>
            </div>
          )}
          {editing ? (
            <Field label="Empleado" fullWidth hint="El empleado no cambia; registra otro pago si te equivocaste.">
              <Input value={editing.user?.nombre ?? `#${editing.userId}`} disabled />
            </Field>
          ) : (
            <Field
              label="Empleado"
              fullWidth
              error={formErrors.userId}
              hint={users.length === 0 ? "El catálogo de empleados no cargó; recarga la lista para elegir." : undefined}
            >
              <Select
                value={form.userId}
                aria-invalid={Boolean(formErrors.userId)}
                onChange={(e) => {
                  setForm((f) => ({ ...f, userId: e.target.value }));
                  setFormErrors((prev) => ({ ...prev, userId: undefined }));
                }}
              >
                <option value="">— Seleccionar —</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {usersErr && !editing && (
            <div className={s.completo}>
              <Alert
                tone="warning"
                role="alert"
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Reintentar
                  </Button>
                }
              >
                {usersErr}
              </Alert>
            </div>
          )}
          <Field label="Concepto" fullWidth optional hint="Así se identifica el pago en el reporte y en el PDF.">
            <Input
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Nómina quincenal, bono, finiquito…"
            />
          </Field>
          <Field label="Periodo desde" hint="Primer día que cubre el pago." error={formErrors.periodFrom}>
            <DateInput
              value={form.periodFrom}
              aria-invalid={Boolean(formErrors.periodFrom)}
              onChange={(e) => {
                setForm((f) => ({ ...f, periodFrom: e.target.value }));
                setFormErrors((prev) => ({ ...prev, periodFrom: undefined, periodTo: undefined }));
              }}
            />
          </Field>
          <Field label="Periodo hasta" hint="Último día que cubre el pago." error={formErrors.periodTo}>
            <DateInput
              value={form.periodTo}
              min={form.periodFrom || undefined}
              aria-invalid={Boolean(formErrors.periodTo)}
              onChange={(e) => {
                setForm((f) => ({ ...f, periodTo: e.target.value }));
                setFormErrors((prev) => ({ ...prev, periodTo: undefined }));
              }}
            />
          </Field>
          <Field label="Monto" hint="Pesos: el neto que se deposita." error={formErrors.amount}>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.amount || ""}
              aria-invalid={Boolean(formErrors.amount)}
              onChange={(e) => {
                setForm((f) => ({ ...f, amount: Number(e.target.value) }));
                setFormErrors((prev) => ({ ...prev, amount: undefined }));
              }}
            />
          </Field>
          <Field
            label="Horas trabajadas"
            optional
            hint={
              canCalcAttendance
                ? "«Calcular» las trae de los registros de asistencia del periodo."
                : "Elige empleado y periodo para poder calcularlas desde asistencia."
            }
          >
            <div className={s.horas}>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-label="Horas trabajadas"
                className={s.horasInput}
                value={Math.round((form.totalMinutes / 60) * 100) / 100}
                onChange={(e) => setForm((f) => ({ ...f, totalMinutes: Math.round(Number(e.target.value) * 60) }))}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void calcularDesdeAsistencia()}
                disabled={calculatingAttendance || !canCalcAttendance}
                loading={calculatingAttendance}
              >
                {calculatingAttendance ? "Calculando…" : "Calcular"}
              </Button>
            </div>
          </Field>
          {!editing && (
            <Field label="Estado" hint="Un borrador se revisa antes de aprobarlo y marcarlo pagado.">
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))}
              >
                <option value="Borrador">Borrador</option>
                <option value="Pagado">Pagado</option>
              </Select>
            </Field>
          )}
          <Field label="Nota" fullWidth optional hint="Referencia interna; se queda en el ERP.">
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Ej. transferencia BBVA 1234"
            />
          </Field>
          <div className={s.completo}>
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
              <ul className={s.archivos}>
                {evidenceFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className={s.archivo}>
                    <span className={s.archivoNombre}>{f.name}</span>
                    <LinkButton
                      aria-label={`Quitar ${f.name}`}
                      onClick={() => setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Quitar
                    </LinkButton>
                  </li>
                ))}
              </ul>
            )}
            {editing?.evidenceUrls && editing.evidenceUrls.length > 0 && (
              <div className={`${s.pistaPie} ${s.existentes}`}>
                Existentes:{" "}
                {editing.evidenceUrls.map((u, i) => {
                  const href = assetUrl(u);
                  return href ? (
                    <a key={`${u}-${i}`} href={href} target="_blank" rel="noreferrer" className={s.enlace}>
                      archivo {i + 1}
                    </a>
                  ) : null;
                })}
              </div>
            )}
          </div>
          {editing && (editing.paidAt || editing.contabilidadRef) && (
            <div className={`${s.completo} ${s.pista}`}>
              {editing.paidAt ? `Pagado el ${formatFechaHora(editing.paidAt)}. ` : ""}
              {editing.contabilidadRef ? `Folio contable: ${editing.contabilidadRef}.` : ""}
            </div>
          )}
          {saveErr && (
            <div className={s.completo}>
              <Alert
                tone="danger"
                role="alert"
                onDismiss={() => setSaveErr(null)}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void submit()} disabled={saving}>
                    Reintentar
                  </Button>
                }
              >
                {saveErr}
              </Alert>
            </div>
          )}
        </FieldGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
