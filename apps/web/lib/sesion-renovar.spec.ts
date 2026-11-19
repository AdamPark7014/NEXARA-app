import { describe, expect, it } from "vitest";
import { debeRenovarSesion } from "./sesion-renovar";

describe("renovar la sesión solo cuando hace falta (C4)", () => {
  const ahora = Date.parse("2026-11-18T12:00:00Z");
  it("con más de 2 h por delante no renueva", () => {
    expect(debeRenovarSesion("2026-11-18T20:00:00Z", ahora)).toBe(false);
  });
  it("con menos de 2 h, sí", () => {
    expect(debeRenovarSesion("2026-11-18T13:30:00Z", ahora)).toBe(true);
  });
  it("sin fecha o con fecha inválida, sí (como antes)", () => {
    expect(debeRenovarSesion(null, ahora)).toBe(true);
    expect(debeRenovarSesion("x", ahora)).toBe(true);
  });
});
