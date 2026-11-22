"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatApiError } from "@/lib/erp-api";

/**
 * Listas que alimentan un formulario: almacenes, productos, proveedores, plantillas…
 *
 * Cuando una de estas no cargaba, el fallo se callaba (`.catch(() => undefined)`) y el formulario
 * decía «Primero crea un almacén» o «Aún no hay proveedores». Una lista que no llegó no es una
 * lista vacía: quien lee eso da de alta un duplicado o cree que perdió sus datos.
 *
 * Aquí la carga dice en qué quedó (`estado`), por qué falló (`causa`) y se puede repetir
 * (`recargar`). Si un refresco falla con la lista ya a la vista, la lista se queda.
 */
export type EstadoDeApoyo = "espera" | "cargando" | "lista" | "fallo" | "reintentando";

/** En qué quedó la carga, sin la lista: lo que necesita el aviso del formulario. */
export type CargaDeApoyo = {
  estado: EstadoDeApoyo;
  /** Cómo se llama en una frase, en plural y con artículo: «los almacenes», «las plantillas». */
  nombre: string;
  /** Por qué no cargó, ya en español («No se pudo conectar…»). `null` si no falló o no hay más que decir. */
  causa: string | null;
  /** Falló y no hay nada que enseñar: es cuando el formulario tiene que avisar. */
  noCargo: boolean;
  /** Vuelve a pedirla: el «Reintentar» del aviso, o después de dar de alta algo. */
  recargar: () => Promise<void>;
};

export type ListaDeApoyo<T> = CargaDeApoyo & {
  lista: T[];
  /** Pone la lista sin pedirla (lo que ya se sabe tras un alta). Quita el fallo. */
  poner: (lista: T[]) => void;
};

/**
 * @param clave  Con qué se pide (la sesión, la empresa, «formulario abierto»). `null` = todavía no.
 *               Se vuelve a pedir cuando cambia, no en cada repintado.
 * @param pedir  La llamada. Puede ser una función nueva en cada repintado: se usa la última.
 * @param nombre «los almacenes»: en plural y con artículo, para «No se pudieron cargar los almacenes».
 */
export function useListaDeApoyo<T>(clave: string | null, pedir: () => Promise<T[]>, nombre: string): ListaDeApoyo<T> {
  const [lista, setLista] = useState<T[]>([]);
  const [estado, setEstado] = useState<EstadoDeApoyo>(clave === null ? "espera" : "cargando");
  const [causa, setCausa] = useState<string | null>(null);

  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;
  const claveRef = useRef(clave);
  claveRef.current = clave;
  /** Sube con cada petición: solo la última puede escribir. */
  const turno = useRef(0);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const cargar = useCallback(async (reintento: boolean) => {
    if (claveRef.current === null) return;
    const mio = ++turno.current;
    setEstado(reintento ? "reintentando" : "cargando");
    try {
      const llegada = await pedirRef.current();
      if (!montado.current || mio !== turno.current) return;
      setLista(Array.isArray(llegada) ? llegada : []);
      setCausa(null);
      setEstado("lista");
    } catch (e) {
      if (!montado.current || mio !== turno.current) return;
      setCausa(formatApiError(e, "") || null);
      setEstado("fallo");
    }
  }, []);

  useEffect(() => {
    if (clave === null) {
      // Otra sesión u otra empresa no heredan la lista de la anterior.
      turno.current += 1;
      setLista([]);
      setCausa(null);
      setEstado("espera");
      return;
    }
    void cargar(false);
  }, [clave, cargar]);

  const fallando = estado === "fallo" || estado === "reintentando";
  const recargar = useCallback(() => cargar(fallando), [cargar, fallando]);

  const poner = useCallback((nueva: T[]) => {
    turno.current += 1;
    setLista(nueva);
    setCausa(null);
    setEstado("lista");
  }, []);

  return { lista, estado, nombre, causa: fallando ? causa : null, noCargo: fallando && lista.length === 0, recargar, poner };
}

/**
 * La primera opción de un `<select>` que se llena con una de estas listas. Con opciones invita a
 * elegir; vacía de verdad dice qué hacer; si no cargó, lo dice en vez de mandar a crear algo.
 */
export function rotuloDeApoyo(
  apoyo: { estado: EstadoDeApoyo; lista: readonly unknown[] },
  textos: { elige: string; vacia: string; fallo: string; cargando?: string },
): string {
  if (apoyo.lista.length > 0) return textos.elige;
  if (apoyo.estado === "fallo" || apoyo.estado === "reintentando") return textos.fallo;
  if (apoyo.estado === "lista") return textos.vacia;
  return textos.cargando ?? "Cargando…";
}

/** «los productos ni los almacenes»: lo que sigue a «No se pudieron cargar…». */
export function enumerarConNi(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} ni ${nombres[nombres.length - 1]}`;
}
