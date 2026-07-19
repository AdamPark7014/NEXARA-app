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
import {
  listStockLevels,
  mapStockLevelToRow,
  updateStockLevelConfig,
  listWarehouses,
  listCatalogProducts,
  createStockMovement,
  listStockMovements,
  listLots,
  createLot,
  getStockValuation,
  type StockMovementRow,
  type LotRow,
  type ValuationRow,
} from "@/lib/stock-api";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

type StockRow = ReturnType<typeof mapStockLevelToRow>;

const TABS = [
  { key: "inventario", label: "Inventario" },
  { key: "movimientos", label: "Movimientos" },
  { key: "lotes", label: "Lotes y caducidad" },
  { key: "valuacion", label: "Valuación" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Entrada",
  DISPATCH: "Salida",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolución",
  SCRAP: "Merma",
  PRODUCTION_IN: "Entrada producción",
  PRODUCTION_OUT: "Salida producción",
};

export default function WarehousePage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "warehouse"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const productFilter = searchParams.get("productId");
  const movementId = searchParams.get("movementId");

  const [items, setItems] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
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

  const [tab, setTab] = useState<TabKey>("inventario");

  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState("");

  const [lots, setLots] = useState<LotRow[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [showLotForm, setShowLotForm] = useState(false);
  const [lotForm, setLotForm] = useState({ lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" });
  const [savingLot, setSavingLot] = useState(false);
  const [lotSaveErr, setLotSaveErr] = useState<string | null>(null);

  const [valuation, setValuation] = useState<ValuationRow[]>([]);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationWarehouseFilter, setValuationWarehouseFilter] = useState("");

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
      if (tab === "movimientos") void loadMovements();
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

  const loadMovements = useCallback(async () => {
    if (!token) return;
    setMovementsLoading(true);
    try {
      const rows = await listStockMovements(token, {
        type: movementTypeFilter || undefined,
        warehouseId: movementWarehouseFilter ? Number(movementWarehouseFilter) : undefined,
      });
      setMovements(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los movimientos"));
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  }, [token, movementTypeFilter, movementWarehouseFilter]);

  const loadLots = useCallback(async () => {
    if (!token) return;
    setLotsLoading(true);
    try {
      const rows = await listLots(token);
      setLots(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron cargar los lotes"));
      setLots([]);
    } finally {
      setLotsLoading(false);
    }
  }, [token]);

  const saveLot = async () => {
    if (!token || !lotForm.lotNumber.trim() || !lotForm.productId) {
      setLotSaveErr("Número de lote y producto son obligatorios.");
      return;
    }
    setSavingLot(true);
    setLotSaveErr(null);
    try {
      const created = await createLot(token, {
        lotNumber: lotForm.lotNumber.trim(),
        productId: Number(lotForm.productId),
        expirationDate: lotForm.expirationDate || undefined,
        manufacturingDate: lotForm.manufacturingDate || undefined,
        notes: lotForm.notes.trim() || undefined,
      });
      setLots((prev) => [created, ...prev]);
      setShowLotForm(false);
      setLotForm({ lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" });
    } catch (e) {
      setLotSaveErr(formatApiError(e, "No se pudo crear el lote"));
    } finally {
      setSavingLot(false);
    }
  };

  const loadValuation = useCallback(async () => {
    if (!token) return;
    setValuationLoading(true);
    try {
      const rows = await getStockValuation(token, valuationWarehouseFilter ? Number(valuationWarehouseFilter) : undefined);
      setValuation(rows);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar la valuación"));
      setValuation([]);
    } finally {
      setValuationLoading(false);
    }
  }, [token, valuationWarehouseFilter]);

  useEffect(() => {
    if (tab === "movimientos") void loadMovements();
  }, [tab, loadMovements]);

  useEffect(() => {
    if (tab === "lotes") void loadLots();
  }, [tab, loadLots]);

  useEffect(() => {
    if (tab === "valuacion") void loadValuation();
  }, [tab, loadValuation]);

  const sinStock = items.filter((s) => s.existencia === 0).length;
  const bajoMinimo = items.filter((s) => s.existencia > 0 && s.existencia < s.minimo).length;
  const valorTotal = items.reduce((sum, s) => sum + s.existencia * s.costo, 0);

  const stockEstado = (s: StockRow): "danger" | "warning" | "neutral" =>
    s.existencia === 0 ? "danger" : s.existencia < s.minimo ? "warning" : "neutral";

  const visibleItems = useMemo(() => {
    let rows = items;
    if (productFilter) {
      const pid = Number(productFilter);
      if (!Number.isNaN(pid)) rows = rows.filter((s) => s.productId === pid);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((s) =>
        (s.nombre ?? "").toLowerCase().includes(q) ||
        (s.sku ?? "").toLowerCase().includes(q) ||
        (s.categoria ?? "").toLowerCase().includes(q)
      );
    }
    if (filterEstado === "sin_stock") rows = rows.filter((s) => s.existencia === 0);
    else if (filterEstado === "bajo_minimo") rows = rows.filter((s) => s.existencia > 0 && s.existencia < s.minimo);
    else if (filterEstado === "ok") rows = rows.filter((s) => s.existencia >= s.minimo);
    return rows;
  }, [items, productFilter, searchQ, filterEstado]);

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
      render: (s) => {
        const pct = s.minimo > 0 ? Math.min(100, (s.existencia / (s.minimo * 2)) * 100) : (s.existencia > 0 ? 50 : 0);
        const color = s.existencia === 0 ? "var(--danger)" : s.existencia < s.minimo ? "var(--warning)" : "var(--success)";
        return (
          <div style={{ minWidth: 130 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.existencia}</span>
              <Tag variant={stockEstado(s)}>{s.existencia === 0 ? "Sin stock" : s.existencia < s.minimo ? "Bajo mín." : "OK"}</Tag>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .3s" }} />
            </div>
          </div>
        );
      },
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

  const movementColumns: Column<StockMovementRow>[] = [
    { key: "movementNumber", label: "Folio", render: (m) => <code style={{ fontSize: 11.5 }}>{m.movementNumber}</code>, width: 120 },
    { key: "type", label: "Tipo", render: (m) => (
      <Tag variant={m.type === "RECEIPT" || m.type === "PRODUCTION_IN" || m.type === "RETURN" ? "positive" : m.type === "SCRAP" ? "danger" : "default"}>
        {MOVEMENT_TYPE_LABEL[m.type] ?? m.type}
      </Tag>
    ), width: 130 },
    { key: "product", label: "Producto", render: (m) => (
      <div>
        <div style={{ fontSize: 13 }}>{m.product?.name ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.product?.sku}{m.lot ? ` · Lote ${m.lot.lotNumber}` : ""}</div>
      </div>
    ) },
    { key: "route", label: "Origen → Destino", render: (m) => (
      <span style={{ fontSize: 12 }}>{m.fromWarehouse?.name ?? "—"} → {m.toWarehouse?.name ?? "—"}</span>
    ), width: 200 },
    { key: "quantity", label: "Cantidad", render: (m) => <strong style={{ fontSize: 13 }}>{Number(m.quantity)}</strong>, width: 90, numeric: true },
    { key: "totalCost", label: "Costo total", render: (m) => <Money value={Number(m.totalCost ?? 0)} compact />, width: 110, numeric: true },
    { key: "createdAt", label: "Fecha", render: (m) => (
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{new Date(m.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
    ), width: 140 },
    { key: "createdBy", label: "Registró", accessor: (m) => m.createdBy?.nombre ?? "—", width: 130 },
  ];

  const today = new Date();
  const lotColumns: Column<LotRow>[] = [
    { key: "lotNumber", label: "Lote", render: (l) => <code style={{ fontSize: 12 }}>{l.lotNumber}</code>, width: 130 },
    { key: "product", label: "Producto", render: (l) => (
      <div>
        <div style={{ fontSize: 13 }}>{l.product?.name ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{l.product?.sku}</div>
      </div>
    ) },
    { key: "manufacturingDate", label: "Fabricación", render: (l) => l.manufacturingDate ? <span style={{ fontSize: 12 }}>{new Date(l.manufacturingDate).toLocaleDateString("es-MX")}</span> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "expirationDate", label: "Caducidad", width: 150, render: (l) => {
      if (!l.expirationDate) return <span style={{ color: "var(--text-tertiary)" }}>Sin caducidad</span>;
      const exp = new Date(l.expirationDate);
      const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
      const variant = days < 0 ? "danger" : days <= 30 ? "warning" : "positive";
      const text = days < 0 ? `Vencido hace ${Math.abs(days)}d` : days <= 30 ? `Vence en ${days}d` : exp.toLocaleDateString("es-MX");
      return <Tag variant={variant}>{text}</Tag>;
    } },
    { key: "notes", label: "Notas", accessor: (l) => l.notes ?? "—" },
  ];

  const valuationColumns: Column<ValuationRow>[] = [
    { key: "product", label: "Producto", render: (v) => (
      <div>
        <div style={{ fontSize: 13 }}>{v.product?.name ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{v.product?.sku}</div>
      </div>
    ) },
    { key: "warehouse", label: "Almacén", accessor: (v) => v.warehouse?.name ?? "—", width: 150 },
    { key: "quantity", label: "Cantidad", render: (v) => Number(v.quantity), width: 90, numeric: true },
    { key: "availableQty", label: "Disponible", render: (v) => Number(v.availableQty), width: 100, numeric: true },
    { key: "unitCost", label: "Costo unit.", render: (v) => <Money value={Number(v.unitCost ?? 0)} compact />, width: 110, numeric: true },
    { key: "totalValue", label: "Valor total", render: (v) => <Money value={v.totalValue} compact />, width: 130, numeric: true },
  ];

  const totalValuation = useMemo(() => valuation.reduce((s, v) => s + v.totalValue, 0), [valuation]);
  const expiringLotsCount = useMemo(() => lots.filter((l) => {
    if (!l.expirationDate) return false;
    const days = Math.floor((new Date(l.expirationDate).getTime() - Date.now()) / 86400000);
    return days <= 30;
  }).length, [lots]);

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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      {/* ── Nuevo almacén (disponible desde cualquier pestaña) ── */}
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

      {/* ── Entrada/salida de stock (disponible desde cualquier pestaña) ── */}
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

      {tab === "inventario" && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Sin stock" value={sinStock} variant={sinStock > 0 ? "danger" : "positive"} hint={sinStock > 0 ? "Requieren reposición urgente" : "Todo disponible"} icon="📦" />
        <KpiCard label="Bajo mínimo" value={bajoMinimo} variant={bajoMinimo > 0 ? "warning" : "positive"} hint={bajoMinimo > 0 ? "Por debajo del punto de reorden" : "Niveles OK"} icon="⚠️" />
        <KpiCard label="Valor inventario" value={<Money value={valorTotal} compact />} hint={`${items.length} SKUs en catálogo`} variant="accent" icon="💰" />
        <KpiCard label="Almacenes" value={warehouses.length} hint="Ubicaciones configuradas" icon="🏭" />
      </div>

      {items.length > 0 && (() => {
        const byCategory = Object.entries(
          items.reduce<Record<string, number>>((acc, s) => { const k = s.categoria || "Sin categoría"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>SKUs por categoría</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {byCategory.map(([cat, count]) => (
                <div key={cat} style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{cat}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: "var(--primary)", borderRadius: 3, transition: "width .4s" }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por SKU, nombre o categoría…" }}
        selects={[{
          label: "Estado",
          value: filterEstado,
          onChange: setFilterEstado,
          options: [
            { value: "sin_stock", label: "Sin stock" },
            { value: "bajo_minimo", label: "Bajo mínimo" },
            { value: "ok", label: "Stock OK" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "sku", label: "SKU" },
            { key: "nombre", label: "Producto" },
            { key: "categoria", label: "Categoría" },
            { key: "existencia", label: "Stock" },
            { key: "minimo", label: "Mínimo" },
            { key: "costo", label: "Precio ref." },
            { key: "ubicacion", label: "Ubicación" },
          ], "inventario")}>Excel</Button>
        ) : undefined}
      />

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
      )}

      {tab === "movimientos" && (
        <Section
          title="Movimientos de inventario"
          subtitle="Historial de entradas, salidas, traspasos y ajustes registrados en el almacén."
          actions={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={movementWarehouseFilter} onChange={(e) => setMovementWarehouseFilter(e.target.value)} style={{ ...inp, width: 170 }}>
                <option value="">Todos los almacenes</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <select value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)} style={{ ...inp, width: 150 }}>
                <option value="">Todos los tipos</option>
                {Object.entries(MOVEMENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {cfg.canCreate && (
                <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowMovementForm(true)}>Registrar movimiento</Button>
              )}
            </div>
          }
        >
          {movementsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={movementColumns} rows={movements} rowKey={(m) => m.id} emptyTitle="Sin movimientos" emptyDescription="Registra una entrada o salida de inventario para ver el historial aquí." />
          )}
        </Section>
      )}

      {tab === "lotes" && (
        <Section
          title="Lotes y caducidad"
          subtitle="Trazabilidad por lote de fabricación, con alerta cuando se acerca la fecha de caducidad."
          actions={cfg.canCreate ? (
            <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setLotForm({ lotNumber: "", productId: "", expirationDate: "", manufacturingDate: "", notes: "" }); setShowLotForm(true); }}>
              Nuevo lote
            </Button>
          ) : undefined}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
            <KpiCard label="Lotes registrados" value={lots.length} icon="🧾" />
            <KpiCard
              label="Por vencer / vencidos"
              value={expiringLotsCount}
              variant={expiringLotsCount > 0 ? "warning" : "positive"}
              hint="Caducidad en 30 días o menos"
              icon={expiringLotsCount > 0 ? "⏰" : "✅"}
            />
          </div>
          {showLotForm && (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Número de lote</label>
                <input value={lotForm.lotNumber} onChange={(e) => setLotForm((f) => ({ ...f, lotNumber: e.target.value }))} placeholder="LOTE-2026-001" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Producto</label>
                <select value={lotForm.productId} onChange={(e) => setLotForm((f) => ({ ...f, productId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha de fabricación (opcional)</label>
                <input type="date" value={lotForm.manufacturingDate} onChange={(e) => setLotForm((f) => ({ ...f, manufacturingDate: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha de caducidad (opcional)</label>
                <input type="date" value={lotForm.expirationDate} onChange={(e) => setLotForm((f) => ({ ...f, expirationDate: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas (opcional)</label>
                <input value={lotForm.notes} onChange={(e) => setLotForm((f) => ({ ...f, notes: e.target.value }))} style={inp} />
              </div>
              {lotSaveErr && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>{lotSaveErr}</div>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => { setShowLotForm(false); setLotSaveErr(null); }}>Cancelar</Button>
                <Button variant="primary" onClick={() => void saveLot()} disabled={savingLot}>{savingLot ? "Guardando…" : "Crear lote"}</Button>
              </div>
            </div>
          )}
          {lotsLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={lotColumns} rows={lots} rowKey={(l) => l.id} emptyTitle="Sin lotes" emptyDescription="Registra el primer lote para trazabilidad y control de caducidad." />
          )}
        </Section>
      )}

      {tab === "valuacion" && (
        <Section
          title="Valuación de inventario"
          subtitle="Costo unitario y valor total por producto y almacén, según el método de valuación configurado."
          actions={
            <select value={valuationWarehouseFilter} onChange={(e) => setValuationWarehouseFilter(e.target.value)} style={{ ...inp, width: 200 }}>
              <option value="">Todos los almacenes</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
            <KpiCard label="Valor total en valuación" value={<Money value={totalValuation} compact />} variant="accent" icon="💰" />
            <KpiCard label="SKUs valuados" value={valuation.length} icon="📦" />
          </div>
          {valuationLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={valuationColumns} rows={valuation} rowKey={(v) => v.id} emptyTitle="Sin datos de valuación" emptyDescription="No hay niveles de stock configurados para este almacén." />
          )}
        </Section>
      )}
    </>
  );
}
