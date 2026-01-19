// Tipos para producto y source
type CTSource = {
  supplier?: string;
  stock?: number | Record<string, number>;
};
export type Producto = {
  id?: string;
  sku?: string;
  name?: string;
  price?: number;
  sources?: CTSource[];
};
// Utilidad para obtener productos solo de CT Internacional desde el backend real
export async function fetchCTProducts() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";
  const endpoint = `${apiBase}/products?supplier=CT%20Internacional&limit=1000`;
  const res = await fetch(endpoint, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  // Normaliza al formato esperado por ProductosTab
  const productos = (Array.isArray(data.products) ? data.products : data) || [];
  return productos
    .map((p: unknown) => {
      const prod = p as Producto;
      // Buscar el source de CT Internacional
      const ctSource = Array.isArray(prod.sources)
        ? prod.sources.find((s) => s.supplier?.toLowerCase().includes('ct'))
        : undefined;
      // Sumar stock total de todos los almacenes si es objeto
      let stockTotal = 0;
      if (ctSource && typeof ctSource.stock === 'object' && ctSource.stock !== null) {
        stockTotal = Object.values(ctSource.stock as Record<string, number>).reduce(
          (sum, v) => sum + (typeof v === 'number' ? v : 0),
          0,
        );
      } else if (ctSource && typeof ctSource.stock === 'number') {
        stockTotal = ctSource.stock;
      }
      return {
        id: prod.id || prod.sku,
        name: prod.name,
        sku: prod.sku,
        price:
          typeof prod.price === 'number' && prod.price > 0
            ? `$${Number(prod.price).toLocaleString('es-MX', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : '-',
        stock: stockTotal > 0 ? stockTotal : '-',
        status:
          stockTotal > 0 && stockTotal < 15
            ? 'Bajo stock'
            : stockTotal > 0
            ? 'Activo'
            : 'Sin stock',
        source: 'ct-internacional',
      };
    })
    .filter(
      (p: { stock?: number | string; price?: string }) =>
        p.stock !== '-' &&
        p.price !== '-',
    );
}
