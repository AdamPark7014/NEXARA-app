"use client";

/**
 * Entrada por cuña USB (HID): el escáner escribe el código y Enter dispara el lookup;
 * luego se confirma la entrada de stock al almacén elegido.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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

export default function ScannerAlmacenPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [hit, setHit] = useState<Match | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!token) return;
    void listWarehouses(token)
      .then((rows) => {
        const list = rows.map((w) => ({ id: w.id, name: w.name }));
        setWarehouses(list);
        if (list[0]) setWarehouseId(list[0].id);
      })
      .catch(() => setWarehouses([]));
  }, [token]);

  const buscar = useCallback(async () => {
    const q = code.trim();
    if (!q || !token) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se encontró el código");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [code, token]);

  const confirmarEntrada = async () => {
    if (!hit || !token || warehouseId === "") return;
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      await createStockMovement(token, {
        type: "RECEIPT",
        productId: hit.product.id,
        toWarehouseId: Number(warehouseId),
        quantity,
        packagingId: hit.match === "empaque" ? hit.packaging.id : undefined,
        cantidadCapturada: hit.match === "empaque" ? quantity : undefined,
        unidadCaptura: hit.match === "empaque" ? hit.packaging.nombre : undefined,
        notes: `Escáner HID · ${hit.codigoBarras}`,
        reference: hit.codigoBarras,
      });
      setOkMsg(`Entrada registrada: ${hit.product.name}`);
      setHit(null);
      setQty("1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la entrada");
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Escáner de almacén</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          Conecta la cuña USB: escanea el código, confirma almacén y cantidad, y registra la entrada.
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código de barras…"
          autoComplete="off"
          autoFocus
          style={{
            flex: 1,
            minWidth: 200,
            minHeight: 44,
            fontSize: 16,
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid var(--primary)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          style={{
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
      {okMsg && <div style={{ color: "var(--success)", fontSize: 13 }}>{okMsg}</div>}
      {hit && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "color-mix(in srgb, var(--success) 12%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--success) 35%, var(--border))",
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <strong>{hit.product.name}</strong>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              SKU {hit.product.sku} · código {hit.codigoBarras}
            </div>
            {hit.match === "empaque" && (
              <div style={{ fontSize: 13 }}>
                Empaque: {hit.packaging.nombre} ({hit.packaging.piezasPorUnidad} pzas)
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
              style={{ minHeight: 40, borderRadius: 8, padding: "0 10px", fontSize: 14 }}
            >
              <option value="">Almacén…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.001}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Cantidad"
              style={{ width: 100, minHeight: 40, borderRadius: 8, padding: "0 10px", fontSize: 16 }}
            />
            <button
              type="button"
              onClick={() => void confirmarEntrada()}
              disabled={saving || warehouseId === ""}
              style={{
                minHeight: 40,
                padding: "0 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--success)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {saving ? "Guardando…" : "Confirmar entrada"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
