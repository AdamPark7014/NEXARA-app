/**
 * NEXARA · Global Search API client
 * Consume `GET /search?q=` (tenant-scoped, RBAC).
 */
import { apiRequest, parseResponseJson } from "@/lib/api-base";

export type SearchResultRisk = "low" | "medium" | "high";

export type GlobalSearchResult = {
  type: string;
  id: number;
  title: string;
  subtitle?: string;
  risk?: SearchResultRisk;
  recommendation?: string;
};

export type GlobalSearchResponse = {
  results: GlobalSearchResult[];
  total: number;
  intelligence: {
    what: string;
    why: string;
    next: string[];
    risk: SearchResultRisk;
  };
};

export async function fetchGlobalSearch(
  token: string,
  query: string,
  limit = 12,
): Promise<GlobalSearchResponse> {
  const q = query.trim();
  if (q.length < 2) {
    return {
      results: [],
      total: 0,
      intelligence: {
        what: "Sin consulta",
        why: "Escribe al menos 2 caracteres",
        next: [],
        risk: "low",
      },
    };
  }

  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await apiRequest(`search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Búsqueda falló (${res.status})`);
  }

  const data = await parseResponseJson<GlobalSearchResponse>(res);
  return data ?? {
    results: [],
    total: 0,
    intelligence: { what: "", why: "", next: [], risk: "low" },
  };
}
