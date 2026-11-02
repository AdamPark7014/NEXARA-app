"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  Field,
  FilterChip,
  FilterChips,
  Input,
  ListCard,
  ModuleToolbar,
  SearchInput,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { Money } from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { financeStatusLabel } from "@/lib/finance-status-labels";
import { toast } from "@/components/Toast";
import TruncatedId from "@/components/ui/TruncatedId";
import s from "./ContabilidadInvoicesView.module.css";
import { aFechaLocal, formatoFechaLocal } from "@/lib/fecha-calendario";

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number | string;
  paidAmount?: number | string;
  receptorName?: string | null;
  emisorName?: string | null;
  cfdiUuid?: string | null;
  cfdiXml?: string | null;
};

function pendingOf(row: InvoiceRow) {
  return Number(row.totalAmount || 0) - Number(row.paidAmount || 0);
}

/** Una factura pagada, cancelada o en borrador ya no debe nada, aunque su fecha haya pasado. */
function sigueAbierta(row: InvoiceRow) {
  return pendingOf(row) > 0.01 && !["PAID", "CANCELLED", "DRAFT"].includes(row.status);
}

function daysOverdue(due?: string | null) {
  const d = aFechaLocal(due);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

const TIPO_FACTURA: Record<string, string> = {
  ACCOUNTS_RECEIVABLE: "Emitida",
  INCOME: "Emitida",
  ACCOUNTS_PAYABLE: "Recibida",
  EXPENSE: "Recibida",
};

function tipoFacturaLabel(type: string): string {
  return TIPO_FACTURA[type] ?? "Documento";
}

/**
 * Estado para quien cobra — nunca la clave cruda del modelo. Las traducciones
 * salen del catálogo compartido, para que «Pago parcial» se diga igual aquí,
 * en Por cobrar y en el expediente del proveedor.
 */
function statusLabel(row: InvoiceRow): { text: string; tone: "ok" | "warn" | "bad" | "mute" } {
  const pend = pendingOf(row);
  const od = daysOverdue(row.dueDate);
  if (row.status === "STAMPING") return { text: financeStatusLabel("STAMPING"), tone: "warn" };
  if (row.status === "CANCELLED") return { text: financeStatusLabel("CANCELLED"), tone: "mute" };
  if (row.status === "DRAFT") return { text: financeStatusLabel("DRAFT"), tone: "mute" };
  if (pend <= 0.01 || row.status === "PAID") return { text: financeStatusLabel("PAID"), tone: "ok" };
  // Mismo texto que la columna «Vencida» de Por cobrar: días completos, sin
  // abreviar. «Vencida · 12d» obligaba a adivinar qué era la d.
  if (od != null && od > 0) {
    return { text: `Vencida · ${od} ${od === 1 ? "día" : "días"}`, tone: "bad" };
  }
  if (Number(row.paidAmount || 0) > 0 || row.status === "PARTIALLY_PAID") {
    return { text: financeStatusLabel("PARTIALLY_PAID"), tone: "warn" };
  }
  // Sin estado, pero con saldo abierto: eso sí lo sabemos y se dice.
  return { text: row.status ? financeStatusLabel(row.status) : "Pendiente", tone: "mute" };
}

/** El tono del estado, en el vocabulario de `Badge`: punto y palabra. */
const TONO_ESTADO: Record<"ok" | "warn" | "bad" | "mute", Tone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
  mute: "neutral",
};

type Mode = "cxc" | "cxp" | "all";

/**
 * Tope del DTO de la API (`PaginationQueryDto`, `@Max(100)`).
 *
 * Esta vista pedía `limit=200` para traérselo todo de una, así que la ruta
 * contestaba 400 y la pantalla de Facturas no cargó nunca: salía el error de
 * validación crudo encima de un «Todavía no hay facturas».
 */
const POR_PAGINA = 100;

/** Páginas por tanda. Lo que quede fuera se avisa en pantalla, no se calla. */
const PAGINAS_POR_TANDA = 5;

