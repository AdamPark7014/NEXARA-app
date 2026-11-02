"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { erpFetch } from "@/lib/erp-api";

/**
 * Cronómetro de procesos (Programa Velocidad Core, 01-11-2026): cuánto tarda de verdad asignar,
 * cotizar y revisar, para tener línea base antes de cambiar nada y comparar después de cada ola.
 *
 * Nunca estorba: si falla el envío no pasa nada y la persona no se entera.
 */
export type ProcesoMedido = "asignar" | "autoasignar" | "asignar_ia" | "asignar_formato" | "cotizar" | "revisar";

export type Medicion = { inicio: number | null; ocultoDesde: number | null; ocultoMs: number; clics: number };

export const medicionNueva = (inicio: number | null): Medicion => ({ inicio, ocultoDesde: null, ocultoMs: 0, clics: 0 });

/** Tiempo con la pestaña a la vista; null si todavía no arranca. */
export function duracionVisibleMs(m: Medicion, ahora: number): number | null {
  if (m.inicio == null) return null;
  const oculto = m.ocultoMs + (m.ocultoDesde != null ? ahora - m.ocultoDesde : 0);
  return Math.max(0, Math.round(ahora - m.inicio - oculto));
}

/** Más que esto es una pestaña olvidada: la API la rechazaría y no aporta nada. */
const TOPE_MS = 8 * 60 * 60 * 1000;

export type Cronometro = {
  /** Empieza a contar si no lo hacía. Con `manual`, lo llama la pantalla cuando empieza de verdad. */
  arrancar: () => void;
  /** Manda lo medido y deja el reloj en cero, listo para la siguiente. */
  terminar: (entidadId?: number | null, detalle?: string | null) => void;
  /** Tira lo medido sin mandarlo: la persona dejó esa captura. */
  descartar: () => void;
};

export function useCronometroProceso(
  proceso: ProcesoMedido,
  token: string | null | undefined,
  opciones: { activo?: boolean; manual?: boolean } = {},
): Cronometro {
  const { activo = true, manual = false } = opciones;
  const m = useRef<Medicion>(medicionNueva(null));
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!activo) return;
    if (!manual) m.current = medicionNueva(performance.now());
    const alClic = () => {
      m.current.clics += 1;
    };
    const alCambiarVista = () => {
      const a = m.current;
      if (document.hidden) {
        if (a.ocultoDesde == null) a.ocultoDesde = performance.now();
      } else if (a.ocultoDesde != null) {
        a.ocultoMs += performance.now() - a.ocultoDesde;
        a.ocultoDesde = null;
      }
    };
    document.addEventListener("pointerdown", alClic, true);
    document.addEventListener("visibilitychange", alCambiarVista);
    return () => {
      document.removeEventListener("pointerdown", alClic, true);
      document.removeEventListener("visibilitychange", alCambiarVista);
    };
  }, [activo, manual]);

  const arrancar = useCallback(() => {
    if (m.current.inicio == null) m.current = medicionNueva(performance.now());
  }, []);

  const descartar = useCallback(() => {
    m.current = medicionNueva(manual ? null : performance.now());
  }, [manual]);

  const terminar = useCallback<Cronometro["terminar"]>(
    (entidadId, detalle) => {
      const duracionMs = duracionVisibleMs(m.current, performance.now());
      const { clics } = m.current;
      m.current = medicionNueva(manual ? null : performance.now());
      const t = tokenRef.current;
      if (!activo || !t || duracionMs == null || duracionMs > TOPE_MS) return;
      void erpFetch("/proceso-tiempos", t, {
        method: "POST",
        body: JSON.stringify({
          proceso,
          duracionMs,
          clics,
          ...(entidadId && entidadId > 0 ? { entidadId } : {}),
          ...(detalle?.trim() ? { detalle: detalle.trim().slice(0, 60) } : {}),
        }),
      }).catch(() => undefined);
    },
    [activo, manual, proceso],
  );

  return useMemo(() => ({ arrancar, terminar, descartar }), [arrancar, terminar, descartar]);
}
