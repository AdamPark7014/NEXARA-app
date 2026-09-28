import { describe, expect, it } from "vitest";
import { normalizarLista, segmentosLista, traeVineta } from "./vinetas-texto";

describe("viñetas de una partida", () => {
  it("al pegar, cada viñeta queda en su renglón y el encabezado se queda como párrafo", () => {
    expect(normalizarLista("Disco duro Con las siguientes características: • Subcategoría: SSD. • Capacidad: 3.84 TB.")).toBe(
      "Disco duro Con las siguientes características:\n• Subcategoría: SSD.\n• Capacidad: 3.84 TB.",
    );
    expect(segmentosLista("Cable - Conector macho - Forma de enchufe")[0]).toEqual({
      tipo: "parrafo",
      texto: "Cable",
    });
    expect(traeVineta("Wi-Fi 6 de -20°C")).toBe(false);
    expect(traeVineta("- Montaje en techo")).toBe(true);
  });
});
