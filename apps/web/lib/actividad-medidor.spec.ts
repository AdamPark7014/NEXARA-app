import { describe, expect, it } from "vitest";
import { medidorDeTiempo } from "./actividad-tiempos";

describe("medidorDeTiempo", () => {
  it("en tiempo mientras no pasa lo planeado", () => {
    const m = medidorDeTiempo({ minutosPlan: 450, minutosReales: 340 });
    expect(m.estado).toBe("en_tiempo");
    expect(m.tope).toBe(563);
    expect(m.avance).toBeCloseTo(340 / 450);
    expect(m.texto).toBe("va en tiempo");
  });

  it("cerca: pasó el plan sin llegar al tope (el máximo manda sobre el +25 %)", () => {
    const m = medidorDeTiempo({ minutosPlan: 120, minutosReales: 130, tiempoMaximoMin: 170 });
    expect(m.estado).toBe("cerca");
    expect(m.texto).toBe("le quedan 40 min para el tope");
  });

  it("excedida: pasó el tope", () => {
    const m = medidorDeTiempo({ minutosPlan: 60, minutosReales: 100 });
    expect(m.estado).toBe("excedida");
    expect(m.texto).toBe("se pasó 25 min del tope");
    expect(m.avance).toBe(1.5);
  });

  it("sin plan no hay contra qué medir", () => {
    expect(medidorDeTiempo({ minutosReales: 50 })).toMatchObject({ estado: "sin_plan", avance: null, texto: "sin tiempo planeado" });
    expect(medidorDeTiempo({}).texto).toBe("aún sin tiempo");
  });
});
