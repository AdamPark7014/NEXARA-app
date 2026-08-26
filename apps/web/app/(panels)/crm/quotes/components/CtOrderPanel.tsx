"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Money } from "@/components/ui/DataTable";
import {
  smartQuoteCtOrderConfirm,
  smartQuoteCtOrderPreview,
  smartQuoteCtOrderSubmit,
  type CtEnvioForm,
  type CtOrderPreview,
  type SupplierPurchaseOrderRow,
} from "@/lib/smart-quote-api";
import styles from "./quote-supplier.module.css";

type Props = {
  token: string;
  cotizacionId: number;
  quoteStatus: string;
  canManage: boolean;
};

const emptyEnvio: CtEnvioForm = {
  nombre: "",
  direccion: "",
  entreCalles: " ",
  noExterior: "S/N",
  colonia: "",
  estado: "",
  ciudad: "",
  codigoPostal: "",
  telefono: "",
};

export default function CtOrderPanel({ token, cotizacionId, quoteStatus, canManage }: Props) {
  const [preview, setPreview] = useState<CtOrderPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [almacen, setAlmacen] = useState("");
  const [confirmNow, setConfirmNow] = useState(false);
  const [envio, setEnvio] = useState<CtEnvioForm>(emptyEnvio);
  const [orders, setOrders] = useState<SupplierPurchaseOrderRow[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await smartQuoteCtOrderPreview(token, cotizacionId);
      setPreview(data);
      setOrders(data.existingOrders ?? []);
      setAlmacen(data.suggestedAlmacen || data.config?.defaultAlmacen || "01A");
      if (data.defaultEnvio) {
        setEnvio({
          ...data.defaultEnvio,
          codigoPostal: String(data.defaultEnvio.codigoPostal ?? ""),
          telefono: String(data.defaultEnvio.telefono ?? ""),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar vista previa CT");
    } finally {
      setLoading(false);
    }
  }, [token, cotizacionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasCtLines = (preview?.lines?.length ?? 0) > 0;
  const approved = quoteStatus === "APPROVED";
  const almacenMismatchLines =
    preview?.lines.filter(
      (l) => l.supplierWarehouseCode && l.supplierWarehouseCode !== almacen,
    ) ?? [];

  if (loading) return null;
  if (!hasCtLines) return null;

  const patchEnvio = (key: keyof CtEnvioForm, value: string) =>
    setEnvio((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!canManage || !approved) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const order = await smartQuoteCtOrderSubmit(token, cotizacionId, {
        almacen,
        confirm: confirmNow,
        envio: [{ ...envio, codigoPostal: envio.codigoPostal, telefono: envio.telefono }],
      });
      setSuccess(
        order.externalFolio
          ? `Pedido enviado — folio CT ${order.externalFolio}`
          : "Pedido registrado en CT",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOrder = async (orderId: number) => {
    setSubmitting(true);
    setError(null);
    try {
      await smartQuoteCtOrderConfirm(token, orderId);
      setSuccess("Pedido confirmado en CT");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <div className={styles.panelEyebrow}>CT Online · solo partidas de catálogo CT</div>
          <h3 className={styles.panelTitle}>Pedido a mayorista</h3>
          <p className={styles.panelLead}>
            Al cliente se le cotizó precio de venta + IVA. A CT se pide al{" "}
            <strong>costo proveedor</strong> (neto, sin tu margen).
          </p>
        </div>
        <div className={styles.panelKpis}>
          <div>
            <span>Costo CT</span>
            <strong>
              <Money value={preview?.subtotalCost ?? 0} />
            </strong>
          </div>
          <div>
            <span>Venta neta</span>
            <strong>
              <Money value={preview?.subtotalSell ?? 0} />
            </strong>
          </div>
          <div>
            <span>Tu margen</span>
            <strong>
              <Money value={preview?.marginAmount ?? 0} />
            </strong>
          </div>
        </div>
      </div>

      {!preview?.config?.apiConfigured && (
        <div className={styles.warn}>
          API CT no configurada en servidor (CT_API_EMAIL, CT_API_CLIENTE, CT_API_RFC). Puedes revisar el
          borrador; el envío estará disponible cuando operaciones configure las credenciales.
        </div>
      )}

      {!approved && (
        <div className={styles.info}>
          Cuando el cliente <strong>apruebe</strong> la cotización se creará un borrador de pedido CT y
          podrás enviarlo desde aquí.
        </div>
      )}

      {preview?.warehouseMismatch && (
        <div className={styles.warn}>
          Las partidas tienen <strong>almacenes de surtido distintos</strong>. CT acepta un almacén por
          pedido: elige desde dónde surtir todo o ajusta la cotización.
        </div>
      )}

      {(preview?.stockWarnings?.length ?? 0) > 0 && (
        <div className={styles.warn}>
          <strong>Stock en almacén cotizado:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {preview!.stockWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {orders.length > 0 && (
        <div className={styles.orders}>
          <div className={styles.ordersTitle}>Historial de pedidos CT</div>
          {orders.map((o) => (
            <div key={o.id} className={styles.orderRow}>
              <div>
                <strong>{o.externalFolio || `Borrador #${o.id}`}</strong>
                <span className={styles.orderMeta}>
                  {o.status} · almacén {o.almacen}
                  {o.errorMessage ? ` · ${o.errorMessage}` : ""}
                </span>
              </div>
              {canManage && o.externalFolio && o.status !== "CONFIRMED" && (
                <Button size="sm" variant="secondary" onClick={() => void confirmOrder(o.id)} loading={submitting}>
                  Confirmar en CT
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar formulario de envío" : approved ? "Preparar envío a CT" : "Ver partidas CT"}
      </button>

      {open && (
        <div className={styles.formBlock}>
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Obtener de</th>
                <th>Cant.</th>
                <th>Costo u.</th>
                <th>Venta u.</th>
                <th>Costo línea</th>
              </tr>
            </thead>
            <tbody>
              {preview?.lines.map((l) => (
                <tr key={String(l.clave)}>
                  <td>{l.clave}</td>
                  <td>{l.nombre}</td>
                  <td>
                    {l.almacenLabel || l.supplierWarehouseCode || "—"}
                    {l.stockAtWarehouse != null ? (
                      <span className={styles.orderMeta}> · {l.stockAtWarehouse} u.</span>
                    ) : null}
                    {!l.stockOk ? (
                      <span className={styles.orderMeta} style={{ color: "#b45309" }}>
                        {" "}
                        · stock bajo
                      </span>
                    ) : null}
                  </td>
                  <td>{l.qty}</td>
                  <td>
                    <Money value={l.unitCost} />
                  </td>
                  <td>
                    <Money value={l.unitSell} />
                  </td>
                  <td>
                    <Money value={l.lineCost} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {approved && canManage && (
            <>
              {almacenMismatchLines.length > 0 && (
                <div className={styles.info}>
                  {almacenMismatchLines.length} partida(s) se cotizaron desde otro almacén. Al enviar desde{" "}
                  <strong>{almacen}</strong> se validará stock en ese almacén.
                </div>
              )}
              <div className={styles.formGrid}>
                <label>
                  Almacén CT (pedido completo)
                  <select value={almacen} onChange={(e) => setAlmacen(e.target.value)} className={styles.input}>
                    {(preview?.config?.warehouses ?? []).map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} — {w.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre destinatario
                  <input className={styles.input} value={envio.nombre} onChange={(e) => patchEnvio("nombre", e.target.value)} />
                </label>
                <label>
                  Teléfono
                  <input className={styles.input} value={envio.telefono} onChange={(e) => patchEnvio("telefono", e.target.value)} />
                </label>
                <label className={styles.span2}>
                  Dirección
                  <input className={styles.input} value={envio.direccion} onChange={(e) => patchEnvio("direccion", e.target.value)} />
                </label>
                <label>
                  No. exterior
                  <input className={styles.input} value={envio.noExterior} onChange={(e) => patchEnvio("noExterior", e.target.value)} />
                </label>
                <label>
                  Colonia
                  <input className={styles.input} value={envio.colonia} onChange={(e) => patchEnvio("colonia", e.target.value)} />
                </label>
                <label>
                  Ciudad
                  <input className={styles.input} value={envio.ciudad} onChange={(e) => patchEnvio("ciudad", e.target.value)} />
                </label>
                <label>
                  Estado
                  <input className={styles.input} value={envio.estado} onChange={(e) => patchEnvio("estado", e.target.value)} />
                </label>
                <label>
                  C.P.
                  <input className={styles.input} value={envio.codigoPostal} onChange={(e) => patchEnvio("codigoPostal", e.target.value)} />
                </label>
              </div>

              <label className={styles.check}>
                <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
                Confirmar pedido en CT inmediatamente (si no, tienes ~48 h para confirmar)
              </label>

              <Button variant="primary" onClick={() => void submit()} loading={submitting} disabled={!preview?.config?.apiConfigured}>
                Enviar pedido a CT Online
              </Button>
            </>
          )}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
    </section>
  );
}
