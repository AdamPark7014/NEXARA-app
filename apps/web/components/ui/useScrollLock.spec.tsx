import { describe, expect, it } from "vitest";
import { lockScroll } from "./useScrollLock";

describe("Bloqueo de scroll al abrir una ventana", () => {
  it("bloquea en <html>, que es quien desplaza la página, y deja <body> como estaba", () => {
    const soltar = lockScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    soltar();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("una ventana encima de otra no suelta el bloqueo antes de tiempo", () => {
    const primera = lockScroll();
    const segunda = lockScroll();
    segunda();
    expect(document.documentElement.style.overflow).toBe("hidden");
    primera();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("soltar dos veces la misma ventana no desbloquea a la otra", () => {
    const primera = lockScroll();
    const segunda = lockScroll();
    segunda();
    segunda();
    expect(document.documentElement.style.overflow).toBe("hidden");
    primera();
  });
});
