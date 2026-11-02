"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import { useUrlQuery } from "@/components/finance/useUrlQuery";
import ReceiptCapture from "@/components/finance/ReceiptCapture";
import {
  ApprovalTrail,
  BreakdownTable,
  LiquidacionResumen,
  RepartoEditor,
  SelectorMultiple,
  categoriaLabel,
  estatusLabel,
  trailActionLabel,
  type AnalyticsBucket,
  type ApprovalTrailEntry,
} from "./_parts";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  DateInput,
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
  type ModuleEmpty,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { filterRowsByScope, getErpViaticsAdminSectionConfig } from "@/lib/section-views";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import {
  approveViatico,
  assignViaticoLote,
  comprobarViatico,
  markViaticoPagado,
  patchViatico,
  postViatico,
  downloadViaticsReportPdf,
  type ViaticoLiquidacion,
  type ViaticoParte,
} from "@/lib/viatics-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  centavosViatico as centavos,
  pesosViatico as dinero,
  revisarCuadreReparto,
  type ParteForm,
} from "@/lib/viatics-display";
import Modal from "@/components/ui/Modal";
import { FinanceModuleShell } from "@/components/finance/FinanceModuleShell";
import s from "./viatics.module.css";

interface Viatico {
  id: number;
  concepto?: string;
  motivo?: string;
  montoSolicitado?: number;
  estatus?: string;
  fechaSolicitud?: string;
  comprobante?: string;
  ticketEvidenciaUrl?: string;
  categoria?: string;
  /** SOLICITUD (la pide el usuario) | ASIGNACION (la asigna un manager). */
  origen?: string;
  usuario?: { id: number; nombre: string; email?: string };
  /** La API devuelve `anNumber` como folio real; `titulo` es el nombre de la actividad. */
  actividad?: { id: number; titulo?: string; anNumber?: string } | null;
  project?: { id: number; name?: string } | null;
  vehicle?: { id: number; nombre?: string; placas?: string | null } | null;
  projectId?: number | null;
  vehicleId?: number | null;
  asignadoPor?: { id: number; nombre?: string } | null;
  contabilidadRef?: string;
  approvalStep?: number;
  approvalTrail?: unknown;
  /** Partes del gasto cuando el viaje cubrió varias actividades. */
  repartos?: {
    id: number;
    actividadId: number;
    monto: number | string;
    nota?: string | null;
    actividad?: { id: number; anNumber?: string; titulo?: string } | null;
  }[];
  montoAprobado?: number | string | null;
  montoComprobado?: number | string | null;
  liquidacion?: ViaticoLiquidacion;
}

const ESTATUS = ["Pendiente", "Aprobado_Coordinador", "Aprobado", "Rechazado", "Pagado"];
/** En la pestaña de contabilidad la lista ya viene acotada a estos dos. */
const ESTATUS_CONTABILIDAD = ["Aprobado", "Pagado"];
const CATEGORIAS = ["COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS"];

/**
 * `viaticos.service.ts` sirve la lista sin paginar con `take: DEFAULT_LIST_TAKE`
 * (200) y sin total. Si llegan justo 200, lo más probable es que haya más y los
 * totales de la tira solo cubran lo que se ve: hay que decirlo, no callarlo.
 */
const API_LIST_CAP = 200;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Por debajo de este ancho la fecha deja de ser columna y baja bajo el concepto
 * (regla 2: si una columna no se lee en móvil se colapsa, no se hace scroll
 * horizontal). Va con `matchMedia` porque `DataTable` fija las columnas en JS.
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
 * acción (aún sin autorizar) o algo salió mal.
 */
function estatusTone(estatus?: string): Tone {
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

function folioViatico(id: number) {
  return `V-${String(id).padStart(4, "0")}`;
}

function formatFecha(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** `approvalTrail` es Json en la base: se lee a la defensiva y nunca se inventa. */
function readTrail(raw: unknown): ApprovalTrailEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ApprovalTrailEntry => Boolean(e) && typeof e === "object");
}

