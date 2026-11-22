import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MENSAJE_SIN_CONEXION } from "@/lib/red-caida";
import { enumerarConNi, rotuloDeApoyo, useListaDeApoyo } from "./lista-de-apoyo";

type Almacen = { id: number; name: string };
const CENTRAL: Almacen = { id: 1, name: "Central" };
const BODEGA: Almacen = { id: 2, name: "Bodega" };

const TEXTOS = {
  elige: "Elige el almacén",
  vacia: "Primero crea un almacén",
  fallo: "No se pudieron cargar los almacenes",
};

/** Una promesa que se resuelve o se rechaza cuando la prueba lo dice. */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (motivo: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

/** Una lista que no llegó no es una lista vacía: la carga dice en qué quedó y se puede repetir. */
describe("useListaDeApoyo", () => {
  it("sin clave no pide nada y queda en espera", () => {
    const pedir = vi.fn(async () => [CENTRAL]);
    const { result } = renderHook(() => useListaDeApoyo<Almacen>(null, pedir, "los almacenes"));
    expect(pedir).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("espera");
    expect(result.current.noCargo).toBe(false);
  });

  it("pide la lista y la entrega", async () => {
    const pedir = vi.fn(async () => [CENTRAL, BODEGA]);
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    expect(result.current.estado).toBe("cargando");
    await waitFor(() => expect(result.current.estado).toBe("lista"));
    expect(result.current.lista).toEqual([CENTRAL, BODEGA]);
    expect(result.current.noCargo).toBe(false);
    expect(result.current.causa).toBeNull();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("cuando no carga lo dice, con la causa en español, en vez de quedarse vacía y callada", async () => {
    const pedir = vi.fn(async (): Promise<Almacen[]> => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("fallo"));
    expect(result.current.noCargo).toBe(true);
    expect(result.current.nombre).toBe("los almacenes");
    expect(result.current.causa).toBe(MENSAJE_SIN_CONEXION);
    expect(result.current.lista).toEqual([]);
  });

  it("un fallo sin mensaje propio no inventa una causa", async () => {
    const pedir = vi.fn(async (): Promise<Almacen[]> => {
      throw new Error("");
    });
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("fallo"));
    expect(result.current.causa).toBeNull();
  });

  it("reintentar vuelve a pedirla; mientras tanto el aviso sigue y al llegar se quita", async () => {
    const segunda = diferida<Almacen[]>();
    const pedir = vi
      .fn<() => Promise<Almacen[]>>()
      .mockRejectedValueOnce(new Error("Internal Server Error"))
      .mockReturnValueOnce(segunda.promesa);
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("fallo"));

    let reintento!: Promise<void>;
    act(() => {
      reintento = result.current.recargar();
    });
    expect(result.current.estado).toBe("reintentando");
    expect(result.current.noCargo).toBe(true);

    await act(async () => {
      segunda.resolver([CENTRAL]);
      await reintento;
    });
    expect(result.current.estado).toBe("lista");
    expect(result.current.noCargo).toBe(false);
    expect(result.current.causa).toBeNull();
    expect(result.current.lista).toEqual([CENTRAL]);
  });

  it("si un refresco falla, lo que ya estaba cargado se queda y no hay nada que avisar en el formulario", async () => {
    const pedir = vi
      .fn<() => Promise<Almacen[]>>()
      .mockResolvedValueOnce([CENTRAL])
      .mockRejectedValueOnce(new TypeError("Load failed"));
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("lista"));
    await act(async () => {
      await result.current.recargar();
    });
    expect(result.current.estado).toBe("fallo");
    expect(result.current.lista).toEqual([CENTRAL]);
    expect(result.current.noCargo).toBe(false);
  });

  it("al cambiar la clave vuelve a pedir y una respuesta vieja que llega tarde no pisa a la nueva", async () => {
    const vieja = diferida<Almacen[]>();
    const nueva = diferida<Almacen[]>();
    const pedir = vi.fn<() => Promise<Almacen[]>>().mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    const { result, rerender } = renderHook(({ clave }) => useListaDeApoyo<Almacen>(clave, pedir, "los almacenes"), {
      initialProps: { clave: "empresa-1" },
    });
    rerender({ clave: "empresa-2" });
    await act(async () => {
      nueva.resolver([BODEGA]);
      await nueva.promesa;
    });
    await act(async () => {
      vieja.resolver([CENTRAL]);
      await vieja.promesa;
    });
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(result.current.lista).toEqual([BODEGA]);
    expect(result.current.estado).toBe("lista");
  });

  it("no vuelve a pedir en cada repintado aunque la función de pedir sea otra", async () => {
    const pedidas = vi.fn(async () => [CENTRAL]);
    const { result, rerender } = renderHook(() => useListaDeApoyo<Almacen>("sesion", () => pedidas(), "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("lista"));
    rerender();
    rerender();
    expect(pedidas).toHaveBeenCalledTimes(1);
  });

  it("poner la lista a mano (tras un alta) quita el fallo", async () => {
    const pedir = vi.fn(async (): Promise<Almacen[]> => {
      throw new Error("HTTP 502");
    });
    const { result } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    await waitFor(() => expect(result.current.estado).toBe("fallo"));
    act(() => result.current.poner([CENTRAL]));
    expect(result.current.estado).toBe("lista");
    expect(result.current.noCargo).toBe(false);
    expect(result.current.lista).toEqual([CENTRAL]);
  });

  it("al quitarse la clave deja de esperar y no enseña la lista de otra sesión", async () => {
    const pedir = vi.fn(async () => [CENTRAL]);
    const { result, rerender } = renderHook(({ clave }: { clave: string | null }) => useListaDeApoyo<Almacen>(clave, pedir, "los almacenes"), {
      initialProps: { clave: "sesion" as string | null },
    });
    await waitFor(() => expect(result.current.estado).toBe("lista"));
    rerender({ clave: null });
    expect(result.current.estado).toBe("espera");
    expect(result.current.lista).toEqual([]);
  });

  it("una respuesta que llega con la pantalla ya cerrada no hace nada", async () => {
    const tarde = diferida<Almacen[]>();
    const pedir = vi.fn(() => tarde.promesa);
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useListaDeApoyo<Almacen>("sesion", pedir, "los almacenes"));
    unmount();
    await act(async () => {
      tarde.rechazar(new Error("tarde"));
      await tarde.promesa.catch(() => undefined);
    });
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });
});

describe("rotuloDeApoyo", () => {
  const con = (estado: "espera" | "cargando" | "lista" | "fallo" | "reintentando", lista: unknown[] = []) => ({ estado, lista });

  it("con opciones invita a elegir", () => {
    expect(rotuloDeApoyo(con("lista", [CENTRAL]), TEXTOS)).toBe("Elige el almacén");
  });

  it("vacía de verdad dice qué hacer", () => {
    expect(rotuloDeApoyo(con("lista"), TEXTOS)).toBe("Primero crea un almacén");
  });

  it("si no cargó no manda a crear nada: dice que no cargó", () => {
    expect(rotuloDeApoyo(con("fallo"), TEXTOS)).toBe("No se pudieron cargar los almacenes");
    expect(rotuloDeApoyo(con("reintentando"), TEXTOS)).toBe("No se pudieron cargar los almacenes");
  });

  it("mientras llega no dice que no hay", () => {
    expect(rotuloDeApoyo(con("cargando"), TEXTOS)).toBe("Cargando…");
    expect(rotuloDeApoyo(con("espera"), TEXTOS)).toBe("Cargando…");
    expect(rotuloDeApoyo(con("cargando"), { ...TEXTOS, cargando: "Cargando almacenes…" })).toBe("Cargando almacenes…");
  });

  it("un refresco fallido con la lista a la vista sigue invitando a elegir", () => {
    expect(rotuloDeApoyo(con("fallo", [CENTRAL]), TEXTOS)).toBe("Elige el almacén");
  });
});

describe("enumerarConNi", () => {
  it("une lo que no cargó como se dice en español", () => {
    expect(enumerarConNi(["los almacenes"])).toBe("los almacenes");
    expect(enumerarConNi(["los productos", "los almacenes"])).toBe("los productos ni los almacenes");
    expect(enumerarConNi(["las plantillas", "los paquetes", "las versiones"])).toBe("las plantillas, los paquetes ni las versiones");
    expect(enumerarConNi([])).toBe("");
  });
});
