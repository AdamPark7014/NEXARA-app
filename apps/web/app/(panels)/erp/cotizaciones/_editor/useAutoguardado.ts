"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cambiosEntre } from "@/lib/cotizacion-documento";

/**
 * Autoguardado del editor: guarda solo lo que cambió, un momento después de dejar de escribir.
 *
 * - Nunca hay dos guardados a la vez: si se escribe mientras uno va en camino, al terminar se manda
 *   lo que falte.
 * - `habilitado = false` pausa (p. ej. borrador nuevo sin cliente, o cotización enviada que todavía
 *   no se quiere revisar): los cambios esperan, no se pierden.
 * - `guardarAhora()` (Ctrl+S, antes de enviar, antes del PDF) no espera al temporizador.
 */
export type EstadoGuardado = "sinCambios" | "pendiente" | "guardando" | "guardado" | "error";

export type Autoguardado<P> = {
  estado: EstadoGuardado;
  error: string | null;
  guardadoEn: Date | null;
  /** Guarda ya. `true` si quedó todo guardado. */
  guardarAhora: () => Promise<boolean>;
  /** El servidor ya tiene este contenido (tras aplicar un paquete, recargar…): no hay nada que guardar. */
  fijarBase: (payload: P) => void;
  hayPendientes: () => boolean;
};

export function useAutoguardado<P extends object>(opciones: {
  payload: P;
  /** Lo que ya está guardado (`null` = nada todavía: cotización nueva). */
  base: P | null;
  habilitado: boolean;
  guardar: (cambios: Partial<P>, completo: P) => Promise<void>;
  espera?: number;
}): Autoguardado<P> {
  const { payload, habilitado, espera = 1200 } = opciones;
  const [estado, setEstado] = useState<EstadoGuardado>("sinCambios");
  const [error, setError] = useState<string | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);

  const baseRef = useRef<P | null>(opciones.base);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const guardarRef = useRef(opciones.guardar);
  guardarRef.current = opciones.guardar;
  const habilitadoRef = useRef(habilitado);
  habilitadoRef.current = habilitado;
  const enCamino = useRef<Promise<boolean> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montado = useRef(true);

  const hayPendientes = useCallback(
    () => Object.keys(cambiosEntre(baseRef.current, payloadRef.current)).length > 0,
    [],
  );

  const ejecutar = useCallback(async (): Promise<boolean> => {
    // Uno a la vez: el que llega espera al que va en camino y después revisa qué falta.
    while (enCamino.current) {
      await enCamino.current;
    }
    if (!hayPendientes()) return true;
    if (!habilitadoRef.current) return false;

    const foto = payloadRef.current;
    const cambios = cambiosEntre(baseRef.current, foto);
    const promesa = (async () => {
      if (montado.current) {
        setEstado("guardando");
        setError(null);
      }
      try {
        await guardarRef.current(cambios, foto);
        baseRef.current = foto;
        if (!montado.current) return true;
        setGuardadoEn(new Date());
        setEstado(hayPendientes() ? "pendiente" : "guardado");
        return true;
      } catch (e) {
        if (montado.current) {
          setEstado("error");
          setError(e instanceof Error ? e.message : "No se pudo guardar");
        }
        return false;
      }
    })();
    enCamino.current = promesa;
    try {
      return await promesa;
    } finally {
      enCamino.current = null;
    }
  }, [hayPendientes]);

  const programar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      void ejecutar().then((ok) => {
        // Lo que se escribió mientras se guardaba sale en la siguiente vuelta.
        if (ok && montado.current && hayPendientes() && habilitadoRef.current) programar();
      });
    }, espera);
  }, [ejecutar, espera, hayPendientes]);

  const clave = JSON.stringify(payload);
  useEffect(() => {
    if (!hayPendientes()) {
      setEstado((prev) => (prev === "pendiente" ? (guardadoEn ? "guardado" : "sinCambios") : prev));
      return;
    }
    setEstado((prev) => (prev === "guardando" ? prev : "pendiente"));
    if (habilitado) programar();
    // `clave` resume el payload: si no cambió el contenido, no se reprograma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  // Salir con cambios sin guardar: el navegador pregunta.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (!hayPendientes()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayPendientes]);

  const guardarAhora = useCallback(async () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    return ejecutar();
  }, [ejecutar]);

  const fijarBase = useCallback((nuevo: P) => {
    baseRef.current = nuevo;
    setEstado("guardado");
    setGuardadoEn(new Date());
  }, []);

  return { estado, error, guardadoEn, guardarAhora, fijarBase, hayPendientes };
}
