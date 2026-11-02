"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Checkbox,
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
  Textarea,
  type Column,
  type Tone,
} from "@/components/base";
import { useUrlQuery } from "@/components/finance/useUrlQuery";
import { todayStamp } from "@/components/finance/download";
import ReceiptCapture from "@/components/finance/ReceiptCapture";
import { FinanceModuleShell } from "@/components/finance/FinanceModuleShell";
import { Money } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
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
import s from "./expenses.module.css";

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
  fecha: "",
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
function estadoTone(estado?: string): Tone {
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
  const columnas: Column<FinanceAnalyticsBucket>[] = [
    { key: "name", label: "Concepto", render: (r) => r.name },
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

export default function ExpensesPage() {
  const { user, isContextReady } = useUser();
  const searchParams = useUrlQuery();
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
  const deferredQ = useDeferredValue(searchQ);
  const [filterCat, setFilterCat] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  /** Id del renglón con una acción en vuelo: sin esto, doble clic = doble pago. */
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [initialForm, setInitialForm] = useState(emptyForm);
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
      // Un fallo al refrescar NO borra lo que ya estaba en pantalla: se avisa
      // arriba y la tabla sigue mostrando la última lista buena. Vaciarla
      // convertía un timeout en «no tienes gastos», que es mentira.
      setError(formatApiError(e, "No se pudieron cargar los gastos"));
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

  /**
   * Lo que la persona tiene derecho a ver, antes de filtrar. Separado de
   * `visibleItems` porque la regla 7 distingue «no hay ni un gasto» de «los
   * filtros no dejaron pasar ninguno», y son dos pantallas distintas.
   */
  const scopedItems = useMemo(
    () => filterRowsByScope(items, user, cfg.defaultScope),
    [items, user, cfg.defaultScope],
  );
  const hasFilters = Boolean(searchQ.trim() || filterCat || filterEstado);

  /** Búsqueda y categoría; el estado se aplica después para poder contar cada estado en los chips. */
  const porTexto = useMemo(() => {
    let result = scopedItems;
    if (deferredQ.trim()) {
      const q = deferredQ.trim().toLowerCase();
      result = result.filter(
        (e) =>
          (e.concepto ?? "").toLowerCase().includes(q) ||
          (e.creadoPor?.nombre ?? "").toLowerCase().includes(q) ||
          (e.categoria ?? "").toLowerCase().includes(q) ||
          (e.contabilidadRef ?? "").toLowerCase().includes(q),
      );
    }
    if (filterCat) result = result.filter((e) => e.categoria === filterCat);
    return result;
  }, [scopedItems, deferredQ, filterCat]);

  const visibleItems = useMemo(() => {
    let result = porTexto;
    if (filterEstado) result = result.filter((e) => e.estado === filterEstado);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) result = [...result].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return result;
  }, [porTexto, filterEstado, highlightId]);

  const conteoEstado = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const e of porTexto) cuenta[e.estado ?? ""] = (cuenta[e.estado ?? ""] ?? 0) + 1;
    return cuenta;
  }, [porTexto]);

  /**
   * Regla 1: la tira responde a lo que la persona viene a saber — cuánto falta
   * por autorizar, cuánto está autorizado esperando pago, cuánto ya se pagó y
   * qué bloquea el cierre contable.
   */
  const resumen = useMemo(() => {
    const sum = (rows: Expense[]) => rows.reduce((acc, e) => acc + (e.monto ?? 0), 0);
    const porAutorizar = visibleItems.filter((e) => e.estado === "Pendiente");
    const autorizados = visibleItems.filter((e) => e.estado === "Aprobado");
    const pagados = visibleItems.filter((e) => e.estado === "Pagado");
    const sinComprobante = visibleItems.filter(
      (e) => !e.ticketEvidenciaUrl && e.estado !== "Rechazado",
    );
    return {
      porAutorizar: { n: porAutorizar.length, total: sum(porAutorizar) },
      autorizados: { n: autorizados.length, total: sum(autorizados) },
      pagados: { n: pagados.length, total: sum(pagados) },
      sinComprobante: sinComprobante.length,
    };
  }, [visibleItems]);
  const toggleEstado = (estado: string) => setFilterEstado((prev) => (prev === estado ? "" : estado));

  const openNew = () => {
    const inicial = { ...emptyForm, fecha: todayStamp() };
    setEditing(null);
    setForm(inicial);
    setInitialForm(inicial);
    setEvidenceFile(null);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    const inicial = {
      concepto: e.concepto ?? "",
      monto: e.monto ?? 0,
      categoria: e.categoria ?? "Servicios",
      esRecurrente: e.esRecurrente ?? false,
      fecha: e.fecha?.slice(0, 10) ?? todayStamp(),
    };
    setEditing(e);
    setForm(inicial);
    setInitialForm(inicial);
    setEvidenceFile(null);
    setSaveErr(null);
    setFormErrors({});
    setShowForm(true);
  };

  const formDirty =
    evidenceFile != null || (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== initialForm[k]);

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
    if (rowBusyId != null) return;
    setConfirmState({
      message: `¿Marcar como pagado "${e.concepto}"? Se registra la salida de dinero.`,
      confirmLabel: "Marcar pagado",
      danger: false,
      fn: async () => {
        setRowBusyId(e.id);
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
        } finally {
          setRowBusyId(null);
        }
      },
    });
  };

  const remove = (e: Expense) => {
    if (rowBusyId != null) return;
    setConfirmState({
      message: `¿Eliminar el gasto "${e.concepto}"?`,
      confirmLabel: "Eliminar",
      fn: async () => {
        setRowBusyId(e.id);
        setActionError(null);
        try {
          await deleteExpense(token, e.id);
          setItems((prev) => prev.filter((x) => x.id !== e.id));
          toast.success("Gasto eliminado");
        } catch (err) {
          setActionError(
            `No se pudo eliminar "${e.concepto}": ${formatApiError(err, "el servidor no respondió")}`,
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
          <div className={s.celdaConcepto}>
            <div className={s.concepto}>{e.concepto ?? "—"}</div>
            <div className={s.meta}>
              {/* En móvil el estado deja de ser columna y baja aquí: antes
                  empujaba la tabla más allá del ancho de la pantalla. */}
              {narrow ? (
                <Badge dot size="sm" tone={estadoTone(e.estado)}>
                  {e.estado ?? "—"}
                </Badge>
              ) : null}
              <span>{meta.join(" · ")}</span>
              {href ? (
                <span>
                  ·{" "}
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Ver comprobante de ${e.concepto ?? "el gasto"}`}
                    className={s.enlace}
                  >
                    Ver comprobante
                  </a>
                </span>
              ) : (
                <span className={s.sinComprobante}>· Sin comprobante</span>
              )}
            </div>
            {/* En el teléfono las acciones bajan bajo el concepto: una columna más obligaba a deslizar la tabla. */}
            {narrow ? <div className={s.accionesMovil}>{filaAcciones(e)}</div> : null}
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
            render: (e: Expense) => <span className={s.fechaCelda}>{formatFecha(e.fecha)}</span>,
            width: 110,
          },
        ] as Column<Expense>[])),
    ...(narrow
      ? []
      : ([
          {
            key: "estado",
            label: "Estado",
            render: (e: Expense) => (
              <Badge dot size="sm" tone={estadoTone(e.estado)}>
                {e.estado ?? "—"}
              </Badge>
            ),
            width: 110,
          },
        ] as Column<Expense>[])),
  ];

  /** Acciones del renglón, todas en una sola línea (columna de acciones de `DataTable`). */
  const filaAcciones = (e: Expense) => {
    const nombre = e.concepto ?? `gasto #${e.id}`;
    return (
      <>
        {cfg.canEdit && e.estado === "Pendiente" && (
          <Button size="sm" variant="ghost" aria-label={`Editar ${nombre}`} onClick={() => openEdit(e)}>
            Editar
          </Button>
        )}
        {cfg.canApprove && e.estado === "Pendiente" && (
          <>
            <Button size="sm" variant="secondary" aria-label={`Autorizar ${nombre}`} onClick={() => runApprove(e)}>
              Autorizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
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
            aria-label={`Marcar como pagado ${nombre}`}
            disabled={rowBusyId === e.id}
            onClick={() => runMarkPagado(e)}
          >
            {rowBusyId === e.id ? "Pagando…" : "Marcar pagado"}
          </Button>
        )}
        {cfg.canDelete && (
          <Button
            size="sm"
            variant="danger-ghost"
            aria-label={`Eliminar ${nombre}`}
            disabled={rowBusyId === e.id}
            onClick={() => remove(e)}
          >
            Eliminar
          </Button>
        )}
      </>
    );
  };

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);

  /**
   * Regla 7: cuatro celdas en `$0` encima de un «Sin gastos» no informan de
   * nada y le quitan el sitio a lo único que ayuda ahí —de dónde sale el
   * primer gasto y el botón que lo crea—. La condición es el conteo de filas,
   * no que el importe sea cero: un periodo que de verdad cerró en cero tiene
   * filas y sí se enseña.
   */
  const showMetrics = tab === "lista" && visibleItems.length > 0;
  /** Sin un solo gasto y sin filtros puestos no hay nada que buscar ni exportar. */
  const showToolbar = scopedItems.length > 0 || hasFilters;
  /** La primera carga sí tapa la pantalla; un refresco posterior, no. */
  const firstLoad = loading && items.length === 0;
  /** Sin gastos, sin filtros y sin error: el vacío lleva el botón principal y la cabeza no lo repite. */
  const sinRegistros = !loading && scopedItems.length === 0 && !hasFilters;

  const clearFilters = () => {
    setSearchQ("");
    setFilterCat("");
    setFilterEstado("");
  };

  const buscarPlaceholder = "Buscar por concepto, persona o ref. contable…";

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
    cfg.canCreate && !(tab === "lista" && sinRegistros && !error) ? (
      <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNew}>
        Registrar gasto
      </Button>
    ) : null;

  const estadoChip = (estado: ExpenseEstado) => (
    <FilterChip
      key={estado}
      active={filterEstado === estado}
      count={conteoEstado[estado] ?? 0}
      dot={estadoTone(estado)}
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
        title={cfg.title || "Gastos · Admin"}
        subtitle={cfg.subtitle}
        actions={primaryAction}
        tabs={[
          { id: "lista", label: "Lista" },
          { id: "analytics", label: "Análisis" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as "lista" | "analytics")}
      >
        {highlightId && (
          <Alert tone="info" role="alert">
            {`Mostrando el gasto #${highlightId} desde un enlace directo.`}
          </Alert>
        )}
        {tab === "analytics" ? (
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
            {/* Regla 7 en el periodo: si no hubo ni un gasto, la tira de ceros
                no dice nada; la frase sí. Con filas, aunque sumen cero, se
                enseña: un periodo que cerró en cero es información. */}
            {!analyticsLoading && analytics && analytics.count === 0 && (
              <Card as="div">
                <EmptyState
                  size="compact"
                  tone="neutral"
                  icon={<InsightsOutlinedIcon />}
                  title="En el periodo elegido no hay ningún gasto registrado."
                />
              </Card>
            )}
            {!analyticsLoading && analytics && analytics.count > 0 && (
              <>
                <StatRow variant="strip" ariaLabel="Resumen del periodo">
                  <Stat
                    label="Registros"
                    value={analytics.count}
                    hint={analytics.periodLabel || "en el periodo"}
                    icon={<ReceiptLongOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Por autorizar"
                    value={analytics.pendientes}
                    hint={plural(analytics.pendientes, "gasto esperando", "gastos esperando")}
                    tone={analytics.pendientes > 0 ? "warning" : "default"}
                    icon={<PendingActionsOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Solicitado"
                    value={<Money value={analytics.totalSolicitado} />}
                    hint="capturado en el periodo"
                    icon={<RequestQuoteOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Autorizado"
                    value={<Money value={analytics.totalAprobado} />}
                    hint="sin pagar aún"
                    icon={<TaskAltOutlinedIcon />}
                    iconTone="neutral"
                  />
                  <Stat
                    label="Pagado"
                    value={<Money value={analytics.totalPagado} />}
                    hint="liquidado en el periodo"
                    icon={<PaymentsOutlinedIcon />}
                    iconTone="neutral"
                  />
                </StatRow>
                <BreakdownTable title="Por categoría" rows={analytics.byCategory} />
                <BreakdownTable title="Por persona" rows={analytics.byPerson} />
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
              <StatRow variant="strip" ariaLabel="Resumen de gastos">
                <Stat
                  label="Por autorizar"
                  value={<Money value={resumen.porAutorizar.total} />}
                  hint={plural(resumen.porAutorizar.n, "gasto esperando", "gastos esperando")}
                  tone={resumen.porAutorizar.n > 0 ? "warning" : "default"}
                  icon={<PendingActionsOutlinedIcon />}
                  iconTone="neutral"
                  onClick={() => toggleEstado("Pendiente")}
                  pressed={filterEstado === "Pendiente"}
                />
                <Stat
                  label="Autorizado sin pagar"
                  value={<Money value={resumen.autorizados.total} />}
                  hint={plural(resumen.autorizados.n, "gasto listo para pago", "gastos listos para pago")}
                  icon={<AccountBalanceWalletOutlinedIcon />}
                  iconTone="neutral"
                  onClick={() => toggleEstado("Aprobado")}
                  pressed={filterEstado === "Aprobado"}
                />
                <Stat
                  label="Pagado"
                  value={<Money value={resumen.pagados.total} />}
                  hint={plural(resumen.pagados.n, "gasto liquidado", "gastos liquidados")}
                  icon={<PaymentsOutlinedIcon />}
                  iconTone="neutral"
                  onClick={() => toggleEstado("Pagado")}
                  pressed={filterEstado === "Pagado"}
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
                          active={filterEstado === ""}
                          count={porTexto.length}
                          onClick={() => setFilterEstado("")}
                        >
                          Todos
                        </FilterChip>
                        {ESTADOS.map(estadoChip)}
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
                      aria-label="Categoría"
                      title="Categoría"
                      controlSize="sm"
                      wrapperClassName={s.filtroSelect}
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                    >
                      <option value="">Todos · Categoría</option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
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
                      title: "Ningún gasto coincide",
                      description: "Ningún gasto coincide con los filtros aplicados.",
                      action: (
                        <Button size="sm" variant="secondary" onClick={clearFilters}>
                          Limpiar filtros
                        </Button>
                      ),
                      tone: "neutral",
                    }
                  : {
                      icon: <ReceiptLongOutlinedIcon />,
                      title: "Todavía no hay gastos",
                      description: cfg.canCreate
                        ? "Aquí van los pagos de la operación que no se cargan a un cliente: renta, internet, licencias, papelería. Registra el primero y queda listo para autorizar."
                        : "Aquí van los pagos de la operación que no se cargan a un cliente: renta, internet, licencias, papelería. Los captura el equipo administrativo.",
                      action: cfg.canCreate ? (
                        <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={openNew}>
                          Registrar gasto
                        </Button>
                      ) : undefined,
                      secondaryAction: refreshAction,
                      tone: "neutral",
                    }
              }
            >
              {firstLoad ? (
                <>
                  <SkeletonRows rows={6} label="Cargando gastos…" />
                  <span className="ui-sr-only" role="status" aria-live="polite">
                    Cargando gastos…
                  </span>
                </>
              ) : error && items.length === 0 ? null : (
                <DataTable
                  flush
                  columns={columns}
                  rows={visibleItems}
                  rowKey={(e) => e.id}
                  density="compact"
                  ariaLabel="Gastos administrativos"
                  loading={loading && !firstLoad}
                  rowActionsLabel="Acciones"
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
        title={editing ? "Editar gasto" : "Registrar gasto"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving} loading={saving}>
              {saving ? "Guardando…" : editing ? "Guardar" : "Registrar gasto"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          {invalidFields.length > 0 && (
            <div className={s.completo}>
              <Alert tone="warning" role="alert">
                {`Falta por capturar: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
              </Alert>
            </div>
          )}
          <Field
            label="Concepto"
            fullWidth
            hint="Así aparece en el reporte y en el PDF de cierre."
            error={formErrors.concepto}
          >
            <Input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
              placeholder="Renta oficinas, internet, SaaS…"
            />
          </Field>
          <Field label="Categoría" hint="Define en qué rubro suma dentro del reporte.">
            <Select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monto" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.monto || ""}
              aria-invalid={Boolean(formErrors.monto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, monto: Number(e.target.value) }));
                setFormErrors((prev) => ({ ...prev, monto: undefined }));
              }}
            />
          </Field>
          <Field label="Fecha" hint="El día en que se realizó el gasto, no el de captura.">
            <DateInput
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
          </Field>
          <div className={s.completo}>
            <Checkbox
              id="recurrente"
              checked={form.esRecurrente}
              onChange={(e) => setForm((f) => ({ ...f, esRecurrente: e.target.checked }))}
              label="Gasto recurrente mensual"
              description="Se repite cada mes; sirve para proyectar el gasto fijo."
            />
          </div>
          <div className={s.completo}>
            <ReceiptCapture
              file={evidenceFile}
              onFile={(f) => {
                setEvidenceFile(f);
                setFormErrors((prev) => ({ ...prev, evidencia: undefined }));
              }}
              label="Comprobante"
              required={!editing}
              hint={editing ? "Opcional · reemplaza el archivo actual" : "PDF o imagen del ticket o la factura"}
              showCamera={narrow}
              disabled={saving}
            />
            {formErrors.evidencia && (
              <div role="alert" className={s.errorCampo}>
                {formErrors.evidencia}
              </div>
            )}
            {editing?.ticketEvidenciaUrl && !evidenceFile && (
              <div className={s.pistaPie}>
                Actual:{" "}
                <a
                  href={assetUrl(editing.ticketEvidenciaUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={s.enlace}
                >
                  ver comprobante
                </a>
              </div>
            )}
          </div>
          {editing?.contabilidadRef && (
            <div className={`${s.completo} ${s.pista}`}>Folio contable: {editing.contabilidadRef}</div>
          )}
          {saveErr && (
            <div className={s.completo}>
              <Alert
                tone="danger"
                role="alert"
                action={
                  <Button size="sm" variant="secondary" onClick={() => void save()} disabled={saving}>
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
              onClick={() => {
                setRejectTarget(null);
                setRejectErr(null);
              }}
              disabled={rejecting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void submitReject()} disabled={rejecting} loading={rejecting}>
              {rejecting ? "Rechazando…" : "Rechazar"}
            </Button>
          </>
        }
      >
        <div className={s.rechazoCabeza}>
          <span className={s.rechazoConcepto}>{rejectTarget?.concepto}</span>
          <span className={s.rechazoMonto}>
            <Money value={rejectTarget?.monto ?? 0} />
          </span>
        </div>
        <FieldGrid>
          <Field
            label="Nota para quien lo solicitó"
            fullWidth
            optional
            hint="Si explicas el motivo, se corrige a la primera."
          >
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Motivo del rechazo"
            />
          </Field>
          {rejectErr && (
            <div className={s.completo}>
              <Alert tone="danger" role="alert">
                {rejectErr}
              </Alert>
            </div>
          )}
        </FieldGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
