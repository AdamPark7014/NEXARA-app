import { describe, expect, it, beforeEach } from "vitest";
import { CODIGO_JORNADA_NO_ABIERTA, errorDeJornada, manejarErrorJornada, barreraJornadaActiva, cerrarBarreraJornada, abrirBarreraJornada } from "./jornada-candado";

beforeEach(() => cerrarBarreraJornada());

describe("errorDeJornada", () => {
  it("detecta 409 con codigo", () => {
    const e = new Error(JSON.stringify({ statusCode: 409, code: CODIGO_JORNADA_NO_ABIERTA, message: "Registra tu entrada para empezar a trabajar" }));
    expect(errorDeJornada(e)?.code).toBe(CODIGO_JORNADA_NO_ABIERTA);
  });
  it("ignora otros errores", () => {
    expect(errorDeJornada(new Error(JSON.stringify({ code: "OTRO" })))).toBeNull();
    expect(errorDeJornada(new Error("fallo"))).toBeNull();
  });
});

describe("manejarErrorJornada", () => {
  it("abre la barrera", () => {
    expect(barreraJornadaActiva()).toBe(false);
    const ok = manejarErrorJornada(new Error(JSON.stringify({ code: CODIGO_JORNADA_NO_ABIERTA, message: "x" })));
    expect(ok).toBe(true);
    expect(barreraJornadaActiva()).toBe(true);
    abrirBarreraJornada(); // idempotente
    expect(barreraJornadaActiva()).toBe(true);
  });
});