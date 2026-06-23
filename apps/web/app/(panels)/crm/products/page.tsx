"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface StockItem {
  id: number;
  sku?: string;
  nombre?: string;
  categoria?: string;
  existencia?: number;
  minimo?: number;
  costo?: number;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

// Margen de venta sugerido sobre costo de almacén
const MARGIN = 1.35;

export default function ProductsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("warehouse", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el catálogo");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => (p.nombre ?? "").toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const columns: Column<StockItem>[] = [
    { key: "sku", label: "SKU", render: (p) => <code style={{ fontSize: 11.5 }}>{p.sku ?? "—"}</code>, width: 120 },
    {
      key: "nombre", label: "Producto",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.categoria ?? "—"}</div>
        </div>
      ),
    },
    { key: "categoria", label: "Categoría", render: (p) => <Tag variant="default">{p.categoria ?? "—"}</Tag>, width: 120 },
    { key: "precio" as keyof StockItem, label: "Precio sugerido", align: "right" as const, render: (p) => <Money value={(p.costo ?? 0) * MARGIN} />, width: 130 },
    {
      key: "existencia", label: "Stock", align: "center" as const,
      render: (p) => {
        const stock = p.existencia ?? 0;
        return <Tag variant={stock === 0 ? "danger" : stock < (p.minimo ?? 0) ? "warning" : "positive"}>{stock}</Tag>;
      },
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo y clientes"
        title="Catálogo de productos y servicios"
        subtitle="Maestro de SKUs vinculado al almacén de ERP. Precio sugerido = costo + margen estándar. Las cotizaciones se construyen desde este catálogo."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <Link href="/erp/warehouse" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📦">Gestionar en Almacén</Button>
            </Link>
          </>
        }
      />

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por SKU o nombre…" style={{ width: "100%", maxWidth: 360, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }} />
      </div>

      <Section title={loading ? "Cargando…" : `${filtered.length} SKUs`} subtitle="Precio sugerido con margen estándar — ajusta en la cotización si aplica.">
        {loading && <EmptyState icon="⏳" title="Cargando catálogo…" description="Consultando inventario del almacén." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} emptyTitle="Catálogo vacío" emptyDescription="Agrega productos desde ERP › Almacén." />}
      </Section>
    </>
  );
}
