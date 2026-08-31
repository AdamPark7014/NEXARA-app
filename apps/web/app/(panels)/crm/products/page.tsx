"use client";

import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { getCrmCatalogSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { createCatalogProduct, listCatalogProducts, listCatalogCategories, type CatalogProduct } from "@/lib/catalog-api";
import { exportToExcel } from "@/lib/export-excel";

const MARGIN = 1.35;

const CURRENCIES = ["MXN", "USD", "EUR"];
const UNITS = ["pza", "kit", "caja", "licencia", "servicio", "m", "m2", "hr", "rollo"];

const EMPTY_FORM = {
  sku: "", name: "", category: "", subcategory: "",
  price: "", currency: "MXN", unit: "", imageUrl: "", description: "",
  satProductKey: "80101500", satUnitKey: "H87",
};

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
  const [filterCat, setFilterCat] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await listCatalogProducts(token, { take: 200 });
      setItems(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el catálogo");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (showForm && token && !categories.length) {
      listCatalogCategories(token).then(setCategories).catch(() => { /* ok */ });
    }
  }, [showForm, token, categories.length]);

  useEffect(() => {
    if (!showForm || !token) return;
    fetch(buildApiUrl("catalog/products/next-sku"), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const sku = await res.json();
        if (typeof sku === "string") setForm((f) => ({ ...f, sku: f.sku.trim() ? f.sku : sku }));
      })
      .catch(() => { /* ok */ });
  }, [showForm, token]);

  const saveProduct = async () => {
    if (!token || !form.name.trim()) return;
    setSaving(true);
    try {
      const created = await createCatalogProduct(token, {
        ...(form.sku.trim() ? { sku: form.sku.trim() } : {}),
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        subcategory: form.subcategory.trim() || undefined,
        price: form.price ? Number(form.price) : undefined,
        currency: form.currency || "MXN",
        unit: form.unit.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        description: form.description.trim() || undefined,
        satProductKey: form.satProductKey.trim() || undefined,
        satUnitKey: form.satUnitKey.trim() || undefined,
        unitName: form.unit.trim() || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    let result = items;
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((p) => (p.name ?? "").toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
    if (filterCat) result = result.filter((p) => p.category === filterCat);
    return result;
  }, [items, search, filterCat]);

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface-2)", color: "var(--foreground)",
    fontSize: 13, boxSizing: "border-box",
  };

  const lbl = (text: string, required?: boolean) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "flex", gap: 3, marginBottom: 4 }}>
      {text}{required && <span style={{ color: "#ef4444" }}>*</span>}
    </span>
  );

  const columns: Column<CatalogProduct>[] = [
    { key: "sku", label: "SKU", render: (p) => <code style={{ fontSize: 11.5, background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4 }}>{p.sku ?? "—"}</code>, width: 130 },
    {
      key: "name", label: "Producto",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {[p.brand?.name, p.subcategory].filter(Boolean).join(" · ") || p.category || "—"}
          </div>
        </div>
      ),
    },
    { key: "category", label: "Categoría", render: (p) => <Tag variant="default">{p.category ?? "—"}</Tag>, width: 120 },
    { key: "price", label: "Precio costo", align: "right", render: (p) => <Money value={Number(p.price ?? 0)} />, width: 120 },
    { key: "suggested", label: "P. sugerido", align: "right", render: (p) => <Money value={Number(p.price ?? 0) * MARGIN} />, width: 120 },
    {
      key: "stock", label: "Stock",
      render: (p) => {
        const s = stockTotal(p);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag variant={s === 0 ? "danger" : s < 5 ? "warning" : "positive"}>{s}</Tag>
            <CrossPanelLink href={`/erp/warehouse?productId=${p.id}`} style={{ fontSize: 11, color: "var(--text-tertiary)", textDecoration: "none" }} title="Ver en inventario">📦</CrossPanelLink>
          </div>
        );
      },
      width: 110,
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
            {cfg.viewMode !== "execute" && (
              <CrossPanelLink href="/erp/warehouse" style={{ textDecoration: "none" }}>
                <Button variant="secondary" iconLeft="📦">Ver inventario</Button>
              </CrossPanelLink>
            )}
            {cfg.canCreate && (
        <Button variant="primary" iconLeft="+" onClick={() => { setShowForm(true); setSaveErr(null); setForm({ ...EMPTY_FORM }); }}>Nuevo producto</Button>
            )}
          </>
        }
      />

      {/* ── Modal: Nuevo producto ─────────────────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "28px 32px", width: 600, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Nuevo producto en catálogo</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Completa al menos el nombre. El SKU se genera automáticamente si lo dejas vacío.
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>

              {/* ── Sección: Identificación ── */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Identificación
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
                <label style={{ display: "grid" }}>
                  {lbl("SKU")}
                  <input value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    placeholder="Auto: SKU-0001" style={{ ...inp, fontFamily: "monospace", textTransform: "uppercase" }}
                    autoFocus />
                </label>
                <label style={{ display: "grid" }}>
                  {lbl("Nombre del producto", true)}
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Cámara domo IP 4K exterior" style={inp} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid" }}>
                  {lbl("Categoría")}
                  <input list="cat-list" value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Ej. CCTV, Redes, Alarmas…" style={inp} />
                  <datalist id="cat-list">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label style={{ display: "grid" }}>
                  {lbl("Subcategoría")}
                  <input value={form.subcategory} onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                    placeholder="Ej. Domo, PTZ, Bullet…" style={inp} />
                </label>
              </div>

              {/* ── Sección: Precio ── */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>
                Precio y unidad
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px", gap: 12 }}>
                <label style={{ display: "grid" }}>
                  {lbl("Precio de costo")}
                  <input type="number" min="0" step="0.01" value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0.00" style={inp} />
                </label>
                <label style={{ display: "grid" }}>
                  {lbl("Moneda")}
                  <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} style={inp}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid" }}>
                  {lbl("Unidad")}
                  <input list="unit-list" value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="pza" style={inp} />
                  <datalist id="unit-list">
                    {UNITS.map((u) => <option key={u} value={u} />)}
                  </datalist>
                </label>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>
                Facturación SAT (CFDI)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                <label style={{ display: "grid" }}>
                  {lbl("Clave producto/servicio SAT")}
                  <input value={form.satProductKey}
                    onChange={(e) => setForm((f) => ({ ...f, satProductKey: e.target.value }))}
                    placeholder="80101500" style={inp} />
                </label>
                <label style={{ display: "grid" }}>
                  {lbl("Clave unidad SAT")}
                  <input value={form.satUnitKey}
                    onChange={(e) => setForm((f) => ({ ...f, satUnitKey: e.target.value }))}
                    placeholder="H87 / E48" style={inp} />
                </label>
              </div>

              {/* ── Sección: Detalles ── */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>
                Detalles adicionales
              </div>

              <label style={{ display: "grid" }}>
                {lbl("URL de imagen")}
                <input type="url" value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…/producto.jpg" style={inp} />
              </label>

              <label style={{ display: "grid" }}>
                {lbl("Descripción")}
                <textarea value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Características técnicas, especificaciones, notas de uso…"
                  rows={3} style={{ ...inp, resize: "vertical" }} />
              </label>

              {/* Price preview */}
              {form.price && Number(form.price) > 0 && (
                <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 24, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <span>Costo: <strong style={{ color: "var(--foreground)" }}>${Number(form.price).toLocaleString("es-MX", { minimumFractionDigits: 2 })} {form.currency}</strong></span>
                  <span>Precio sugerido (×{MARGIN}): <strong style={{ color: "#22c55e" }}>${(Number(form.price) * MARGIN).toLocaleString("es-MX", { minimumFractionDigits: 2 })} {form.currency}</strong></span>
                </div>
              )}
            </div>

            {saveErr && <p style={{ marginTop: 12, marginBottom: 0, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>{saveErr}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveProduct()} disabled={saving || !form.name.trim()}>
                {saving ? "Creando…" : "Crear producto"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (() => {
        const byCat = Object.entries(
          items.reduce<Record<string, number>>((acc, p) => { const k = p.category ?? "Sin categoría"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
              <KpiCard label="Productos en catálogo" value={items.length} icon="📦" />
              <KpiCard label="Sin stock" value={items.filter(p => stockTotal(p) === 0).length} variant={items.filter(p => stockTotal(p) === 0).length > 0 ? "danger" : "positive"} icon="⚠️" hint="Requieren reposición" />
              <KpiCard label="Stock bajo" value={items.filter(p => stockTotal(p) > 0 && stockTotal(p) < 5).length} variant={items.filter(p => stockTotal(p) > 0 && stockTotal(p) < 5).length > 0 ? "warning" : "positive"} icon="📉" hint="Menos de 5 unidades" />
              <KpiCard label="Precio promedio" value={<Money value={items.length > 0 ? items.reduce((s, p) => s + Number(p.price ?? 0), 0) / items.length : 0} />} icon="💰" />
            </div>
            {byCat.length > 0 && (
              <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Productos por categoría</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byCat.map(([cat, count]) => (
                    <div key={cat} style={{ display: "grid", gridTemplateColumns: "140px 1fr 32px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{cat}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <FilterToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Buscar por SKU o nombre…" }}
        selects={categories.length > 0 ? [{
          label: "Categoría",
          value: filterCat,
          onChange: setFilterCat,
          options: categories.map((c) => ({ value: c, label: c })),
          allowAll: true,
        }] : []}
        onClear={() => { setSearch(""); setFilterCat(""); }}
        resultCount={loading ? null : filtered.length}
        rightActions={filtered.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
            { key: "sku", label: "SKU" },
            { key: "name", label: "Nombre" },
            { key: "category", label: "Categoría" },
            { key: "price", label: "Precio", format: (v) => `${Number(v).toFixed(2)}` },
            { key: "unitName", label: "Unidad" },
            { key: "activo", label: "Activo", format: (v) => v ? "Sí" : "No" },
          ], "catalogo-productos")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${filtered.length} SKU${filtered.length === 1 ? "" : "s"}`}>
        {loading && <EmptyState icon="⏳" title="Cargando catálogo…" description="Consultando productos." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id}
            emptyTitle="Catálogo vacío" emptyDescription='Agrega el primer producto con "Nuevo producto".' />
        )}
      </Section>
    </>
  );
}
