import { describe, expect, it } from "vitest";

import type { PlayerState } from "./_LivePlayer";
import { WALL_CONNECT_CONCURRENCY, admitirMosaicos } from "./_wallAdmission";

/**
 * El control de admisión es el que arregló «no se ven todas». Estas pruebas
 * fijan sus dos propiedades para que nadie las deshaga sin darse cuenta:
 *
 * 1. El tope es de **handshakes simultáneos**, no de cámaras vivas. Un límite
 *    de vivas (`cc59543` topaba a 4) es exactamente lo que hacía que nunca se
 *    vieran las nueve.
 * 2. Lo que está fuera de pantalla no ocupa turno. Antes sí lo ocupaba, y en un
 *    4×4 en portátil las filas visibles esperaban detrás de filas invisibles.
 */

const celdas = (...ids: Array<string | null>) => ids.map((id) => (id ? { id } : null));

describe("admisión del muro", () => {
  it("deja arrancar solo a tres a la vez; el resto espera", () => {
    const ids = admitirMosaicos(celdas("a", "b", "c", "d", "e"), {});
    expect([...ids]).toEqual(["a", "b", "c"]);
    expect(ids.size).toBe(WALL_CONNECT_CONCURRENCY);
  });

  it("en cuanto una se asienta, entra la siguiente de la cola", () => {
    const estado: Record<string, PlayerState> = { a: "live", b: "loading", c: "loading" };
    const ids = admitirMosaicos(celdas("a", "b", "c", "d", "e"), estado);
    // «a» sigue admitida —está viva— y además libera su turno para «d».
    expect([...ids]).toEqual(["a", "b", "c", "d"]);
  });

  it("NO es un tope de cámaras vivas: nueve vivas siguen admitidas", () => {
    const nueve = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const estado: Record<string, PlayerState> = {};
    for (const id of nueve) estado[id] = "live";
    expect(admitirMosaicos(celdas(...nueve), estado).size).toBe(9);
  });

  it("respaldo y error también cuentan como asentados: nadie bloquea la cola", () => {
    const estado: Record<string, PlayerState> = { a: "snapshot", b: "error", c: "live" };
    const ids = admitirMosaicos(celdas("a", "b", "c", "d", "e", "f"), estado);
    expect([...ids]).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("las celdas vacías de la rejilla no cuentan para nada", () => {
    const ids = admitirMosaicos(celdas("a", null, "b", null, "c", "d"), {});
    expect([...ids]).toEqual(["a", "b", "c"]);
  });

  it("lo que está fuera de pantalla no se admite ni ocupa turno", () => {
    // El caso medido: un 4×4 en portátil con las últimas filas bajo el pliegue.
    // Antes, «a», «b» y «c» —invisibles— se quedaban en «en cola» sin poder
    // arrancar y consumían los tres turnos, así que «d» y «e», que SÍ se veían,
    // no arrancaban hasta que el operador hiciera scroll.
    const estado: Record<string, PlayerState> = {
      a: "offscreen",
      b: "offscreen",
      c: "offscreen",
    };
    const ids = admitirMosaicos(celdas("a", "b", "c", "d", "e", "f", "g"), estado);
    expect(ids.has("a")).toBe(false);
    expect([...ids]).toEqual(["d", "e", "f"]);
  });

  it("al entrar en pantalla vuelve a la cola normal, sin estampida", () => {
    // Ocho mosaicos que aparecen de golpe al hacer scroll no pueden negociar los
    // ocho a la vez: eso es justo lo que el control de admisión existe para
    // evitar. Al dejar de ser «offscreen» pasan a «queued» y compiten igual.
    const ocho = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const estado: Record<string, PlayerState> = {};
    for (const id of ocho) estado[id] = "queued";
    expect(admitirMosaicos(celdas(...ocho), estado).size).toBe(WALL_CONNECT_CONCURRENCY);
  });

  it("un mosaico invisible entre visibles no roba el turno de nadie", () => {
    const estado: Record<string, PlayerState> = { b: "offscreen" };
    const ids = admitirMosaicos(celdas("a", "b", "c", "d", "e"), estado);
    expect([...ids]).toEqual(["a", "c", "d"]);
  });

  it("el tope es configurable, por si hay que medir con otro valor", () => {
    expect(admitirMosaicos(celdas("a", "b", "c", "d"), {}, 1).size).toBe(1);
    expect(admitirMosaicos(celdas("a", "b", "c", "d"), {}, 4).size).toBe(4);
  });
});