export default function ContabilidadInvoicesView({
  mode = "all",
  title,
  subtitle,
}: {
  mode?: Mode;
  title?: string;
  subtitle?: string;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cuántas quedaron fuera de la tanda, para decirlo en vez de recortar en silencio. */
  const [parcial, setParcial] = useState<{ cargadas: number; total: number } | null>(null);
  const [tandas, setTandas] = useState(1);
  const [q, setQ] = useState("");
  const [aging, setAging] = useState<"" | "vencido" | "hoy" | "d7">("");
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [paying, setPaying] = useState(false);
  /**
   * El registro de pago vivía en un `window.prompt`: una caja gris del
   * navegador, sin saldo a la vista ni forma de corregir el dato. Ahora es un
   * formulario, con el mismo envío y la misma validación de antes.
   */
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  /** Error del servidor dentro del formulario — no solo toast que se va. */
  const [payErr, setPayErr] = useState<string | null>(null);
  /** Tras pulsar Guardar, el monto vacío también se señala bajo el campo. */
  const [intentado, setIntentado] = useState(false);
  /** Cerrojo síncrono: el botón deshabilitado no alcanza contra doble clic. */
  const payingRef = useRef(false);

  const typeParam =
    mode === "cxc" ? "ACCOUNTS_RECEIVABLE" : mode === "cxp" ? "ACCOUNTS_PAYABLE" : "";

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError(
        "Tu sesión todavía no está lista, así que no se pueden pedir las facturas. Espera unos segundos; si sigue igual, vuelve a entrar.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const acumuladas: InvoiceRow[] = [];
      let total = 0;
      for (let pagina = 1; pagina <= tandas * PAGINAS_POR_TANDA; pagina += 1) {
        const qs = new URLSearchParams();
        if (typeParam) qs.set("type", typeParam);
        qs.set("limit", String(POR_PAGINA));
        qs.set("page", String(pagina));
        // `erpFetch` devuelve `unknown` si no se le dice qué esperar, y entonces
        // `data?.items` no compila. La ruta contesta el arreglo pelón o envuelto,
        // según el endpoint, así que se declaran las tres formas.
        const data = await erpFetch<
          | InvoiceRow[]
          | { items?: InvoiceRow[]; data?: InvoiceRow[]; meta?: { total?: number } }
          | null
        >(`accounting/invoices?${qs}`, token);
        const rows: InvoiceRow[] = Array.isArray(data)
          ? data
          : data?.items ?? data?.data ?? [];
        acumuladas.push(...rows);
        const informado = Array.isArray(data) ? undefined : data?.meta?.total;
        total = informado ?? acumuladas.length;
        if (rows.length < POR_PAGINA || acumuladas.length >= total) break;
      }
      setItems(acumuladas);
      setParcial(total > acumuladas.length ? { cargadas: acumuladas.length, total } : null);
    } catch (e) {
      setError(formatApiError(e));
      setItems([]);
      setParcial(null);
    } finally {
      setLoading(false);
    }
  }, [token, typeParam, tandas]);

  useEffect(() => {
    void load();
  }, [load]);

  const baseRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = items;
    if (mode !== "all") {
      rows = rows.filter(sigueAbierta);
    }
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.invoiceNumber, r.receptorName, r.emisorName, r.cfdiUuid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [items, q, mode]);

  /** Antigüedad sin el filtro activo: la escala no debe colapsar al filtrar. */
  const calendar = useMemo(() => {
    if (mode !== "cxp") return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = { today: 0, d7: 0, overdue: 0 };
    for (const r of baseRows) {
      const due = aFechaLocal(r.dueDate);
      const pend = pendingOf(r);
      if (!due) continue;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (diff < 0) buckets.overdue += pend;
      else if (diff === 0) buckets.today += pend;
      else if (diff <= 7) buckets.d7 += pend;
    }
    return buckets;
  }, [baseRows, mode]);

  const filtered = useMemo(() => {
    if (!aging) return baseRows;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return baseRows.filter((r) => {
      const due = aFechaLocal(r.dueDate);
      if (!due) return false;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (aging === "vencido") return diff < 0;
      if (aging === "hoy") return diff === 0;
      return diff > 0 && diff <= 7;
    });
  }, [baseRows, aging]);

  function abrirPago(row: InvoiceRow) {
    const pend = pendingOf(row);
    if (pend <= 0) return;
    setPayAmount(pend.toFixed(2));
    setPayErr(null);
    setIntentado(false);
    setPayOpen(true);
  }

  async function registerPayment(row: InvoiceRow) {
    if (payingRef.current) return;
    setIntentado(true);
    const pend = pendingOf(row);
    if (pend <= 0) {
      setPayErr(
        "Esta factura ya no tiene saldo pendiente: alguien registró el pago mientras tenías la pantalla abierta. Cierra y vuelve a abrirla.",
      );
      return;
    }
    const amount = Number(payAmount);
    // El motivo se queda bajo el campo (`errorMonto`), no en un toast que se va.
    if (!Number.isFinite(amount) || amount <= 0) return;
    payingRef.current = true;
    setPaying(true);
    setPayErr(null);
    try {
      const result = await erpFetch<{
        complement?: { cfdiPaymentUuid?: string | null } | null;
        complementStampWarning?: string | null;
      } | null>(`accounting/invoices/${row.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate: new Date().toISOString().slice(0, 10),
          method: "SPEI",
        }),
      });
      if (result?.complement?.cfdiPaymentUuid) {
        toast.success(
          `Pago registrado y complemento de pago timbrado (folio fiscal ${String(result.complement.cfdiPaymentUuid).slice(0, 8)}…)`,
        );
      } else if (result?.complementStampWarning) {
        toast.warning(
          `El pago quedó registrado, pero el complemento de pago no se timbró ante el SAT: ${result.complementStampWarning} Vuelve a timbrarlo desde Facturación.`,
        );
      } else {
        toast.success("Pago registrado");
      }
      setPayOpen(false);
      setPayAmount("");
      setPayErr(null);
      setIntentado(false);
      setSelected(null);
      await load();
    } catch (e) {
      // El formulario NO se cierra: si se cerrara, nadie sabría si el dinero quedó aplicado.
      setPayErr(
        `No se pudo registrar el pago. ${formatApiError(e)} El saldo no cambió: corrige el monto y vuelve a guardar.`,
      );
      toast.error(formatApiError(e));
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  }

  /**
   * Cómo se llama la otra parte. En la lista mezclada no es «Contraparte»
   * —palabra de contrato, no de trabajo—: es un cliente o un proveedor.
   */
  const partyLabel =
    mode === "cxp" ? "Proveedor" : mode === "cxc" ? "Cliente" : "Cliente o proveedor";
  const partySearchLabel = mode === "cxp" ? "proveedor" : mode === "cxc" ? "cliente" : "nombre";

  /** El mismo criterio que aplica `registerPayment`, mostrado bajo el campo. */
  const errorMonto = (() => {
    if (!payOpen) return null;
    if (payAmount.trim() === "") {
      return intentado ? "Escribe cuánto se está pagando." : null;
    }
    const monto = Number(payAmount);
    if (!Number.isFinite(monto) || monto <= 0) return "Indica un monto mayor a cero.";
    return null;
  })();

  const escalaCalendario: {
    key: "vencido" | "hoy" | "d7";
    label: string;
    monto: number;
    hint: string;
    dot?: Tone;
  }[] = calendar
    ? [
        {
          key: "vencido",
          label: "Vencido",
          monto: calendar.overdue,
          hint: calendar.overdue > 0 ? "ya debió salir" : "nada atrasado",
          dot: calendar.overdue > 0 ? "danger" : undefined,
        },
        {
          key: "hoy",
          label: "Hoy",
          monto: calendar.today,
          hint: "sale hoy",
          dot: calendar.today > 0 ? "warning" : undefined,
        },
        {
          key: "d7",
          label: "Próximos 7 días",
          monto: calendar.d7,
          hint: "esta semana",
        },
      ]
    : [];

  const columns: Column<InvoiceRow>[] = [
    {
      key: "party",
      label: partyLabel,
      render: (r) => (
        <div>
          <div className={s.nombre}>{r.receptorName || r.emisorName || "Sin nombre"}</div>
          <div className={s.sub}>{r.invoiceNumber}</div>
        </div>
      ),
    },
    ...(mode === "all"
      ? [
          {
            key: "tipo",
            label: "Tipo",
            render: (r: InvoiceRow) => <span className={s.tipo}>{tipoFacturaLabel(r.type)}</span>,
          } as Column<InvoiceRow>,
        ]
      : []),
    {
      key: "due",
      label: "Vence",
      render: (r) => {
        const od = daysOverdue(r.dueDate);
        const vencida = sigueAbierta(r) && od != null && od > 0;
        return (
          <span className={s.vence}>
            <span className={vencida ? s.fechaVencida : s.fecha}>
              {formatoFechaLocal(r.dueDate)}
            </span>
            {vencida && (
              <span className={s.diasVencida}>
                {od} {od === 1 ? "día vencida" : "días vencida"}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "saldo",
      label: "Saldo",
      align: "right",
      numeric: true,
      render: (r) => <Money value={pendingOf(r)} />,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => {
        const st = statusLabel(r);
        return (
          <Badge dot size="sm" tone={TONO_ESTADO[st.tone]}>
            {st.text}
          </Badge>
        );
      },
    },
  ];

  const pageTitle =
    title ??
    (mode === "cxc" ? "Por cobrar" : mode === "cxp" ? "Por pagar" : "Facturas");

  const pageSubtitle =
    subtitle ??
    (mode === "cxc"
      ? "Quién te debe y qué urge cobrar."
      : mode === "cxp"
        ? "Qué debes pagar y cuándo."
        : "Documentos emitidos y recibidos.");

  /**
   * Tres vacíos distintos, como en el resto del escritorio: el que el filtro
   * esconde, el que todavía no tiene movimiento y el que ya está liquidado.
   */
  const hayBusqueda = q.trim() !== "" || aging !== "";
  const emptyTitle = hayBusqueda
    ? "Sin resultados con estos filtros"
    : mode === "cxc"
      ? "Nada por cobrar"
      : mode === "cxp"
        ? "Nada por pagar"
        : "Todavía no hay facturas";
  const emptyDesc = hayBusqueda
    ? "Ninguna factura coincide. Borra la búsqueda o elige otro tramo de vencimiento."
    : mode === "all"
      ? "En cuanto emitas o registres una factura, aparecerá aquí con su saldo y su fecha de vencimiento."
      : "Todas las facturas están liquidadas: no queda saldo abierto.";

  const placeholderBusqueda = `Buscar ${partySearchLabel}, folio o folio fiscal…`;

  return (
    <MesaPagina
      titulo={pageTitle}
      descripcion={pageSubtitle}
      terciarias={
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      }
      primaria={
        mode === "all" ? (
          <ButtonLink variant="primary" href="/erp/invoicing">
            Nueva factura
          </ButtonLink>
        ) : undefined
      }
    >
      {parcial && (
        <Alert
          tone="info"
          role="status"
          className={s.aviso}
          action={
            <Button size="sm" onClick={() => setTandas((n) => n + 1)} disabled={loading}>
              Cargar más
            </Button>
          }
        >
          Se cargaron las {parcial.cargadas} facturas más recientes de {parcial.total}. La
          búsqueda y los filtros solo miran las cargadas.
        </Alert>
      )}

      {/* Qué pasó, por qué, y qué hacer — junto a la tabla que quedó vacía. */}
      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={s.aviso}
          action={
            <Button size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudieron cargar las facturas. Vuelve a intentarlo; si sigue igual, avisa a soporte con este dato: «${error.replace(/\s*\.?\s*$/, "")}».`}
        </Alert>
      )}

      <ListCard
        className={s.tarjeta}
        listLabel="Facturas"
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                aria-label={placeholderBusqueda}
                placeholder={placeholderBusqueda}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            }
            chips={
              calendar && (calendar.overdue > 0 || calendar.today > 0 || calendar.d7 > 0) ? (
                <FilterChips ariaLabel="Qué sale de caja">
                  {escalaCalendario.map((t) => (
                    <FilterChip
                      key={t.key}
                      active={aging === t.key}
                      dot={t.dot}
                      title={t.hint}
                      onClick={() => setAging(aging === t.key ? "" : t.key)}
                    >
                      {t.label}
                      <span className={s.tramoMonto}>
                        <Money value={t.monto} bold={false} />
                      </span>
                    </FilterChip>
                  ))}
                </FilterChips>
              ) : null
            }
            end={
              <span role="status" className={s.conteo}>
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </span>
            }
          />
        }
        empty={!loading && !error && filtered.length === 0}
        emptyState={{
          icon: hayBusqueda ? <FilterAltOffOutlinedIcon /> : <ReceiptLongOutlinedIcon />,
          title: emptyTitle,
          description: emptyDesc,
          action: hayBusqueda ? (
            <Button
              size="sm"
              onClick={() => {
                setQ("");
                setAging("");
              }}
            >
              Limpiar filtros
            </Button>
          ) : mode === "all" ? (
            <ButtonLink href="/erp/invoicing">Ir a facturación</ButtonLink>
          ) : undefined,
          tone: "neutral",
        }}
      >
        {loading ? (
          <div className={s.cargando}>
            <SkeletonRows rows={5} />
            <p className={s.cargandoTexto}>Cargando…</p>
          </div>
        ) : error ? null : (
          <DataTable
            flush
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            density="compact"
            ariaLabel="Facturas de contabilidad"
            onRowClick={(r) => setSelected(r)}
          />
        )}
      </ListCard>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.invoiceNumber || "Factura"}
        footer={
          <div className={s.pie}>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
            {selected && pendingOf(selected) > 0.01 && (
              <Button variant="primary" onClick={() => selected && abrirPago(selected)}>
                Registrar pago
              </Button>
            )}
          </div>
        }
      >
        {selected && (
          <div className={s.detalle}>
            <StatRow variant="strip" cols={2} ariaLabel="Saldo de la factura">
              <Stat
                label="Total"
                icon={<ReceiptLongOutlinedIcon />}
                iconTone="neutral"
                value={<Money value={Number(selected.totalAmount || 0)} />}
                hint="facturado"
              />
              <Stat
                label="Saldo"
                icon={<PaymentsOutlinedIcon />}
                iconTone="neutral"
                value={<Money value={pendingOf(selected)} />}
                tone={pendingOf(selected) > 0.01 ? "warning" : "success"}
                hint={pendingOf(selected) > 0.01 ? "pendiente de cobro" : "liquidada"}
              />
            </StatRow>

            <div className={s.datos}>
              <Dato etiqueta={partyLabel}>
                {selected.receptorName || selected.emisorName || "—"}
              </Dato>
              <Dato etiqueta="Emisión">
                {formatoFechaLocal(selected.issueDate)}
              </Dato>
              <Dato etiqueta="Vence">
                {formatoFechaLocal(selected.dueDate)}
              </Dato>
              <Dato etiqueta="Estado">
                <Badge dot tone={TONO_ESTADO[statusLabel(selected).tone]}>
                  {statusLabel(selected).text}
                </Badge>
              </Dato>
              {/* «UUID CFDI» es como lo llama el sistema; en la factura
                  impresa ese mismo número se llama folio fiscal. */}
              {selected.cfdiUuid ? (
                <Dato etiqueta="Folio fiscal">
                  <TruncatedId value={selected.cfdiUuid} label="Folio fiscal" keep={8} />
                </Dato>
              ) : null}
            </div>

            <div>
              {selected.cfdiXml || selected.cfdiUuid ? (
                <Badge dot tone="neutral">
                  Timbrada ante el SAT
                </Badge>
              ) : (
                <Badge
                  dot
                  tone="warning"
                  title="No tiene folio fiscal ni archivo XML: no se puede deducir ni acreditar hasta que se timbre"
                >
                  Sin timbrar ante el SAT
                </Badge>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Registro de pago — antes era un window.prompt del navegador */}
      <Modal
        open={payOpen}
        onClose={() => {
          setPayOpen(false);
          setPayErr(null);
          setIntentado(false);
        }}
        title="Registrar pago"
        maxWidth={440}
        footer={
          <div className={s.pie}>
            <Button
              variant="ghost"
              onClick={() => {
                setPayOpen(false);
                setPayErr(null);
                setIntentado(false);
              }}
              disabled={paying}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={paying}
              onClick={() => selected && void registerPayment(selected)}
            >
              Guardar
            </Button>
          </div>
        }
      >
        {selected && (
          <div className={s.formPago}>
            {payErr && (
              <Alert tone="danger" role="alert" className={s.aviso} onDismiss={() => setPayErr(null)}>
                {payErr}
              </Alert>
            )}
            <div className={s.saldoPendiente}>
              <span className={s.saldoEtiqueta}>
                Saldo pendiente de <strong>{selected.invoiceNumber}</strong>
              </span>
              <Money value={pendingOf(selected)} />
            </div>
            <Field
              label="Monto"
              hint="Pesos, con IVA incluido. Se registra con la fecha de hoy y forma de pago SPEI."
              error={errorMonto}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={pendingOf(selected).toFixed(2)}
              />
            </Field>
          </div>
        )}
      </Modal>
    </MesaPagina>
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
