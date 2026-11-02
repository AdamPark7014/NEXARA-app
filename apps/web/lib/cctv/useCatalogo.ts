"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listarCatalogo } from "./api";
import { MODELOS_EQUIPO, MODELO_GENERICO, MODELOS_CAMARA, leerFilasCatalogo, registrarCatalogo, type FilaCatalogo, type ModeloCamara, type ModeloEquipo } from "./catalogo";

export type Catalogo = {
  /** Lo base y lo que agregó la empresa. */
  camaras: readonly ModeloCamara[];
  equipos: readonly ModeloEquipo[];
  filas: readonly FilaCatalogo[];
  /** Sube cuando llega algo agregado; con 0 la lista base alcanza para dibujar lo que haya. */
  version: number;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<{ camaras: readonly ModeloCamara[]; equipos: readonly ModeloEquipo[] }>;
};

/** El catálogo de la empresa. Si no se puede leer, el diseñador sigue con la lista base. */
export function useCatalogo(token: string | null | undefined): Catalogo {
  const [filas, setFilas] = useState<readonly FilaCatalogo[]>([]);
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!token) return { camaras: MODELOS_CAMARA, equipos: MODELOS_EQUIPO };
    try {
      const nuevas = await listarCatalogo(token);
      const { camaras, equipos } = leerFilasCatalogo(nuevas);
      registrarCatalogo(camaras, equipos);
      setFilas(nuevas);
      if (nuevas.length) setVersion((v) => v + 1);
      setError(null);
      return { camaras: [...MODELOS_CAMARA, ...camaras], equipos: [...MODELOS_EQUIPO, ...equipos] };
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el catálogo.");
      return { camaras: MODELOS_CAMARA, equipos: MODELOS_EQUIPO };
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return useMemo(() => {
    const { camaras, equipos } = leerFilasCatalogo(filas);
    return { camaras: [...MODELOS_CAMARA, ...camaras, MODELO_GENERICO], equipos: [...MODELOS_EQUIPO, ...equipos], filas, version, cargando, error, recargar };
  }, [filas, version, cargando, error, recargar]);
}
