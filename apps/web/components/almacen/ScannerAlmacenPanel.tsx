"use client";

/**
 * Entrada por cuña USB (HID): ráfaga rápida de teclas + Enter = escaneo;
 * tras el lookup el operador elige el tipo de movimiento y confirma.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createStockMovement, listWarehouses } from "@/lib/stock-api";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { FinanceField, FinanceFormGrid } from "@/components/finance/FinanceModuleShell";

type Match =
  | {
      match: "empaque";
      codigoBarras: string;
      packaging: { id: number; nombre: string; piezasPorUnidad: number };
      product: { id: number; sku: string; name: string };
    }
  | {
      match: "producto";
      codigoBarras: string;
      product: { id: number; sku: string; name: string };
    };

type OpType = "RECEIPT" | "DISPATCH" | "TRANSFER" | "ADJUSTMENT" | "ADJUSTMENT_OUT" | "RETURN";

/**
 * Lo que queda escrito en la nota del movimiento. No se toca: cambiarlo
 * dejaría el historial con dos formas de nombrar la misma operación.
 */
const OP_LABELS: Record<OpType, string> = {
  RECEIPT: "Entrada (recepción)",
  DISPATCH: "Salida (despacho)",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste (alta)",
  ADJUSTMENT_OUT: "Ajuste (baja)",
  RETURN: "Devolución",
};

/** Lo que lee el operador. Sin paréntesis ni sinónimos: qué le pasa al stock. */
const OP_UI: Record<OpType, string> = {
  RECEIPT: "Entra material",
  DISPATCH: "Sale material",
  TRANSFER: "Se mueve de almacén",
  ADJUSTMENT: "Ajuste: sobra",
  ADJUSTMENT_OUT: "Ajuste: falta",
  RETURN: "Devuelven material",
};

/** Gap máximo entre teclas para tratarlas como ráfaga HID. */
const SCAN_CHAR_MS = 45;
/** Longitud mínima del código para aceptar Enter como escaneo. */
const MIN_SCAN_LEN = 3;

/** El error va atado al campo del código: sin esto se anuncia suelto. */
const ERROR_ID = "escaner-almacen-error";

const campo: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 36,
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 14,
};

