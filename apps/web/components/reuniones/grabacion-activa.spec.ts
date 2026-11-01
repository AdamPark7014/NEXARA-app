import { describe, expect, it } from "vitest";
import { RETOMAR_SOLA_MS, borrarNota, esReciente, guardarNota, leerNota, tituloConGrabacion, tituloSinGrabacion } from "./grabacion-activa";

describe("el título de la pestaña", () => {
  it("lleva el reloj una sola vez y se quita al terminar", () => {
    const una = tituloConGrabacion("Clientes · NEXARA Core", "12:34", false);
    expect(una).toBe("● 12:34 · Clientes · NEXARA Core");
    expect(tituloConGrabacion(una, "12:35", false)).toBe("● 12:35 · Clientes · NEXARA Core");
    expect(tituloConGrabacion(una, "12:35", true)).toBe("⏸ 12:35 · Clientes · NEXARA Core");
    expect(tituloSinGrabacion(tituloConGrabacion(una, "12:35", true))).toBe("Clientes · NEXARA Core");
    expect(tituloSinGrabacion("Clientes · NEXARA Core")).toBe("Clientes · NEXARA Core");
  });
});

describe("la nota para retomar", () => {
  it("se guarda, se lee y se borra; una rota no estorba", () => {
    expect(leerNota()).toBeNull();
    guardarNota({ meetingId: 7, titulo: "Junta", at: 1 });
    expect(leerNota()).toEqual({ meetingId: 7, titulo: "Junta", at: 1 });
    borrarNota();
    expect(leerNota()).toBeNull();
    window.localStorage.setItem("nx-grabacion-activa", "{roto");
    expect(leerNota()).toBeNull();
  });

  it("solo una nota de hace poco es una recarga", () => {
    const ahora = 1_000_000;
    expect(esReciente({ meetingId: 7, titulo: "", at: ahora - 5_000 }, ahora)).toBe(true);
    expect(esReciente({ meetingId: 7, titulo: "", at: ahora - RETOMAR_SOLA_MS - 1 }, ahora)).toBe(false);
  });
});
