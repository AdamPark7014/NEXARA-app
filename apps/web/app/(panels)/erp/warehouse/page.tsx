"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig } from "@/lib/section-views";
import { listStockLevels, mapStockLevelToRow, updateStockLevelConfig, listWarehouses, listCatalogProducts, createStockMovement } from "@/lib/stock-api";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type StockRow = ReturnType<typeof mapStockLevelToRow>;

export default function WarehousePage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "warehouse"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const productFilter = searchParams.get("productId");
  const movementId = searchParams.get("movementId");

  const [items, setItems] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [minimo, setMinimo] = useState(5);
  const [products, setProducts] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [movement, setMovement] = useState({ type: "RECEIPT" as "RECEIPT" | "DISPATCH", productId: "", warehouseId: "", quantity: 1, unitCost: "", reference: "" });
  const [savingMovement, setSavingMovement] = useState(false);
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "", address: "", city: "" });
  const [savingWarehouse, setSavingWarehouse] = useState(false);

  const loadWarehouses = useCallback(() => {
    if (!token) return;
    void listWarehouses(token).then(setWarehouses).catch(() => setWarehouses([]));
  }, [token]);

  const createWarehouse = async () => {
    if (!token || !warehouseForm.name.trim()) return;
    setSavingWarehouse(true);
    try {
      const { buildApiUrl } = await import("@/lib/api-base");
      const res = await fetch(buildApiUrl("warehouse"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: warehouseForm.name.trim(),
          code: warehouseForm.code.trim() || warehouseForm.name.trim().toUpperCase().slice(0, 6).replace(/\s/g, "-"),
          address: warehouseForm.address.trim() || undefined,
          city: warehouseForm.city.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setShowWarehouseForm(false);
      setWarehouseForm({ name: "", code: "", address: "", city: "" });
      void loadWarehouses();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al crear almacén"); }
    finally { setSavingWarehouse(false); }
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const levels = await listStockLevels(token);
      setItems(levels.map(mapStockLevelToRow));
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar el inventario"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => { loadWarehouses(); }, [loadWarehouses]);

  useEffect(() => {
    if (!token) return;
    void listCatalogProducts(token).then(setProducts).catch(() => setProducts([]));
  }, [token]);

  const saveMovement = async () => {
    if (!token || !movement.productId || !movement.warehouseId || movement.quantity <= 0) return;
    setSavingMovement(true);
    try {
      await createStockMovement(token, {
        type: movement.type,
        productId: Number(movement.productId),
        ...(movement.type === "RECEIPT"
          ? { toWarehouseId: Number(movement.warehouseId) }
          : { fromWarehouseId: Number(movement.warehouseId) }),
        quantity: movement.quantity,
        unitCost: movement.unitCost ? Number(movement.unitCost) : undefined,
        reference: movement.reference.trim() || undefined,
      });
      setShowMovementForm(false);
      setMovement({ type: "RECEIPT", productId: "", warehouseId: "", quantity: 1, unitCost: "", reference: "" });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar entrada");
    } finally {
      setSavingMovement(false);
    }
  };

  const openEdit = (s: StockRow) => {
    setEditing(s);
    setMinimo(s.minimo);
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !editing) return;
    try {
      await updateStockLevelConfig(token, editing.id, { minStock: minimo, reorderPoint: minimo });
      setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, minimo } : i)));
      setShowForm(false);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar el mínimo de stock"));
    }
  };

  const sinStock = items.filter((s) => s.existencia === 0).length;
  const bajoMinimo = items.filter((s) => s.existencia > 0 && s.existencia < s.minimo).length;
  const valorTotal = items.reduce((sum, s) => sum + s.existencia * s.costo, 0);

  const stockEstado = (s: StockRow): "danger" | "warning" | "neutral" =>
    s.existencia === 0 ? "danger" : s.existencia < s.minimo ? "warning" : "neutral";

  const visibleItems = useMemo(() => {
    if (!productFilter) return items;
    const pid = Number(productFilter);
    if (Number.isNaN(pid)) return items;
    return items.filter((s) => s.productId === pid);
  }, [items, productFilter]);

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  const columns: Column<StockRow>[] = [
    { key: "sku", label: "SKU", render: (s) => <code style={{ fontSize: 11.5 }}>{s.sku}</code>, width: 110 },
    {
      key: "nombre",
      label: "Producto",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {s.categoria} · {s.ubicacion}
          </div>
        </div>
      ),
    },
    {
      key: "existencia",
      label: "Stock",
      render: (s) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>{s.existencia}</span>
          <Tag variant={stockEstado(s)}>{s.existencia === 0 ? "Sin stock" : s.existencia < s.minimo ? "Bajo mínimo" : "OK"}</Tag>
        </div>
      ),
      width: 160,
    },
    { key: "minimo", label: "Mínimo", accessor: (s) => s.minimo, width: 80 },
    { key: "costo", label: "Precio ref.", render: (s) => <Money value={s.costo} />, width: 110 },
    {
      key: "id",
      label: "",
      render: (s) =>
        cfg.canEdit ? (
          <button onClick={() => openEdit(s)} title="Editar mínimos" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
            ✎
          </button>
        ) : null,
      width: 40,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Almacén"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {cfg.canCreate && (
              <>
                <Button variant="secondary" iconLeft="+" onClick={() => setShowWarehouseForm(true)}>Nuevo almacén</Button>
                <Button variant="primary" iconLeft="+" onClick={() => setShowMovementForm(true)}>Entrada de stock</Button>
              </>
            )}
            <Button variant="ghost" onClick={load}>Actualizar</Button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ padding: "8px 14px", borderRadius: 999, background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
          Stock productos
        </span>
        <Link href="/crm/products" style={{ textDecoration: "none" }}>
          <span style={{ padding: "8px 14px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "inline-block" }}>
            Catálogo productos
          </span>
        </Link>
        <Link href="/ops/tools?tab=inventory" style={{ textDecoration: "none" }}>
          <span style={{ padding: "8px 14px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "inline-block" }}>
            Stock herramientas
          </span>
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Sin stock" value={sinStock} />
        <KpiCard label="Bajo mínimo" value={bajoMinimo} />
        <KpiCard label="Valor inventario" value={`$${(valorTotal / 1000000).toFixed(2)}M`} />
      </div>

      {/* ── Nuevo almacén ── */}
      {showWarehouseForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 13 }}>Nuevo almacén</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre *</span>
              <input value={warehouseForm.name} onChange={e => setWarehouseForm(f => ({ ...f, name: e.target.value }))} placeholder="Almacén Central, Bodega Norte…" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Código (opcional)</span>
              <input value={warehouseForm.code} onChange={e => setWarehouseForm(f => ({ ...f, code: e.target.value }))} placeholder="ALM-01, BODEGA-N…" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Ciudad</span>
              <input value={warehouseForm.city} onChange={e => setWarehouseForm(f => ({ ...f, city: e.target.value }))} placeholder="CDMX, Monterrey…" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Dirección</span>
              <input value={warehouseForm.address} onChange={e => setWarehouseForm(f => ({ ...f, address: e.target.value }))} placeholder="Av. Insurgentes 123…" style={inp} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => setShowWarehouseForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void createWarehouse()} disabled={savingWarehouse || !warehouseForm.name.trim()}>
              {savingWarehouse ? "Creando…" : "Crear almacén"}
            </Button>
          </div>
        </div>
      )}

      {showForm && editing && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 13, margin: "0 0 12px", fontWeight: 600 }}>{editing.nombre}</p>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Stock mínimo / reorden</label>
          <input type="number" min={0} value={minimo} onChange={(e) => setMinimo(+e.target.value)} style={{ ...inp, maxWidth: 200 }} />
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Guardar</Button>
          </div>
        </div>
      )}

      {showMovementForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>{movement.type === "RECEIPT" ? "Entrada de inventario" : "Salida de inventario"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo de movimiento *</span>
              <select value={movement.type} onChange={(e) => setMovement((m) => ({ ...m, type: e.target.value as "RECEIPT" | "DISPATCH" }))} style={inp}>
                <option value="RECEIPT">Entrada (recepción)</option>
                <option value="DISPATCH">Salida (despacho)</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Producto *</span>
              <select value={movement.productId} onChange={(e) => setMovement((m) => ({ ...m, productId: e.target.value }))} style={inp}>
                <option value="">Seleccionar…</option>
                {products.length === 0 && <option disabled>Sin productos — agrégalos en CRM → Productos</option>}
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>{movement.type === "RECEIPT" ? "Almacén destino *" : "Almacén origen *"}</span>
              <select value={movement.warehouseId} onChange={(e) => setMovement((m) => ({ ...m, warehouseId: e.target.value }))} style={inp}>
                <option value="">Seleccionar…</option>
                {warehouses.length === 0 && <option disabled>Sin almacenes — usa "Nuevo almacén" arriba</option>}
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Cantidad *</span>
              <input type="number" min={1} value={movement.quantity} onChange={(e) => setMovement((m) => ({ ...m, quantity: +e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Costo unitario</span>
              <input type="number" min={0} step="0.01" value={movement.unitCost} onChange={(e) => setMovement((m) => ({ ...m, unitCost: e.target.value }))} style={inp} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Referencia</span>
              <input value={movement.reference} onChange={(e) => setMovement((m) => ({ ...m, reference: e.target.value }))} placeholder="OC-000123, ajuste inicial…" style={inp} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Button variant="ghost" onClick={() => setShowMovementForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveMovement()} disabled={savingMovement}>{savingMovement ? "Registrando…" : movement.type === "RECEIPT" ? "Registrar entrada" : "Registrar salida"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} registros de stock`}>
        {productFilter && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Filtrando producto <strong>#{productFilter}</strong>.{" "}
            <Link href="/erp/warehouse" style={{ color: "var(--primary)" }}>Ver todo el inventario</Link>
          </p>
        )}
        {movementId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Enlace desde movimiento de stock <strong>#{movementId}</strong>.
          </p>
        )}
        {loadError && (
          <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
            {loadError} <Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : !loadError ? (
          <DataTable columns={columns} rows={visibleItems} rowKey={(s) => s.id} emptyTitle="Sin stock registrado" emptyDescription="Configura almacenes y niveles de inventario en el backend." />
        ) : null}
      </Section>
    </>
  );
}
