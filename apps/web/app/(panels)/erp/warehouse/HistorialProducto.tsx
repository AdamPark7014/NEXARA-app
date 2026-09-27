"use client";

import { useEffect, useId, useRef } from "react";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/base";
import { exportToExcel } from "@/lib/export-excel";
import { cantidad, fechaHoraCorta, pesos } from "@/lib/recursos-ui";
import { stockMovementDocumentLabel, type mapStockLevelToRow, type StockMovementRow } from "@/lib/stock-api";
import { etiquetaMovimiento, varianteMovimiento } from "./almacen-etiquetas";

type StockRow = ReturnType<typeof mapStockLevelToRow>;

export type TrazaProducto = {
  productId: number;
  sku: string;
  name: string;
  levels: StockRow[];
  movements: StockMovementRow[];
};

const subtitulo = {
  margin: "0 0 10px",
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.3,
} as const;

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
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--nx-ink, #0f172a) 45%, transparent)",
        zIndex: 80,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--nx-panel-elev-2, -8px 0 32px rgba(0,0,0,.12))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 600 }}>
              Historial del producto
            </div>
            <h2 id={tituloId} style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 750 }}>{traza.name}</h2>
            <code style={{ fontSize: 12, color: "var(--text-secondary)" }}>{traza.sku}</code>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={onPdf} disabled={exportingPdf || loading}>
              {exportingPdf ? "Generando…" : "PDF"}
            </Button>
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={exportar} disabled={loading || traza.movements.length === 0}>
              Excel
            </Button>
            <Button ref={cerrarRef} variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </header>
        <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
          {loading ? (
            <SkeletonRows rows={6} label="Cargando historial" />
          ) : (
            <>
              <p style={subtitulo}>Existencia por almacén</p>
              {traza.levels.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
                  Este producto aún no tiene existencia en ningún almacén.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
                  {traza.levels.map((lv) => (
                    <div key={lv.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                      <span>{lv.ubicacion}</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{cantidad(lv.existencia)}</strong>
                    </div>
                  ))}
                </div>
              )}
              <p style={subtitulo}>Movimientos ({traza.movements.length})</p>
              {traza.movements.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Aún no hay movimientos de este producto.</p>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                  {traza.movements.map((m) => (
                    <li key={m.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: "var(--surface)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <code style={{ fontSize: 11 }}>{m.movementNumber}</code>
                          <Tag variant={varianteMovimiento(m.type)}>{etiquetaMovimiento(m.type)}</Tag>
                        </div>
                        <time dateTime={m.createdAt} style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                          {fechaHoraCorta(m.createdAt)}
                        </time>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{cantidad(m.quantity)}</strong>
                        {" · "}
                        {m.fromWarehouse?.name ?? "—"} → {m.toWarehouse?.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "grid", gap: 2, fontVariantNumeric: "tabular-nums" }}>
                        {m.fromQtyBefore != null && <span>Origen: {Number(m.fromQtyBefore)} → {Number(m.fromQtyAfter)}</span>}
                        {m.toQtyBefore != null && <span>Destino: {Number(m.toQtyBefore)} → {Number(m.toQtyAfter)}</span>}
                        <span>Documento: {stockMovementDocumentLabel(m)}</span>
                        <span>Registró: {m.createdBy?.nombre ?? "—"}</span>
                        {m.notes ? <span>Notas: {m.notes}</span> : null}
                        {m.lot ? <span>Lote: {m.lot.lotNumber}</span> : null}
                        {Number(m.totalCost ?? 0) > 0 ? <span>Costo total: {pesos(m.totalCost)}</span> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
