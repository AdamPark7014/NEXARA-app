"use client";

/**
 * Entrada por cuña USB (HID): ráfaga rápida de teclas + Enter = escaneo;
 * tras el lookup el operador elige el tipo de movimiento y confirma.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createStockMovement, listWarehouses } from "@/lib/stock-api";

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

const OP_LABELS: Record<OpType, string> = {
  RECEIPT: "Entrada (recepción)",
  DISPATCH: "Salida (despacho)",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste (alta)",
  ADJUSTMENT_OUT: "Ajuste (baja)",
  RETURN: "Devolución",
};

/** Gap máximo entre teclas para tratarlas como ráfaga HID. */
const SCAN_CHAR_MS = 45;
/** Longitud mínima del código para aceptar Enter como escaneo. */
const MIN_SCAN_LEN = 3;

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
      setOkMsg(`${OP_LABELS[opType]} · ${hit.product.name}`);
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
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: 10,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Escáner de almacén</div>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
          Cuña USB: ráfaga + Enter busca el producto. Luego elige operación, almacén y cantidad.
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busyRef.current) return;
          void buscarCodigo(code);
        }}
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onScanKeyDown}
          placeholder="Código de barras…"
          autoComplete="off"
          autoFocus
          disabled={loading || saving}
          style={{
            flex: 1,
            minWidth: 180,
            minHeight: 40,
            fontSize: 15,
            padding: "8px 10px",
            borderRadius: 8,
            border: "2px solid var(--primary)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        />
        <button
          type="submit"
          disabled={loading || saving || !code.trim()}
          style={{
            minHeight: 40,
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading || saving ? 0.6 : 1,
          }}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
      {okMsg && <div style={{ color: "var(--success)", fontSize: 12.5 }}>{okMsg}</div>}
      {hit && (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: "color-mix(in srgb, var(--success) 12%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--success) 35%, var(--border))",
            display: "grid",
            gap: 8,
          }}
        >
          <div>
            <strong>{hit.product.name}</strong>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              SKU {hit.product.sku} · código {hit.codigoBarras}
            </div>
            {hit.match === "empaque" && (
              <div style={{ fontSize: 12.5 }}>
                Empaque: {hit.packaging.nombre} ({hit.packaging.piezasPorUnidad} pzas)
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={opType}
              onChange={(e) => setOpType(e.target.value as OpType)}
              aria-label="Tipo de operación"
              style={{ minHeight: 36, borderRadius: 8, padding: "0 8px", fontSize: 13 }}
            >
              {(Object.keys(OP_LABELS) as OpType[]).map((k) => (
                <option key={k} value={k}>
                  {OP_LABELS[k]}
                </option>
              ))}
            </select>
            {needsFrom && (
              <select
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value ? Number(e.target.value) : "")}
                aria-label="Almacén origen"
                style={{ minHeight: 36, borderRadius: 8, padding: "0 8px", fontSize: 13 }}
              >
                <option value="">Origen…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            {needsTo && (
              <select
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value ? Number(e.target.value) : "")}
                aria-label="Almacén destino"
                style={{ minHeight: 36, borderRadius: 8, padding: "0 8px", fontSize: 13 }}
              >
                <option value="">Destino…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Cantidad"
              style={{ width: 88, minHeight: 36, borderRadius: 8, padding: "0 8px", fontSize: 15 }}
            />
            <button
              type="button"
              onClick={() => void confirmarMovimiento()}
              disabled={confirmDisabled}
              style={{
                minHeight: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "none",
                background: "var(--success)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                opacity: confirmDisabled ? 0.6 : 1,
              }}
            >
              {saving ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
