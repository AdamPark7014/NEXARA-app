"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getCrmCatalogSectionConfig } from "@/lib/section-views";
import { createCatalogProduct, listCatalogProducts, listCatalogCategories, type CatalogProduct } from "@/lib/catalog-api";

const MARGIN = 1.35;

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

const emptyForm = { sku: "", name: "", category: "", price: "", description: "" };

function stockTotal(p: CatalogProduct): number {
  return (p.stockLevels ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
}

export default function ProductsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmCatalogSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Create form ────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listCatalogProducts(token, { take: 200 });
      setItems(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showForm && token && !categories.length) {
      listCatalogCategories(token).then(setCategories).catch(() => {/* ok */});
    }
  }, [showForm, token, categories.length]);

  const saveProduct = async () => {
    if (!token || !form.sku.trim() || !form.name.trim()) return;
    setSaving(true);
    try {
      const created = await createCatalogProduct(token, {
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        price: form.price ? Number(form.price) : undefined,
        description: form.description.trim() || undefined,
      });
      setItems(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      window.alert("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => (p.name ?? "").toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const columns: Column<CatalogProduct>[] = [
    { key: "sku", label: "SKU", render: (p) => <code style={{ fontSize: 11.5 }}>{p.sku ?? "—"}</code>, width: 120 },
    {
      key: "name",
      label: "Producto",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.brand?.name ?? p.category ?? "—"}</div>
        </div>
      ),
    },
    { key: "category", label: "Categoría", render: (p) => <Tag variant="default">{p.category ?? "—"}</Tag>, width: 120 },
    {
      key: "price",
      label: "Precio lista",
      align: "right",
      render: (p) => <Money value={Number(p.price ?? 0)} />,
      width: 110,
    },
    {
      key: "suggested",
      label: "Precio sugerido",
      align: "right",
      render: (p) => <Money value={Number(p.price ?? 0) * MARGIN} />,
      width: 130,
    },
    {
      key: "stock",
      label: "Stock",
      align: "center",
      render: (p) => {
        const stock = stockTotal(p);
        return <Tag variant={stock === 0 ? "danger" : stock < 5 ? "warning" : "positive"}>{stock}</Tag>;
      },
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.viewMode !== 'execute' && (
              <Link href="/erp/warehouse" style={{ textDecoration: "none" }}>
                <Button variant="secondary" iconLeft="📦">Ver inventario</Button>
              </Link>
            )}
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo producto</Button>
            )}
          </>
        }
      />

      {/* ── Formulario: Nuevo producto ─────────────────────────────────── */}
      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 13 }}>Nuevo producto en catálogo</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>SKU *</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej. CAM-DOMO-4K" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Cámara domo IP 4K" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Categoría</label>
              <input
                list="cat-list"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Ej. CCTV"
                style={inp}
              />
              <datalist id="cat-list">
                {categories.map(c => <option key={c} value={c ?? ""} />)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Precio de costo (MXN)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Descripción</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción breve del producto" style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => void saveProduct()}
              disabled={saving || !form.sku.trim() || !form.name.trim()}
            >
              {saving ? "Creando…" : "Crear producto"}
            </Button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por SKU o nombre…"
          style={{ width: "100%", maxWidth: 360, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
        />
      </div>

      <Section title={loading ? "Cargando…" : `${filtered.length} SKUs`}>
        {loading && <EmptyState icon="⏳" title="Cargando catálogo…" description="Consultando productos." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} emptyTitle="Catálogo vacío" emptyDescription="Los productos se administran en el módulo de catálogo." />}
      </Section>
    </>
  );
}
