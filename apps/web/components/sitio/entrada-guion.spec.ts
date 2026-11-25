import { afterEach, describe, expect, it, vi } from "vitest";
import { GUION_ENTRADA } from "./entrada-guion";

/** Corre el script en línea tal como lo hace el navegador antes de pintar el hero. */
const correr = () => new Function(GUION_ENTRADA)();
const marca = () => document.documentElement.getAttribute("data-intro");
const navegacion = (type: string) => vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type } as unknown as PerformanceEntry]);

describe("Script que decide si la entrada de la portada se repite", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-intro");
  });

  it("primera visita de la sesión: no marca nada (la entrada corre) y deja anotado que ya se vio", () => {
    navegacion("navigate");
    correr();
    expect(marca()).toBeNull();
    expect(sessionStorage.getItem("nx:intro")).toBe("1");
  });

  it("al volver a la portada en la misma sesión, el escenario aparece ya armado", () => {
    navegacion("navigate");
    sessionStorage.setItem("nx:intro", "1");
    correr();
    expect(marca()).toBe("visto");
  });

  it("también al regresar con el botón Atrás", () => {
    navegacion("back_forward");
    sessionStorage.setItem("nx:intro", "1");
    correr();
    expect(marca()).toBe("visto");
  });

  it("recargar la página a propósito repite la entrada", () => {
    navegacion("reload");
    sessionStorage.setItem("nx:intro", "1");
    correr();
    expect(marca()).toBeNull();
    expect(sessionStorage.getItem("nx:intro")).toBe("1");
  });

  it("sin datos de navegación (navegador viejo) se guía solo por la sesión", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    sessionStorage.setItem("nx:intro", "1");
    correr();
    expect(marca()).toBe("visto");
  });

  it("si el navegador bloquea el almacenamiento, no truena: la entrada simplemente corre", () => {
    navegacion("navigate");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(correr).not.toThrow();
    expect(marca()).toBeNull();
  });

  it("es una sola línea sin etiquetas: se puede incrustar en un <script> sin escapar nada", () => {
    expect(GUION_ENTRADA).not.toMatch(/[<>\n]/);
  });
});
