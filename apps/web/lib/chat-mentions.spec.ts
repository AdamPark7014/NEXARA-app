import { describe, expect, it } from "vitest";
import { insertTokenAt, toDisplay } from "./chat-mentions";

const LIGA = "[AN-0351 · Apoyo Biblioteca Tlaxcala](/erp/actividades/351)";
const RAUL = "[@Raúl Pérez](user:7)";

describe("insertTokenAt — la liga entra donde está el cursor (como WhatsApp)", () => {
  it("al final: un espacio antes, uno después y el cursor detrás", () => {
    const r = insertTokenAt("Revisa", 6, 6, LIGA);
    expect(r.markup).toBe(`Revisa ${LIGA} `);
    expect(r.caret).toBe(toDisplay(r.markup).text.length);
  });

  it("en medio de la frase no tira lo que sigue y reusa el espacio que ya había", () => {
    const r = insertTokenAt("Revisa hoy mismo", 7, 7, LIGA);
    expect(r.markup).toBe(`Revisa ${LIGA} hoy mismo`);
    const texto = toDisplay(r.markup).text;
    // El cursor queda justo antes de «hoy»: lo siguiente que se teclea va pegado detrás de la liga.
    expect(texto.slice(r.caret)).toBe("hoy mismo");
  });

  it("sustituye la selección", () => {
    const r = insertTokenAt("Revisa ESTO ya", 7, 11, LIGA);
    expect(r.markup).toBe(`Revisa ${LIGA} ya`);
  });

  it("con el cursor dentro de otra pastilla, se pone detrás de ella sin partirla", () => {
    const markup = `Hola ${RAUL}`;
    const dentro = toDisplay(markup).mentions[0]!.start + 3;
    const r = insertTokenAt(markup, dentro, dentro, LIGA);
    expect(r.markup).toBe(`Hola ${RAUL} ${LIGA} `);
  });

  it("quita el @parcial del autocompletado y deja la mención", () => {
    const r = insertTokenAt("Hola @ra", 8, 8, RAUL, { quitarDisparador: true });
    expect(r.markup).toBe(`Hola ${RAUL} `);
    expect(toDisplay(r.markup).text).toBe("Hola @Raúl Pérez ");
  });

  it("el @ de una pastilla ya puesta no cuenta como disparador", () => {
    const markup = `${RAUL} `;
    const fin = toDisplay(markup).text.length;
    const r = insertTokenAt(markup, fin, fin, LIGA, { quitarDisparador: true });
    expect(r.markup).toBe(`${RAUL} ${LIGA} `);
  });

  it("dos ligas seguidas quedan separadas por un solo espacio", () => {
    const uno = insertTokenAt("", 0, 0, LIGA);
    const dos = insertTokenAt(uno.markup, uno.caret, uno.caret, RAUL);
    expect(dos.markup).toBe(`${LIGA} ${RAUL} `);
    expect(dos.caret).toBe(toDisplay(dos.markup).text.length);
  });
});
