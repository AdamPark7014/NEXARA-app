import { describe, expect, it } from "vitest";
import {
  almacenamientoTB,
  anchoBandaMbps,
  bobinas,
  canalesNvr,
  clasePoe,
  discosNecesarios,
  largoCable,
  mbpsCamara,
  presupuestoPoe,
} from "./infraestructura";

describe("grabación", () => {
  it("estima el flujo por resolución y codec", () => {
    expect(mbpsCamara(4, "h264")).toBe(6);
    expect(mbpsCamara(4, "h265")).toBe(3);
    expect(mbpsCamara(2.5, "h264")).toBeCloseTo(4.5, 9);
    expect(mbpsCamara(4, "h265", 30)).toBe(6);
  });

  it("las 14 cámaras de 4 MP de Bodegas VDM, 30 días en H.265 continuo", () => {
    const mp = Array.from({ length: 14 }, () => 4);
    const g = { retencionDias: 30, codec: "h265" as const, actividadPct: 100 };
    expect(anchoBandaMbps(mp, g)).toBe(42);
    expect(almacenamientoTB(mp, g)).toBeCloseTo(13.61, 2);
    expect(discosNecesarios(almacenamientoTB(mp, g), 8)).toBe(2);
    expect(almacenamientoTB(mp, { ...g, actividadPct: 50 })).toBeCloseTo(6.8, 1);
    expect(canalesNvr(14)).toBe(16);
  });
});

describe("energía", () => {
  it("clase PoE y presupuesto con margen", () => {
    expect(clasePoe(6)).toBe("802.3af");
    expect(clasePoe(20)).toBe("802.3at");
    expect(clasePoe(60)).toBe("802.3bt");
    expect(presupuestoPoe([6, 6, 8])).toBeCloseTo(24, 9);
  });
});

describe("cable", () => {
  it("ruta por la holgura, más bajadas y loop; avisa arriba de 90 m y marca más de 100", () => {
    const ruta = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ];
    const ok = largoCable({ ruta, alturaCamaraM: 5, alturaGabineteM: 1.5 });
    expect(ok.rutaM).toBe(50);
    expect(ok.totalM).toBeCloseTo((50 + 3.5) * 1.2 + 6, 9);
    expect(ok.estado).toBe("ok");
    expect(largoCable({ ruta: [{ x: 0, y: 0 }, { x: 70, y: 0 }], alturaCamaraM: 5 }).estado).toBe("aviso");
    expect(largoCable({ ruta: [{ x: 0, y: 0 }, { x: 75, y: 0 }], alturaCamaraM: 5 }).estado).toBe("excede");
    expect(largoCable({ ruta: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], metrosPorPx: 0.05, alturaCamaraM: 3 }).rutaM).toBe(50);
    expect(bobinas(306)).toBe(2);
    expect(bobinas(0)).toBe(0);
  });
});
