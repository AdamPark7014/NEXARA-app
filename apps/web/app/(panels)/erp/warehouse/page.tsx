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
import { listStockLevels, mapStockLevelToRow, updateStockLevelConfig } from "@/lib/stock-api";

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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [minimo, setMinimo] = useState(5);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const levels = await listStockLevels(token);
      setItems(levels.map(mapStockLevelToRow));
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch {
      /* skip */
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
        title="Inventario / Almacén"
        subtitle="Niveles de stock por producto y ubicación. Los movimientos se registran vía módulo de stock."
        actions={<Button variant="ghost" onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Sin stock" value={sinStock} />
        <KpiCard label="Bajo mínimo" value={bajoMinimo} />
        <KpiCard label="Valor inventario" value={`$${(valorTotal / 1000000).toFixed(2)}M`} />
      </div>

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
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={(s) => s.id} emptyTitle="Sin stock registrado" emptyDescription="Configura almacenes y niveles de inventario en el backend." />
        )}
      </Section>
    </>
  );
}
