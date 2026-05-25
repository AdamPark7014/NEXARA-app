"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { listCatalogCategories, listCatalogProducts, type CatalogProduct } from "@/lib/catalog-api";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import styles from "../clientes/page.module.css";

import { DEFAULT_CATALOG_CATEGORIES } from "@/lib/service-project-types";

export default function VentasProductosPage() {
  const { user } = useUser();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canView = user && (user.isSuperAdmin || hasPermission(user, PERMISSIONS.CATALOG_VIEW));

  const mergedCategories = useMemo(() => {
    const set = new Set([...DEFAULT_CATALOG_CATEGORIES, ...categories.filter(Boolean)]);
    return Array.from(set).sort();
  }, [categories]);

  useEffect(() => {
    if (!user?.token || !canView) return;
    listCatalogCategories(user.token)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [user?.token, canView]);

  useEffect(() => {
    if (!user?.token || !canView) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listCatalogProducts(user.token, {
          q: query.trim() || undefined,
          category: category || undefined,
          take: 60,
        });
        setProducts(res.data || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar catálogo");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [user?.token, query, category, canView]);

  if (!canView) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>No tienes permiso para ver el catálogo de productos.</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Catálogo IT / CCTV</h1>
          <p className={styles.subtitle}>
            Productos y servicios para cotizar: cámaras, NVR, redes, cómputo e instalación.
          </p>
        </div>
      </header>

      <div className={styles.card}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por SKU, marca o modelo…"
          />
          <select className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {mergedCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.list}>
        {loading && <p>Cargando catálogo…</p>}
        {!loading && products.length === 0 && (
          <div className={styles.card}>
            <p className={styles.clientMeta}>
              No hay productos registrados. Importa SKUs en Administración → Almacén o contacta a inventario.
            </p>
          </div>
        )}
        {products.map((product) => (
          <article key={product.id} className={styles.card}>
            <div className={styles.clientHeader}>
              <div>
                <h3>{product.name}</h3>
                <div className={styles.clientMeta}>
                  SKU: {product.sku}
                  {product.brand?.name ? ` · ${product.brand.name}` : ""}
                </div>
              </div>
              <div className={styles.clientMeta}>
                {product.price != null
                  ? `$${Number(product.price).toLocaleString("es-MX")} ${product.currency || "MXN"}`
                  : "Sin precio"}
              </div>
            </div>
            <p className={styles.clientMeta}>
              {[product.category, product.subcategory].filter(Boolean).join(" › ") || "Sin categoría"}
            </p>
            {product.description && <p className={styles.clientMeta}>{product.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
