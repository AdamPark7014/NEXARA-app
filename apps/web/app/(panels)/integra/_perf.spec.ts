import { beforeEach, describe, expect, it, vi } from "vitest";

import { HITOS, hitosRegistrados, marcarHito, reiniciarHitos, resumenHitos } from "./_perf";

/**
 * Las marcas son la única forma de saber si el arranque mejoró de verdad. Lo
 * que se prueba aquí es lo que las hace creíbles: que **el primero manda** —un
 * repintado posterior no puede empeorar un número ya ganado— y que el resumen
 * dice también los tramos, que es donde se ve dónde se va el tiempo.
 */

describe("hitos de arranque", () => {
  beforeEach(() => {
    reiniciarHitos();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  const reloj = (ms: number) => ({ now: () => ms });

  it("registra el hito con los milisegundos desde el arranque de la navegación", () => {
    expect(marcarHito(HITOS.rejillaVisible, { reloj: reloj(142.6) })).toBe(143);
    expect(hitosRegistrados()[HITOS.rejillaVisible]).toBe(143);
  });

  it("el primero manda: un repintado posterior no empeora el número", () => {
    marcarHito(HITOS.primerMosaico, { reloj: reloj(900) });
    expect(marcarHito(HITOS.primerMosaico, { reloj: reloj(4000) })).toBe(900);
    expect(hitosRegistrados()[HITOS.primerMosaico]).toBe(900);
  });

  it("los ordena por cuándo ocurrieron, no por cuándo se declararon", () => {
    marcarHito(HITOS.primerMosaico, { reloj: reloj(1500) });
    marcarHito(HITOS.rejillaVisible, { reloj: reloj(120) });
    marcarHito(HITOS.listaCamaras, { reloj: reloj(340) });
    expect(Object.keys(hitosRegistrados())).toEqual([
      HITOS.rejillaVisible,
      HITOS.listaCamaras,
      HITOS.primerMosaico,
    ]);
  });

  it("el resumen incluye el tramo entre hitos", () => {
    marcarHito(HITOS.rejillaVisible, { reloj: reloj(120) });
    marcarHito(HITOS.listaCamaras, { reloj: reloj(340) });
    marcarHito(HITOS.primerMosaico, { reloj: reloj(1500) });
    const texto = resumenHitos();
    expect(texto).toContain(`${HITOS.rejillaVisible}: 120 ms`);
    expect(texto).toContain("(+220 ms)");
    expect(texto).toContain("(+1160 ms)");
  });

  it("sin reloj no inventa un número", () => {
    expect(marcarHito("integra:sin-reloj", { reloj: null })).toBeNull();
    expect(hitosRegistrados()["integra:sin-reloj"]).toBeUndefined();
  });

  it("sin hitos lo dice en vez de devolver una cadena vacía", () => {
    expect(resumenHitos()).toBe("sin hitos registrados");
  });

  it("un `performance.mark` que reviente no puede tumbar la página", () => {
    const relojRoto = {
      now: () => 200,
      mark: () => {
        throw new Error("mark duplicado");
      },
    };
    expect(() => marcarHito("integra:mark-roto", { reloj: relojRoto })).not.toThrow();
    expect(hitosRegistrados()["integra:mark-roto"]).toBe(200);
  });
});
