"use client";

import { useEffect, useState } from "react";

/**
 * Lee la query de la URL en el cliente, sin `useSearchParams`: ese hook obliga
 * a envolver la página en `<Suspense>` y rompe el prerender estático de Next.
 * Devuelve un `URLSearchParams` vacío en el primer render (igual en servidor y
 * cliente, sin desajuste de hidratación) y el real tras montar; se refresca al
 * navegar con atrás/adelante.
 */
export function useUrlQuery(): URLSearchParams {
  const [params, setParams] = useState<URLSearchParams>(() => new URLSearchParams());

  useEffect(() => {
    const leer = () => setParams(new URLSearchParams(window.location.search));
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  return params;
}
