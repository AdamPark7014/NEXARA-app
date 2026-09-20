import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearProgramador, leerSecciones, paginaDeSeccion, seMovioSeccion } from "./vista-previa-vivo";

describe("leerSecciones", () => {
  it("lee la cabecera de la API", () => {
    expect(leerSecciones('{"portada":1,"objetivo":2,"alcance":3,"planos":6,"cotizacion":7}')).toEqual({
      portada: 1,
      objetivo: 2,
      alcance: 3,
      planos: 6,
      cotizacion: 7,
    });
  });

  it("ignora basura sin romper la vista previa", () => {
    expect(leerSecciones(null)).toEqual({});
    expect(leerSecciones("no es json")).toEqual({});
    expect(leerSecciones("[1,2]")).toEqual({});
    expect(leerSecciones('{"portada":1,"otra":4,"objetivo":"x","alcance":0,"planos":2.5,"cotizacion":"5"}')).toEqual({
      portada: 1,
      cotizacion: 5,
    });
  });
});

describe("paginaDeSeccion", () => {
  const todas = { portada: 1, objetivo: 2, alcance: 3, planos: 6, cotizacion: 7 };

  it("lleva a la página donde empieza la sección", () => {
    expect(paginaDeSeccion(todas, "portada")).toBe(1);
    expect(paginaDeSeccion(todas, "objetivo")).toBe(2);
    expect(paginaDeSeccion(todas, "planos")).toBe(6);
    expect(paginaDeSeccion(todas, "cotizacion")).toBe(7);
  });

  it("una sección que no se imprime va a donde aparecería (la siguiente que sí existe)", () => {
    // Sin alcance ni planos: el PDF pasa de 01 a 04.
    const sinAlcance = { portada: 1, objetivo: 2, cotizacion: 3 };
    expect(paginaDeSeccion(sinAlcance, "alcance")).toBe(3);
    expect(paginaDeSeccion(sinAlcance, "planos")).toBe(3);
  });

  it("sin siguiente, la última anterior; sin datos, la portada", () => {
    expect(paginaDeSeccion({ portada: 1, objetivo: 2 }, "cotizacion")).toBe(2);
    expect(paginaDeSeccion({}, "cotizacion")).toBe(1);
  });

  it("no se sale del documento", () => {
    expect(paginaDeSeccion(todas, "cotizacion", 5)).toBe(5);
  });

  it("sabe si la sección cambió de página entre dos PDFs", () => {
    expect(seMovioSeccion(todas, { ...todas, cotizacion: 8 }, "cotizacion")).toBe(true);
    expect(seMovioSeccion(todas, { ...todas, cotizacion: 8 }, "objetivo")).toBe(false);
  });
});

