"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { listCatalogProducts, type CatalogProduct } from "@/lib/catalog-api";

const MARGIN = 1.35;

function stockTotal(p: CatalogProduct): number {
  return (p.stockLevels ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
}

export default function ProductsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
        eyebrow="CRM · Catálogo y clientes"
        title="Catálogo de productos y servicios"
        subtitle="Maestro de SKUs del catálogo comercial. El stock físico se gestiona en ERP › Almacén."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <Link href="/erp/warehouse" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📦">Ver inventario</Button>
            </Link>
          </>
        }
      />

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
