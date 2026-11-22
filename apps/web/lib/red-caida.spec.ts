import { afterEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_SIN_CONEXION, esErrorDeRed, esTextoDeRedCaida, traducirFallosDeRed } from "./red-caida";
import { MENSAJE_SERVIDOR_CON_PROBLEMA, errorSeguidoDe, formatApiError } from "./erp-api";

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

  it("los genéricos del marco salen en español, llegue el cuerpo como JSON o como texto", () => {
    const cuerpo = (message: unknown, statusCode: number, error?: string) =>
      new Error(JSON.stringify({ statusCode, message, error }));
    const sesion = "Tu sesión expiró. Vuelve a iniciar sesión.";
    const permiso = "No tienes permiso para esta acción.";
    const intentos = "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.";
    const archivo = "El archivo pesa más de lo permitido.";

    expect(formatApiError(cuerpo("Unauthorized", 401), "No se pudo cargar")).toBe(sesion);
    expect(formatApiError(new Error("HTTP 401"), "No se pudo cargar")).toBe(sesion);
    expect(formatApiError(cuerpo("Forbidden resource", 403, "Forbidden"), "No se pudo cargar")).toBe(permiso);
    expect(formatApiError(new Error("Forbidden"), "No se pudo cargar")).toBe(permiso);
    expect(formatApiError(new Error("HTTP 403"), "No se pudo cargar")).toBe(permiso);
    expect(formatApiError(cuerpo("ThrottlerException: Too Many Requests", 429), "No se pudo enviar")).toBe(intentos);
    expect(formatApiError("Too Many Requests", "No se pudo enviar")).toBe(intentos);
    expect(formatApiError(cuerpo("File too large", 413, "Payload Too Large"), "No se pudo subir")).toBe(archivo);
    expect(formatApiError(new Error("Request Entity Too Large"), "No se pudo subir")).toBe(archivo);
    expect(formatApiError(cuerpo("Bad Gateway", 502), "No se pudo cargar")).toBe(MENSAJE_SERVIDOR_CON_PROBLEMA);
    expect(formatApiError(new Error("Service Unavailable"), "No se pudo cargar")).toBe(MENSAJE_SERVIDOR_CON_PROBLEMA);
  });

  it("un genérico que no dice nada deja la frase de quien llamó, y un mensaje propio nunca se toca", () => {
    expect(formatApiError(new Error(JSON.stringify({ statusCode: 400, error: "Bad Request" })), "No se pudo guardar")).toBe(
      "No se pudo guardar",
    );
    expect(formatApiError(new Error(JSON.stringify({ statusCode: 404, message: "Not Found" })), "No se encontró")).toBe(
      "No se encontró",
    );
    expect(formatApiError(new Error("Unexpected field"), "No se pudo subir")).toBe("No se pudo subir");
    expect(
      formatApiError(
        new Error(JSON.stringify({ statusCode: 400, message: "Validation failed (numeric string is expected)", error: "Bad Request" })),
        "No se pudo abrir el proyecto",
      ),
    ).toBe("No se pudo abrir el proyecto");
    // Solo el texto exacto del marco: lo que el servidor redactó llega tal cual, aunque se parezca.
    expect(
      formatApiError(new Error(JSON.stringify({ statusCode: 403, message: "Solo tu jefe directo puede aprobar esto" })), "x"),
    ).toBe("Solo tu jefe directo puede aprobar esto");
    expect(
      formatApiError(new Error(JSON.stringify({ statusCode: 400, message: ["Falta la descripción"], error: "Bad Request" })), "x"),
    ).toBe("Falta la descripción");
    expect(formatApiError(new Error("Proyecto no encontrado"), "x")).toBe("Proyecto no encontrado");
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
