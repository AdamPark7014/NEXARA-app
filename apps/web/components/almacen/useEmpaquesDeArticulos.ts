"use client";

/**
 * Empaque de cada consumible y material por medida de una lista de existencias, para decir
 * «3 botes + 40 pz» en vez de «340».
 *
 * La lista de existencias de la API no siempre trae los empaques del producto: los que
 * falten se piden aquí, una vez por producto y en tandas cortas. Si la API ya los trae,
 * no se pide nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { listarEmpaques } from "@/lib/almacen-api";
import { empaqueDeProducto, type EmpaqueBase } from "@/lib/tipos-articulo";

/** Cuántos productos se piden de una vez (la lista de existencias rara vez pasa de esto). */
const TANDA = 40;

export function useEmpaquesDeArticulos(token: string, productIds: readonly number[]) {
  const [empaques, setEmpaques] = useState<ReadonlyMap<number, EmpaqueBase | null>>(() => new Map());
  const pedidos = useRef(new Set<number>());
  // Sube con cada `olvidar` para que la tanda vuelva a correr con los mismos productos.
  const [vuelta, setVuelta] = useState(0);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const clave = [...new Set(productIds)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!token || !clave) return;
    const faltan = clave
      .split(",")
      .map(Number)
      .filter((id) => id > 0 && !pedidos.current.has(id))
      .slice(0, TANDA);
    if (faltan.length === 0) return;
    for (const id of faltan) pedidos.current.add(id);
    void Promise.all(
      faltan.map((id) =>
        listarEmpaques(token, id)
          .then((lista) => [id, empaqueDeProducto({ packagings: lista })] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((pares) => {
      if (!montado.current) return;
      setEmpaques((prev) => {
        const siguiente = new Map(prev);
        for (const [id, empaque] of pares) siguiente.set(id, empaque);
        return siguiente;
      });
    });
  }, [token, clave, vuelta]);

  /** Tras editar un artículo: su empaque se vuelve a pedir. */
  const olvidar = useCallback((productId: number) => {
    pedidos.current.delete(productId);
    setVuelta((n) => n + 1);
    setEmpaques((prev) => {
      if (!prev.has(productId)) return prev;
      const siguiente = new Map(prev);
      siguiente.delete(productId);
      return siguiente;
    });
  }, []);

  return { empaques, olvidar };
}
