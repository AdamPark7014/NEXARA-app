"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortKey, ValidityKey } from "./_peopleView";

/**
 * Estado del directorio en la URL. Hasta ahora los filtros vivían en `useState`
 * y morían al navegar: nadie podía mandar por chat «mira las que caducan este
 * mes» ni volver atrás sin perder el filtro. Con esto la vista es un enlace.
 *
 * La preferencia de vista (tarjetas/tabla) además se recuerda en `localStorage`:
 * la URL manda si la trae, y si no se aplica la última que eligió esta persona.
 */

export type ViewMode = "tarjetas" | "tabla";
/** Filtro de tres estados: sin filtrar / solo los que sí / solo los que no. */
export type TriFilter = "" | "si" | "no";

export type PeopleQuery = {
  q: string;
  estado: ValidityKey | "";
  rostro: TriFilter;
  erp: TriFilter;
  tipo: string;
  puerta: string;
  org: string;
  orden: SortKey;
  vista: ViewMode;
};

export const VIEW_STORAGE_KEY = "nexara_integra_people_vista";

const DEFAULTS: PeopleQuery = {
  q: "",
  estado: "",
  rostro: "",
  erp: "",
  tipo: "",
  puerta: "",
  org: "",
  orden: "nombre",
  vista: "tarjetas",
};

/** Filtros que cuentan como «hay algo aplicado» (orden y vista no filtran). */
const FILTER_KEYS = ["q", "estado", "rostro", "erp", "tipo", "puerta", "org"] as const;

const VALIDITY_KEYS: ReadonlyArray<ValidityKey> = ["ok", "warn", "expired", "off", "unknown"];
const SORT_KEYS: ReadonlyArray<SortKey> = ["nombre", "vigencia", "credenciales"];

function readTri(v: string | null): TriFilter {
  return v === "si" || v === "no" ? v : "";
}

function readView(v: string | null): ViewMode | null {
  return v === "tarjetas" || v === "tabla" ? v : null;
}

export function usePeopleQuery(): {
  query: PeopleQuery;
  setQuery: (patch: Partial<PeopleQuery>) => void;
  resetFilters: () => void;
  activeFilterCount: number;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sp = searchParams.toString();

  const query = useMemo<PeopleQuery>(() => {
    const p = new URLSearchParams(sp);
    const estado = p.get("estado");
    const orden = p.get("orden");
    return {
      q: p.get("q") || "",
      estado: VALIDITY_KEYS.includes(estado as ValidityKey) ? (estado as ValidityKey) : "",
      rostro: readTri(p.get("rostro")),
      erp: readTri(p.get("erp")),
      tipo: p.get("tipo") || "",
      puerta: p.get("puerta") || "",
      org: p.get("org") || "",
      orden: SORT_KEYS.includes(orden as SortKey) ? (orden as SortKey) : DEFAULTS.orden,
      vista: readView(p.get("vista")) ?? DEFAULTS.vista,
    };
  }, [sp]);

  const setQuery = useCallback(
    (patch: Partial<PeopleQuery>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        const key = k as keyof PeopleQuery;
        const value = String(v ?? "");
        // Un parámetro que vale lo mismo que el defecto no aporta nada al enlace.
        if (!value || value === DEFAULTS[key]) next.delete(key);
        else next.set(key, value);
      }
      if (patch.vista && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(VIEW_STORAGE_KEY, patch.vista);
        } catch {
          // Modo privado o almacenamiento lleno: la vista simplemente no se recuerda.
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams(sp);
    for (const k of FILTER_KEYS) next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [sp, pathname, router]);

  // La vista recordada solo se aplica si el enlace no trae una: la URL manda.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (new URLSearchParams(sp).has("vista")) return;
    let stored: ViewMode | null = null;
    try {
      stored = readView(window.localStorage.getItem(VIEW_STORAGE_KEY));
    } catch {
      stored = null;
    }
    if (stored && stored !== DEFAULTS.vista) setQuery({ vista: stored });
  }, [sp, setQuery]);

  const activeFilterCount = useMemo(
    () => FILTER_KEYS.filter((k) => query[k] !== DEFAULTS[k]).length,
    [query],
  );

  return { query, setQuery, resetFilters, activeFilterCount };
}
