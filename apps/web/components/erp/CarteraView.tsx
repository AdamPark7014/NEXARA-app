"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
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
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import Modal from "@/components/ui/Modal";
import { Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { withTenantHeaders } from "@/lib/tenant";
import {
  financeStatusLabel,
  paymentMethodLabel,
  satFormaPagoLabel,
  satMetodoPagoLabel,
  satMotivoCancelacionLabel,
  satUsoCfdiLabel,
} from "@/lib/finance-status-labels";
import { toast } from "@/components/Toast";
import s from "./CarteraView.module.css";
import { formatoFechaLocal } from "@/lib/fecha-calendario";

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

/**
 * Las formas de pago que admite el registro. El valor es el del contrato con
 * la API; la etiqueta sale del catálogo compartido, para que el desplegable y
 * la lista de pagos ya aplicados digan lo mismo.
 */
const METODOS_VALIDOS = [
  "SPEI",
  "BANK_TRANSFER",
  "CASH",
  "CHECK",
  "CREDIT_CARD",
  "CARD_DEBIT",
  "DOMICILIACION",
  "COMPENSATION",
  "OTHER",
] as const;

const METODOS: { value: string; label: string }[] = METODOS_VALIDOS.map((value) => ({
  value,
  label: paymentMethodLabel(value),
}));

/**
 * El tono que manda el API, traducido al vocabulario de `Badge`: punto y
 * palabra. Antes era texto en negritas de color, y con veinte renglones la
 * columna de estado competía con los montos.
 */
const TONO_ESTADO: Record<string, Tone> = {
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
  return formatoFechaLocal(iso, { day: "numeric", month: "long", year: "numeric" }, iso);
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
 * Un renglón «etiqueta: valor» para el detalle. Cuando el API no manda el dato
 * se escribe «—»: ni se esconde el renglón ni se rellena con una suposición.
 */
function Linea({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  // `valor || "—"` convertiría un 0 legítimo en un guion; aquí solo se
  // sustituye lo que de verdad falta.
  const vacio = valor === null || valor === undefined || valor === "";
  return (
    <div className={s.linea}>
      <span className={s.tenue}>{etiqueta}</span>
      <span className={s.lineaValor}>
        {vacio ? <span className={s.tenue}>—</span> : valor}
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
  emptyAction,
}: {
  kind: CarteraKind;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  /**
   * Qué hacer cuando no hay ni una factura. Un vacío sin salida obliga a
   * adivinar de dónde sale el primer renglón; con esto la pantalla lo dice.
   */
  emptyAction?: ReactNode;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const esCobrar = kind === "cxc";
  const etiquetaContraparte = esCobrar ? "Cliente" : "Proveedor";
  /** «Todos los proveedors» salía de pegarle una s al singular. */
  const etiquetaContrapartePlural = esCobrar ? "clientes" : "proveedores";

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
          headers: withTenantHeaders({ Authorization: `Bearer ${token}` }),
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
  const tramos = useMemo(() => {
    if (!data) return [];
    const presentes = ORDEN_AGING.filter((b) => data.aging[b] != null);
    if (presentes.every((b) => data.aging[b].documentos === 0)) return [];
    return presentes.map((b) => {
      const tramo = data.aging[b];
      const vacio = tramo.documentos === 0;
      return {
        key: b,
        label: data.agingEtiquetas[b] ?? b,
        monto: tramo.monto,
        documentos: tramo.documentos,
        hint: vacio
          ? "sin facturas"
          : `${tramo.documentos} ${tramo.documentos === 1 ? "factura" : "facturas"}`,
        // El color solo entra donde hay algo que hacer; un tramo en cero nunca
        // se pinta de rojo aunque sea el de vencido.
        dot: (vacio ? undefined : b === "vencido" ? "danger" : b === "hoy" ? "warning" : undefined) as
          | Tone
          | undefined,
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
      const msg = "La factura ya no está abierta. Ciérrala y vuelve a entrar.";
      setErrorPago(msg);
      toast.error(msg);
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
      try {
        const refrescado = await erpFetch<Detalle>(
          `accounting/workspace/${kind}/${detalle.factura.id}`,
          token,
        );
        setDetalle(refrescado);
        await cargar();
        if (!esCobrar) await cargarCalendario();
      } catch (refreshErr) {
        toast.warning(
          `El ${esCobrar ? "cobro" : "pago"} quedó registrado, pero no se pudo refrescar la vista. ${formatApiError(refreshErr)} Actualiza la página.`,
        );
      }
    } catch (e) {
      // El formulario NO se cierra: si se cerrara, el capturista no sabría si
      // el dinero quedó aplicado y volvería a capturarlo.
      const msg = `No se pudo registrar el ${esCobrar ? "cobro" : "pago"}. ${formatApiError(e)}`;
      setErrorPago(msg);
      toast.error(msg);
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
          <div className={s.nombre}>{r.contraparte.nombre}</div>
          <div className={s.sub}>
            {r.folio}
            {r.contraparte.rfc ? ` · ${r.contraparte.rfc}` : ""}
            {r.moneda && r.moneda !== "MXN" ? ` · ${r.moneda}` : ""}
          </div>
          {/* Angosto: lo que se quitó de columnas baja aquí, bajo el concepto,
              en vez de empujar la tabla a un scroll horizontal. */}
          {esAngosto && (
            <div className={`${s.sub} ${s.subAngosto}`}>
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
                <span className={s.proyecto}>{r.proyecto.nombre}</span>
              ) : (
                <span className={`${s.proyecto} ${s.tenue}`}>Sin proyecto</span>
              ),
          },
          {
            key: "emision",
            label: "Emisión",
            render: (r: Fila) => <span className={s.fecha}>{fechaCorta(r.emision)}</span>,
          },
          {
            key: "vencimiento",
            label: "Vence",
            render: (r: Fila) => (
              <span className={(r.diasVencido ?? -1) > 0 ? s.fechaVencida : s.fecha}>
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
              r.pagado > 0 ? <Money value={r.pagado} bold={false} /> : <span className={s.tenue}>—</span>,
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
        <Badge dot size="sm" tone={TONO_ESTADO[r.estadoTono] ?? "neutral"} title={textoDias(r.diasVencido)}>
          {r.estadoEtiqueta}
        </Badge>
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

  const placeholderBusqueda = `Buscar ${etiquetaContraparte.toLowerCase()}, folio, RFC o folio fiscal…`;

  return (
    <MesaPagina
      titulo={title}
      descripcion={subtitle}
      terciarias={
        <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
          Actualizar
        </Button>
      }
    >
      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={s.aviso}
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudo cargar la cartera. ${error} Reintenta; si sigue igual, avisa a soporte.`}
        </Alert>
      )}

      {data?.meta.truncado && (
        <Alert tone="warning" role="alert" className={s.aviso}>
          {`Se muestran ${data.rows.length} de ${data.meta.total} facturas: no caben todas de una vez, así que los totales de arriba solo cubren lo que se ve. Acota el periodo o filtra para que cuadren.`}
        </Alert>
      )}

      {/* Totales — una tira de cifras, no una pared de tarjetas.
          Tres cifras y de qué se componen; el adorno se queda fuera.
          Con cero facturas no se pinta: una fila de ceros no informa y le quita
          el sitio al vacío, que sí dice de dónde sale el primer renglón. */}
      {data && data.rows.length > 0 ? (
        <StatRow variant="strip" ariaLabel="Resumen de la cartera">
          <Stat
            label={esCobrar ? "Por cobrar" : "Por pagar"}
            icon={esCobrar ? <PaymentsOutlinedIcon /> : <ReceiptOutlinedIcon />}
            iconTone="neutral"
            value={cargando ? "…" : <Money value={totales?.pendiente ?? 0} />}
            hint={
              cargando
                ? "leyendo la cartera"
                : `de ${(totales?.total ?? 0).toLocaleString("es-MX", {
                    style: "currency",
                    currency: "MXN",
                    maximumFractionDigits: 0,
                  })} facturados`
            }
          />
          <Stat
            label="Vencido"
            icon={<EventBusyOutlinedIcon />}
            iconTone="neutral"
            value={cargando ? "…" : <Money value={vencido} />}
            tone={vencido > 0 ? "danger" : "default"}
            hint={
              cargando
                ? "…"
                : vencido > 0
                  ? `${documentosVencidos} ${documentosVencidos === 1 ? "factura pasada" : "facturas pasadas"} de fecha`
                  : "nada pasado de fecha"
            }
          />
          <Stat
            label="Facturas"
            icon={<ReceiptLongOutlinedIcon />}
            iconTone="neutral"
            value={cargando ? "…" : String(totales?.documentos ?? 0)}
            hint={
              cargando
                ? "…"
                : `${esCobrar ? "cobrado" : "pagado"} ${(totales?.pagado ?? 0).toLocaleString("es-MX", {
                    style: "currency",
                    currency: "MXN",
                    maximumFractionDigits: 0,
                  })}`
            }
          />
        </StatRow>
      ) : null}

      {!esCobrar && (
        <CalendarioCxP
          calendario={calendario}
          error={errorCalendario}
          ventana={ventana}
          onVentana={setVentana}
          onReintentar={() => void cargarCalendario()}
          aging={aging}
          onAging={setAging}
        />
      )}

      <ListCard
        className={s.tarjeta}
        listLabel={esCobrar ? "Facturas por cobrar" : "Facturas por pagar"}
        toolbar={
          <>
            <ModuleToolbar
              className={s.herramientas}
              search={
                <SearchInput
                  aria-label={placeholderBusqueda}
                  placeholder={placeholderBusqueda}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              }
              end={
                <>
                  {hayFiltros ? <LinkButton onClick={limpiar}>Limpiar</LinkButton> : null}
                  {data ? (
                    <span role="status" className={s.conteo}>
                      {data.rows.length} resultado{data.rows.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </>
              }
            >
              <label className={s.campoFecha}>
                <span>Emitidas desde</span>
                <DateInput
                  aria-label="Emitidas desde"
                  className={s.filtroFecha}
                  controlSize="sm"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>
              <label className={s.campoFecha}>
                <span>Hasta</span>
                <DateInput
                  aria-label="Hasta"
                  className={s.filtroFecha}
                  controlSize="sm"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>
              <Select
                aria-label="Estado"
                title="Estado"
                wrapperClassName={s.filtroSelect}
                controlSize="sm"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                {ESTADOS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={etiquetaContraparte}
                title={etiquetaContraparte}
                wrapperClassName={s.filtroSelect}
                controlSize="sm"
                value={contraparte}
                onChange={(e) => setContraparte(e.target.value)}
              >
                <option value="">{`Todos los ${etiquetaContrapartePlural}`}</option>
                {(data?.filtros.contrapartes ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Proyecto"
                title="Proyecto"
                wrapperClassName={s.filtroSelect}
                controlSize="sm"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
              >
                <option value="">Todos los proyectos</option>
                {(data?.filtros.proyectos ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </ModuleToolbar>

            {/* Antigüedad — la escala compartida: se lee de izquierda a derecha y filtra */}
            {tramos.length > 0 && (
              <div className={s.filaTramos}>
                <FilterChips ariaLabel="Antigüedad de saldos">
                  {tramos.map((t) => (
                    <FilterChip
                      key={t.key}
                      active={aging === t.key}
                      count={t.documentos}
                      dot={t.dot}
                      title={t.hint}
                      onClick={() => setAging(aging === t.key ? "" : t.key)}
                    >
                      {t.label}
                      <span className={s.tramoMonto}>
                        <Money value={t.monto} compact bold={false} />
                      </span>
                    </FilterChip>
                  ))}
                </FilterChips>
                {aging !== "" && <LinkButton onClick={() => setAging("")}>Ver toda la cartera</LinkButton>}
              </div>
            )}
          </>
        }
        empty={!cargando && (!data || data.rows.length === 0)}
        emptyState={{
          icon: hayFiltros ? <FilterAltOffOutlinedIcon /> : <ReceiptLongOutlinedIcon />,
          title: hayFiltros ? "Sin resultados con estos filtros" : emptyTitle,
          description: hayFiltros
            ? "Prueba a quitar el tramo de antigüedad, ampliar el periodo o limpiar la búsqueda."
            : emptyDescription,
          action: hayFiltros ? (
            <Button size="sm" onClick={limpiar}>
              Limpiar filtros
            </Button>
          ) : (
            emptyAction
          ),
          tone: "neutral",
        }}
      >
        {cargando ? (
          <div className={s.cargando}>
            <SkeletonRows rows={5} />
            <p className={s.cargandoTexto} aria-busy="true">
              {token ? "Cargando la cartera…" : "Esperando la sesión para pedir la cartera…"}
            </p>
          </div>
        ) : data ? (
          <DataTable
            flush
            columns={columnas}
            rows={data.rows}
            rowKey={(r) => r.id}
            density="compact"
            ariaLabel="Cartera por cobrar y pagar"
            onRowClick={(r) => void abrirDetalle(r)}
          />
        ) : null}
      </ListCard>

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
          <div className={s.pie}>
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
          <p className={s.cargandoTexto} aria-busy="true">
            Abriendo la factura…
          </p>
        )}
        {errorDetalle && (
          <Alert
            tone="danger"
            role="alert"
            className={s.aviso}
            action={
              abierta ? (
                <Button size="sm" onClick={() => void abrirDetalle(abierta)}>
                  Reintentar
                </Button>
              ) : undefined
            }
          >
            {`No se pudo abrir el detalle. ${errorDetalle}`}
          </Alert>
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
          <div className={s.pie}>
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
          <div className={s.formPago}>
            {errorPago && (
              <Alert tone="danger" role="alert" className={s.aviso} onDismiss={() => setErrorPago(null)}>
                {errorPago}
              </Alert>
            )}
            <div className={s.saldoPendiente}>
              <span className={s.saldoEtiqueta}>
                Saldo pendiente de <strong>{detalle.factura.folio}</strong>
              </span>
              <Money value={detalle.saldo.pendiente} />
            </div>

            <FieldGrid>
              <Field
                label="Monto"
                hint="Pesos, con IVA incluido. No puede pasar del saldo pendiente."
                error={errorMonto}
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pago.amount}
                  onChange={(e) => setPago((p) => ({ ...p, amount: e.target.value }))}
                  placeholder={detalle.saldo.pendiente.toFixed(2)}
                  aria-invalid={errorMonto ? true : undefined}
                />
                <LinkButton
                  className={s.usarSaldo}
                  onClick={() =>
                    setPago((p) => ({ ...p, amount: detalle.saldo.pendiente.toFixed(2) }))
                  }
                >
                  Usar el saldo completo
                </LinkButton>
              </Field>

              <Field
                label="Fecha"
                hint="El día en que el dinero se movió, no el de captura."
                error={errorFecha}
              >
                <DateInput
                  value={pago.paymentDate}
                  onChange={(e) => setPago((p) => ({ ...p, paymentDate: e.target.value }))}
                  aria-invalid={errorFecha ? true : undefined}
                />
              </Field>

              <Field label="Forma de pago">
                <Select
                  value={pago.method}
                  onChange={(e) => setPago((p) => ({ ...p, method: e.target.value }))}
                >
                  {METODOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Referencia"
                optional
                hint="Folio del banco, clave de rastreo o número de cheque."
              >
                <Input
                  value={pago.reference}
                  onChange={(e) => setPago((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Folio del banco, cheque, etc."
                />
              </Field>

              <Field label="Nota" optional fullWidth hint="Queda en el historial de la factura.">
                <Input
                  value={pago.notes}
                  onChange={(e) => setPago((p) => ({ ...p, notes: e.target.value }))}
                />
              </Field>
            </FieldGrid>
          </div>
        )}
      </Modal>
    </MesaPagina>
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
    return <span className={s.sinPlazo}>Sin plazo</span>;
  }
  if (dias > 0) {
    return (
      <span title={textoDias(dias)} className={s.diasMal}>
        {dias} {dias === 1 ? "día" : "días"}
      </span>
    );
  }
  if (dias === 0) {
    return (
      <span title={textoDias(dias)} className={s.diasHoy}>
        Hoy
      </span>
    );
  }
  return (
    <span title={textoDias(dias)} className={s.diasEnPlazo}>
      en {-dias} {-dias === 1 ? "día" : "días"}
    </span>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={s.datoEtiqueta}>{etiqueta}</div>
      <div className={s.datoValor}>{children}</div>
    </div>
  );
}

function CalendarioCxP({
  calendario,
  error,
  ventana,
  onVentana,
  onReintentar,
  aging,
  onAging,
}: {
  calendario: Calendario | null;
  error: string | null;
  ventana: number;
  onVentana: (v: number) => void;
  onReintentar: () => void;
  aging: AgingBucket | "";
  onAging: (v: AgingBucket | "") => void;
}) {
  if (error) {
    return (
      <Card className={s.tarjeta}>
        <CardHead title="Calendario de vencimientos" />
        <div className={s.cuerpo}>
          <Alert
            tone="warning"
            role="alert"
            className={s.aviso}
            action={
              <Button size="sm" onClick={onReintentar}>
                Reintentar
              </Button>
            }
          >
            {`No se pudo cargar el calendario. ${error}`}
          </Alert>
        </div>
      </Card>
    );
  }
  if (!calendario) {
    return (
      <Card className={s.tarjeta}>
        <CardHead title="Calendario de vencimientos" />
        <div className={s.cuerpo}>
          <p className={`${s.parrafo} ${s.tenue}`} aria-busy="true">
            Armando el calendario…
          </p>
        </div>
      </Card>
    );
  }

  const { resumen } = calendario;
  const vacio =
    resumen.vencido === 0 && resumen.enVentana === 0 && resumen.sinFecha === 0;

  const escalaCaja: {
    key: AgingBucket;
    label: string;
    monto: number;
    hint: string;
    dot?: Tone;
  }[] = [
    {
      key: "vencido",
      label: "Vencido",
      monto: resumen.vencido,
      hint: resumen.vencido > 0 ? "ya debió salir" : "nada atrasado",
      dot: resumen.vencido > 0 ? "danger" : undefined,
    },
    {
      key: "hoy",
      label: "Hoy",
      monto: resumen.hoy,
      hint: "sale hoy",
      dot: resumen.hoy > 0 ? "warning" : undefined,
    },
    {
      key: "proximos7",
      label: "Próximos 7 días",
      monto: resumen.proximos7,
      hint: "esta semana",
    },
    {
      key: "proximos30",
      label: "Próximos 30 días",
      monto: resumen.proximos30,
      hint: "el mes",
    },
  ];

  return (
    <Card className={s.tarjeta}>
      <CardHead
        title="Calendario de vencimientos"
        subtitle={`Qué sale de caja del ${fechaLarga(calendario.desde)} al ${fechaLarga(
          calendario.hasta,
        )} · ${calendario.ventanaDias} días.`}
        actions={
          <div className={s.acciones}>
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
      />
      <div className={s.cuerpo}>
        {vacio ? (
          <p className={s.parrafo}>
            No hay pagos comprometidos en la ventana. Nada urgente por aquí.
          </p>
        ) : (
          <>
            <FilterChips ariaLabel="Qué sale de caja">
              {escalaCaja.map((t) => (
                <FilterChip
                  key={t.key}
                  active={aging === t.key}
                  dot={t.dot}
                  title={t.hint}
                  onClick={() => onAging(aging === t.key ? "" : t.key)}
                >
                  {t.label}
                  <span className={s.tramoMonto}>
                    <Money value={t.monto} bold={false} />
                  </span>
                </FilterChip>
              ))}
            </FilterChips>

            {/* Lo vencido no es una cifra suelta: el API manda a quién se le
                debe y cuántos documentos son, y no se pintaba en ningún lado. */}
            {calendario.vencido.documentos > 0 && (
              <Alert tone="danger" dense className={s.aviso}>
                <strong>
                  {calendario.vencido.documentos}{" "}
                  {calendario.vencido.documentos === 1 ? "factura vencida" : "facturas vencidas"}
                </strong>{" "}
                por {pesos(calendario.vencido.monto)}.
                {calendario.vencido.contrapartes.length > 0 && (
                  <span className={s.vencidoQuien}>
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
              </Alert>
            )}

            {calendario.semanas.length > 0 && (
              <ul className={s.semanas}>
                {calendario.semanas.slice(0, 9).map((sem) => (
                  <li key={sem.semana} className={s.semana}>
                    <div className={s.semanaTexto}>
                      <div className={s.semanaTitulo}>
                        {sem.etiqueta}{" "}
                        <span className={s.semanaRango}>
                          {fechaCorta(sem.inicio)} – {fechaCorta(sem.fin)}
                        </span>
                      </div>
                      <div className={s.semanaQuien}>
                        {sem.contrapartes
                          .slice(0, 3)
                          .map((c) => c.nombre)
                          .join(" · ")}
                        {sem.contrapartes.length > 3 ? ` y ${sem.contrapartes.length - 3} más` : ""}
                      </div>
                    </div>
                    <div className={s.semanaMonto}>
                      <Money value={sem.monto} />
                      <div className={s.semanaDocs}>
                        {sem.documentos} {sem.documentos === 1 ? "factura" : "facturas"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {calendario.semanas.length > 9 && (
              <p className={s.nota}>
                Se muestran las primeras 9 de {calendario.semanas.length} semanas de la ventana.
              </p>
            )}

            {(resumen.fueraDeVentana > 0 || resumen.sinFecha > 0) && (
              <p className={s.nota}>
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
      </div>
    </Card>
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
    <div className={s.detalle}>
      {factura.cancelada && (
        <Alert tone="warning" role="alert" className={s.aviso}>
          {`Factura cancelada${
            satMotivoCancelacionLabel(factura.motivoCancelacion)
              ? `: ${satMotivoCancelacionLabel(factura.motivoCancelacion)}`
              : ""
          }. Ya no admite pagos ni cobros.`}
        </Alert>
      )}

      <div className={s.datos}>
        <Dato etiqueta={etiquetaContraparte}>
          {contraparte.nombre}
          {contraparte.rfc && <div className={s.datoSub}>{contraparte.rfc}</div>}
        </Dato>
        <Dato etiqueta="Proyecto">
          {proyecto ? proyecto.nombre : <span className={s.datoNormal}>Sin proyecto ligado</span>}
        </Dato>
        <Dato etiqueta="Estado">
          <Badge dot tone={TONO_ESTADO[factura.estadoTono] ?? "neutral"}>
            {factura.estadoEtiqueta}
          </Badge>
        </Dato>
      </div>

      <div className={`${s.datos} ${s.datosCortos}`}>
        <Dato etiqueta="Emitida">{fechaLarga(factura.emision)}</Dato>
        <Dato etiqueta="Vence">
          {fechaLarga(factura.vencimiento)}
          <div className={s.datoSub}>{textoDias(factura.diasVencido)}</div>
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
          <div aria-hidden="true" className={s.barra}>
            <div
              className={`${s.barraRelleno} ${saldo.pendiente <= 0.009 ? s.barraRellenoPagada : ""}`}
              style={{ width: `${saldo.porcentajePagado}%` }}
            />
          </div>
          <div className={s.cubierto}>
            {saldo.porcentajePagado}% cubierto · <Money value={saldo.pagado} compact bold={false} /> de{" "}
            <Money value={saldo.total} compact bold={false} />
          </div>
        </div>
      )}

      {/* Los datos fiscales del CFDI llegaban en el detalle y no se pintaban:
          sin UUID, forma y método de pago no se puede casar con el SAT. */}
      <Bloque titulo="Datos del comprobante">
        <div className={s.lineas}>
          <Linea
            etiqueta="Folio fiscal"
            valor={
              factura.uuid ? (
                <span className={s.uuid}>{factura.uuid}</span>
              ) : (
                <span className={s.tenue}>Sin timbrar</span>
              )
            }
          />
          <Linea etiqueta="Moneda" valor={factura.moneda} />
          <Linea etiqueta="Subtotal" valor={<Money value={factura.subtotal} bold={false} />} />
          <Linea etiqueta="Impuestos" valor={<Money value={factura.impuestos} bold={false} />} />
          {/* Las tres claves del SAT llegaban crudas —«03», «PPD», «G03»— y
              solo las reconoce quien las escribió. Se pintan con su
              significado al lado; si la clave no está en el catálogo se deja
              tal cual, sin inventar. */}
          <Linea
            etiqueta="Cómo se paga"
            valor={factura.formaPago ? satFormaPagoLabel(factura.formaPago) : null}
          />
          <Linea
            etiqueta="Cuándo se paga"
            valor={factura.metodoPago ? satMetodoPagoLabel(factura.metodoPago) : null}
          />
          <Linea
            etiqueta="Para qué se usa"
            valor={factura.usoCfdi ? satUsoCfdiLabel(factura.usoCfdi) : null}
          />
          {factura.match && <Linea etiqueta="Conciliación" valor={financeStatusLabel(factura.match)} />}
          {factura.notas && <Linea etiqueta="Notas" valor={factura.notas} />}
        </div>
      </Bloque>

      <Bloque titulo={`Pagos aplicados (${pagos.length})`}>
        {pagos.length === 0 ? (
          <p className={s.parrafo}>Todavía no hay pagos registrados sobre esta factura.</p>
        ) : (
          <ul className={s.pagos}>
            {pagos.map((p) => (
              <li key={p.id} className={s.pago}>
                <div className={s.pagoTexto}>
                  <div className={s.pagoFecha}>{fechaLarga(p.fecha)}</div>
                  <div className={s.pagoMeta}>
                    {[
                      paymentMethodLabel(p.metodo),
                      p.referencia,
                      p.banco,
                      p.registradoPor,
                    ]
                      .filter((t) => Boolean(t) && t !== "—")
                      .join(" · ")}
                  </div>
                  {/* Clave de rastreo, complemento y nota: venían en cada pago
                      y no se enseñaban en ningún sitio. */}
                  {(p.claveRastreo || p.complementoUuid || p.notas) && (
                    <div className={s.pagoExtra}>
                      {[
                        p.claveRastreo ? `clave de rastreo ${p.claveRastreo}` : null,
                        p.complementoUuid
                          ? `complemento de pago ${p.complementoUuid.slice(0, 8)}…`
                          : null,
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
          <ul className={s.conceptos}>
            {conceptos.slice(0, 8).map((c) => (
              <li key={c.id} className={s.concepto}>
                <span className={s.conceptoTexto}>
                  {c.cantidad}
                  {c.unidad ? ` ${c.unidad}` : ""} × {c.descripcion}
                  <span className={s.tenue}>
                    {" "}
                    · {pesos(c.precioUnitario, 2)} c/u
                  </span>
                </span>
                <Money value={c.total} bold={false} />
              </li>
            ))}
            {conceptos.length > 8 && (
              <li className={s.masConceptos}>
                y {conceptos.length - 8}{" "}
                {conceptos.length - 8 === 1 ? "concepto más" : "conceptos más"}
              </li>
            )}
          </ul>
        </Bloque>
      )}

      <Bloque titulo="Documentos">
        {errorDescarga && (
          <Alert
            tone="danger"
            role="alert"
            className={`${s.aviso} ${s.avisoDoc}`}
            onDismiss={onCerrarErrorDescarga}
          >
            {errorDescarga}
          </Alert>
        )}
        <div className={s.documentos}>
          {documentos.map((d) => {
            if (!d.disponible || !d.url) {
              return (
                <span key={d.tipo} className={s.tenue}>
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
                  className={s.enlaceDoc}
                >
                  Abrir {d.tipo.toUpperCase()} →
                </a>
              );
            }
            const bajando = descargando === d.url;
            return (
              <LinkButton
                key={d.tipo}
                onClick={() => void onDescargarXml(d.url as string, d.nombre)}
                disabled={bajando}
                aria-busy={bajando || undefined}
                className={bajando ? s.docBajando : undefined}
              >
                {bajando
                  ? `Descargando ${d.tipo.toUpperCase()}…`
                  : `Descargar ${d.tipo.toUpperCase()} →`}
              </LinkButton>
            );
          })}
        </div>
      </Bloque>

      <Bloque titulo="Historial">
        <ol className={s.historial}>
          {historial.map((h, i) => (
            <li key={`${h.tipo}-${i}`} className={s.historialItem}>
              <div className={s.historialTitulo}>
                {h.tipo === "match"
                  ? h.titulo.replace(
                      /\b(NOT_REQUIRED|PENDING|MATCHED|VARIANCE|WAIVED)\b/g,
                      (m) => financeStatusLabel(m),
                    )
                  : h.titulo}
              </div>
              <div className={s.historialMeta}>
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
      <h3 className={s.bloqueTitulo}>{titulo}</h3>
      {children}
    </section>
  );
}
