"use client";

import { useEffect, useState } from "react";
import { listCatalogCategories, listCatalogProducts, type CatalogProduct } from "@/lib/catalog-api";
import { DEFAULT_CATALOG_CATEGORIES } from "@/lib/service-project-types";

type CatalogPickerProps = {
  token: string;
  open: boolean;
  onClose: () => void;
  onSelect: (product: CatalogProduct) => void;
};

export default function CatalogPicker({ token, open, onClose, onSelect }: CatalogPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    listCatalogCategories(token).then(setCategories).catch(() => setCategories([]));
  }, [open, token]);

  useEffect(() => {
    if (!open || !token) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await listCatalogProducts(token, {
          q: query.trim() || undefined,
          category: category || undefined,
          take: 40,
        });
        setProducts(res.data || []);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, token, query, category]);

  if (!open) return null;

  const mergedCategories = Array.from(new Set([...DEFAULT_CATALOG_CATEGORIES, ...categories])).sort();

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto", padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Catálogo IT / CCTV</h2>
          <button type="button" className="ghostButton" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Buscar SKU, marca, modelo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {mergedCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {loading && <p style={{ color: "var(--text-secondary)" }}>Buscando…</p>}
        {!loading && products.length === 0 && (
          <p style={{ color: "var(--text-secondary)" }}>Sin resultados. Importa productos en Almacén o crea líneas manualmente.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {products.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  onClose();
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border, rgba(15,106,214,0.15))",
                  background: "var(--card-bg, #fff)",
                  cursor: "pointer",
                }}
              >
                <strong>{p.name}</strong>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  SKU: {p.sku}
                  {p.brand?.name ? ` · ${p.brand.name}` : ""}
                  {p.category ? ` · ${p.category}` : ""}
                  {p.price != null ? ` · $${Number(p.price).toLocaleString("es-MX")}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
