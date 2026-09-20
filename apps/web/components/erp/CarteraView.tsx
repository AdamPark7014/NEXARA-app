"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
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
  const [pago, setPago] = useState({
    amount: "",
    paymentDate: hoyIso(),
    method: "SPEI",
    reference: "",
    notes: "",
  });

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
        toast.error(formatApiError(e));
      }
    },
    [token],
  );

  const chips = useMemo(() => {
    if (!data) return [];
    return ORDEN_AGING.filter((b) => data.aging[b]?.documentos > 0).map((b) => ({
      bucket: b,
      etiqueta: data.agingEtiquetas[b],
      monto: data.aging[b].monto,
      documentos: data.aging[b].documentos,
      tono: b === "vencido" ? "bad" : b === "hoy" ? "warn" : "mute",
    }));
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
    if (!detalle) return;
    const monto = Number(pago.amount);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Escribe un monto mayor a cero");
      return;
    }
    if (monto > detalle.saldo.pendiente + 0.01) {
      toast.error("El monto supera el saldo pendiente");
      return;
    }
    setGuardandoPago(true);
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
      toast.success(esCobrar ? "Cobro registrado" : "Pago registrado");
      setFormPago(false);
      setPago({ amount: "", paymentDate: hoyIso(), method: "SPEI", reference: "", notes: "" });
      const refrescado = await erpFetch<Detalle>(
        `accounting/workspace/${kind}/${detalle.factura.id}`,
        token,
      );
      setDetalle(refrescado);
      await cargar();
      if (!esCobrar) await cargarCalendario();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
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
          </div>
        </div>
      ),
    },
    {
      key: "proyecto",
      label: "Proyecto",
      render: (r) =>
        r.proyecto ? (
          <span style={{ fontSize: 12 }}>{r.proyecto.nombre}</span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin proyecto</span>
        ),
    },
    {
      key: "emision",
      label: "Emisión",
      render: (r) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fechaCorta(r.emision)}</span>,
    },
    {
      key: "vencimiento",
      label: "Vence",
      render: (r) => (
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
    {
      key: "pagado",
      label: "Pagado",
      align: "right",
      numeric: true,
      render: (r) =>
        r.pagado > 0 ? (
          <Money value={r.pagado} bold={false} />
        ) : (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ),
    },
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
   * El mismo criterio que ya aplica `registrarPago`, pero bajo el campo
   * mientras se captura. No bloquea el guardado: solo adelanta la respuesta
   * que hoy llega en un toast después de intentar.
   */
  const errorMonto = (() => {
    if (!detalle || pago.amount.trim() === "") return null;
    const monto = Number(pago.amount);
    if (!Number.isFinite(monto) || monto <= 0) return "Escribe un monto mayor a cero.";
    if (monto > detalle.saldo.pendiente + 0.01) return "El monto supera el saldo pendiente.";
    return null;
  })();

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

      {/* Antigüedad — una escala que se lee de izquierda a derecha y filtra */}
      <EscalaAntiguedad
        tramos={chips}
        activo={aging}
        total={data?.totales.pendiente ?? 0}
        onElegir={(b) => setAging(b)}
      />

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
          message="Hay más documentos de los que caben en un barrido. Acota el periodo para que los totales sean exactos."
        />
      )}

      {cargando ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando la cartera…</p>
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
              <Button variant="primary" onClick={() => setFormPago(true)}>
                {esCobrar ? "Registrar cobro" : "Registrar pago"}
              </Button>
            )}
          </div>
        }
      >
        {cargandoDetalle && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Abriendo la factura…</p>
        )}
        {errorDetalle && (
          <InlineAlert variant="danger" message={`No se pudo abrir el detalle. ${errorDetalle}`} />
        )}
        {detalle && (
          <DetalleFactura
            detalle={detalle}
            etiquetaContraparte={etiquetaContraparte}
            onDescargarXml={descargarXml}
          />
        )}
      </Modal>

      {/* Registro de pago */}
      <Modal
        open={formPago}
        onClose={() => setFormPago(false)}
        title={esCobrar ? "Registrar cobro" : "Registrar pago"}
        maxWidth={460}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
            <Button variant="ghost" onClick={() => setFormPago(false)} disabled={guardandoPago}>
              Cancelar
            </Button>
            <Button variant="primary" loading={guardandoPago} onClick={() => void registrarPago()}>
              Guardar
            </Button>
          </div>
        }
      >
        {detalle && (
          <div style={{ display: "grid", gap: 14, fontSize: 13 }}>
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

              <FinanceField label="Fecha" hint="El día en que el dinero se movió, no el de captura.">
                <input
                  type="date"
                  value={pago.paymentDate}
                  onChange={(e) => setPago((p) => ({ ...p, paymentDate: e.target.value }))}
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

type Tramo = {
  bucket: AgingBucket;
  etiqueta: string;
  monto: number;
  documentos: number;
  tono: string;
};

const TONO_TRAMO: Record<string, string> = {
  bad: "var(--state-danger-text, #b91c1c)",
  warn: "var(--state-warning-text, #b45309)",
  mute: "var(--text-secondary)",
};

/**
 * Antigüedad como escala, no como cinco botones sueltos.
 *
 * Las celdas van pegadas y en orden —vencido, hoy, 7, 30, +30— con una regla
 * bajo cada una cuyo ancho es su parte del saldo: así se ve de un vistazo
 * hacia qué lado carga la cartera. Cada celda filtra la tabla al hacer clic.
 */
function EscalaAntiguedad({
  tramos,
  activo,
  total,
  onElegir,
}: {
  tramos: Tramo[];
  activo: AgingBucket | "";
  total: number;
  onElegir: (bucket: AgingBucket | "") => void;
}) {
  if (tramos.length === 0) return null;
  const base = total > 0 ? total : tramos.reduce((s, t) => s + Math.abs(t.monto), 0);

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        role="group"
        aria-label="Antigüedad de saldos"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(128px, 1fr))`,
          border: "1px solid var(--nx-panel-hairline, var(--border))",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        {tramos.map((t, i) => {
          const esActivo = activo === t.bucket;
          const color = TONO_TRAMO[t.tono] ?? "var(--text-secondary)";
          const parte = base > 0 ? Math.min(100, (Math.abs(t.monto) / base) * 100) : 0;
          return (
            <button
              key={t.bucket}
              type="button"
              aria-pressed={esActivo}
              onClick={() => onElegir(esActivo ? "" : t.bucket)}
              style={{
                position: "relative",
                display: "grid",
                gap: 2,
                padding: "9px 12px 11px",
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
                color: "var(--text-primary)",
                border: "none",
                borderRight:
                  i < tramos.length - 1
                    ? "1px solid var(--nx-panel-hairline, var(--border))"
                    : undefined,
                background: esActivo
                  ? "color-mix(in srgb, var(--primary) 7%, var(--surface))"
                  : "transparent",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: esActivo ? 700 : 500,
                  color: t.tono === "mute" ? "var(--text-tertiary)" : color,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t.etiqueta}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                <Money value={t.monto} compact bold={false} />
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                {t.documentos} {t.documentos === 1 ? "factura" : "facturas"}
              </span>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  height: 2,
                  width: `${parte}%`,
                  background: t.tono === "mute" ? "var(--text-tertiary)" : color,
                  opacity: t.tono === "mute" ? 0.35 : 0.7,
                }}
              />
            </button>
          );
        })}
      </div>
      {activo !== "" && (
        <button
          type="button"
          onClick={() => onElegir("")}
          style={{
            marginTop: 6,
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
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
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
      subtitle={`Qué sale de caja hasta el ${fechaLarga(calendario.hasta)}.`}
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
}: {
  detalle: Detalle;
  etiquetaContraparte: string;
  onDescargarXml: (url: string, nombre: string) => void | Promise<void>;
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
                  {c.cantidad} × {c.descripcion}
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {documentos.map((d) => {
            if (!d.disponible || !d.url) {
              return (
                <span key={d.tipo} style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  {d.tipo.toUpperCase()}: {d.nota}
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
            return (
              <button
                key={d.tipo}
                type="button"
                onClick={() => void onDescargarXml(d.url as string, d.nombre)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--primary)",
                  cursor: "pointer",
                }}
              >
                Descargar {d.tipo.toUpperCase()} →
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