/** El folio real de la actividad es `anNumber`; `Act-<id>` solo si no viene. */
function actividadFolio(actividad?: Viatico["actividad"]) {
  if (!actividad) return null;
  return actividad.anNumber || `Act-${actividad.id}`;
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

/** Una persona del catálogo `users/assignable`: quien puede recibir un viático. */
type PersonaAsignable = { id: number; nombre: string; email?: string; puesto?: string };
/** Una actividad del catálogo `activities`, con su folio real (`anNumber`). */
type ActividadAsignable = { id: number; anNumber?: string; titulo?: string };

/**
 * La captura de la asignación en lote. Todo texto salvo las dos listas de ids,
 * porque un `<input type="number">` a medio teclear («8», camino de «800») no
 * es un número todavía y convertirlo a cada pulsación borra lo que se escribe.
 */
const emptyAssignForm = {
  usuarioIds: [] as number[],
  actividadIds: [] as number[],
  projectId: "",
  vehicleId: "",
  categoria: "OTROS",
  montoPorPersona: "",
  motivo: "",
  desde: "",
  hasta: "",
};

const fechaCampo = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Lunes a domingo de la semana en curso.
 *
 * Es el caso que pidió el CEO: la cuadrilla sale el lunes y el viático cubre
 * hasta el domingo. Se calcula en hora **local**, no en UTC, porque quien
 * captura piensa en su lunes; a las 18:00 de un domingo en México el UTC ya es
 * lunes y la semana saldría corrida siete días.
 */
function semanaEnCurso(hoy: Date = new Date()): { desde: string; hasta: string } {
  const lunes = new Date(hoy);
  // getDay(): 0 domingo … 6 sábado. `(d + 6) % 7` da cuántos días han pasado
  // desde el lunes, contando el domingo como el sexto y no como el cero.
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { desde: fechaCampo(lunes), hasta: fechaCampo(domingo) };
}

type FormMode = "create" | "approve" | "edit" | "assign" | null;
type FormErrors = {
  concepto?: string;
  monto?: string;
  enlace?: string;
  comprobante?: string;
  reparto?: string;
};

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  concepto: "Concepto",
  monto: "Monto solicitado",
  enlace: "Proyecto o actividad",
  comprobante: "Comprobante",
  reparto: "Reparto entre actividades",
};

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
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getErpViaticsAdminSectionConfig(user), [user]);
  const canViewAll = cfg.defaultScope === "team";
  const token = user?.token ?? "";
  const searchParams = useUrlQuery();
  const highlightId = searchParams.get("highlight");
  const tabParam = searchParams.get("tab");
  const narrow = useNarrowViewport();

  const [items, setItems] = useState<Viatico[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Fallo de una acción de fila: sobrevive al diálogo o al renglón que lo provocó. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<Viatico | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState({
    estatus: "Aprobado",
    comentariosAdmin: "",
    /** Recorte al autorizar: vacío = se autoriza lo solicitado. */
    montoAprobado: "",
    /** Comprobación de tickets contra el anticipo ya entregado. */
    montoComprobado: "",
  });
  const [partes, setPartes] = useState<ParteForm[]>([]);
  const [saving, setSaving] = useState(false);
  /** Id del renglón con una acción en vuelo: sin esto, doble clic = doble pago. */
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [tab, setTab] = useState<"todos" | "contabilidad" | "analytics">(
    tabParam === "analytics" || tabParam === "todos" || tabParam === "contabilidad"
      ? tabParam
      : "contabilidad",
  );
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [filterEstatus, setFilterEstatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: number; nombre: string; placas?: string | null }[]>([]);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  /* ── Asignación en lote ─────────────────────────────────────────────────── */
  const [assignForm, setAssignForm] = useState({ ...emptyAssignForm });
  const [personas, setPersonas] = useState<PersonaAsignable[]>([]);
  const [actividades, setActividades] = useState<ActividadAsignable[]>([]);
  const [assignCatalogLoading, setAssignCatalogLoading] = useState(false);
  const [assignCatalogErr, setAssignCatalogErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isContextReady) return;
    if (!token) {
      // Antes salía en silencio y la pantalla se quedaba en «Cargando viáticos…»
      // para siempre. Ahora dice qué pasa y qué hacer.
      setLoading(false);
      setError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión para ver los viáticos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("viatics", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setTruncated(Array.isArray(data) && rows.length >= API_LIST_CAP);
      setItems(rows.map((v: Record<string, unknown>) => ({
        ...v,
        concepto: (v.motivo as string | undefined) ?? (v.concepto as string | undefined),
        comprobante: (v.ticketEvidenciaUrl as string | undefined) ?? (v.comprobante as string | undefined),
      })) as Viatico[]);
    } catch (e) {
      // Un fallo al refrescar NO borra lo que ya estaba en pantalla: se avisa
      // arriba y la tabla sigue mostrando la última lista buena. Vaciarla
      // convertía un timeout en «no hay viáticos», que es mentira.
      setError(formatApiError(e, "No se pudieron cargar los viáticos"));
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
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      const data = await apiFetch(`viatics/analytics?${qs}`, token);
      setAnalytics(data as AnalyticsPayload);
    } catch (e) {
      // Antes solo salía un toast y la pestaña quedaba en blanco sin explicación.
      setAnalyticsError(formatApiError(e, "No se pudo calcular el resumen del periodo"));
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
    setCatalogErr(null);
    void apiFetch("ventas/proyectos", token)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        setProjects(rows.map((p: { id: number; name?: string }) => ({ id: p.id, name: p.name || `#${p.id}` })));
      })
      .catch((e) => {
        setProjects([]);
        // Antes se tragaba el error y el desplegable salía vacío sin explicar por qué.
        setCatalogErr(formatApiError(e, "No se pudo cargar el catálogo de proyectos"));
      });
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

  /**
   * Catálogos de la asignación: personas y actividades.
   *
   * Se piden al abrir el modal y no con la pantalla, por dos razones: quien
   * solo entra a autorizar no paga esa espera, y los dos endpoints exigen
   * permisos que no todo el que ve viáticos tiene —pedirlos siempre sería un
   * 403 en cada visita—. Con `allSettled`, que falle un catálogo no deja sin
   * el otro: se puede asignar por proyecto aunque las actividades no carguen.
   */
  const cargarCatalogosAsignacion = useCallback(async () => {
    if (!token) return;
    setAssignCatalogLoading(true);
    setAssignCatalogErr(null);
    const [gente, actos] = await Promise.allSettled([
      apiFetch("users/assignable", token),
      apiFetch("activities", token),
    ]);
    const fallos: string[] = [];
    if (gente.status === "fulfilled") {
      const rows = Array.isArray(gente.value) ? gente.value : (gente.value?.data ?? []);
      setPersonas(
        rows.map((u: PersonaAsignable) => ({
          id: u.id,
          nombre: u.nombre || `Persona #${u.id}`,
          email: u.email,
          puesto: u.puesto,
        })),
      );
    } else {
      setPersonas([]);
      fallos.push(formatApiError(gente.reason, "no se pudo cargar la lista de personas"));
    }
    if (actos.status === "fulfilled") {
      const rows = Array.isArray(actos.value) ? actos.value : (actos.value?.data ?? []);
      setActividades(
        rows.map((a: ActividadAsignable) => ({ id: a.id, anNumber: a.anNumber, titulo: a.titulo })),
      );
    } else {
      setActividades([]);
      fallos.push(formatApiError(actos.reason, "no se pudo cargar la lista de actividades"));
    }
    setAssignCatalogErr(fallos.length > 0 ? fallos.join(" · ") : null);
    setAssignCatalogLoading(false);
  }, [token]);

  const visibleItems = useMemo(
    () => filterRowsByScope(items, user, cfg.defaultScope),
    [items, user, cfg.defaultScope],
  );

  /**
   * Lo que cae en la pestaña abierta antes de buscar. Separado de `filtered`
   * porque la regla 7 distingue «aquí todavía no hay nada» de «los filtros no
   * dejaron pasar ninguno», y son dos pantallas distintas.
   */
  const tabRows = useMemo(() => {
    if (tab === "analytics") return [];
    return tab === "contabilidad"
      ? visibleItems.filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado")
      : visibleItems;
  }, [visibleItems, tab]);

  const hasFilters = Boolean(filter.trim() || filterEstatus);

  /** La búsqueda de texto, separada para que los contadores de estatus cuenten lo mismo que la lista. */
  const coincide = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    if (!q) return () => true;
    return (v: Viatico) =>
      (v.concepto ?? "").toLowerCase().includes(q) ||
      (v.usuario?.nombre ?? "").toLowerCase().includes(q) ||
      (actividadFolio(v.actividad) ?? "").toLowerCase().includes(q) ||
      (v.actividad?.titulo ?? "").toLowerCase().includes(q) ||
      (v.project?.name ?? "").toLowerCase().includes(q) ||
      (v.categoria ?? "").toLowerCase().includes(q) ||
      categoriaLabel(v.categoria).toLowerCase().includes(q) ||
      estatusLabel(v.estatus).toLowerCase().includes(q) ||
      (v.contabilidadRef ?? "").toLowerCase().includes(q);
  }, [deferredFilter]);

  const filtered = useMemo(() => {
    if (tab === "analytics") return [];
    let rows = tabRows;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    if (filterEstatus) rows = rows.filter((v) => v.estatus === filterEstatus);
    return rows.filter(coincide);
  }, [tabRows, coincide, filterEstatus, highlightId, tab]);

  /** Cuántos hay de cada estatus entre lo que dejó pasar la búsqueda, para los chips. */
  const conteoEstatus = useMemo(() => {
    const porTexto = tabRows.filter(coincide);
    const conteo: Record<string, number> = { "": porTexto.length };
    for (const v of porTexto) {
      const clave = v.estatus ?? "";
      conteo[clave] = (conteo[clave] ?? 0) + 1;
    }
    return conteo;
  }, [tabRows, coincide]);

  /**
   * Regla 1: lo que la persona viene a saber — cuánto espera autorización,
   * cuánto está autorizado sin pagar, cuánto ya se liquidó y qué bloquea el
   * cierre por falta de comprobante.
   */
  const metrics = useMemo(() => {
    const sum = (rows: Viatico[]) => rows.reduce((acc, v) => acc + (Number(v.montoSolicitado) || 0), 0);
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
        icon: <PendingActionsOutlinedIcon />,
        value: <Money value={sum(porAutorizar)} />,
        hint: plural(porAutorizar.length, "solicitud esperando", "solicitudes esperando"),
        tone: porAutorizar.length > 0 ? ("warning" as const) : ("default" as const),
      },
      {
        label: "Autorizado sin pagar",
        icon: <RequestQuoteOutlinedIcon />,
        value: <Money value={sum(autorizados)} />,
        hint: plural(autorizados.length, "solicitud lista para pago", "solicitudes listas para pago"),
        tone: "default" as const,
      },
      {
        label: "Pagado",
        icon: <PaymentsOutlinedIcon />,
        value: <Money value={sum(pagados)} />,
        hint: plural(pagados.length, "solicitud liquidada", "solicitudes liquidadas"),
        tone: "default" as const,
      },
      {
        label: "Sin comprobante",
        icon: <ReceiptLongOutlinedIcon />,
        value: sinComprobante.length,
        hint: sinComprobante.length > 0 ? "bloquean el cierre" : "todo comprobado",
        tone: sinComprobante.length > 0 ? ("danger" as const) : ("default" as const),
      },
    ];
  }, [visibleItems]);

  /**
   * El resumen en vivo de la asignación — y la única defensa contra el error
   * que de verdad cuesta dinero: capturar el TOTAL del lote creyendo que el
   * campo es por cabeza. Aquí se ve multiplicado antes de confirmar.
   *
   * La cuenta va en centavos enteros porque `800.10 * 3` en coma flotante da
   * 2400.2999999999997, y un total que no cuadra con el del servidor siembra
   * la duda de cuál de los dos miente.
   */
  const resumenAsignacion = useMemo(() => {
    const personasElegidas = assignForm.usuarioIds.length;
    const porPersonaCent = centavos(assignForm.montoPorPersona);
    const totalCent = porPersonaCent * personasElegidas;
    const cuantasActividades = assignForm.actividadIds.length;

    // Lo que impide confirmar, dicho como una lista de cosas por hacer y no
    // como un «formulario inválido»: son las tres reglas del servidor.
    const faltan: string[] = [];
    if (personasElegidas === 0) faltan.push("elige al menos un beneficiario");
    if (porPersonaCent <= 0) faltan.push("captura el monto por persona");
    if (cuantasActividades === 0 && !assignForm.projectId) {
      faltan.push("liga el viático a una actividad o a un proyecto");
    }

    const cobertura =
      cuantasActividades > 1
        ? `, repartido entre ${cuantasActividades} actividades`
        : cuantasActividades === 1
          ? ", sobre 1 actividad"
          : "";

    return {
      personas: personasElegidas,
      porPersonaCent,
      totalCent,
      actividades: cuantasActividades,
      cobertura,
      faltan,
      listo: faltan.length === 0,
      frase: `${plural(personasElegidas, "persona", "personas")} × ${dinero(porPersonaCent)} = ${dinero(totalCent)}${cobertura}`,
    };
  }, [assignForm]);

  const openAssign = () => {
    setAssignForm({ ...emptyAssignForm });
    setSaveErr(null);
    setMode("assign");
    void cargarCatalogosAsignacion();
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormErrors({});
    setSaveErr(null);
    setEvidenceFile(null);
    setPartes([]);
    setMode("create");
  };
  const openApprove = (v: Viatico) => {
    setSelected(v);
    setApproveForm({
      estatus: "Aprobado",
      comentariosAdmin: "",
      montoAprobado: "",
      montoComprobado:
        v.montoComprobado != null ? String(Number(v.montoComprobado).toFixed(2)) : "",
    });
    setSaveErr(null);
    setMode("approve");
  };
  const openEdit = (v: Viatico) => {
    setSelected(v);
    setEvidenceFile(null);
    setFormErrors({});
    setSaveErr(null);
    setForm({
      concepto: v.concepto ?? v.motivo ?? "",
      montoSolicitado: Number(v.montoSolicitado) || 0,
      comprobante: v.comprobante ?? v.ticketEvidenciaUrl ?? "",
      categoria: v.categoria || "OTROS",
      projectId: v.projectId ? String(v.projectId) : "",
      actividadId: v.actividad?.id ? String(v.actividad.id) : "",
      vehicleId: v.vehicleId ? String(v.vehicleId) : "",
    });
    setPartes(
      (v.repartos ?? []).map((p) => ({
        actividadId: String(p.actividadId),
        monto: Number(p.monto).toFixed(2),
        nota: p.nota ?? "",
      })),
    );
    setMode("edit");
  };

  const closeModal = () => {
    setMode(null);
    setSaveErr(null);
    setFormErrors({});
  };

  /**
   * El reparto tiene que sumar el total exacto. Se comprueba aquí para poder
   * contestar bajo el campo; el servidor lo vuelve a comprobar porque esto es
   * una ayuda, no la regla.
   */
  const revisarReparto = (total: number) => revisarCuadreReparto(partes, total);

  const partesParaApi = (): ViaticoParte[] =>
    partes.map((p) => ({
      actividadId: Number(p.actividadId),
      monto: Number(p.monto),
      nota: p.nota.trim() || null,
    }));

  /** Comprobación de tickets contra el anticipo ya entregado. */
  const runComprobar = async () => {
    if (saving) return;
    if (!token || !selected) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    const monto = parseFloat(approveForm.montoComprobado);
    if (!Number.isFinite(monto) || monto < 0) {
      setSaveErr("Captura cuánto se comprobó con tickets. Si no se gastó nada, captura 0.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      await comprobarViatico(token, selected.id, {
        montoComprobado: monto,
        nota: approveForm.comentariosAdmin || undefined,
      });
      void load();
      setMode(null);
      toast.success("Comprobación registrada");
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo registrar la comprobación"));
    } finally {
      setSaving(false);
    }
  };

  const runApprove = async (action: "approve" | "reject" | "pagado") => {
    if (saving) return;
    if (!token || !selected) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      if (action === "pagado") await markViaticoPagado(token, selected.id);
      else
        await approveViatico(
          token,
          selected.id,
          action,
          approveForm.comentariosAdmin || undefined,
          action === "approve" && approveForm.montoAprobado.trim()
            ? Number(approveForm.montoAprobado)
            : undefined,
        );
      void load();
      setMode(null);
      toast.success(action === "reject" ? "Viático rechazado" : action === "pagado" ? "Marcado como pagado" : "Viático aprobado");
    } catch (e) {
      // El aviso se queda en el formulario: un toast se va y la persona no sabe
      // si el viático quedó aprobado o no.
      setSaveErr(formatApiError(e, "No se pudo registrar la resolución"));
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (saving) return;
    if (!token || !selected) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    // Regla 5: la validación se contesta bajo el campo, no en un aviso suelto.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Describe el gasto del viaje.";
    if (!form.montoSolicitado || form.montoSolicitado <= 0) {
      errors.monto = "Captura el monto; tiene que ser mayor que cero.";
    }
    if (!form.projectId && !form.actividadId) {
      errors.enlace = "Liga la solicitud a un proyecto o a una actividad.";
    }
    const reparto = revisarReparto(form.montoSolicitado);
    if (reparto) errors.reparto = reparto;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveErr(null);
      return;
    }

    setSaving(true);
    setSaveErr(null);
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
          // Se manda siempre: una lista vacía deshace un reparto anterior.
          partes: partesParaApi(),
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
      // El reparto no viene en la respuesta del PATCH: se recarga para que la
      // lista enseñe las partes que de verdad quedaron guardadas.
      void load();
      setMode(null);
      setEvidenceFile(null);
      toast.success("Viático actualizado");
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar el viático"));
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    if (saving) return;
    if (!token || !user?.id) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    // Regla 5: mismos requisitos de siempre, dichos bajo el campo que falta.
    const errors: FormErrors = {};
    if (!form.concepto.trim()) errors.concepto = "Describe el gasto del viaje.";
    if (!form.montoSolicitado || form.montoSolicitado <= 0) {
      errors.monto = "Captura el monto; tiene que ser mayor que cero.";
    }
    if (!form.projectId && !form.actividadId) {
      errors.enlace = "Liga la solicitud a un proyecto o a una actividad.";
    }
    if (!evidenceFile && !form.comprobante.trim()) {
      errors.comprobante = "Adjunta el comprobante: un archivo o una liga.";
    }
    const repartoCreate = revisarReparto(form.montoSolicitado);
    if (repartoCreate) errors.reparto = repartoCreate;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveErr(null);
      return;
    }

    setSaving(true);
    setSaveErr(null);
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
          partes: partes.length > 0 ? partesParaApi() : undefined,
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
      setSaveErr(formatApiError(e, "No se pudo enviar la solicitud"));
    } finally { setSaving(false); }
  };

  /**
   * Manda el lote. Las tres reglas duras —al menos un beneficiario, monto
   * mayor que cero y vínculo a actividad o proyecto— las vuelve a aplicar el
   * servidor; aquí solo se adelantan para no gastar un viaje de red. Lo que
   * NO se duplica es el reparto entre actividades ni la comprobación de que
   * la gente esté activa: eso lo sabe el servidor y su mensaje se enseña tal
   * cual, con nombres, en vez de un «revisa los datos».
   */
  const submitAssign = async () => {
    if (saving) return;
    if (!token) {
      setSaveErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión e inténtalo otra vez.");
      return;
    }
    // El botón ya sale deshabilitado sin esto, pero un Enter dentro de un campo
    // no pasa por el botón: sin esta guarda llegaría un lote vacío a la API.
    if (!resumenAsignacion.listo) {
      setSaveErr(`Antes de asignar: ${resumenAsignacion.faltan.join("; ")}.`);
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await assignViaticoLote(token, {
        usuarioIds: assignForm.usuarioIds,
        actividadIds: assignForm.actividadIds.length > 0 ? assignForm.actividadIds : undefined,
        projectId: assignForm.projectId ? Number(assignForm.projectId) : null,
        vehicleId: assignForm.vehicleId ? Number(assignForm.vehicleId) : null,
        categoria: assignForm.categoria,
        montoPorPersona: Number(assignForm.montoPorPersona),
        motivo: assignForm.motivo.trim() || undefined,
        desde: assignForm.desde || undefined,
        hasta: assignForm.hasta || undefined,
      });
      // Las cifras del aviso son las del servidor, no las de la pantalla: si
      // alguna vez no coincidieran, la que vale es la que quedó guardada.
      const creados = res?.creados ?? assignForm.usuarioIds.length;
      const totalCent = res ? centavos(res.montoTotal) : resumenAsignacion.totalCent;
      void load();
      setMode(null);
      toast.success(
        `${plural(creados, "viático asignado", "viáticos asignados")} · ${dinero(totalCent)} en total`,
      );
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudieron asignar los viáticos"));
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (pdfBusy) return;
    if (!token) {
      setActionError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión.");
      return;
    }
    setPdfBusy(true);
    try {
      await downloadViaticsReportPdf(token, {
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      toast.success("PDF generado");
    } catch (e) {
      setActionError(formatApiError(e, "No se pudo generar el PDF"));
    } finally {
      setPdfBusy(false);
    }
  };

  const markPagadoRow = (v: Viatico) => {
    if (rowBusyId != null) return;
    const nombre = `${folioViatico(v.id)} · ${v.concepto ?? "viático"}`;
    setConfirmState({
      message: `¿Marcar como pagado ${nombre}? Se registra la salida de dinero.`,
      confirmLabel: "Marcar pagado",
      danger: false,
      fn: async () => {
        setRowBusyId(v.id);
        setActionError(null);
        try {
          await markViaticoPagado(token, v.id);
          void load();
          toast.success("Marcado como pagado");
        } catch (err) {
          setActionError(
            `No se pudo marcar pagado ${nombre}: ${formatApiError(err, "el servidor no respondió")}`,
          );
        } finally {
          setRowBusyId(null);
        }
      },
    });
  };

  const softDelete = (v: Viatico) => {
    if (rowBusyId != null) return;
    const nombre = `${folioViatico(v.id)} · ${v.concepto ?? v.motivo ?? "viático"}`;
    setConfirmState({
      message: `¿Cancelar ${nombre}? Queda como rechazado.`,
      confirmLabel: "Cancelar viático",
      fn: async () => {
        setRowBusyId(v.id);
        setActionError(null);
        try {
          await apiFetch(`viatics/${v.id}`, token, { method: "PATCH", body: JSON.stringify({ estatus: "Rechazado" }) });
          setItems((prev) => prev.map((i) => (i.id === v.id ? { ...i, estatus: "Rechazado" } : i)));
          // Antes el éxito era mudo: la fila cambiaba y nadie decía que se hizo.
          toast.success("Viático cancelado");
        } catch (e) {
          setActionError(
            `No se pudo cancelar ${nombre}: ${formatApiError(e, "el servidor no respondió")}`,
          );
        } finally {
          setRowBusyId(null);
        }
      },
    });
  };

  const exportExcel = () =>
    exportToExcel(
      filtered,
      [
        { key: "id", label: "ID" },
        { key: "concepto", label: "Concepto" },
        { key: "usuario", label: "Solicitante", format: (v) => (v as Viatico["usuario"])?.nombre ?? "—" },
        { key: "categoria", label: "Categoría", format: (v) => categoriaLabel(v as string | undefined) },
        { key: "montoSolicitado", label: "Monto" },
        { key: "estatus", label: "Estatus", format: (v) => estatusLabel(v as string | undefined) },
        { key: "contabilidadRef", label: "Ref. contable" },
        { key: "fechaSolicitud", label: "Fecha", format: (v) => (v ? String(v).slice(0, 10) : "") },
      ],
      "viaticos",
      { title: "Control de viáticos" },
    );

  /**
   * Las acciones de un renglón. En escritorio son su propia columna; en móvil
   * bajan bajo el concepto (como ya hacen el estado y la fecha), porque una
   * columna más empujaba la tabla más allá del ancho de la pantalla.
   */
  const accionesDe = (v: Viatico, enCelda = false) => {
    const nombre = `${folioViatico(v.id)} · ${v.concepto ?? "viático"}`;
    const busy = rowBusyId === v.id;
    return (
      <div className={enCelda ? `${s.acciones} ${s.accionesEnCelda}` : s.acciones}>
        {v.estatus === "Pendiente" && (cfg.canCreate || v.usuario?.id === user?.id) && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Editar ${nombre}`}
            onClick={(e) => { e.stopPropagation(); openEdit(v); }}
          >
            Editar
          </Button>
        )}
        {cfg.canApprove && v.estatus === "Pendiente" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Autorizar ${nombre}`}
              onClick={(e) => { e.stopPropagation(); openApprove(v); }}
            >
              Autorizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Rechazar ${nombre}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(v);
                setApproveForm({
                  estatus: "Rechazado",
                  comentariosAdmin: "",
                  montoAprobado: "",
                  montoComprobado: "",
                });
                setSaveErr(null);
                setMode("approve");
              }}
            >
              Rechazar
            </Button>
          </>
        )}
        {cfg.canApprove && v.estatus === "Aprobado" && (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Marcar como pagado ${nombre}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); markPagadoRow(v); }}
          >
            {busy ? "Pagando…" : "Marcar pagado"}
          </Button>
        )}
        {cfg.canDelete && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Cancelar ${nombre}`}
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); softDelete(v); }}
          >
            Cancelar
          </Button>
        )}
      </div>
    );
  };

  const columns: Column<Viatico>[] = [
    {
      key: "concepto",
      label: "Concepto",
      render: (v) => {
        const href = assetUrl(v.comprobante ?? v.ticketEvidenciaUrl);
        const trail = readTrail(v.approvalTrail);
        const last = trail[trail.length - 1];
        const meta: string[] = [folioViatico(v.id)];
        if (canViewAll && v.usuario?.nombre) meta.push(v.usuario.nombre);
        if (v.categoria) meta.push(categoriaLabel(v.categoria));
        // Folio real de la actividad (`anNumber`) y nombre del proyecto: los
        // devuelve la API y hasta ahora no se veían.
        const folioAct = actividadFolio(v.actividad);
        if (folioAct) meta.push(v.actividad?.titulo ? `${folioAct} · ${v.actividad.titulo}` : folioAct);
        if (v.project?.name) meta.push(v.project.name);
        if (v.vehicle?.nombre) {
          meta.push(v.vehicle.placas ? `${v.vehicle.nombre} (${v.vehicle.placas})` : v.vehicle.nombre);
        }
        if (v.origen === "ASIGNACION") {
          meta.push(v.asignadoPor?.nombre ? `Asignado por ${v.asignadoPor.nombre}` : "Asignado");
        }
        if (narrow) meta.push(formatFecha(v.fechaSolicitud));
        if (v.contabilidadRef) meta.push(`Ref. ${v.contabilidadRef}`);
        // Quién resolvió y cuándo: venía en `approvalTrail` y no se mostraba.
        if (last) {
          meta.push(
            `${trailActionLabel(last.action)} ${last.userName ?? "—"} · ${formatFecha(last.at)}`,
          );
        }
        return (
          <div className={s.celdaConcepto}>
            <div className={s.concepto}>{v.concepto ?? "—"}</div>
            <div className={s.meta}>
              {/* En móvil el estado deja de ser columna y baja aquí: antes
                  empujaba la tabla más allá del ancho de la pantalla. */}
              {narrow ? (
                <Badge dot size="sm" tone={estatusTone(v.estatus)}>
                  {estatusLabel(v.estatus)}
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
                    aria-label={`Ver comprobante de ${folioViatico(v.id)}`}
                    className={s.enlace}
                  >
                    Ver comprobante
                  </a>
                </span>
              ) : (
                <span className={s.metaAviso}>· Sin comprobante</span>
              )}
            </div>
            {narrow ? accionesDe(v, true) : null}
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
      width: narrow ? undefined : 120,
    },
    ...(narrow
      ? []
      : ([
          {
            key: "fechaSolicitud",
            label: "Fecha",
            render: (v: Viatico) => <span className={s.fechaCelda}>{formatFecha(v.fechaSolicitud)}</span>,
            width: 110,
          },
        ] as Column<Viatico>[])),
    ...(narrow
      ? []
      : ([
          {
            key: "estatus",
            label: "Estado",
            render: (v: Viatico) => (
              <Badge dot size="sm" tone={estatusTone(v.estatus)}>
                {estatusLabel(v.estatus)}
              </Badge>
            ),
            width: 150,
          },
        ] as Column<Viatico>[])),
    ...(narrow
      ? []
      : ([
          {
            key: "acciones",
            label: "",
            align: "right",
            render: (v: Viatico) => accionesDe(v),
            width: 310,
          },
        ] as Column<Viatico>[])),
  ];

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);
  const validationSummary =
    invalidFields.length > 0 ? (
      <div className={s.completo}>
        <Alert tone="warning" role="alert">
          {`Falta por capturar: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
        </Alert>
      </div>
    ) : null;

  const selectedTrail = readTrail(selected?.approvalTrail);

  /**
   * Regla 7: cuatro celdas en `$0` encima de un «Sin viáticos» no informan de
   * nada y le quitan el sitio a lo único que ayuda ahí —de dónde sale el
   * primer viático y el botón que lo pide—. La condición es el conteo de
   * filas, no que el importe sea cero.
   */
  const showMetrics = tab !== "analytics" && visibleItems.length > 0;
  /** Sin un solo viático en la pestaña y sin filtros no hay nada que buscar. */
  const showToolbar = tabRows.length > 0 || hasFilters;
  /** La primera carga sí tapa la pantalla; un refresco posterior, no. */
  const firstLoad = loading && items.length === 0;

  const clearFilters = () => {
    setFilter("");
    setFilterEstatus("");
  };

  /**
   * Regla 4: un solo primario por pantalla, y es la acción a la que se vino.
   *
   * Quien puede asignar vino a asignar —el CEO ni siquiera solicita viáticos,
   * lo dice su propio subtítulo—, así que ese es el primario y «Solicitar»
   * baja a gris en vez de competir con él. Quien no puede asignar sigue viendo
   * «Solicitar» como primario, igual que antes.
   */
  const assignAction = cfg.canAssign ? (
    <Button variant="primary" iconStart={<GroupAddOutlinedIcon />} onClick={openAssign}>
      Asignar viático
    </Button>
  ) : null;

  const primaryAction = cfg.canCreate ? (
    <Button
      variant={cfg.canAssign ? "secondary" : "primary"}
      iconStart={<AddRoundedIcon />}
      onClick={openCreate}
    >
      Solicitar viático
    </Button>
  ) : null;

  const refreshAction = (
    <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
      {loading ? "Actualizando…" : "Actualizar"}
    </Button>
  );

  /* ── Avisos y cifras: bajo la cabeza, en este orden ─────────────────────── */

  const hayAvisos =
    tab === "analytics"
      ? Boolean(analyticsError)
      : Boolean(actionError || catalogErr || (truncated && !error) || error);

  const avisos =
    tab === "analytics" ? (
      analyticsError ? (
        <Alert
          tone="danger"
          role="alert"
          onDismiss={() => setAnalyticsError(null)}
          action={<LinkButton onClick={() => void loadAnalytics()}>Reintentar</LinkButton>}
        >
          {analyticsError}
        </Alert>
      ) : null
    ) : (
      <>
        {actionError && (
          <Alert
            tone="danger"
            role="alert"
            onDismiss={() => setActionError(null)}
            action={<LinkButton onClick={() => void load()}>Recargar</LinkButton>}
          >
            {actionError}
          </Alert>
        )}
        {catalogErr && (
          <Alert tone="warning" role="alert" onDismiss={() => setCatalogErr(null)}>
            {`${catalogErr}. El desplegable de proyectos saldrá vacío; puedes ligar la solicitud con el ID de actividad.`}
          </Alert>
        )}
        {truncated && !error && (
          <Alert tone="warning" role="alert">
            {`La API devuelve como máximo ${API_LIST_CAP} solicitudes por consulta y llegaron ${API_LIST_CAP}: puede haber más sin mostrar, y los totales de arriba solo cubren lo que ves. Usa Analytics con un rango de fechas para cifras del periodo completo.`}
          </Alert>
        )}
        {error && (
          <Alert
            tone="danger"
            role="alert"
            action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}
          >
            {error}
          </Alert>
        )}
      </>
    );

  const analisisConDatos = !analyticsLoading && analytics !== null && analytics.totals.count > 0;

  const cifras =
    tab === "analytics" ? (
      analisisConDatos && analytics ? (
        <StatRow variant="strip" ariaLabel="Resumen del periodo">
          <Stat
            label="Registros"
            value={analytics.totals.count}
            hint="en el periodo"
            icon={<ReceiptLongOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Por autorizar"
            value={analytics.totals.pendientes}
            hint={plural(analytics.totals.pendientes, "solicitud esperando", "solicitudes esperando")}
            tone={analytics.totals.pendientes > 0 ? "warning" : "default"}
            icon={<PendingActionsOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Solicitado"
            value={<Money value={analytics.totals.totalSolicitado} />}
            hint="pedido en el periodo"
            icon={<RequestQuoteOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Autorizado"
            value={<Money value={analytics.totals.totalAprobado} />}
            hint="sin pagar aún"
            icon={<CheckCircleOutlineRoundedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Pagado"
            value={<Money value={analytics.totals.totalPagado} />}
            hint="liquidado en el periodo"
            icon={<PaymentsOutlinedIcon />}
            iconTone="neutral"
          />
        </StatRow>
      ) : null
    ) : showMetrics ? (
      <StatRow variant="strip" ariaLabel="Resumen de viáticos">
        {metrics.map((m) => (
          <Stat key={m.label} iconTone="neutral" {...m} />
        ))}
      </StatRow>
    ) : null;

  /* ── Tarjeta de lista ─────────────────────────────────────────────────────── */

  const hayFechas = Boolean(dateFrom || dateTo);

  const barraAnalisis = (
    <ModuleToolbar
      end={
        <>
          <Button size="sm" onClick={() => void loadAnalytics()} disabled={analyticsLoading}>
            {analyticsLoading ? "Calculando…" : "Aplicar"}
          </Button>
          <ListExportActions onPdf={() => void downloadPdf()} pdfBusy={pdfBusy} />
        </>
      }
    >
      <label className={s.fecha}>
        <span>Desde</span>
        <DateInput
          controlSize="sm"
          className={s.fechaInput}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Desde"
        />
      </label>
      <label className={s.fecha}>
        <span>Hasta</span>
        <DateInput
          controlSize="sm"
          className={s.fechaInput}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Hasta"
        />
      </label>
      {hayFechas ? (
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
  );

  /** Regla 7 en el periodo: si no hubo ni un viático, la tira de ceros no dice nada; la frase sí. */
  const analisisVacio: ModuleEmpty | null = analyticsLoading
    ? { icon: <HourglassEmptyRoundedIcon />, title: "Calculando el resumen del periodo…", tone: "neutral" }
    : !analytics && !analyticsError
      ? {
          icon: <InsightsOutlinedIcon />,
          title: "Pulsa «Aplicar» para calcular el resumen. Sin fechas cubre todo el histórico.",
          tone: "neutral",
        }
      : analytics && analytics.totals.count === 0
        ? {
            icon: <InsightsOutlinedIcon />,
            title: "En el periodo elegido no hay ningún viático registrado.",
            tone: "neutral",
          }
        : null;

  const barraLista = showToolbar ? (
    <ModuleToolbar
      search={
        <SearchInput
          aria-label="Buscar por concepto, solicitante, folio o ref…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por concepto, solicitante, folio o ref…"
        />
      }
      chips={
        <FilterChips ariaLabel="Estatus">
          <FilterChip active={filterEstatus === ""} count={conteoEstatus[""]} onClick={() => setFilterEstatus("")}>
            Todos
          </FilterChip>
          {(tab === "contabilidad" ? ESTATUS_CONTABILIDAD : ESTATUS).map((e) => (
            <FilterChip
              key={e}
              active={filterEstatus === e}
              count={conteoEstatus[e] ?? 0}
              dot={estatusTone(e)}
              onClick={() => setFilterEstatus(filterEstatus === e ? "" : e)}
            >
              {estatusLabel(e)}
            </FilterChip>
          ))}
        </FilterChips>
      }
      end={
        <>
          {firstLoad ? null : (
            <span className={s.conteo} role="status">
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
            </span>
          )}
          {refreshAction}
          <ListExportActions
            onExcel={exportExcel}
            excelDisabled={filtered.length === 0}
            onPdf={() => void downloadPdf()}
            pdfBusy={pdfBusy}
          />
        </>
      }
    >
      {hasFilters ? <LinkButton onClick={clearFilters}>Limpiar</LinkButton> : null}
    </ModuleToolbar>
  ) : undefined;

  /** Sin lista que mostrar: la primera carga o un fallo sin nada previo en pantalla. */
  const listaVisible = !firstLoad && !(error && items.length === 0);
  const listaVacia = listaVisible && filtered.length === 0;

  const vacioLista: ModuleEmpty = hasFilters
    ? {
        icon: <FilterAltOffOutlinedIcon />,
        title: "Ningún viático coincide",
        description: "Ninguna solicitud coincide con los filtros aplicados.",
        action: <Button onClick={clearFilters}>Limpiar filtros</Button>,
        tone: "neutral",
      }
    : {
        icon: <RequestQuoteOutlinedIcon />,
        title: tab === "contabilidad" ? "Todavía no hay viáticos autorizados" : "Todavía no hay viáticos",
        description:
          tab === "contabilidad"
            ? "Un viático llega aquí cuando alguien lo autoriza. Los que siguen esperando resolución están en «Todos»."
            : cfg.canCreate
              ? "Un viático es el dinero de un viaje de trabajo —gasolina, casetas, hospedaje o alimentos— ligado a una actividad o a un proyecto. Pide el primero y queda aquí para autorizar."
              : "Un viático es el dinero de un viaje de trabajo —gasolina, casetas, hospedaje o alimentos—. Los pide el equipo desde su panel y aquí llegan para que los autorices.",
        // Sin filas la barra de filtros no se pinta, así que «Actualizar» vive aquí;
        // pedir o asignar el primer viático está en la cabeza de la pantalla.
        action: tab === "contabilidad" ? <Button onClick={() => setTab("todos")}>Ver todos</Button> : undefined,
        secondaryAction: refreshAction,
      };

  return (
    <FinanceModuleShell
      variant="flat"
      eyebrow="Finanzas"
      title={cfg.title}
      subtitle={cfg.subtitle}
      actions={
        primaryAction || assignAction ? (
          <>
            {primaryAction}
            {assignAction}
          </>
        ) : undefined
      }
      kpis={
        hayAvisos || cifras ? (
          <div className={s.cabecera}>
            {hayAvisos ? avisos : null}
            {cifras}
          </div>
        ) : undefined
      }
      tabs={[
        { id: "contabilidad", label: "Contabilidad" },
        { id: "todos", label: "Todos" },
        { id: "analytics", label: "Análisis" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === "analytics" ? (
        <ListCard
          listLabel="Análisis de viáticos"
          toolbar={barraAnalisis}
          empty={Boolean(analisisVacio)}
          emptyState={analisisVacio ?? undefined}
        >
          {analisisConDatos && analytics ? (
            <div className={s.desgloses}>
              <BreakdownTable title="Por proyecto" rows={analytics.byProject} />
              <BreakdownTable title="Por persona" rows={analytics.byPerson} />
              <BreakdownTable title="Por categoría" rows={analytics.byCategory} />
            </div>
          ) : null}
        </ListCard>
      ) : (
        <ListCard
          listLabel="Lista de viáticos"
          toolbar={barraLista}
          empty={listaVacia}
          emptyState={vacioLista}
        >
          {firstLoad ? (
            <div className={s.cargando} role="status" aria-live="polite">
              <p className={s.cargandoTexto}>Cargando viáticos…</p>
              <SkeletonRows rows={4} label="Cargando viáticos" />
            </div>
          ) : listaVisible ? (
            <DataTable
              flush
              columns={columns}
              rows={filtered}
              rowKey={(v) => v.id}
              ariaLabel="Solicitudes de viáticos"
              loading={loading && !firstLoad}
            />
          ) : null}
        </ListCard>
      )}

      {/* ── Asignar viático a varias personas de una sola captura ───────────
          Lo que el CEO llevaba tiempo pidiendo: la cuadrilla que sale el lunes
          recibe gasolina y casetas de golpe, en vez de repetir el mismo
          formulario cuatro veces —y cada repetición es una ocasión de teclear
          mal el monto—. */}
      <Modal
        open={mode === "assign"}
        onClose={closeModal}
        title="Asignar viático"
        maxWidth={640}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitAssign()}
              disabled={saving || !resumenAsignacion.listo}
              loading={saving}
            >
              {/* La cifra va en el botón: es la última oportunidad de ver que
                  se está repartiendo el triple de lo que se creía. */}
              {saving
                ? "Asignando…"
                : resumenAsignacion.listo
                  ? `Confirmar ${dinero(resumenAsignacion.totalCent)}`
                  : "Confirmar asignación"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          {assignCatalogErr && (
            <div className={s.completo}>
              <Alert tone="warning" role="alert" onDismiss={() => setAssignCatalogErr(null)}>
                {`${assignCatalogErr}. Puedes seguir con lo que sí cargó.`}
              </Alert>
            </div>
          )}
          <Field
            label="Beneficiarios"
            fullWidth
            hint={
              assignCatalogLoading
                ? "Cargando el equipo…"
                : "Cada persona elegida recibe su propio viático por el monto de abajo."
            }
          >
            <SelectorMultiple
              opciones={personas}
              elegidos={assignForm.usuarioIds}
              onChange={(ids) => setAssignForm((f) => ({ ...f, usuarioIds: ids }))}
              textoDe={(p) => p.nombre}
              detalleDe={(p) => p.puesto || p.email || null}
              placeholder="Buscar por nombre, puesto o correo…"
              etiqueta="beneficiarios"
              vacio="No hay personas a las que puedas asignarles un viático."
              disabled={saving}
            />
          </Field>
          <Field
            label="Actividades que cubre"
            fullWidth
            optional
            hint="Con varias, el costo de cada persona se reparte entre ellas en partes iguales. Lo calcula el servidor: aquí no hay que capturar cuánto va a cada una."
          >
            <SelectorMultiple
              opciones={actividades}
              elegidos={assignForm.actividadIds}
              onChange={(ids) => setAssignForm((f) => ({ ...f, actividadIds: ids }))}
              textoDe={(a) => a.anNumber || `Act-${a.id}`}
              detalleDe={(a) => a.titulo || null}
              placeholder="Buscar por folio o título…"
              etiqueta="actividades"
              vacio="No hay actividades a la vista para ligar el viático."
              disabled={saving}
            />
          </Field>
          <Field
            label="Proyecto"
            hint="Hace falta al menos una actividad o un proyecto; puedes poner los dos."
          >
            <Select
              value={assignForm.projectId}
              onChange={(e) => setAssignForm((f) => ({ ...f, projectId: e.target.value }))}
              disabled={saving}
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vehículo" optional hint="Solo si el gasto es de combustible o casetas.">
            <Select
              value={assignForm.vehicleId}
              onChange={(e) => setAssignForm((f) => ({ ...f, vehicleId: e.target.value }))}
              disabled={saving}
            >
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}{v.placas ? ` · ${v.placas}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría" hint="Determina en qué rubro suma el reporte.">
            <Select
              value={assignForm.categoria}
              onChange={(e) => setAssignForm((f) => ({ ...f, categoria: e.target.value }))}
              disabled={saving}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{categoriaLabel(c)}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Monto por persona"
            hint="Lo que recibe CADA beneficiario, no el total del lote. Pesos, con IVA incluido."
          >
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={assignForm.montoPorPersona}
              onChange={(e) => setAssignForm((f) => ({ ...f, montoPorPersona: e.target.value }))}
              placeholder="0.00"
              disabled={saving}
              className={s.monto}
            />
          </Field>
          <Field
            label="Periodo que cubre"
            fullWidth
            optional
            hint="Se añade al motivo: un viático semanal sin decir de qué semana es imposible de conciliar tres meses después."
          >
            <div className={s.periodoFechas}>
              <DateInput
                aria-label="Desde"
                value={assignForm.desde}
                onChange={(e) => setAssignForm((f) => ({ ...f, desde: e.target.value }))}
                disabled={saving}
                className={s.fechaCampo}
              />
              <DateInput
                aria-label="Hasta"
                value={assignForm.hasta}
                onChange={(e) => setAssignForm((f) => ({ ...f, hasta: e.target.value }))}
                disabled={saving}
                className={s.fechaCampo}
              />
              {/* El atajo del caso real: la cuadrilla sale el lunes y el viático
                  cubre hasta el domingo. Teclear dos fechas para eso cada
                  semana es trabajo que la pantalla puede hacer sola. */}
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => setAssignForm((f) => ({ ...f, ...semanaEnCurso() }))}
              >
                Esta semana
              </Button>
            </div>
          </Field>
          <Field
            label="Motivo"
            fullWidth
            optional
            hint="Lo que leerá quien lo recibe y quien lo autoriza. El periodo y el número de actividades se añaden solos."
          >
            <Textarea
              value={assignForm.motivo}
              onChange={(e) => setAssignForm((f) => ({ ...f, motivo: e.target.value }))}
              rows={2}
              disabled={saving}
              placeholder="Ej. Gasolina y casetas de la ruta Puebla–Tehuacán"
            />
          </Field>
          {/* El resumen que evita el error caro. Sin caja propia (regla 9):
              una línea sobre el pie del modal basta para separarlo. */}
          <div className={`${s.completo} ${s.resumen}`}>
            <span className={s.etiqueta}>Lo que se va a crear</span>
            <p className={s.frase} role="status" aria-live="polite">
              {plural(resumenAsignacion.personas, "persona", "personas")} ×{" "}
              {dinero(resumenAsignacion.porPersonaCent)} ={" "}
              <strong>{dinero(resumenAsignacion.totalCent)}</strong>
              {resumenAsignacion.cobertura}
            </p>
            <div className={s.nota}>
              {resumenAsignacion.listo ? (
                <Alert dense icon={null} tone="neutral">
                  El lote es todo o nada: si alguien está inactivo o una actividad no es de tu empresa, no se crea ninguno y el aviso dirá cuál.
                </Alert>
              ) : (
                <Alert dense icon={null} tone="warning">
                  {`Para poder asignar: ${resumenAsignacion.faltan.join("; ")}.`}
                </Alert>
              )}
            </div>
          </div>
          {saveErr && (
            <div className={s.completo}>
              <Alert
                tone="danger"
                role="alert"
                action={
                  <LinkButton
                    onClick={() => void submitAssign()}
                    disabled={saving || !resumenAsignacion.listo}
                  >
                    Reintentar
                  </LinkButton>
                }
              >
                {saveErr}
              </Alert>
            </div>
          )}
        </FieldGrid>
      </Modal>

      <Modal
        open={mode === "create"}
        onClose={closeModal}
        title="Solicitar viático"
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitCreate()} disabled={saving} loading={saving}>
              {saving ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          {validationSummary}
          <Field label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <Input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
              placeholder="Ej. Hospedaje 1 noche + alimentos, Puebla"
            />
          </Field>
          <Field label="Categoría" hint="Determina en qué rubro suma el reporte.">
            <Select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{categoriaLabel(c)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monto solicitado" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.montoSolicitado}
              aria-invalid={Boolean(formErrors.monto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, montoSolicitado: +e.target.value }));
                setFormErrors((prev) => ({ ...prev, monto: undefined }));
              }}
            />
          </Field>
          <Field
            label="Proyecto (ventas)"
            hint="Proyecto o actividad: hace falta uno de los dos para cargar el gasto."
            error={formErrors.enlace}
          >
            <Select
              value={form.projectId}
              aria-invalid={Boolean(formErrors.enlace)}
              onChange={(e) => {
                setForm((f) => ({ ...f, projectId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="ID actividad OPS" hint="El número de la actividad, si el gasto va por ahí.">
            <Input
              value={form.actividadId}
              aria-invalid={Boolean(formErrors.enlace)}
              onChange={(e) => {
                setForm((f) => ({ ...f, actividadId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
              placeholder="Ej. 128"
            />
          </Field>
          <Field label="Vehículo" optional hint="Solo si el gasto es de combustible o casetas.">
            <Select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </Select>
          </Field>
          <Field
            label="Repartir entre actividades"
            fullWidth
            optional
            hint="Cuando un mismo viaje cubrió varios servicios. Las partes tienen que sumar el monto de arriba."
            error={formErrors.reparto}
          >
            <RepartoEditor
              partes={partes}
              onChange={(p) => {
                setPartes(p);
                setFormErrors((prev) => ({ ...prev, reparto: undefined }));
              }}
              total={form.montoSolicitado}
              disabled={saving}
            />
          </Field>
          <div className={s.completo}>
            <ReceiptCapture
              file={evidenceFile}
              onFile={(f) => {
                setEvidenceFile(f);
                setFormErrors((prev) => ({ ...prev, comprobante: undefined }));
              }}
              label="Ticket o comprobante"
              required
              showCamera={narrow}
              disabled={saving}
              hint="PDF o imagen. Si no lo tienes a la mano, pega la liga abajo."
            />
            {formErrors.comprobante && (
              <div role="alert" className={s.errorCampo}>
                {formErrors.comprobante}
              </div>
            )}
          </div>
          <Field label="URL del comprobante" fullWidth optional hint="Alternativa al archivo: una liga a Drive o al portal del proveedor.">
            <Input
              value={form.comprobante}
              onChange={(e) => {
                setForm((f) => ({ ...f, comprobante: e.target.value }));
                setFormErrors((prev) => ({ ...prev, comprobante: undefined }));
              }}
              placeholder="https://…"
            />
          </Field>
          {saveErr && (
            <div className={s.completo}>
              <Alert
                tone="danger"
                role="alert"
                action={<LinkButton onClick={() => void submitCreate()} disabled={saving}>Reintentar</LinkButton>}
              >
                {saveErr}
              </Alert>
            </div>
          )}
        </FieldGrid>
      </Modal>

      <Modal
        open={mode === "edit" && !!selected}
        onClose={closeModal}
        title={selected ? `Editar viático ${folioViatico(selected.id)}` : "Editar"}
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitEdit()} disabled={saving} loading={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          {validationSummary}
          <Field label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <Input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, concepto: e.target.value }));
                setFormErrors((prev) => ({ ...prev, concepto: undefined }));
              }}
            />
          </Field>
          <Field label="Categoría" hint="Determina en qué rubro suma el reporte.">
            <Select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{categoriaLabel(c)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monto solicitado" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={form.montoSolicitado}
              aria-invalid={Boolean(formErrors.monto)}
              onChange={(e) => {
                setForm((f) => ({ ...f, montoSolicitado: +e.target.value }));
                setFormErrors((prev) => ({ ...prev, monto: undefined }));
              }}
            />
          </Field>
          <Field
            label="Proyecto (ventas)"
            hint="Proyecto o actividad: hace falta uno de los dos para cargar el gasto."
            error={formErrors.enlace}
          >
            <Select
              value={form.projectId}
              aria-invalid={Boolean(formErrors.enlace)}
              onChange={(e) => {
                setForm((f) => ({ ...f, projectId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
            >
              <option value="">— Sin proyecto —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="ID actividad OPS" hint="El número de la actividad, si el gasto va por ahí.">
            <Input
              value={form.actividadId}
              aria-invalid={Boolean(formErrors.enlace)}
              onChange={(e) => {
                setForm((f) => ({ ...f, actividadId: e.target.value }));
                setFormErrors((prev) => ({ ...prev, enlace: undefined }));
              }}
            />
          </Field>
          <Field label="Vehículo" optional hint="Solo si el gasto es de combustible o casetas.">
            <Select value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">— Sin vehículo —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nombre}{v.placas ? ` · ${v.placas}` : ""}</option>)}
            </Select>
          </Field>
          <Field
            label="Repartir entre actividades"
            fullWidth
            optional
            hint="Cuando un mismo viaje cubrió varios servicios. Las partes tienen que sumar el monto de arriba."
            error={formErrors.reparto}
          >
            <RepartoEditor
              partes={partes}
              onChange={(p) => {
                setPartes(p);
                setFormErrors((prev) => ({ ...prev, reparto: undefined }));
              }}
              total={form.montoSolicitado}
              disabled={saving}
            />
          </Field>
          <div className={s.completo}>
            <ReceiptCapture
              file={evidenceFile}
              onFile={setEvidenceFile}
              label="Nuevo comprobante"
              showCamera={narrow}
              disabled={saving}
              hint="Opcional · reemplaza el archivo actual (PDF o imagen)"
            />
          </div>
          <Field label="URL del comprobante" fullWidth optional hint="Alternativa al archivo: una liga a Drive o al portal del proveedor.">
            <Input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} />
          </Field>
          {selected?.contabilidadRef && (
            <div className={s.folioContable}>
              Folio contable: {selected.contabilidadRef}
            </div>
          )}
          {saveErr && (
            <div className={s.completo}>
              <Alert
                tone="danger"
                role="alert"
                action={<LinkButton onClick={() => void submitEdit()} disabled={saving}>Reintentar</LinkButton>}
              >
                {saveErr}
              </Alert>
            </div>
          )}
        </FieldGrid>
      </Modal>

      <Modal
        open={mode === "approve" && !!selected}
        onClose={closeModal}
        title="Revisar viático"
        maxWidth={500}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancelar</Button>
            {approveForm.estatus === "Rechazado" ? (
              <Button variant="danger" onClick={() => void runApprove("reject")} disabled={saving} loading={saving}>
                {saving ? "Guardando…" : "Confirmar rechazo"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void runApprove(approveForm.estatus === "Pagado" ? "pagado" : "approve")}
                disabled={saving}
                loading={saving}
              >
                {saving ? "Guardando…" : approveForm.estatus === "Pagado" ? "Marcar pagado" : "Aprobar"}
              </Button>
            )}
          </>
        }
      >
        {selected && (
          <>
            <div className={s.revisionCabeza}>
              <div className={s.revisionTexto}>
                <div className={s.concepto}>{selected.concepto}</div>
                <div className={s.meta}>
                  <span>
                    {[
                      folioViatico(selected.id),
                      selected.usuario?.nombre,
                      categoriaLabel(selected.categoria),
                      actividadFolio(selected.actividad),
                      selected.project?.name,
                      selected.contabilidadRef ? `Ref. ${selected.contabilidadRef}` : null,
                      formatFecha(selected.fechaSolicitud),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
              <span className={s.revisionImporte}>
                <Money value={Number(selected.montoSolicitado) || 0} />
              </span>
            </div>
            <FieldGrid>
              {(selected.repartos?.length ?? 0) > 0 && (
                <div className={s.completo}>
                  <span className={s.etiqueta}>Repartido entre actividades</span>
                  <ul className={s.repartos}>
                    {selected.repartos!.map((parte) => (
                      <li key={parte.id} className={s.reparto}>
                        <span className={s.repartoActividad}>
                          {parte.actividad?.anNumber ?? `Act-${parte.actividadId}`}
                          {parte.actividad?.titulo ? ` · ${parte.actividad.titulo}` : ""}
                        </span>
                        <span className={s.repartoMonto}>
                          <Money value={Number(parte.monto)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={s.completo}>
                <LiquidacionResumen liquidacion={selected.liquidacion} />
              </div>
              <div className={s.completo}>
                <ApprovalTrail trail={selectedTrail} step={selected.approvalStep} />
              </div>
              <div className={s.completo}>
                <span className={s.etiqueta} id="resolucion-viatico">Resolución</span>
                <div className={s.opciones} role="group" aria-labelledby="resolucion-viatico">
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
                        disabled={saving}
                        className={active ? s.opcionActiva : undefined}
                        onClick={() => setApproveForm((f) => ({ ...f, estatus: value }))}
                      >
                        {active ? `✓ ${label}` : label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              {approveForm.estatus === "Aprobado" && (
                <Field
                  label="Monto autorizado"
                  optional
                  hint={`Vacío autoriza los ${dinero(centavos(Number(selected.montoSolicitado) || 0))} solicitados. Puedes recortar, no subir.`}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={approveForm.montoAprobado}
                    onChange={(e) => setApproveForm((f) => ({ ...f, montoAprobado: e.target.value }))}
                    placeholder={(Number(selected.montoSolicitado) || 0).toFixed(2)}
                    className={s.monto}
                  />
                </Field>
              )}
              {["Aprobado", "Pagado"].includes(selected.estatus ?? "") && (
                <Field
                  label="Comprobado con tickets"
                  optional
                  hint="Lo que de verdad se gastó del anticipo. La diferencia queda como saldo a favor o en contra."
                >
                  <div className={s.comprobar}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={approveForm.montoComprobado}
                      onChange={(e) => setApproveForm((f) => ({ ...f, montoComprobado: e.target.value }))}
                      placeholder="0.00"
                      className={`${s.monto} ${s.comprobarCampo}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving || !approveForm.montoComprobado.trim()}
                      onClick={() => void runComprobar()}
                    >
                      Registrar
                    </Button>
                  </div>
                </Field>
              )}
              <Field
                label="Comentarios"
                fullWidth
                optional
                hint="Motivo del rechazo, referencia del pago o nota para contabilidad. Queda en la cadena de autorización."
              >
                <Textarea
                  value={approveForm.comentariosAdmin}
                  onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                  rows={3}
                />
              </Field>
              {saveErr && (
                <div className={s.completo}>
                  <Alert tone="danger" role="alert">{saveErr}</Alert>
                </div>
              )}
            </FieldGrid>
          </>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </FinanceModuleShell>
  );
}
