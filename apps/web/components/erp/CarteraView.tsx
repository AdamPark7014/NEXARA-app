"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { erpFetch, erpInputStyle, formatApiError } from "@/lib/erp-api";
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

const TONOS: Record<string, string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  bad: "var(--danger)",
  mute: "var(--text-secondary)",
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
      label: "Días",
      align: "right",
      numeric: true,
      render: (r) => (
        <span
          style={{
            fontSize: 12,
            fontWeight: (r.diasVencido ?? -1) > 0 ? 700 : 500,
            color: (r.diasVencido ?? -1) > 0 ? "var(--danger)" : "var(--text-secondary)",
          }}
        >
          {r.diasVencido === null ? "—" : r.diasVencido > 0 ? `+${r.diasVencido}` : r.diasVencido}
        </span>
      ),
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
        <span style={{ fontSize: 12.5, fontWeight: 600, color: TONOS[r.estadoTono] }}>
          {r.estadoEtiqueta}
        </span>
      ),
    },
  ];

  const saldoAbierto = detalle?.saldo.pendiente ?? 0;
  const puedePagar = !!detalle && saldoAbierto > 0.009 && !detalle.factura.cancelada;

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

      {/* Totales — tres cifras, no una pared de tarjetas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 1,
          marginBottom: 14,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--nx-panel-hairline)",
          background: "var(--nx-panel-hairline)",
        }}
      >
        <Cifra
          etiqueta={esCobrar ? "Por cobrar" : "Por pagar"}
          valor={cargando ? null : <Money value={data?.totales.pendiente ?? 0} />}
        />
        <Cifra
          etiqueta="Vencido"
          valor={cargando ? null : <Money value={data?.totales.vencido ?? 0} />}
          alerta={(data?.totales.vencido ?? 0) > 0}
        />
        <Cifra etiqueta="Documentos" valor={cargando ? null : String(data?.totales.documentos ?? 0)} />
      </div>

      {/* Antigüedad — cada chip filtra la tabla */}
      {chips.length > 0 && (
        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
          role="group"
          aria-label="Antigüedad de saldos"
        >
          <Chip activo={aging === ""} onClick={() => setAging("")} etiqueta="Todo" tono="mute" />
          {chips.map((c) => (
            <Chip
              key={c.bucket}
              activo={aging === c.bucket}
              onClick={() => setAging(aging === c.bucket ? "" : (c.bucket as AgingBucket))}
              etiqueta={c.etiqueta}
              monto={c.monto}
              documentos={c.documentos}
              tono={c.tono as "bad" | "warn" | "mute"}
            />
          ))}
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
          <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              Saldo pendiente de <strong>{detalle.factura.folio}</strong>:{" "}
              <Money value={detalle.saldo.pendiente} />
            </p>
            <Campo etiqueta="Monto">
              <input
                type="number"
                min="0"
                step="0.01"
                value={pago.amount}
                onChange={(e) => setPago((p) => ({ ...p, amount: e.target.value }))}
                placeholder={detalle.saldo.pendiente.toFixed(2)}
                style={erpInputStyle}
              />
              <button
                type="button"
                onClick={() => setPago((p) => ({ ...p, amount: detalle.saldo.pendiente.toFixed(2) }))}
                style={{
                  marginTop: 4,
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--primary)",
                  cursor: "pointer",
                }}
              >
                Usar el saldo completo
              </button>
            </Campo>
            <Campo etiqueta="Fecha">
              <input
                type="date"
                value={pago.paymentDate}
                onChange={(e) => setPago((p) => ({ ...p, paymentDate: e.target.value }))}
                style={erpInputStyle}
              />
            </Campo>
            <Campo etiqueta="Forma de pago">
              <select
                value={pago.method}
                onChange={(e) => setPago((p) => ({ ...p, method: e.target.value }))}
                style={erpInputStyle}
              >
                {METODOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Referencia (opcional)">
              <input
                value={pago.reference}
                onChange={(e) => setPago((p) => ({ ...p, reference: e.target.value }))}
                placeholder="Folio del banco, cheque, etc."
                style={erpInputStyle}
              />
            </Campo>
            <Campo etiqueta="Nota (opcional)">
              <input
                value={pago.notes}
                onChange={(e) => setPago((p) => ({ ...p, notes: e.target.value }))}
                style={erpInputStyle}
              />
            </Campo>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: React.ReactNode | null;
  alerta?: boolean;
}) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--surface)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 4 }}>
        {etiqueta}
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: alerta ? "var(--danger)" : "var(--text-primary)",
        }}
      >
        {valor ?? "…"}
      </div>
    </div>
  );
}

function Chip({
  etiqueta,
  monto,
  documentos,
  tono,
  activo,
  onClick,
}: {
  etiqueta: string;
  monto?: number;
  documentos?: number;
  tono: "bad" | "warn" | "mute";
  activo: boolean;
  onClick: () => void;
}) {
  const color = TONOS[tono];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        cursor: "pointer",
        fontSize: 12.5,
        border: `1px solid ${activo ? color : "var(--nx-panel-hairline, var(--border))"}`,
        background: activo
          ? `color-mix(in srgb, ${color} 12%, var(--surface))`
          : "var(--surface)",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ fontWeight: 600, color: tono === "mute" ? undefined : color }}>{etiqueta}</span>
      {monto !== undefined && (
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
          <Money value={monto} compact bold={false} />
        </span>
      )}
      {documentos !== undefined && (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{documentos}</span>
      )}
    </button>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          marginBottom: 4,
        }}
      >
        {etiqueta}
      </span>
      {children}
    </label>
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Dato etiqueta="Vencido">
              <span style={{ color: resumen.vencido > 0 ? "var(--danger)" : undefined }}>
                <Money value={resumen.vencido} />
              </span>
            </Dato>
            <Dato etiqueta="Hoy">
              <Money value={resumen.hoy} />
            </Dato>
            <Dato etiqueta="Próximos 7 días">
              <Money value={resumen.proximos7} />
            </Dato>
            <Dato etiqueta="Próximos 30 días">
              <Money value={resumen.proximos30} />
            </Dato>
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
          <span style={{ color: TONOS[factura.estadoTono] }}>{factura.estadoEtiqueta}</span>
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
                background: "var(--success)",
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
