import { buildApiUrl } from "@/lib/api-base";

export type CatalogProduct = {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  brand?: { id: number; name: string } | null;
  stockLevels?: Array<{
    quantity: number | string;
    reservedQty: number | string;
    warehouse?: { id: number; name: string };
  }>;
};

export type CatalogListResponse = {
  data: CatalogProduct[];
  total: number;
};

async function catalogRequest<T>(path: string, token: string, fallbackError: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === "string" ? data.message : fallbackError);
  }
  return res.json() as Promise<T>;
}

export const listCatalogProducts = async (
  token: string,
  filters?: { q?: string; category?: string; brand?: string; skip?: number; take?: number },
) => {
  const search = new URLSearchParams();
  if (filters?.q) search.set("q", filters.q);
  if (filters?.category) search.set("category", filters.category);
  if (filters?.brand) search.set("brand", filters.brand);
  if (filters?.skip != null) search.set("skip", String(filters.skip));
  if (filters?.take != null) search.set("take", String(filters.take));
  const qs = search.toString();
  return catalogRequest<CatalogListResponse>(
    `catalog/products${qs ? `?${qs}` : ""}`,
    token,
    "No se pudo cargar el catálogo",
  );
};

export const listCatalogCategories = async (token: string) => {
  const data = await catalogRequest<string[]>("catalog/categories", token, "No se pudieron cargar las categorías");
  return Array.isArray(data) ? data : [];
};

export const getCatalogProduct = async (token: string, id: number) => {
  return catalogRequest<CatalogProduct>(`catalog/products/${id}`, token, "Producto no encontrado");
};

export const createCatalogProduct = async (
  token: string,
  dto: {
    sku?: string;
    name: string;
    category?: string;
    subcategory?: string;
    price?: number;
    currency?: string;
    unit?: string;
    imageUrl?: string;
    description?: string;
  },
): Promise<CatalogProduct> => {
  const res = await fetch(buildApiUrl("catalog/products"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === "string" ? data.message : `HTTP ${res.status}`);
  }
  return res.json();
};
