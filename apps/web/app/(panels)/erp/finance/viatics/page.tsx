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
import {
  approveViatico,
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
import FileDropzone from "@/components/ui/FileDropzone";
import Modal from "@/components/ui/Modal";
import {
  FinanceField,
  FinanceFormGrid,
  FinanceModuleShell,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";

/** Entrada de `approvalTrail` (JSON en la API). Todo opcional: es Json, no un contrato duro. */
type ApprovalTrailEntry = {
  role?: string;
  userId?: number;
  userName?: string;
  action?: string;
  at?: string;
  note?: string;
};

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
const rowMetaWarnStyle: CSSProperties = { color: "var(--state-danger-text)" };
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

function folioViatico(id: number) {
  return `V-${String(id).padStart(4, "0")}`;
}

function formatFecha(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function formatFechaHora(value?: string) {
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

/** `approvalTrail` es Json en la base: se lee a la defensiva y nunca se inventa. */
function readTrail(raw: unknown): ApprovalTrailEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ApprovalTrailEntry => Boolean(e) && typeof e === "object");
}

function trailActionLabel(action?: string) {
  if (action === "approve") return "Aprobó";
  if (action === "reject") return "Rechazó";
  return "Revisó";
}

function humanRole(role?: string) {
  if (!role) return "";
  return role.replace(/_/g, " ");
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

type FormMode = "create" | "approve" | "edit" | null;
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

/** Desglose de analytics como tabla real: son datos tabulares, no una lista pintada. */
function BreakdownTable({
  title,
  rows,
  limit = 10,
}: {
  title: string;
  rows: AnalyticsBucket[];
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


const parteVacia = (): ParteForm => ({ actividadId: "", monto: "", nota: "" });

/**
 * Reparto del gasto entre varias actividades.
 *
 * El viaje a Tehuacán cubrió dos servicios de clientes distintos: la gasolina es
 * una, el costo son dos. Mientras se captura, la pista de abajo dice cuánto
 * falta o sobra, porque descubrirlo al guardar es descubrirlo tarde. El
 * servidor vuelve a comprobarlo: esto es ayuda, no la regla.
 */
function RepartoEditor({
  partes,
  onChange,
  total,
  disabled,
}: {
  partes: ParteForm[];
  onChange: (partes: ParteForm[]) => void;
  total: number;
  disabled?: boolean;
}) {
  const totalCent = centavos(total);
  const sumaCent = partes.reduce((acc, p) => acc + centavos(p.monto), 0);
  const diferencia = totalCent - sumaCent;

  const set = (i: number, campo: keyof ParteForm, valor: string) =>
    onChange(partes.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  const pista =
    partes.length === 0
      ? "Sin repartir, el gasto entero carga a la actividad de arriba."
      : diferencia === 0
        ? `Cuadra: las ${partes.length} partes suman ${dinero(totalCent)}.`
        : diferencia > 0
          ? `Faltan ${dinero(diferencia)} por repartir de ${dinero(totalCent)}.`
          : `Sobran ${dinero(-diferencia)}: las partes suman más que el viático.`;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {partes.map((parte, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 8, alignItems: "center" }}
        >
          <input
            type="number"
            min="1"
            step="1"
            value={parte.actividadId}
            onChange={(e) => set(i, "actividadId", e.target.value)}
            placeholder="ID actividad"
            aria-label={`Actividad de la parte ${i + 1}`}
            disabled={disabled}
            style={financeInputStyle}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={parte.monto}
            onChange={(e) => set(i, "monto", e.target.value)}
            placeholder="0.00"
            aria-label={`Monto de la parte ${i + 1}`}
            disabled={disabled}
            style={{ ...financeInputStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
          />
          <Button
            size="sm"
            variant="ghost"
            style={rowButtonStyle}
            disabled={disabled}
            aria-label={`Quitar la parte ${i + 1}`}
            onClick={() => onChange(partes.filter((_, j) => j !== i))}
          >
            Quitar
          </Button>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button
          size="sm"
          variant="secondary"
          style={rowButtonStyle}
          disabled={disabled}
          onClick={() => {
            // La primera parte se abre con lo que falta: casi siempre el total.
            const pendiente = partes.length === 0 ? totalCent : Math.max(diferencia, 0);
            onChange([
              ...partes,
              { ...parteVacia(), monto: pendiente > 0 ? (pendiente / 100).toFixed(2) : "" },
            ]);
          }}
        >
          Añadir actividad
        </Button>
        {partes.length > 0 && (
          <StatusDot
            wrap
            tone={diferencia === 0 ? "success" : "warning"}
            label={pista}
          />
        )}
      </div>
      {partes.length === 0 && (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{pista}</span>
      )}
    </div>
  );
}

/** Lo entregado, lo comprobado y quién le debe a quién. */
function LiquidacionResumen({ liquidacion }: { liquidacion?: ViaticoLiquidacion }) {
  if (!liquidacion) return null;
  const { entregado, comprobado, saldo, estado } = liquidacion;
  const texto =
    estado === "SIN_COMPROBAR"
      ? "Todavía nadie entregó tickets contra este anticipo."
      : estado === "CUADRADO"
        ? "Cuadrado: lo comprobado es exactamente lo entregado."
        : estado === "POR_DEVOLVER"
          ? `Sobraron ${dinero(centavos(saldo ?? 0))}: quedan por devolver a la empresa.`
          : `Faltaron ${dinero(centavos(Math.abs(saldo ?? 0)))}: la empresa debe ese reembolso.`;
  return (
    <div>
      <span style={choiceLabelStyle}>Anticipo</span>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5 }}>
          Entregado <strong style={{ fontVariantNumeric: "tabular-nums" }}><Money value={entregado} /></strong>
        </span>
        <span style={{ fontSize: 12.5 }}>
          Comprobado{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {comprobado == null ? "—" : <Money value={comprobado} />}
          </strong>
        </span>
        {saldo != null && (
          <span style={{ fontSize: 12.5 }}>
            Saldo <strong style={{ fontVariantNumeric: "tabular-nums" }}><Money value={Math.abs(saldo)} /></strong>
          </span>
        )}
      </div>
      <StatusDot
        wrap
        tone={estado === "CUADRADO" ? "success" : estado === "SIN_COMPROBAR" ? "neutral" : "warning"}
        label={texto}
      />
    </div>
  );
}

/** La cadena de autorización: quién, con qué papel, cuándo y qué escribió. */
function ApprovalTrail({ trail, step }: { trail: ApprovalTrailEntry[]; step?: number }) {
  return (
    <div>
      <span style={choiceLabelStyle}>Cadena de autorización</span>
      {trail.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          — Nadie la ha revisado todavía{typeof step === "number" ? ` (paso ${step})` : ""}.
        </div>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {trail.map((entry, i) => (
            <li key={`${entry.at ?? i}-${entry.userId ?? i}`} style={{ fontSize: 12, lineHeight: 1.45 }}>
              <StatusDot
                wrap
                tone={entry.action === "reject" ? "danger" : "success"}
                label={
                  <span>
                    <strong style={{ fontWeight: 600 }}>{trailActionLabel(entry.action)}</strong>{" "}
                    {entry.userName ?? (entry.userId ? `usuario #${entry.userId}` : "—")}
                    {entry.role ? ` · ${humanRole(entry.role)}` : ""}
                    {" · "}
                    {formatFechaHora(entry.at)}
                    {entry.note ? (
                      <span style={{ display: "block", color: "var(--text-tertiary)" }}>“{entry.note}”</span>
                    ) : null}
                  </span>
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function ViaticosPage() {
  const { user, isContextReady } = useUser();
  const cfg = useMemo(() => getErpViaticsAdminSectionConfig(user), [user]);
  const canViewAll = cfg.defaultScope === "team";
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
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

  const filtered = useMemo(() => {
    if (tab === "analytics") return [];
    let rows = tabRows;
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
        (actividadFolio(v.actividad) ?? "").toLowerCase().includes(q) ||
        (v.actividad?.titulo ?? "").toLowerCase().includes(q) ||
        (v.project?.name ?? "").toLowerCase().includes(q) ||
        (v.categoria ?? "").toLowerCase().includes(q) ||
        (v.estatus ?? "").toLowerCase().includes(q) ||
        (v.contabilidadRef ?? "").toLowerCase().includes(q),
    );
  }, [tabRows, filter, filterEstatus, highlightId, tab]);

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

  const inp = financeInputStyle;

  const exportExcel = () =>
    exportToExcel(
      filtered,
      [
        { key: "id", label: "ID" },
        { key: "concepto", label: "Concepto" },
        { key: "usuario", label: "Solicitante", format: (v) => (v as Viatico["usuario"])?.nombre ?? "—" },
        { key: "categoria", label: "Categoría" },
        { key: "montoSolicitado", label: "Monto" },
        { key: "estatus", label: "Estatus" },
        { key: "contabilidadRef", label: "Ref. contable" },
        { key: "fechaSolicitud", label: "Fecha", format: (v) => (v ? String(v).slice(0, 10) : "") },
      ],
      "viaticos",
      { title: "Control de viáticos" },
    );

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
        if (v.categoria) meta.push(v.categoria);
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
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
              {v.concepto ?? "—"}
            </div>
            <div style={rowMetaStyle}>
              {/* En móvil el estado deja de ser columna y baja aquí: antes
                  empujaba la tabla más allá del ancho de la pantalla. */}
              {narrow ? (
                <StatusDot
                  label={(v.estatus ?? "Pendiente").replace(/_/g, " ")}
                  tone={estatusTone(v.estatus)}
                />
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
      key: "montoSolicitado",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (v) => <Money value={Number(v.montoSolicitado) || 0} />,
      width: 120,
    },
    ...(narrow
      ? []
      : ([
          {
            key: "fechaSolicitud",
            label: "Fecha",
            render: (v: Viatico) => (
              <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {formatFecha(v.fechaSolicitud)}
              </span>
            ),
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
              <StatusDot
                label={(v.estatus ?? "Pendiente").replace(/_/g, " ")}
                tone={estatusTone(v.estatus)}
              />
            ),
            width: 150,
          },
        ] as Column<Viatico>[])),
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (v) => {
        const nombre = `${folioViatico(v.id)} · ${v.concepto ?? "viático"}`;
        const busy = rowBusyId === v.id;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {v.estatus === "Pendiente" && (cfg.canCreate || v.usuario?.id === user?.id) && (
              <Button
                size="sm"
                variant="ghost"
                style={rowButtonStyle}
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
                  style={rowButtonStyle}
                  aria-label={`Autorizar ${nombre}`}
                  onClick={(e) => { e.stopPropagation(); openApprove(v); }}
                >
                  Autorizar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  style={rowButtonStyle}
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
                style={rowButtonStyle}
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
                style={rowButtonStyle}
                aria-label={`Cancelar ${nombre}`}
                disabled={busy}
                onClick={(e) => { e.stopPropagation(); softDelete(v); }}
              >
                Cancelar
              </Button>
            )}
          </div>
        );
      },
      // En móvil la columna se estrecha a lo que ocupen los botones: fijarla en
      // 240px era lo que obligaba a hacer scroll lateral a 375px.
      width: narrow ? undefined : 240,
    },
  ];

  const invalidFields = (Object.keys(formErrors) as (keyof FormErrors)[]).filter((k) => formErrors[k]);
  const validationSummary =
    invalidFields.length > 0 ? (
      <div style={{ gridColumn: "1 / -1" }}>
        <InlineAlert
          variant="warning"
          style={{ marginBottom: 0 }}
          message={`Falta por capturar: ${invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}. Cada campo dice abajo qué necesita.`}
        />
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

  /** Regla 4: un solo primario por pantalla, y es la acción a la que se vino. */
  const primaryAction = cfg.canCreate ? (
    <Button size="sm" variant="primary" style={toolbarButtonStyle} onClick={openCreate}>
      Solicitar viático
    </Button>
  ) : null;

  const refreshAction = (
    <Button
      size="sm"
      variant="ghost"
      style={toolbarButtonStyle}
      disabled={loading}
      onClick={() => void load()}
    >
      {loading ? "Actualizando…" : "Actualizar"}
    </Button>
  );

  return (
    <FinanceModuleShell
      variant="flat"
      title={cfg.title}
      subtitle={cfg.subtitle}
      kpis={showMetrics ? <MetricStrip metrics={metrics} ariaLabel="Resumen de viáticos" /> : undefined}
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
          {/* Regla 8: rango, acción y exportación en una sola fila, sin caja. */}
          <FilterToolbar
            dates={[
              { label: "Desde", value: dateFrom, onChange: setDateFrom },
              { label: "Hasta", value: dateTo, onChange: setDateTo },
            ]}
            onClear={() => {
              setDateFrom("");
              setDateTo("");
            }}
            style={{ marginBottom: 0 }}
            rightActions={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  style={toolbarButtonStyle}
                  onClick={() => void loadAnalytics()}
                  disabled={analyticsLoading}
                >
                  {analyticsLoading ? "Calculando…" : "Aplicar"}
                </Button>
                <ListExportActions onPdf={() => void downloadPdf()} pdfBusy={pdfBusy} />
                {primaryAction}
              </>
            }
          />
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
              Pulsa «Aplicar» para calcular el resumen. Sin fechas cubre todo el histórico.
            </div>
          )}
          {/* Regla 7 en el periodo: si no hubo ni un viático, la tira de ceros
              no dice nada; la frase sí. Con filas, aunque sumen cero, se
              enseña: un periodo que cerró en cero es información. */}
          {!analyticsLoading && analytics && analytics.totals.count === 0 && (
            <div style={statusPanelStyle}>
              En el periodo elegido no hay ningún viático registrado.
            </div>
          )}
          {!analyticsLoading && analytics && analytics.totals.count > 0 && (
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
                  { label: "Solicitado", value: <Money value={analytics.totals.totalSolicitado} />, hint: "pedido en el periodo" },
                  { label: "Autorizado", value: <Money value={analytics.totals.totalAprobado} />, hint: "sin pagar aún" },
                  { label: "Pagado", value: <Money value={analytics.totals.totalPagado} />, hint: "liquidado en el periodo" },
                ]}
              />
              <BreakdownTable title="Por proyecto" rows={analytics.byProject} />
              <BreakdownTable title="Por persona" rows={analytics.byPerson} />
              <BreakdownTable title="Por categoría" rows={analytics.byCategory} />
            </>
          )}
        </div>
      ) : (
        <>
          {/* Regla 8: buscador, selector, exportación y la acción principal en
              una sola fila. Sin recuadro propio: cada control ya trae su borde
              y meterlos en una caja es dibujarlo dos veces. Exportar vive aquí
              y solo aquí — antes estaba también en la cabecera. */}
          {showToolbar && (
            <FilterToolbar
              search={{ value: filter, onChange: setFilter, placeholder: "Buscar por concepto, solicitante, folio o ref…" }}
              selects={[{
                label: "Estatus",
                value: filterEstatus,
                onChange: setFilterEstatus,
                options: (tab === "contabilidad" ? ESTATUS_CONTABILIDAD : ESTATUS).map((s) => ({
                  value: s,
                  label: s.replace("_", " "),
                })),
                allowAll: true,
              }]}
              onClear={clearFilters}
              style={{ marginBottom: 0 }}
              resultCount={firstLoad ? null : filtered.length}
              rightActions={
                <>
                  {refreshAction}
                  <ListExportActions
                    onExcel={exportExcel}
                    excelDisabled={filtered.length === 0}
                    onPdf={() => void downloadPdf()}
                    pdfBusy={pdfBusy}
                  />
                  {primaryAction}
                </>
              }
            />
          )}

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
          {catalogErr && (
            <InlineAlert
              message={`${catalogErr}. El desplegable de proyectos saldrá vacío; puedes ligar la solicitud con el ID de actividad.`}
              variant="warning"
              onDismiss={() => setCatalogErr(null)}
            />
          )}
          {truncated && !error && (
            <InlineAlert
              variant="warning"
              message={`La API devuelve como máximo ${API_LIST_CAP} solicitudes por consulta y llegaron ${API_LIST_CAP}: puede haber más sin mostrar, y los totales de arriba solo cubren lo que ves. Usa Analytics con un rango de fechas para cifras del periodo completo.`}
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
          {firstLoad ? (
            <div style={{ ...statusPanelStyle, padding: 32 }} role="status" aria-live="polite">
              Cargando viáticos…
            </div>
          ) : error && items.length === 0 ? null : (
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(v) => v.id}
              density="compact"
              ariaLabel="Solicitudes de viáticos"
              emptyTitle={
                hasFilters
                  ? "Ningún viático coincide"
                  : tab === "contabilidad"
                    ? "Todavía no hay viáticos autorizados"
                    : "Todavía no hay viáticos"
              }
              emptyDescription={
                hasFilters
                  ? "Ninguna solicitud coincide con los filtros aplicados."
                  : tab === "contabilidad"
                    ? "Un viático llega aquí cuando alguien lo autoriza. Los que siguen esperando resolución están en «Todos»."
                    : cfg.canCreate
                      ? "Un viático es el dinero de un viaje de trabajo —gasolina, casetas, hospedaje o alimentos— ligado a una actividad o a un proyecto. Pide el primero y queda aquí para autorizar."
                      : "Un viático es el dinero de un viaje de trabajo —gasolina, casetas, hospedaje o alimentos—. Los pide el equipo desde su panel y aquí llegan para que los autorices."
              }
              emptyAction={
                hasFilters ? (
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    {tab === "contabilidad" ? (
                      <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => setTab("todos")}>
                        Ver todos
                      </Button>
                    ) : (
                      primaryAction
                    )}
                    {refreshAction}
                  </div>
                )
              }
            />
          )}
        </>
      )}

      <Modal
        open={mode === "create"}
        onClose={closeModal}
        title="Solicitar viático"
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button variant="primary" style={toolbarButtonStyle} onClick={() => void submitCreate()} disabled={saving} loading={saving}>
              {saving ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          {validationSummary}
          <FinanceField label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
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
              aria-invalid={Boolean(formErrors.monto)}
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
              aria-invalid={Boolean(formErrors.enlace)}
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
              aria-invalid={Boolean(formErrors.enlace)}
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
          <FinanceField
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
              <div role="alert" style={{ fontSize: 11, color: "var(--state-danger-text)", marginTop: 6 }}>
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
          {saveErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                message={saveErr}
                variant="danger"
                style={{ marginBottom: 0 }}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void submitCreate()} disabled={saving}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "edit" && !!selected}
        onClose={closeModal}
        title={selected ? `Editar viático ${folioViatico(selected.id)}` : "Editar"}
        maxWidth={560}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button variant="primary" style={toolbarButtonStyle} onClick={() => void submitEdit()} disabled={saving} loading={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          {validationSummary}
          <FinanceField label="Concepto" fullWidth hint="Qué se va a gastar y para qué viaje." error={formErrors.concepto}>
            <input
              value={form.concepto}
              aria-invalid={Boolean(formErrors.concepto)}
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
          <FinanceField label="Monto solicitado" hint="Pesos, con IVA incluido." error={formErrors.monto}>
            <input
              type="number"
              min={0}
              value={form.montoSolicitado}
              aria-invalid={Boolean(formErrors.monto)}
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
              aria-invalid={Boolean(formErrors.enlace)}
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
              aria-invalid={Boolean(formErrors.enlace)}
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
          <FinanceField
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
          {selected?.contabilidadRef && (
            <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-tertiary)" }}>
              Folio contable: {selected.contabilidadRef}
            </div>
          )}
          {saveErr && (
            <div style={{ gridColumn: "1 / -1" }}>
              <InlineAlert
                message={saveErr}
                variant="danger"
                style={{ marginBottom: 0 }}
                action={
                  <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void submitEdit()} disabled={saving}>
                    Reintentar
                  </Button>
                }
              />
            </div>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={mode === "approve" && !!selected}
        onClose={closeModal}
        title="Revisar viático"
        maxWidth={500}
        footer={
          <>
            <Button variant="ghost" style={toolbarButtonStyle} onClick={closeModal} disabled={saving}>Cancelar</Button>
            {approveForm.estatus === "Rechazado" ? (
              <Button variant="danger" style={toolbarButtonStyle} onClick={() => void runApprove("reject")} disabled={saving} loading={saving}>
                {saving ? "Guardando…" : "Confirmar rechazo"}
              </Button>
            ) : (
              <Button
                variant="primary"
                style={toolbarButtonStyle}
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
                      folioViatico(selected.id),
                      selected.usuario?.nombre,
                      selected.categoria,
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
              <span style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}>
                <Money value={Number(selected.montoSolicitado) || 0} />
              </span>
            </div>
            <FinanceFormGrid>
              {(selected.repartos?.length ?? 0) > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={choiceLabelStyle}>Repartido entre actividades</span>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                    {selected.repartos!.map((parte) => (
                      <li
                        key={parte.id}
                        style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          {parte.actividad?.anNumber ?? `Act-${parte.actividadId}`}
                          {parte.actividad?.titulo ? ` · ${parte.actividad.titulo}` : ""}
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          <Money value={Number(parte.monto)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <LiquidacionResumen liquidacion={selected.liquidacion} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <ApprovalTrail trail={selectedTrail} step={selected.approvalStep} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={choiceLabelStyle} id="resolucion-viatico">Resolución</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-labelledby="resolucion-viatico">
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
                        style={{
                          ...rowButtonStyle,
                          height: 32,
                          fontSize: 12.5,
                          borderColor: active ? "var(--primary)" : undefined,
                          color: active ? "var(--primary)" : undefined,
                        }}
                        onClick={() => setApproveForm((f) => ({ ...f, estatus: value }))}
                      >
                        {active ? `✓ ${label}` : label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              {approveForm.estatus === "Aprobado" && (
                <FinanceField
                  label="Monto autorizado"
                  optional
                  hint={`Vacío autoriza los ${dinero(centavos(Number(selected.montoSolicitado) || 0))} solicitados. Puedes recortar, no subir.`}
                >
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={approveForm.montoAprobado}
                    onChange={(e) => setApproveForm((f) => ({ ...f, montoAprobado: e.target.value }))}
                    placeholder={(Number(selected.montoSolicitado) || 0).toFixed(2)}
                    style={{ ...inp, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                  />
                </FinanceField>
              )}
              {["Aprobado", "Pagado"].includes(selected.estatus ?? "") && (
                <FinanceField
                  label="Comprobado con tickets"
                  optional
                  hint="Lo que de verdad se gastó del anticipo. La diferencia queda como saldo a favor o en contra."
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={approveForm.montoComprobado}
                      onChange={(e) => setApproveForm((f) => ({ ...f, montoComprobado: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inp, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      style={{ ...rowButtonStyle, height: 32, whiteSpace: "nowrap" }}
                      disabled={saving || !approveForm.montoComprobado.trim()}
                      onClick={() => void runComprobar()}
                    >
                      Registrar
                    </Button>
                  </div>
                </FinanceField>
              )}
              <FinanceField
                label="Comentarios"
                fullWidth
                optional
                hint="Motivo del rechazo, referencia del pago o nota para contabilidad. Queda en la cadena de autorización."
              >
                <textarea
                  value={approveForm.comentariosAdmin}
                  onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                  rows={3}
                  style={{ ...inp, resize: "vertical" }}
                />
              </FinanceField>
              {saveErr && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <InlineAlert message={saveErr} variant="danger" style={{ marginBottom: 0 }} />
                </div>
              )}
            </FinanceFormGrid>
          </>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </FinanceModuleShell>
  );
}
