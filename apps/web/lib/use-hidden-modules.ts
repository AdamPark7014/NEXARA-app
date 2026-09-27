"use client";

/**
 * Módulos que la empresa le esconde a quien está en sesión (`hiddenModuleIds` de /me/navigation).
 *
 * La barra lateral y la paleta ya filtran con `filterModulesByNavigation`; este hook es para los
 * atajos y pestañas sueltas que no pasan por ahí (riel de Finanzas, atajos del inicio, la propia
 * pantalla). Una sola consulta por sesión: el resultado se comparte entre componentes.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { fetchMeNavigationAuthed } from "@/lib/me-navigation";

const enCurso = new Map<string, Promise<string[]>>();

function cargar(token: string): Promise<string[]> {
  let p = enCurso.get(token);
  if (!p) {
    p = fetchMeNavigationAuthed(token).then((nav) => nav?.hiddenModuleIds ?? []);
    enCurso.set(token, p);
    // No cachear un fallo de red para siempre: al siguiente montaje se vuelve a intentar.
    void p.catch(() => enCurso.delete(token));
  }
  return p;
}

/** Conjunto de ids ocultos y si ya se conoce (`listo`): mientras carga no oculta nada. */
export function useHiddenModuleIds(): { hidden: ReadonlySet<string>; listo: boolean } {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [estado, setEstado] = useState<{ token: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void cargar(token)
      .then((ids) => {
        if (!cancelado) setEstado({ token, ids });
      })
      .catch(() => {
        if (!cancelado) setEstado({ token, ids: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const listo = estado?.token === token && token !== "";
  return { hidden: new Set(listo ? estado!.ids : []), listo };
}
