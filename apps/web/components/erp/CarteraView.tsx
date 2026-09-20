"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import FilterScale, { type ScaleItem } from "@/components/ui/FilterScale";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

/**
 * Cartera de la contadora — cuentas por cobrar y por pagar.
 *
 * Las dos páginas comparten el motor (mismos datos, mismas columnas, mismo
 * detalle) pero no el foco: CxC mira a quién hay que cobrarle y CxP además
 * arma el calendario de lo que sale de caja.
 */

export type CarteraKind = "cxc" | "cxp";

type AgingBucket = "vencido" | "hoy" | "proximos7" | "proximos30" | "mas30" | "sinFecha";

const ORDEN_AGING: AgingBucket[] = [
  "vencido",
  "hoy",
  "proximos7",
  "proximos30",
  "mas30",
  "sinFecha",
];

type Contraparte = { tipo: string; id: number | null; nombre: string; rfc: string | null };
type Proyecto = { id: number | null; clave: string; nombre: string; origen: string } | null;

type Fila = {
  id: number;
  folio: string;
  uuid: string | null;
  contraparte: Contraparte;
  proyecto: Proyecto;
  emision: string | null;
  vencimiento: string | null;
  diasVencido: number | null;
  aging: AgingBucket;
  monto: number;
  pagado: number;
  pendiente: number;
  moneda: string;
  estado: string;
  estadoEtiqueta: string;
  estadoTono: "ok" | "warn" | "bad" | "mute";
  cancelada: boolean;
  tieneXml: boolean;
  tienePdf: boolean;
};

type Respuesta = {
  kind: CarteraKind;
  filtros: {
    contrapartes: { id: number; nombre: string }[];
    proyectos: { id: number; nombre: string }[];
  };
  totales: { documentos: number; total: number; pagado: number; pendiente: number; vencido: number };
  aging: Record<AgingBucket, { monto: number; documentos: number }>;
  agingEtiquetas: Record<AgingBucket, string>;
  rows: Fila[];
  meta: { total: number; page: number; limit: number; totalPages: number; truncado: boolean };
};

type Pago = {
  id: number;
  fecha: string | null;
  monto: number;
  metodo: string;
  referencia: string | null;
  claveRastreo: string | null;
  banco: string | null;
  notas: string | null;
  complementoUuid: string | null;
  registradoPor: string | null;
};

type Detalle = {
  kind: CarteraKind;
  factura: {
    id: number;
    folio: string;
    uuid: string | null;
    emision: string | null;
    vencimiento: string | null;
    diasVencido: number | null;
    moneda: string;
    subtotal: number;
    impuestos: number;
    estado: string;
    estadoEtiqueta: string;
    estadoTono: "ok" | "warn" | "bad" | "mute";
    cancelada: boolean;
    motivoCancelacion: string | null;
    formaPago: string | null;
    metodoPago: string | null;
    usoCfdi: string | null;
    notas: string | null;
    match: string | null;
  };
  contraparte: Contraparte;
  proyecto: Proyecto;
  conceptos: {
    id: number;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
    unidad: string | null;
  }[];
  pagos: Pago[];
  saldo: { total: number; pagado: number; pendiente: number; porcentajePagado: number };
  documentos: { tipo: string; nombre: string; disponible: boolean; url: string | null; nota: string | null }[];
  historial: { fecha: string | null; tipo: string; titulo: string; detalle: string | null; usuario: string | null }[];
};

type Calendario = {
  desde: string;
  hasta: string;
  ventanaDias: number;
  vencido: { monto: number; documentos: number; contrapartes: { nombre: string; monto: number; documentos: number }[] };
  resumen: {
    vencido: number;
    hoy: number;
    proximos7: number;
    proximos30: number;
    enVentana: number;
    fueraDeVentana: number;
    sinFecha: number;
  };
  dias: { fecha: string; enDias: number; monto: number; documentos: number; contrapartes: { nombre: string; monto: number }[] }[];
  semanas: { semana: number; etiqueta: string; inicio: string; fin: string; monto: number; documentos: number; contrapartes: { nombre: string; monto: number }[] }[];
};

const ESTADOS: { value: string; label: string }[] = [
  { value: "abiertas", label: "Con saldo" },
  { value: "vencidas", label: "Solo vencidas" },
  { value: "pagadas", label: "Pagadas" },
  { value: "canceladas", label: "Canceladas" },
  { value: "todas", label: "Todas" },
];

const METODOS: { value: string; label: string }[] = [
  { value: "SPEI", label: "SPEI" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "CASH", label: "Efectivo" },
  { value: "CHECK", label: "Cheque" },
  { value: "CREDIT_CARD", label: "Tarjeta de crédito" },
  { value: "CARD_DEBIT", label: "Tarjeta de débito" },
  { value: "DOMICILIACION", label: "Domiciliación" },
  { value: "COMPENSATION", label: "Compensación" },
  { value: "OTHER", label: "Otro" },
];

/**
 * El tono que manda el API, traducido al vocabulario de `StatusDot`: punto y
 * palabra. Antes era texto en negritas de color, y con veinte renglones la
 * columna de estado competía con los montos.
 */
const TONO_ESTADO: Record<string, StatusTone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
  mute: "neutral",
};