export default function ScannerAlmacenPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const busyRef = useRef(false);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [hit, setHit] = useState<Match | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [opType, setOpType] = useState<OpType>("RECEIPT");
  const [fromWarehouseId, setFromWarehouseId] = useState<number | "">("");
  const [toWarehouseId, setToWarehouseId] = useState<number | "">("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    busyRef.current = loading || saving;
  }, [loading, saving]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!token) return;
    void listWarehouses(token)
      .then((rows) => {
        const list = rows.map((w) => ({ id: w.id, name: w.name }));
        setWarehouses(list);
        if (list[0]) {
          setFromWarehouseId(list[0].id);
          setToWarehouseId(list[0].id);
        }
      })
      .catch(() => setWarehouses([]));
  }, [token]);

  const needsFrom =
    opType === "DISPATCH" || opType === "TRANSFER" || opType === "ADJUSTMENT_OUT";
  const needsTo =
    opType === "RECEIPT" || opType === "TRANSFER" || opType === "ADJUSTMENT" || opType === "RETURN";

  const buscarCodigo = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || !token || busyRef.current) return;
      if (q.length < MIN_SCAN_LEN) {
        setError(`Código demasiado corto (mín. ${MIN_SCAN_LEN})`);
        return;
      }
      setLoading(true);
      setError(null);
      setOkMsg(null);
      setHit(null);
      try {
        const res = await fetch(buildApiUrl(`stock/barcode/${encodeURIComponent(q)}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        setHit((await res.json()) as Match);
        setCode("");
        bufferRef.current = "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se encontró el código");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [token],
  );

  const onScanKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();

    if (e.key === "Enter") {
      e.preventDefault();
      if (busyRef.current) return;
      const candidate = (bufferRef.current || code).trim();
      bufferRef.current = "";
      lastKeyAtRef.current = 0;
      if (candidate.length < MIN_SCAN_LEN) {
        if (candidate.length > 0) setError(`Código demasiado corto (mín. ${MIN_SCAN_LEN})`);
        return;
      }
      void buscarCodigo(candidate);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const gap = now - lastKeyAtRef.current;
      if (lastKeyAtRef.current > 0 && gap > SCAN_CHAR_MS) {
        bufferRef.current = "";
      }
      bufferRef.current += e.key;
      lastKeyAtRef.current = now;
    }
  };

  const confirmarMovimiento = async () => {
    if (!hit || !token) return;
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    if (needsFrom && fromWarehouseId === "") {
      setError("Indica el almacén de origen");
      return;
    }
    if (needsTo && toWarehouseId === "") {
      setError("Indica el almacén de destino");
      return;
    }
    if (opType === "TRANSFER" && fromWarehouseId === toWarehouseId) {
      setError("Origen y destino deben ser distintos");
      return;
    }

    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const apiType = opType === "ADJUSTMENT_OUT" ? "ADJUSTMENT" : opType;
      const payload: Parameters<typeof createStockMovement>[1] = {
        type: apiType,
        productId: hit.product.id,
        quantity,
        packagingId: hit.match === "empaque" ? hit.packaging.id : undefined,
        cantidadCapturada: hit.match === "empaque" ? quantity : undefined,
        unidadCaptura: hit.match === "empaque" ? hit.packaging.nombre : undefined,
        notes: `Escáner HID · ${hit.codigoBarras} · ${OP_LABELS[opType]}`,
        reference: hit.codigoBarras,
      };
      if (needsFrom) payload.fromWarehouseId = Number(fromWarehouseId);
      if (needsTo) payload.toWarehouseId = Number(toWarehouseId);

      await createStockMovement(token, payload);
      setOkMsg(`${OP_UI[opType]}: ${hit.product.name}`);
      setHit(null);
      setQty("1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  const confirmDisabled =
    saving ||
    (needsFrom && fromWarehouseId === "") ||
    (needsTo && toWarehouseId === "") ||
    (opType === "TRANSFER" && fromWarehouseId !== "" && fromWarehouseId === toWarehouseId);

  return (
    <Section
      title="Escanear"
      subtitle="Dispara el lector sobre el código. El producto aparece abajo y ahí decides qué pasó con él."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busyRef.current) return;
          void buscarCodigo(code);
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onScanKeyDown}
          placeholder="Código de barras…"
          aria-label="Código de barras"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          autoComplete="off"
          autoFocus
          disabled={loading || saving}
          style={{ ...campo, flex: "1 1 220px", maxWidth: 360 }}
        />
        <Button type="submit" variant="primary" loading={loading} disabled={!code.trim() || saving}>
          Buscar
        </Button>
      </form>

      {error && (
        <div id={ERROR_ID} style={{ marginTop: 10 }}>
          <InlineAlert variant="danger" message={error} onDismiss={() => setError(null)} />
        </div>
      )}
      {okMsg && (
        <div style={{ marginTop: 10 }}>
          <InlineAlert variant="success" message={okMsg} onDismiss={() => setOkMsg(null)} />
        </div>
      )}

      {hit ? (
        // El hallazgo no va en una caja verde: el producto ya es el protagonista
        // y el color se reserva para lo que pide acción o salió mal.
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <strong style={{ fontSize: 15 }}>{hit.product.name}</strong>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Clave {hit.product.sku} · código {hit.codigoBarras}
              {hit.match === "empaque"
                ? ` · ${hit.packaging.nombre} de ${hit.packaging.piezasPorUnidad} piezas`
                : ""}
            </span>
          </div>

          <FinanceFormGrid>
            <FinanceField label="Qué pasó">
              <select
                value={opType}
                onChange={(e) => setOpType(e.target.value as OpType)}
                style={campo}
              >
                {(Object.keys(OP_UI) as OpType[]).map((k) => (
                  <option key={k} value={k}>
                    {OP_UI[k]}
                  </option>
                ))}
              </select>
            </FinanceField>

            {needsFrom && (
              <FinanceField label="Sale de">
                <select
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value ? Number(e.target.value) : "")}
                  style={campo}
                >
                  <option value="">Elige almacén…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </FinanceField>
            )}

            {needsTo && (
              <FinanceField label="Entra a">
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value ? Number(e.target.value) : "")}
                  style={campo}
                >
                  <option value="">Elige almacén…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </FinanceField>
            )}

            <FinanceField
              label="Cantidad"
              hint={hit.match === "empaque" ? hit.packaging.nombre : undefined}
            >
              <input
                type="number"
                min={0.001}
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={{ ...campo, fontVariantNumeric: "tabular-nums" }}
              />
            </FinanceField>
          </FinanceFormGrid>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              paddingTop: 12,
              borderTop: "1px solid var(--nx-panel-hairline, var(--border))",
            }}
          >
            <Button variant="ghost" onClick={() => setHit(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmarMovimiento()}
              disabled={confirmDisabled}
              loading={saving}
            >
              Registrar movimiento
            </Button>
          </div>
        </div>
      ) : okMsg ? null : (
        // Tras registrar un movimiento manda el aviso de «listo», no este hueco.
        <div style={{ marginTop: 8 }}>
          <EmptyState
            variant="compact"
            title="Nada escaneado todavía"
            description="Dispara el lector sobre el código de barras, o tecléalo y pulsa Buscar."
          />
        </div>
      )}
    </Section>
  );
}
