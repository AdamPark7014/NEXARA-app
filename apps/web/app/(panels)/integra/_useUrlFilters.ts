"use client";

/**
 * Filtros en la URL: una vista filtrada se comparte pegando el enlace.
 *
 * Solo viajan los valores distintos del defecto, así `/integra/alarms` sigue
 * siendo `/integra/alarms` y no una ristra de parámetros redundantes. Se usa
 * `replace` para no llenar el historial: filtrar no es navegar.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const values = useMemo(() => {
    const params = new URLSearchParams(search);
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T & string>) {
      const raw = params.get(key);
      if (raw != null && raw !== "") out[key] = raw as T[keyof T & string];
    }
    return out;
    // `defaults` es un literal estable por página; la URL es la fuente viva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setValues = useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(search);
      for (const key of Object.keys(patch) as Array<keyof T & string>) {
        const value = patch[key];
        const v = value == null ? "" : String(value);
        if (!v || v === defaults[key]) params.delete(key);
        else params.set(key, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router, search],
  );

  return [values, setValues];
}