function fechaCorta(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}

function fechaLarga(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/** "12 días vencida" / "faltan 4 días" — en palabras, no en signos. */
function textoDias(dias: number | null) {
  if (dias === null) return "Sin plazo";
  if (dias > 0) return dias === 1 ? "1 día vencida" : `${dias} días vencida`;
  if (dias === 0) return "Vence hoy";
  const faltan = -dias;
  return faltan === 1 ? "Falta 1 día" : `Faltan ${faltan} días`;
}

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const pesos = (n: number, decimales = 0) =>
  n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: decimales,
  });

/**
 * Los CFDI vienen del SAT con su clave; enseñar «PPD» a la contadora está bien,
 * enseñarle «ACCOUNTS_PAYABLE» no. Si la clave no está en la tabla se muestra
 * tal cual llegó: preferimos un dato crudo a inventar una traducción.
 */
const METODO_CFDI: Record<string, string> = {
  PUE: "PUE · pago en una sola exhibición",
  PPD: "PPD · pago en parcialidades o diferido",
};

/**
 * Un renglón «etiqueta: valor» para el detalle. Cuando el API no manda el dato
 * se escribe «—»: ni se esconde el renglón ni se rellena con una suposición.
 */
function Linea({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  // `valor || "—"` convertiría un 0 legítimo en un guion; aquí solo se
  // sustituye lo que de verdad falta.
  const vacio = valor === null || valor === undefined || valor === "";
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", fontSize: 12.5 }}>
      <span style={{ color: "var(--text-tertiary)" }}>{etiqueta}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>
        {vacio ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : valor}
      </span>
    </div>
  );
}

