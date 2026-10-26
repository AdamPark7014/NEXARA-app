"use client";

import { useEffect, useId, useRef } from "react";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import { Badge, Button, SkeletonRows, Timeline, TimelineItem, type TimelineState } from "@/components/base";
import { claseMono } from "@/components/almacen/PiezasAlmacen";
import { exportToExcel } from "@/lib/export-excel";
import { cantidad, fechaHoraCorta, pesos } from "@/lib/recursos-ui";
import { stockMovementDocumentLabel, type mapStockLevelToRow, type StockMovementRow } from "@/lib/stock-api";
import { TONO_DE_VARIANTE, etiquetaMovimiento, varianteMovimiento } from "./almacen-etiquetas";
import s from "./almacen.module.css";

type StockRow = ReturnType<typeof mapStockLevelToRow>;

/**
 * A 390 px cada dato del movimiento va en su renglón: tipo, cantidad, origen,
 * destino, folio y hora. En escritorio siguen en la misma línea. El corte es
 * 480 px para cubrir el teléfono (390) sin partir el escritorio (1440).
 */
const HISTORIAL_TELEFONO = `
@media (max-width: 480px) {
  [data-nx-historial] .nxHpTipo,
  [data-nx-historial] .nxHpCantidad,
  [data-nx-historial] .nxHpOrigen,
  [data-nx-historial] .nxHpDestino,
  [data-nx-historial] .nxHpFolio,
  [data-nx-historial] .nxHpHora {
    display: block;
  }
  [data-nx-historial] .nxHpOrigen,
  [data-nx-historial] .nxHpDestino {
    overflow-wrap: anywhere;
  }
  [data-nx-historial] .nxHpCantidad,
  [data-nx-historial] .nxHpOrigen,
  [data-nx-historial] .nxHpDestino,
  [data-nx-historial] .nxHpHora {
    margin-top: 2px;
  }
  [data-nx-historial] .nxHpSp,
  [data-nx-historial] .nxHpSep {
    display: none;
  }
}
`;

export type TrazaProducto = {
  productId: number;
  sku: string;
  name: string;
  levels: StockRow[];
  movements: StockMovementRow[];
};

/** Entradas en verde, mermas en rojo, el resto neutro: el color de la línea de tiempo. */
function estadoDelMovimiento(tipo: string): TimelineState {
  const variante = varianteMovimiento(tipo);
  if (variante === "positive") return "done";
  if (variante === "danger") return "danger";
  return "default";
}