describe("crearProgramador", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Petición controlable: se resuelve cuando la prueba quiere. */
  function peticiones() {
    const hechas: Array<{ entrada: string; signal: AbortSignal; resolver: (v: string) => void; fallar: (e: unknown) => void }> = [];
    const pedir = (entrada: string, signal: AbortSignal) =>
      new Promise<string>((resolver, fallar) => hechas.push({ entrada, signal, resolver, fallar }));
    return { hechas, pedir };
  }

  it("espera 600 ms desde la última tecla y pide una sola vez", async () => {
    const { hechas, pedir } = peticiones();
    const resultados: string[] = [];
    const p = crearProgramador({ pedir, alResultado: (r) => resultados.push(r) });

    p.programar("R");
    vi.advanceTimersByTime(300);
    p.programar("Re");
    vi.advanceTimersByTime(300);
    p.programar("Ren");
    vi.advanceTimersByTime(599);
    expect(hechas).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(hechas.map((h) => h.entrada)).toEqual(["Ren"]);

    hechas[0]!.resolver("pdf de Ren");
    await vi.runAllTimersAsync();
    expect(resultados).toEqual(["pdf de Ren"]);
  });

  it("una petición nueva aborta la que va en camino", () => {
    const { hechas, pedir } = peticiones();
    const p = crearProgramador({ pedir, alResultado: () => undefined });
    p.ahora("a");
    p.ahora("b");
    expect(hechas[0]!.signal.aborted).toBe(true);
    expect(hechas[1]!.signal.aborted).toBe(false);
  });

  it("una respuesta vieja que llega tarde no pisa a la nueva", async () => {
    const { hechas, pedir } = peticiones();
    const resultados: string[] = [];
    const errores: unknown[] = [];
    const p = crearProgramador({ pedir, alResultado: (r) => resultados.push(r), alError: (e) => errores.push(e) });

    p.ahora("vieja");
    p.ahora("nueva");
    hechas[1]!.resolver("pdf nuevo");
    // El servidor ya había mandado la vieja: el fetch la entrega aunque se abortó.
    hechas[0]!.resolver("pdf viejo");
    await vi.runAllTimersAsync();
    expect(resultados).toEqual(["pdf nuevo"]);

    // Ni su error cuenta.
    p.ahora("otra");
    p.ahora("última");
    hechas[2]!.fallar(new Error("HTTP 500 de la vieja"));
    hechas[3]!.resolver("pdf última");
    await vi.runAllTimersAsync();
    expect(errores).toEqual([]);
    expect(resultados).toEqual(["pdf nuevo", "pdf última"]);
  });

  it("informa el error de la última petición, pero no el de un abort", async () => {
    const errores: unknown[] = [];
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const p = crearProgramador<string, string>({
      pedir: (e) => (e === "abort" ? Promise.reject(abort) : Promise.reject(new Error("HTTP 500"))),
      alResultado: () => undefined,
      alError: (e) => errores.push((e as Error).message),
    });
    p.ahora("abort");
    await vi.runAllTimersAsync();
    p.ahora("falla");
    await vi.runAllTimersAsync();
    expect(errores).toEqual(["HTTP 500"]);
  });

  it("«ahora» se salta la espera y cancela lo programado", () => {
    const { hechas, pedir } = peticiones();
    const p = crearProgramador({ pedir, alResultado: () => undefined });
    p.programar("tecleando");
    p.ahora("botón Actualizar");
    vi.advanceTimersByTime(2000);
    expect(hechas.map((h) => h.entrada)).toEqual(["botón Actualizar"]);
  });

  it("cancelar olvida lo pendiente, aborta lo que va y apaga el indicador", async () => {
    const { hechas, pedir } = peticiones();
    const estados: boolean[] = [];
    const resultados: string[] = [];
    const p = crearProgramador({ pedir, alResultado: (r) => resultados.push(r), alCambiarEstado: (v) => estados.push(v) });
    p.ahora("en camino");
    p.programar("pendiente");
    expect(p.enCamino()).toBe(true);
    p.cancelar();
    vi.advanceTimersByTime(2000);
    hechas[0]!.resolver("tarde");
    await vi.runAllTimersAsync();
    expect(hechas).toHaveLength(1);
    expect(hechas[0]!.signal.aborted).toBe(true);
    expect(resultados).toEqual([]);
    expect(estados).toEqual([true, false]);
    expect(p.enCamino()).toBe(false);
  });

  it("el indicador sigue encendido mientras la última no termina", async () => {
    const { hechas, pedir } = peticiones();
    const estados: boolean[] = [];
    const p = crearProgramador({ pedir, alResultado: () => undefined, alCambiarEstado: (v) => estados.push(v) });
    p.ahora("1");
    p.ahora("2");
    hechas[0]!.resolver("vieja");
    await vi.runAllTimersAsync();
    expect(p.enCamino()).toBe(true);
    hechas[1]!.resolver("nueva");
    await vi.runAllTimersAsync();
    expect(p.enCamino()).toBe(false);
    expect(estados).toEqual([true, false]);
  });
});