export default function CarteraView({
  kind,
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
}: {
  kind: CarteraKind;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const esCobrar = kind === "cxc";
  const etiquetaContraparte = esCobrar ? "Cliente" : "Proveedor";

  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("abiertas");
  const [aging, setAging] = useState<AgingBucket | "">("");
  const [contraparte, setContraparte] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [calendario, setCalendario] = useState<Calendario | null>(null);
  const [errorCalendario, setErrorCalendario] = useState<string | null>(null);
  const [ventana, setVentana] = useState(30);

  const [abierta, setAbierta] = useState<Fila | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const [formPago, setFormPago] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  /** Lo que contestó el servidor al último intento, dentro del formulario. */
  const [errorPago, setErrorPago] = useState<string | null>(null);
  /** Se pulsó «Guardar» al menos una vez: a partir de ahí el campo vacío también se señala. */
  const [intentado, setIntentado] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  /**
   * Cerrojo síncrono: `guardandoPago` deshabilita el botón, pero un doble clic
   * rápido entra dos veces antes del repintado. Registrar el mismo cobro dos
   * veces descuadra el saldo de la factura, así que el cerrojo es un ref.
   */
  const pagoEnVueloRef = useRef(false);
  const [pago, setPago] = useState({
    amount: "",
    paymentDate: hoyIso(),
    method: "SPEI",
    reference: "",
    notes: "",
  });
  const [esAngosto, setEsAngosto] = useState(false);

  /**
   * Debajo de 1100px la tabla tiene nueve columnas y ninguna se lee: el
   * contrato dice que la columna que no cabe se colapsa bajo el concepto, no
   * que la tabla se desplace de lado.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 1100px)");
    const sincronizar = () => setEsAngosto(mq.matches);
    sincronizar();
    mq.addEventListener("change", sincronizar);
    return () => mq.removeEventListener("change", sincronizar);
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (estado) qs.set("estado", estado);
      if (aging) qs.set("aging", aging);
      if (contraparte) qs.set("contraparte", contraparte);
      if (proyecto) qs.set("proyecto", proyecto);
      if (desde) qs.set("from", desde);
      if (hasta) qs.set("to", hasta);
      qs.set("limit", "200");
      const res = await erpFetch<Respuesta>(`accounting/workspace/${kind}?${qs}`, token);
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [token, kind, q, estado, aging, contraparte, proyecto, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cargarCalendario = useCallback(async () => {
    if (!token || esCobrar) return;
    setErrorCalendario(null);
    try {
      const res = await erpFetch<Calendario>(
        `accounting/workspace/cxp/calendario?dias=${ventana}`,
        token,
      );
      setCalendario(res);
    } catch (e) {
      setErrorCalendario(formatApiError(e));
      setCalendario(null);
    }
  }, [token, esCobrar, ventana]);

  useEffect(() => {
    void cargarCalendario();
  }, [cargarCalendario]);

  const abrirDetalle = useCallback(
    async (fila: Fila) => {
      setAbierta(fila);
      setDetalle(null);
      setErrorDetalle(null);
      setFormPago(false);
      setCargandoDetalle(true);
      try {
        const res = await erpFetch<Detalle>(`accounting/workspace/${kind}/${fila.id}`, token);
        setDetalle(res);
      } catch (e) {
        setErrorDetalle(formatApiError(e));
      } finally {
        setCargandoDetalle(false);
      }
    },
    [kind, token],
  );

  /**
   * El XML viaja por la API autenticada, así que no sirve un enlace pelado:
   * se pide con la sesión y se entrega como archivo.
   */
  const descargarXml = useCallback(
    async (url: string, nombre: string) => {
      setDescargando(url);
      setErrorDescarga(null);
      try {
        const res = await fetch(buildApiUrl(url), {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      } catch (e) {
        // Junto a los documentos, no en un toast: el botón sigue ahí y hay que
        // saber si el archivo no bajó y por qué.
        setErrorDescarga(`No se pudo descargar ${nombre}. ${formatApiError(e)}`);
      } finally {
        setDescargando(null);
      }
    },
    [token],
  );

  /**
   * La escala de antigüedad, con los tramos que manda el API.
   *
   * Se pintan **todos** los que vienen, incluido el que está en cero: antes se
   * ocultaban los vacíos y la escala cambiaba de forma según el día, así que
   * «vencido, hoy, 7, 30» dejaba de leerse como una escala y no se distinguía
   * «este tramo está limpio» de «este tramo no se está mirando». Un tramo que
   * el API no manda no aparece: no se inventa ninguno, y las etiquetas son las
   * suyas (`agingEtiquetas`), no una lista escrita aquí.
   */
  const tramos: ScaleItem[] = useMemo(() => {
    if (!data) return [];
    const presentes = ORDEN_AGING.filter((b) => data.aging[b] != null);
    const base =
      data.totales.pendiente > 0
        ? data.totales.pendiente
        : presentes.reduce((s, b) => s + Math.abs(data.aging[b].monto), 0);
    if (presentes.every((b) => data.aging[b].documentos === 0)) return [];
    return presentes.map((b) => {
      const tramo = data.aging[b];
      const vacio = tramo.documentos === 0;
      return {
        key: b,
        label: data.agingEtiquetas[b] ?? b,
        value: <Money value={tramo.monto} compact bold={false} />,
        hint: vacio
          ? "sin facturas"
          : `${tramo.documentos} ${tramo.documentos === 1 ? "factura" : "facturas"}`,
        // El color solo entra donde hay algo que hacer; un tramo en cero nunca
        // se pinta de rojo aunque sea el de vencido.
        tone: vacio ? "mute" : b === "vencido" ? "danger" : b === "hoy" ? "warning" : "mute",
        share: base > 0 ? Math.abs(tramo.monto) / base : undefined,
      };
    });
  }, [data]);

  const hayFiltros =
    !!q.trim() || estado !== "abiertas" || !!aging || !!contraparte || !!proyecto || !!desde || !!hasta;

  function limpiar() {
    setQ("");
    setEstado("abiertas");
    setAging("");
    setContraparte("");
    setProyecto("");
    setDesde("");
    setHasta("");
  }

  async function registrarPago() {
    if (pagoEnVueloRef.current) return;
    setIntentado(true);
    if (!detalle) {
      setErrorPago("La factura ya no está abierta. Ciérrala y vuelve a entrar.");
      return;
    }
    const monto = Number(pago.amount);
    // El motivo se queda bajo el campo (`errorMonto`), no en un toast que se
    // va: el formulario sigue abierto y hay que poder releer qué falta.
    if (!Number.isFinite(monto) || monto <= 0) return;
    if (monto > detalle.saldo.pendiente + 0.01) return;
    if (!pago.paymentDate) return;
    pagoEnVueloRef.current = true;
    setGuardandoPago(true);
    setErrorPago(null);
    try {
      await erpFetch(`accounting/invoices/${detalle.factura.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount: monto,
          paymentDate: pago.paymentDate,
          method: pago.method,
          reference: pago.reference.trim() || undefined,
          notes: pago.notes.trim() || undefined,
        }),
      });
      toast.success(
        `${esCobrar ? "Cobro" : "Pago"} de ${pesos(monto, 2)} registrado en ${detalle.factura.folio}`,
      );
      setFormPago(false);
      setIntentado(false);
      setPago({ amount: "", paymentDate: hoyIso(), method: "SPEI", reference: "", notes: "" });
      const refrescado = await erpFetch<Detalle>(
        `accounting/workspace/${kind}/${detalle.factura.id}`,
        token,
      );
      setDetalle(refrescado);
      await cargar();
      if (!esCobrar) await cargarCalendario();
    } catch (e) {
      // El formulario NO se cierra: si se cerrara, el capturista no sabría si
      // el dinero quedó aplicado y volvería a capturarlo.
      setErrorPago(
        `No se pudo registrar el ${esCobrar ? "cobro" : "pago"}. ${formatApiError(e)}`,
      );
    } finally {
      pagoEnVueloRef.current = false;
      setGuardandoPago(false);
    }
  }

  const columnas: Column<Fila>[] = [
    {
      key: "contraparte",
      label: etiquetaContraparte,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.contraparte.nombre}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {r.folio}
            {r.contraparte.rfc ? ` · ${r.contraparte.rfc}` : ""}
            {r.moneda && r.moneda !== "MXN" ? ` · ${r.moneda}` : ""}
          </div>
          {/* Angosto: lo que se quitó de columnas baja aquí, bajo el concepto,
              en vez de empujar la tabla a un scroll horizontal. */}
          {esAngosto && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              {[
                r.proyecto ? r.proyecto.nombre : "Sin proyecto",
                `emitida ${fechaCorta(r.emision)}`,
                `vence ${fechaCorta(r.vencimiento)}`,
                r.pagado > 0 ? `pagado ${pesos(r.pagado)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      ),
    },
    ...(esAngosto
      ? []
      : ([
          {
            key: "proyecto",
            label: "Proyecto",
            render: (r: Fila) =>
              r.proyecto ? (
                <span style={{ fontSize: 12 }}>{r.proyecto.nombre}</span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin proyecto</span>
              ),
          },
          {
            key: "emision",
            label: "Emisión",
            render: (r: Fila) => (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fechaCorta(r.emision)}</span>
            ),
          },
          {
            key: "vencimiento",
            label: "Vence",
            render: (r: Fila) => (
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: (r.diasVencido ?? -1) > 0 ? "var(--danger)" : undefined,
                }}
              >
                {fechaCorta(r.vencimiento)}
              </span>
            ),
          },
        ] as Column<Fila>[])),
    {
      key: "dias",
      label: "Vencida",
      align: "right",
      numeric: true,
      width: 92,
      render: (r) => <DiasVencido dias={r.diasVencido} />,
    },
    {
      key: "monto",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (r) => <Money value={r.monto} bold={false} />,
    },
    ...(esAngosto
      ? []
      : ([
          {
            key: "pagado",
            label: "Pagado",
            align: "right",
            numeric: true,
            render: (r: Fila) =>
              r.pagado > 0 ? (
                <Money value={r.pagado} bold={false} />
              ) : (
                <span style={{ color: "var(--text-tertiary)" }}>—</span>
              ),
          },
        ] as Column<Fila>[])),
    {
      key: "pendiente",
      label: "Pendiente",
      align: "right",
      numeric: true,
      render: (r) => <Money value={r.pendiente} />,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => (
        <StatusDot
          label={r.estadoEtiqueta}
          tone={TONO_ESTADO[r.estadoTono] ?? "neutral"}
          title={textoDias(r.diasVencido)}
        />
      ),
    },
  ];

  const saldoAbierto = detalle?.saldo.pendiente ?? 0;
  const puedePagar = !!detalle && saldoAbierto > 0.009 && !detalle.factura.cancelada;

  /**
   * El mismo criterio que aplica `registrarPago`, bajo el campo. Mientras no
   * se ha intentado guardar, el campo vacío se queda callado —no se regaña a
   * nadie por no haber escrito todavía—; en cuanto se pulsa Guardar, el vacío
   * también responde, porque antes ese caso no decía nada en el formulario.
   */
  const errorMonto = (() => {
    if (!detalle) return null;
    if (pago.amount.trim() === "") {
      return intentado ? "Escribe cuánto se está pagando." : null;
    }
    const monto = Number(pago.amount);
    if (!Number.isFinite(monto) || monto <= 0) return "Escribe un monto mayor a cero.";
    if (monto > detalle.saldo.pendiente + 0.01) {
      return `El monto supera el saldo pendiente (${pesos(detalle.saldo.pendiente, 2)}).`;
    }
    return null;
  })();

  const errorFecha =
    intentado && !pago.paymentDate ? "Elige el día en que se movió el dinero." : null;

  const totales = data?.totales;
  const vencido = totales?.vencido ?? 0;
  const documentosVencidos = data ? (data.aging.vencido?.documentos ?? 0) : 0;

  /** Tres cifras y de qué se componen. El adorno se queda fuera. */
  const metricas: Metric[] = [
    {
      label: esCobrar ? "Por cobrar" : "Por pagar",
      value: cargando ? "…" : <Money value={totales?.pendiente ?? 0} />,
      hint: cargando
        ? "leyendo la cartera"
        : `de ${(totales?.total ?? 0).toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
            maximumFractionDigits: 0,
          })} facturados`,
    },
    {
      label: "Vencido",
      value: cargando ? "…" : <Money value={vencido} />,
      tone: vencido > 0 ? "danger" : "default",
      hint: cargando
        ? "…"
        : vencido > 0
          ? `${documentosVencidos} ${documentosVencidos === 1 ? "factura pasada" : "facturas pasadas"} de fecha`
          : "nada pasado de fecha",
    },
    {
      label: "Documentos",
      value: cargando ? "…" : String(totales?.documentos ?? 0),
      hint: cargando
        ? "…"
        : `${esCobrar ? "cobrado" : "pagado"} ${(totales?.pagado ?? 0).toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
            maximumFractionDigits: 0,
          })}`,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title={title}
        subtitle={subtitle}
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void cargar()} disabled={cargando}>
            Actualizar
          </Button>
        }
      />

      {/* Totales — una tira de cifras, no una pared de tarjetas */}
      <div style={{ marginBottom: 12 }}>
        <MetricStrip ariaLabel="Resumen de la cartera" metrics={metricas} />
      </div>

      {/* Antigüedad — la escala compartida: se lee de izquierda a derecha y filtra */}
      {tramos.length > 0 && (
        <div>
          <FilterScale
            ariaLabel="Antigüedad de saldos"
            items={tramos}
            active={aging}
            onSelect={(clave) => setAging(clave as AgingBucket | "")}
            minCellWidth={128}
          />
          {aging !== "" && (
            <button
              type="button"
              onClick={() => setAging("")}
              style={{
                margin: "-8px 0 14px",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--primary)",
                cursor: "pointer",
              }}
            >
              Ver toda la cartera
            </button>
          )}
        </div>
      )}

      {!esCobrar && (
        <CalendarioCxP
          calendario={calendario}
          error={errorCalendario}
          ventana={ventana}
          onVentana={setVentana}
          onReintentar={() => void cargarCalendario()}
        />
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{
            value: q,
            onChange: setQ,
            placeholder: `Buscar ${etiquetaContraparte.toLowerCase()}, folio, RFC o UUID…`,
          }}
          dates={[
            { label: "Emitidas desde", value: desde, onChange: setDesde },
            { label: "Hasta", value: hasta, onChange: setHasta },
          ]}
          selects={[
            {
              label: "Estado",
              value: estado,
              onChange: setEstado,
              options: ESTADOS,
              allowAll: false,
            },
            {
              label: etiquetaContraparte,
              value: contraparte,
              onChange: setContraparte,
              options: (data?.filtros.contrapartes ?? []).map((c) => ({
                value: String(c.id),
                label: c.nombre,
              })),
              allowAll: true,
              allLabel: `Todos los ${etiquetaContraparte.toLowerCase()}s`,
            },
            {
              label: "Proyecto",
              value: proyecto,
              onChange: setProyecto,
              options: (data?.filtros.proyectos ?? []).map((p) => ({
                value: String(p.id),
                label: p.nombre,
              })),
              allowAll: true,
              allLabel: "Todos los proyectos",
            },
          ]}
          onClear={hayFiltros ? limpiar : undefined}
          resultCount={data?.rows.length ?? null}
        />
      </div>

      {error && (
        <InlineAlert
          variant="danger"
          message={`No se pudo cargar la cartera. ${error}`}
        />
      )}
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Button size="sm" variant="secondary" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      )}

      {data?.meta.truncado && (
        <InlineAlert
          variant="warning"
          message={`Se muestran ${data.rows.length} de ${data.meta.total} documentos: hay más de los que caben en un barrido. Acota el periodo para que los totales sean exactos.`}
        />
      )}

      {cargando ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
          {token ? "Cargando la cartera…" : "Esperando la sesión para pedir la cartera…"}
        </p>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title={hayFiltros ? "Sin resultados con estos filtros" : emptyTitle}
          description={
            hayFiltros
              ? "Prueba a quitar el tramo de antigüedad, ampliar el periodo o limpiar la búsqueda."
              : emptyDescription
          }
          action={
            hayFiltros ? (
              <Button size="sm" variant="secondary" onClick={limpiar}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columnas}
          rows={data.rows}
          rowKey={(r) => r.id}
          density="compact"
          ariaLabel="Cartera por cobrar y pagar"
          onRowClick={(r) => void abrirDetalle(r)}
        />
      )}

      {/* Detalle */}
      <Modal
        open={!!abierta}
        onClose={() => {
          setAbierta(null);
          setDetalle(null);
          setFormPago(false);
        }}
        title={abierta ? `Factura ${abierta.folio}` : "Factura"}
        maxWidth={760}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setAbierta(null);
                setDetalle(null);
                setFormPago(false);
              }}
            >
              Cerrar
            </Button>
            {puedePagar && (
              <Button
                variant="primary"
                onClick={() => {
                  // El formulario abre limpio: sin el error del intento anterior.
                  setIntentado(false);
                  setErrorPago(null);
                  setFormPago(true);
                }}
              >
                {esCobrar ? "Registrar cobro" : "Registrar pago"}
              </Button>
            )}
          </div>
        }
      >
        {cargandoDetalle && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
            Abriendo la factura…
          </p>
        )}
        {errorDetalle && (
          <InlineAlert
            variant="danger"
            message={`No se pudo abrir el detalle. ${errorDetalle}`}
            action={
              abierta ? (
                <Button size="sm" variant="secondary" onClick={() => void abrirDetalle(abierta)}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        )}
        {detalle && (
          <DetalleFactura
            detalle={detalle}
            etiquetaContraparte={etiquetaContraparte}
            onDescargarXml={descargarXml}
            descargando={descargando}
            errorDescarga={errorDescarga}
            onCerrarErrorDescarga={() => setErrorDescarga(null)}
          />
        )}
      </Modal>

      {/* Registro de pago */}
      <Modal
        open={formPago}
        onClose={() => {
          setFormPago(false);
          setErrorPago(null);
          setIntentado(false);
        }}
        dirty={pago.amount.trim() !== "" || pago.reference.trim() !== "" || pago.notes.trim() !== ""}
        title={esCobrar ? "Registrar cobro" : "Registrar pago"}
        maxWidth={460}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setFormPago(false);
                setErrorPago(null);
                setIntentado(false);
              }}
              disabled={guardandoPago}
            >
              Cancelar
            </Button>
            {/* El botón NO se deshabilita por campos incompletos: un botón que
                no reacciona tampoco explica qué falta. Al pulsarlo, el campo
                que falla lo dice debajo. */}
            <Button variant="primary" loading={guardandoPago} onClick={() => void registrarPago()}>
              {guardandoPago ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        {detalle && (
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
            {errorPago && (
              <InlineAlert
                variant="danger"
                message={errorPago}
                style={{ marginBottom: 0 }}
                onDismiss={() => setErrorPago(null)}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--nx-panel-hairline, var(--border))",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Saldo pendiente de <strong>{detalle.factura.folio}</strong>
              </span>
              <Money value={detalle.saldo.pendiente} />
            </div>

            <FinanceFormGrid>
              <FinanceField
                label="Monto"
                hint="Pesos, con IVA incluido. No puede pasar del saldo pendiente."
                error={errorMonto}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pago.amount}
                  onChange={(e) => setPago((p) => ({ ...p, amount: e.target.value }))}
                  placeholder={detalle.saldo.pendiente.toFixed(2)}
                  aria-invalid={errorMonto ? true : undefined}
                  style={financeInputStyle}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPago((p) => ({ ...p, amount: detalle.saldo.pendiente.toFixed(2) }))
                  }
                  style={{
                    justifySelf: "start",
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--primary)",
                    cursor: "pointer",
                  }}
                >
                  Usar el saldo completo
                </button>
              </FinanceField>

              <FinanceField
                label="Fecha"
                hint="El día en que el dinero se movió, no el de captura."
                error={errorFecha}
              >
                <input
                  type="date"
                  value={pago.paymentDate}
                  onChange={(e) => setPago((p) => ({ ...p, paymentDate: e.target.value }))}
                  aria-invalid={errorFecha ? true : undefined}
                  style={financeInputStyle}
                />
              </FinanceField>

              <FinanceField label="Forma de pago">
                <select
                  value={pago.method}
                  onChange={(e) => setPago((p) => ({ ...p, method: e.target.value }))}
                  style={financeInputStyle}
                >
                  {METODOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </FinanceField>

              <FinanceField
                label="Referencia"
                optional
                hint="Folio del banco, clave de rastreo o número de cheque."
              >
                <input
                  value={pago.reference}
                  onChange={(e) => setPago((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Folio del banco, cheque, etc."
                  style={financeInputStyle}
                />
              </FinanceField>

              <FinanceField label="Nota" optional fullWidth hint="Queda en el historial de la factura.">
                <input
                  value={pago.notes}
                  onChange={(e) => setPago((p) => ({ ...p, notes: e.target.value }))}
                  style={financeInputStyle}
                />
              </FinanceField>
            </FinanceFormGrid>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

/**
 * Los días vencido son el dato que duele. Mientras la factura está en plazo el
 * número se queda gris y pequeño; en cuanto se pasa de fecha sube de peso y de
 * color, para que la columna se lea de un barrido.
 */
function DiasVencido({ dias }: { dias: number | null }) {
  if (dias === null) {
    return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin plazo</span>;
  }
  if (dias > 0) {
    return (
      <span
        title={textoDias(dias)}
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--state-danger-text, #b91c1c)",
          whiteSpace: "nowrap",
        }}
      >
        {dias} {dias === 1 ? "día" : "días"}
      </span>
    );
  }
  if (dias === 0) {
    return (
      <span
        title={textoDias(dias)}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--state-warning-text, #b45309)" }}
      >
        Hoy
      </span>
    );
  }
  return (
    <span
      title={textoDias(dias)}
      style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-tertiary)" }}
    >
      en {-dias} d
    </span>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{children}</div>
    </div>
  );
}

function CalendarioCxP({
  calendario,
  error,
  ventana,
  onVentana,
  onReintentar,
}: {
  calendario: Calendario | null;
  error: string | null;
  ventana: number;
  onVentana: (v: number) => void;
  onReintentar: () => void;
}) {
  if (error) {
    return (
      <Section title="Calendario de vencimientos" dense>
        <InlineAlert variant="warning" message={`No se pudo cargar el calendario. ${error}`} />
        <Button size="sm" variant="secondary" onClick={onReintentar}>
          Reintentar
        </Button>
      </Section>
    );
  }
  if (!calendario) {
    return (
      <Section title="Calendario de vencimientos" dense>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
          Armando el calendario…
        </p>
      </Section>
    );
  }

  const { resumen } = calendario;
  const vacio =
    resumen.vencido === 0 && resumen.enVentana === 0 && resumen.sinFecha === 0;

  return (
    <Section
      title="Calendario de vencimientos"
      subtitle={`Qué sale de caja del ${fechaLarga(calendario.desde)} al ${fechaLarga(
        calendario.hasta,
      )} · ${calendario.ventanaDias} días.`}
      dense
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          {[30, 60].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={ventana === v ? "secondary" : "ghost"}
              onClick={() => onVentana(v)}
            >
              {v} días
            </Button>
          ))}
        </div>
      }
    >
      {vacio ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
          No hay pagos comprometidos en la ventana. Nada urgente por aquí.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <MetricStrip
              ariaLabel="Qué sale de caja"
              metrics={[
                {
                  label: "Vencido",
                  value: <Money value={resumen.vencido} />,
                  tone: resumen.vencido > 0 ? "danger" : "default",
                  hint: resumen.vencido > 0 ? "ya debió salir" : "nada atrasado",
                },
                { label: "Hoy", value: <Money value={resumen.hoy} />, hint: "sale hoy" },
                {
                  label: "Próximos 7 días",
                  value: <Money value={resumen.proximos7} />,
                  hint: "esta semana",
                },
                {
                  label: "Próximos 30 días",
                  value: <Money value={resumen.proximos30} />,
                  hint: "el mes",
                },
              ]}
            />
          </div>

          {/* Lo vencido no es una cifra suelta: el API manda a quién se le
              debe y cuántos documentos son, y no se pintaba en ningún lado. */}
          {calendario.vencido.documentos > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--state-danger-border, var(--danger))",
                background: "var(--state-danger-bg, #fef2f2)",
                fontSize: 12.5,
                color: "var(--state-danger-text, #b91c1c)",
                lineHeight: 1.5,
              }}
            >
              <strong>
                {calendario.vencido.documentos}{" "}
                {calendario.vencido.documentos === 1 ? "factura vencida" : "facturas vencidas"}
              </strong>{" "}
              por {pesos(calendario.vencido.monto)}.
              {calendario.vencido.contrapartes.length > 0 && (
                <span style={{ color: "var(--text-secondary)" }}>
                  {" "}
                  {calendario.vencido.contrapartes
                    .slice(0, 3)
                    .map((c) => `${c.nombre} (${pesos(c.monto)})`)
                    .join(" · ")}
                  {calendario.vencido.contrapartes.length > 3
                    ? ` y ${calendario.vencido.contrapartes.length - 3} más`
                    : ""}
                </span>
              )}
            </div>
          )}

          {calendario.semanas.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {calendario.semanas.slice(0, 9).map((s) => (
                <li
                  key={s.semana}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 12,
                    alignItems: "baseline",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--nx-panel-hairline)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {s.etiqueta}{" "}
                      <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>
                        {fechaCorta(s.inicio)} – {fechaCorta(s.fin)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.contrapartes
                        .slice(0, 3)
                        .map((c) => c.nombre)
                        .join(" · ")}
                      {s.contrapartes.length > 3 ? ` y ${s.contrapartes.length - 3} más` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Money value={s.monto} />
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {s.documentos} {s.documentos === 1 ? "factura" : "facturas"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {calendario.semanas.length > 9 && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Se muestran las primeras 9 de {calendario.semanas.length} semanas de la ventana.
            </p>
          )}

          {(resumen.fueraDeVentana > 0 || resumen.sinFecha > 0) && (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
              {resumen.fueraDeVentana > 0 && (
                <>
                  Después de la ventana: <Money value={resumen.fueraDeVentana} compact bold={false} />
                  .{" "}
                </>
              )}
              {resumen.sinFecha > 0 && (
                <>
                  Sin fecha de vencimiento:{" "}
                  <Money value={resumen.sinFecha} compact bold={false} />.
                </>
              )}
            </p>
          )}
        </>
      )}
    </Section>
  );
}

