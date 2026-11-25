import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-base", () => ({ buildApiUrl: (ruta: string) => `/api/${ruta}` }));

import { leerListaPortal } from "./portal-lista";

const responde = (status: number, cuerpo: string) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(cuerpo, { status })));
const leer = () => leerListaPortal<{ id: number }>("client-portal/tickets", "t", "tus tickets");

describe("leerListaPortal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("una lista vacía de verdad no es un error", async () => {
    responde(200, "[]");
    expect(await leer()).toEqual({ items: [], error: null });
  });

  it("devuelve los renglones", async () => {
    responde(200, '[{"id":1}]');
    expect(await leer()).toEqual({ items: [{ id: 1 }], error: null });
  });

  it("un 500 no se confunde con «no tienes tickets»", async () => {
    responde(500, '{"message":"Internal server error"}');
    expect((await leer()).error).toContain("error 500");
  });

  it("la sesión vencida se dice", async () => {
    responde(401, "{}");
    expect((await leer()).error).toContain("sesión");
  });

  it.each(["<html>", "{}"])("una respuesta que no es lista (%s) es un error", async (cuerpo) => {
    responde(200, cuerpo);
    expect((await leer()).error).toContain("No pudimos cargar tus tickets");
  });

  it("sin red es un error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect((await leer()).error).toContain("conexión");
  });
});
