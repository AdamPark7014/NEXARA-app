"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/base";
import { cantidad, fechaCorta } from "@/lib/recursos-ui";
import { RFQ_STATUS, varianteRfq, type RfqComparison } from "./compras-datos";
import s from "./compras.module.css";

type Borrador = { unitPrice: string; leadTimeDays: string };

interface Props {
  comparison: RfqComparison | null;
  loading: boolean;
  canApprove: boolean;
  savingLineId: number | null;
  awardingSupplierId: number | null;
  onClose: () => void;
  onSaveLine: (lineId: number, borrador: Borrador) => void;
  onAward: (supplierId: number, supplierName: string) => void;
  onVerOrden: (orderId: number) => void;
}

/** Precios por proveedor lado a lado: se capturan aquí y se adjudica al que convenga. */
export default function ComparacionCotizaciones({
  comparison,
  loading,
  canApprove,
  savingLineId,
  awardingSupplierId,
  onClose,
  onSaveLine,
  onAward,
  onVerOrden,
}: Props) {
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});

  useEffect(() => {
    if (!comparison) return;
    const siguiente: Record<number, Borrador> = {};
    for (const prov of comparison.suppliers) {
      for (const l of prov.lines) {
        siguiente[l.id] = {
          unitPrice: l.unitPrice != null ? String(l.unitPrice) : "",
          leadTimeDays: l.leadTimeDays != null ? String(l.leadTimeDays) : "",
        };
      }
    }
    setBorradores(siguiente);
  }, [comparison]);

  if (loading && !comparison) {
    return (
      <section className={s.comparacion} aria-label="Comparación de cotizaciones">
        <SkeletonRows rows={4} label="Cargando comparación" />
      </section>
    );
  }
  if (!comparison) return null;

  const { rfq } = comparison;
  const editable = rfq.status !== "AWARDED" && rfq.status !== "CANCELLED";

  return (
    <section className={s.comparacion} aria-labelledby="comparacion-titulo">
      <div className={s.comparacionCabeza}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 id="comparacion-titulo" className={s.comparacionTitulo}>
            {rfq.requisition?.title ?? "Cotización"}
          </h2>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--text-tertiary)" }}>
            {rfq.rfqNumber}
            {rfq.requisition?.reqNumber ? ` · ${rfq.requisition.reqNumber}` : ""}
            {rfq.dueDate ? ` · responder antes del ${fechaCorta(rfq.dueDate)}` : ""}
            <Tag variant={varianteRfq(rfq.status)} size="sm">{RFQ_STATUS[rfq.status] ?? "Sin estado"}</Tag>
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
      </div>

      {rfq.status === "AWARDED" && rfq.awardedPurchaseOrder && (
        <p className={s.aviso}>
          Se adjudicó y generó la orden{" "}
          <button type="button" className={s.enlace} onClick={() => onVerOrden(rfq.awardedPurchaseOrder!.id)}>
            {rfq.awardedPurchaseOrder.poNumber}
          </button>
        </p>
      )}

      {editable && (
        <p className={s.ayuda} style={{ margin: "0 0 12px" }}>
          Captura el precio que te dio cada proveedor y guarda cada renglón. Se puede adjudicar cuando el proveedor tenga todos sus renglones con precio.
        </p>
      )}

      {comparison.suppliers.length === 0 ? (
        <p className={s.ayuda}>Esta cotización no tiene proveedores.</p>
      ) : (
        <div className={s.proveedores}>
          {comparison.suppliers.map((prov) => {
            const mejorPrecio = prov.supplierId === comparison.bestPriceSupplierId;
            const mejorEntrega = prov.supplierId === comparison.bestLeadTimeSupplierId;
            const completo = prov.quotedLines === prov.totalLines;
            return (
              <article
                key={prov.supplierId}
                className={`${s.proveedor} ${mejorPrecio ? s.proveedorMejor : ""}`}
                aria-label={prov.supplierName}
              >
                <div className={s.proveedorCabeza}>
                  <div className={s.proveedorNombre}>
                    <strong style={{ fontSize: 13.5 }}>{prov.supplierName}</strong>
                    {mejorPrecio && <Tag variant="positive" size="sm">Mejor precio</Tag>}
                    {mejorEntrega && <Tag variant="accent" size="sm">Entrega más rápida</Tag>}
                    <span className={s.ayuda}>
                      {prov.quotedLines} de {prov.totalLines} con precio
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Money value={prov.totalPrice} />
                    {editable && canApprove && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!completo || awardingSupplierId != null}
                        loading={awardingSupplierId === prov.supplierId}
                        title={completo ? undefined : "Faltan precios de este proveedor"}
                        onClick={() => onAward(prov.supplierId, prov.supplierName)}
                      >
                        Adjudicar
                      </Button>
                    )}
                  </div>
                </div>
                <div className={s.tablaEnvoltura}>
                  <table className={s.tabla}>
                    <thead>
                      <tr>
                        <th scope="col">Artículo</th>
                        <th scope="col" className={s.num}>Cantidad</th>
                        <th scope="col" className={s.num}>Precio unitario</th>
                        <th scope="col" className={s.num}>Días de entrega</th>
                        {editable && <th scope="col"><span className={s.srOnly}>Acciones</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {prov.lines.map((l) => {
                        const b = borradores[l.id] ?? { unitPrice: "", leadTimeDays: "" };
                        const cambiar = (campo: keyof Borrador, valor: string) =>
                          setBorradores((prev) => ({ ...prev, [l.id]: { ...b, [campo]: valor } }));
                        return (
                          <tr key={l.id}>
                            <td>{l.description}</td>
                            <td className={s.num}>{cantidad(l.quantity)}</td>
                            <td className={s.num}>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                disabled={!editable}
                                value={b.unitPrice}
                                aria-label={`Precio unitario de ${l.description} con ${prov.supplierName}`}
                                onChange={(e) => cambiar("unitPrice", e.target.value)}
                                className={`${s.input} ${s.num}`}
                                style={{ width: 120 }}
                              />
                            </td>
                            <td className={s.num}>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                disabled={!editable}
                                value={b.leadTimeDays}
                                aria-label={`Días de entrega de ${l.description} con ${prov.supplierName}`}
                                onChange={(e) => cambiar("leadTimeDays", e.target.value)}
                                className={`${s.input} ${s.num}`}
                                style={{ width: 90 }}
                              />
                            </td>
                            {editable && (
                              <td className={s.num}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!b.unitPrice || savingLineId != null}
                                  loading={savingLineId === l.id}
                                  onClick={() => onSaveLine(l.id, b)}
                                >
                                  Guardar
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