function DetalleFactura({
  detalle,
  etiquetaContraparte,
  onDescargarXml,
  descargando,
  errorDescarga,
  onCerrarErrorDescarga,
}: {
  detalle: Detalle;
  etiquetaContraparte: string;
  onDescargarXml: (url: string, nombre: string) => void | Promise<void>;
  descargando: string | null;
  errorDescarga: string | null;
  onCerrarErrorDescarga: () => void;
}) {
  const { factura, contraparte, proyecto, pagos, saldo, documentos, historial, conceptos } = detalle;
  return (
    <div style={{ display: "grid", gap: 16, fontSize: 13 }}>
      {factura.cancelada && (
        <InlineAlert
          variant="warning"
          message={`Factura cancelada${factura.motivoCancelacion ? ` (motivo SAT ${factura.motivoCancelacion})` : ""}. No admite pagos.`}
          style={{ marginBottom: 0 }}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Dato etiqueta={etiquetaContraparte}>
          {contraparte.nombre}
          {contraparte.rfc && (
            <div style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {contraparte.rfc}
            </div>
          )}
        </Dato>
        <Dato etiqueta="Proyecto">
          {proyecto ? proyecto.nombre : <span style={{ fontWeight: 400 }}>Sin proyecto ligado</span>}
        </Dato>
        <Dato etiqueta="Estado">
          <StatusDot
            label={factura.estadoEtiqueta}
            tone={TONO_ESTADO[factura.estadoTono] ?? "neutral"}
          />
        </Dato>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        <Dato etiqueta="Emitida">{fechaLarga(factura.emision)}</Dato>
        <Dato etiqueta="Vence">
          {fechaLarga(factura.vencimiento)}
          <div style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {textoDias(factura.diasVencido)}
          </div>
        </Dato>
        <Dato etiqueta="Total">
          <Money value={saldo.total} />
        </Dato>
        <Dato etiqueta="Pendiente">
          <Money value={saldo.pendiente} />
        </Dato>
      </div>

      {saldo.total > 0 && (
        <div>
          <div
            aria-hidden="true"
            style={{
              height: 6,
              borderRadius: 999,
              background: "var(--surface-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${saldo.porcentajePagado}%`,
                height: "100%",
                background:
                  saldo.pendiente <= 0.009
                    ? "var(--state-success-text, #15803d)"
                    : "var(--text-secondary)",
                opacity: saldo.pendiente <= 0.009 ? 1 : 0.5,
              }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            {saldo.porcentajePagado}% cubierto · <Money value={saldo.pagado} compact bold={false} /> de{" "}
            <Money value={saldo.total} compact bold={false} />
          </div>
        </div>
      )}

      {/* Los datos fiscales del CFDI llegaban en el detalle y no se pintaban:
          sin UUID, forma y método de pago no se puede casar con el SAT. */}
      <Bloque titulo="Datos del comprobante">
        <div style={{ display: "grid", gap: 5 }}>
          <Linea
            etiqueta="UUID fiscal"
            valor={
              factura.uuid ? (
                <span style={{ fontFamily: "var(--nx-font-mono, monospace)", fontSize: 11.5 }}>
                  {factura.uuid}
                </span>
              ) : (
                <span style={{ color: "var(--text-tertiary)" }}>Sin timbrar</span>
              )
            }
          />
          <Linea etiqueta="Moneda" valor={factura.moneda} />
          <Linea etiqueta="Subtotal" valor={<Money value={factura.subtotal} bold={false} />} />
          <Linea etiqueta="Impuestos" valor={<Money value={factura.impuestos} bold={false} />} />
          <Linea etiqueta="Forma de pago" valor={factura.formaPago} />
          <Linea
            etiqueta="Método de pago"
            valor={
              factura.metodoPago
                ? (METODO_CFDI[factura.metodoPago] ?? factura.metodoPago)
                : null
            }
          />
          <Linea etiqueta="Uso del CFDI" valor={factura.usoCfdi} />
          {factura.match && <Linea etiqueta="Conciliación" valor={factura.match} />}
          {factura.notas && <Linea etiqueta="Notas" valor={factura.notas} />}
        </div>
      </Bloque>

      <Bloque titulo={`Pagos aplicados (${pagos.length})`}>
        {pagos.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>
            Todavía no hay pagos registrados sobre esta factura.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {pagos.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: "var(--surface-2)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{fechaLarga(p.fecha)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {[p.metodo, p.referencia, p.banco, p.registradoPor].filter(Boolean).join(" · ")}
                  </div>
                  {/* Clave de rastreo, complemento y nota: venían en cada pago
                      y no se enseñaban en ningún sitio. */}
                  {(p.claveRastreo || p.complementoUuid || p.notas) && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {[
                        p.claveRastreo ? `clave ${p.claveRastreo}` : null,
                        p.complementoUuid ? `complemento ${p.complementoUuid.slice(0, 8)}…` : null,
                        p.notas,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <Money value={p.monto} />
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {conceptos.length > 0 && (
        <Bloque titulo="Conceptos">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
            {conceptos.slice(0, 8).map((c) => (
              <li
                key={c.id}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10 }}
              >
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  {c.cantidad}
                  {c.unidad ? ` ${c.unidad}` : ""} × {c.descripcion}
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {" "}
                    · {pesos(c.precioUnitario, 2)} c/u
                  </span>
                </span>
                <Money value={c.total} bold={false} />
              </li>
            ))}
            {conceptos.length > 8 && (
              <li style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                y {conceptos.length - 8} concepto(s) más
              </li>
            )}
          </ul>
        </Bloque>
      )}

      <Bloque titulo="Documentos">
        {errorDescarga && (
          <InlineAlert
            variant="danger"
            message={errorDescarga}
            onDismiss={onCerrarErrorDescarga}
            style={{ marginBottom: 8 }}
          />
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {documentos.map((d) => {
            if (!d.disponible || !d.url) {
              return (
                <span key={d.tipo} style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  {d.tipo.toUpperCase()}: {d.nota ?? "no disponible"}
                </span>
              );
            }
            const externo = /^https?:\/\//i.test(d.url);
            if (externo) {
              return (
                <a
                  key={d.tipo}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12.5, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}
                >
                  Abrir {d.tipo.toUpperCase()} →
                </a>
              );
            }
            const bajando = descargando === d.url;
            return (
              <button
                key={d.tipo}
                type="button"
                onClick={() => void onDescargarXml(d.url as string, d.nombre)}
                disabled={bajando}
                aria-busy={bajando || undefined}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: bajando ? "var(--text-tertiary)" : "var(--primary)",
                  cursor: bajando ? "progress" : "pointer",
                }}
              >
                {bajando
                  ? `Descargando ${d.tipo.toUpperCase()}…`
                  : `Descargar ${d.tipo.toUpperCase()} →`}
              </button>
            );
          })}
        </div>
      </Bloque>

      <Bloque titulo="Historial">
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {historial.map((h, i) => (
            <li key={`${h.tipo}-${i}`} style={{ display: "grid", gap: 2 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{h.titulo}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {[
                  h.fecha ? fechaLarga(h.fecha.slice(0, 10)) : null,
                  h.usuario,
                  h.detalle,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </li>
          ))}
        </ol>
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-tertiary)",
        }}
      >
        {titulo}
      </h3>
      {children}
    </section>
  );
}