/** Panel lateral: existencia por almacén y línea de tiempo de un producto. */
export default function HistorialProducto({
  traza,
  loading,
  exportingPdf,
  onPdf,
  onClose,
}: {
  traza: TrazaProducto;
  loading: boolean;
  exportingPdf: boolean;
  onPdf: () => void;
  onClose: () => void;
}) {
  const tituloId = useId();
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previo?.focus?.();
    };
  }, [onClose]);

  const exportar = () =>
    exportToExcel(
      traza.movements.map((m) => ({
        folio: m.movementNumber,
        tipo: etiquetaMovimiento(m.type),
        origen: m.fromWarehouse?.name ?? "",
        destino: m.toWarehouse?.name ?? "",
        cantidad: Number(m.quantity),
        saldoOrigen: m.fromQtyBefore != null ? `${Number(m.fromQtyBefore)} → ${Number(m.fromQtyAfter)}` : "",
        saldoDestino: m.toQtyBefore != null ? `${Number(m.toQtyBefore)} → ${Number(m.toQtyAfter)}` : "",
        documento: stockMovementDocumentLabel(m),
        notas: m.notes ?? "",
        fecha: new Date(m.createdAt).toLocaleString("es-MX"),
        quien: m.createdBy?.nombre ?? "",
      })),
      [
        { key: "folio", label: "Folio" },
        { key: "tipo", label: "Tipo" },
        { key: "origen", label: "Origen" },
        { key: "destino", label: "Destino" },
        { key: "cantidad", label: "Cantidad" },
        { key: "saldoOrigen", label: "Saldo origen" },
        { key: "saldoDestino", label: "Saldo destino" },
        { key: "documento", label: "Documento" },
        { key: "notas", label: "Notas" },
        { key: "fecha", label: "Fecha" },
        { key: "quien", label: "Registró" },
      ],
      `historial-${traza.sku}`,
      `Historial ${traza.sku}`,
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      className={s.capa}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className={s.cajon} data-nx-historial="">
        <style>{HISTORIAL_TELEFONO}</style>
        <header className={s.cajonCabeza}>
          <div className={s.cajonTexto}>
            <p className={s.rotulo}>Historial del producto</p>
            <h2 id={tituloId} className={s.cajonTitulo}>{traza.name}</h2>
            <code className={claseMono}>{traza.sku}</code>
          </div>
          <div className={s.cajonAcciones}>
            <Button variant="ghost" size="sm" iconStart={<PictureAsPdfOutlined fontSize="small" />} onClick={onPdf} disabled={exportingPdf || loading}>
              {exportingPdf ? "Generando…" : "PDF"}
            </Button>
            <Button variant="ghost" size="sm" iconStart={<FileDownloadOutlined fontSize="small" />} onClick={exportar} disabled={loading || traza.movements.length === 0}>
              Excel
            </Button>
            <Button ref={cerrarRef} variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </header>
        <div className={s.cajonCuerpo}>
          {loading ? (
            <SkeletonRows rows={6} label="Cargando historial" />
          ) : (
            <>
              <section>
                <p className={s.rotulo}>Existencia por almacén</p>
                {traza.levels.length === 0 ? (
                  <p className={s.textoVacio}>Este producto aún no tiene existencia en ningún almacén.</p>
                ) : (
                  <ul className={s.existencias}>
                    {traza.levels.map((lv) => (
                      <li key={lv.id} className={s.existencia}>
                        <span>{lv.ubicacion}</span>
                        <strong className={s.cifra}>{cantidad(lv.existencia)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <p className={s.rotulo}>Movimientos ({traza.movements.length})</p>
                {traza.movements.length === 0 ? (
                  <p className={s.textoVacio}>Aún no hay movimientos de este producto.</p>
                ) : (
                  <Timeline ariaLabel="Movimientos del producto">
                    {traza.movements.map((m) => (
                      <TimelineItem
                        key={m.id}
                        state={estadoDelMovimiento(m.type)}
                        title={
                          <>
                            <Badge tone={TONO_DE_VARIANTE[varianteMovimiento(m.type)]} size="sm" className="nxHpTipo">
                              {etiquetaMovimiento(m.type)}
                            </Badge>
                            <span className="nxHpSp"> </span>
                            <strong className={`${s.cifra} nxHpCantidad`}>{cantidad(m.quantity)}</strong>
                            <span className="nxHpSep"> · </span>
                            <span className="nxHpOrigen">{m.fromWarehouse?.name ?? "—"}</span>
                            <span className="nxHpDestino"> → {m.toWarehouse?.name ?? "—"}</span>
                          </>
                        }
                        meta={
                          <>
                            <code className={`${claseMono} nxHpFolio`}>{m.movementNumber}</code>
                            <span className="nxHpSep"> · </span>
                            <time className="nxHpHora" dateTime={m.createdAt}>{fechaHoraCorta(m.createdAt)}</time>
                          </>
                        }
                      >
                        <div className={s.detalle}>
                          {m.fromQtyBefore != null && <span>Origen: {Number(m.fromQtyBefore)} → {Number(m.fromQtyAfter)}</span>}
                          {m.toQtyBefore != null && <span>Destino: {Number(m.toQtyBefore)} → {Number(m.toQtyAfter)}</span>}
                          <span>Documento: {stockMovementDocumentLabel(m)}</span>
                          <span>Registró: {m.createdBy?.nombre ?? "—"}</span>
                          {m.notes ? <span>Notas: {m.notes}</span> : null}
                          {m.lot ? <span>Lote: {m.lot.lotNumber}</span> : null}
                          {Number(m.totalCost ?? 0) > 0 ? <span>Costo total: {pesos(m.totalCost)}</span> : null}
                        </div>
                      </TimelineItem>
                    ))}
                  </Timeline>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
