"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { consultarDisponibilidad } from "./api";
import { modelosParaConsulta, type Disponibilidad } from "./existencias";
import type { Catalogo } from "./useCatalogo";

/** Cuántas hay de cada modelo del catálogo. Si no se puede leer, el diseñador sigue igual, sin esos datos. */
export function useExistencias(token: string | null | undefined, catalogo: Pick<Catalogo, "camaras" | "equipos" | "filas" | "cargando">) {
  const [lista, setLista] = useState<readonly Disponibilidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const modelos = useMemo(() => modelosParaConsulta(catalogo.camaras, catalogo.equipos, catalogo.filas), [catalogo.camaras, catalogo.equipos, catalogo.filas]);

  const recargar = useCallback(async () => {
    if (!token || !modelos.length) return;
    setCargando(true);
    try {
      setLista((await consultarDisponibilidad(token, modelos)) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las existencias.");
    } finally {
      setCargando(false);
    }
  }, [token, modelos]);

  useEffect(() => {
    // Hasta que llegue el catálogo de la empresa: si no, se preguntaría dos veces al abrir.
    if (!catalogo.cargando) void recargar();
  }, [catalogo.cargando, recargar]);

  const porClave = useMemo(() => new Map(lista.map((d) => [d.clave, d])), [lista]);
  return { porClave, cargando, error, recargar };
}
