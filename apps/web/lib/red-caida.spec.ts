import { afterEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_SIN_CONEXION, esErrorDeRed, esTextoDeRedCaida, traducirFallosDeRed } from "./red-caida";
import { errorSeguidoDe, formatApiError } from "./erp-api";

describe("red caída", () => {
  let quitar: (() => void) | null = null;
  const fetchDeAntes = window.fetch;

  afterEach(() => {
    quitar?.();
    quitar = null;
    window.fetch = fetchDeAntes;
  });

  it("reconoce el texto de cada navegador y no otros errores de programación", () => {
    for (const t of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
      expect(esTextoDeRedCaida(t)).toBe(true);
    }
    expect(esTextoDeRedCaida("Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(esTextoDeRedCaida("No tienes permiso")).toBe(false);
  });

  it("una llamada a la API sin red rechaza con la frase clara y sigue siendo TypeError", async () => {
    window.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    quitar = traducirFallosDeRed();

    const fallo = await window.fetch("/api/tool-requests").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(TypeError);
    expect((fallo as Error).message).toBe(MENSAJE_SIN_CONEXION);
    expect(esErrorDeRed(fallo)).toBe(true);
  });

  it("deja intactas las cancelaciones, los servicios ajenos y las respuestas del servidor", async () => {
    const cancelada = new DOMException("The user aborted a request.", "AbortError");
    const respuesta = new Response("{}", { status: 500 });
    const original = vi
      .fn()
      .mockRejectedValueOnce(cancelada)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(respuesta);
    window.fetch = original as unknown as typeof fetch;
    quitar = traducirFallosDeRed();

    await expect(window.fetch("/api/algo")).rejects.toBe(cancelada);
    await expect(window.fetch("https://mapas.example.com/tiles/1.png")).rejects.toThrow("Failed to fetch");
    await expect(window.fetch("/api/algo")).resolves.toBe(respuesta);
  });

  it("se instala una sola vez y al quitarla vuelve el fetch de antes", () => {
    const original = vi.fn() as unknown as typeof fetch;
    window.fetch = original;
    quitar = traducirFallosDeRed();
    const envuelto = window.fetch;
    expect(envuelto).not.toBe(original);
    traducirFallosDeRed()();
    expect(window.fetch).toBe(envuelto);
    quitar();
    quitar = null;
    expect(window.fetch).toBe(original);
  });

  it("formatApiError tampoco enseña el texto del navegador ni el genérico en inglés", () => {
    expect(formatApiError(new TypeError("Failed to fetch"), "No se pudo cargar")).toBe(MENSAJE_SIN_CONEXION);
    expect(formatApiError(new Error("Load failed"), "No se pudo cargar")).toBe(MENSAJE_SIN_CONEXION);
    expect(formatApiError(new Error(JSON.stringify({ statusCode: 500, message: "Internal server error" })), "No se pudo cargar")).toBe(
      "El servidor tuvo un problema. Vuelve a intentarlo en un momento.",
    );
    expect(formatApiError(new Error("El código ya se usó"), "No se pudo")).toBe("El código ya se usó");
  });

  it("une el error con la frase siguiente sin dejar dos puntos seguidos", () => {
    expect(errorSeguidoDe(MENSAJE_SIN_CONEXION, "Se muestra lo último que cargó.")).toBe(
      `${MENSAJE_SIN_CONEXION} Se muestra lo último que cargó.`,
    );
    expect(errorSeguidoDe("No se pudo cargar el inventario", "Se muestra lo último que cargó.")).toBe(
      "No se pudo cargar el inventario. Se muestra lo último que cargó.",
    );
    expect(errorSeguidoDe("¿Sigues ahí? ", "Vuelve a entrar.")).toBe("¿Sigues ahí? Vuelve a entrar.");
  });
});
