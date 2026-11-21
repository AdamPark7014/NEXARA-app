import { describe, expect, it } from "vitest";
import { diaEnMexico, diaPactado, diaPactadoVencido, diaParaApi, diasDeAtraso, textoDiaPactado } from "./dia-pactado";

describe("Día pactado de un préstamo", () => {
  it("lee el día que la persona eligió, se haya guardado como se haya guardado", () => {
    // La web de antes: medianoche UTC. En México eso es la tarde del 23 y la lista decía «23 nov».
    expect(diaPactado("2026-11-24T00:00:00.000Z")).toBe("2026-11-24");
    // Las apps: mediodía UTC.
    expect(diaPactado("2026-11-24T12:00:00.000Z")).toBe("2026-11-24");
    // La prórroga de la web: 23:59 de México, que en UTC ya es el 25.
    expect(diaPactado("2026-11-25T05:59:00.000Z")).toBe("2026-11-24");
    // Lo que guarda el servidor ahora: mediodía de México.
    expect(diaPactado("2026-11-24T18:00:00.000Z")).toBe("2026-11-24");
    expect(diaPactado("2026-11-24")).toBe("2026-11-24");
    expect(diaPactado(null)).toBeNull();
    expect(diaPactado("nada")).toBeNull();
  });

  it("lo escribe con el día correcto en cualquier computadora", () => {
    expect(textoDiaPactado("2026-11-24T00:00:00.000Z")).toMatch(/^24 nov\.? 2026$/);
    expect(textoDiaPactado("2026-11-25T05:59:00.000Z")).toMatch(/^24 nov\.? 2026$/);
    expect(textoDiaPactado(null)).toBe("—");
  });

  it("no está vencido el día pactado, ni la tarde anterior: solo cuando ese día ya pasó", () => {
    const pactado = "2026-11-24T00:00:00.000Z";
    // 23 nov, 7 de la tarde en México: antes ya salía «vencida».
    expect(diaPactadoVencido(pactado, new Date("2026-11-24T01:00:00.000Z"))).toBe(false);
    // 24 nov, 11 de la noche en México: sigue en plazo.
    expect(diaPactadoVencido(pactado, new Date("2026-11-25T05:00:00.000Z"))).toBe(false);
    // 25 nov, 8 de la mañana en México: ya venció.
    expect(diaPactadoVencido(pactado, new Date("2026-11-25T14:00:00.000Z"))).toBe(true);
    expect(diaPactadoVencido(null)).toBe(false);
  });

  it("cuenta los días de atraso por día de calendario", () => {
    expect(diasDeAtraso("2026-11-24T18:00:00.000Z", new Date("2026-11-24T20:00:00.000Z"))).toBe(0);
    expect(diasDeAtraso("2026-11-24T18:00:00.000Z", new Date("2026-11-25T14:00:00.000Z"))).toBe(1);
    expect(diasDeAtraso("2026-11-24T18:00:00.000Z", new Date("2026-11-27T14:00:00.000Z"))).toBe(3);
    expect(diasDeAtraso(null)).toBe(0);
  });

  it("al servidor va el día elegido a mediodía de México", () => {
    expect(diaParaApi("2026-11-24")).toBe("2026-11-24T18:00:00.000Z");
    expect(diaPactado(diaParaApi("2026-11-24"))).toBe("2026-11-24");
    expect(diaEnMexico(new Date("2026-11-25T05:00:00.000Z"))).toBe("2026-11-24");
  });
});
