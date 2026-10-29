"use client";

/** Carga un diseño para las páginas de solo lectura (ficha y propuesta). */
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { obtenerDiseno, type Diseno } from "@/lib/cctv/api";

export function useDiseno(id: number) {
  const { token } = useUser();
  const [diseno, setDiseno] = useState<Diseno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setError(null);
    try {
      setDiseno(await obtenerDiseno(token, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el diseño.");
    }
  }, [token, id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  return { diseno, error, cargar };
}
