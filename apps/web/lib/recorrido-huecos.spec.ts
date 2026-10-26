import { describe, expect, it } from "vitest";
import { huecosDelRecorrido } from "./recorrido-huecos";

const at = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00-06:00`).toISOString();
const ahora = (hhmm: string) => new Date(at(hhmm)).getTime();

describe("huecosDelRecorrido", () => {
  it("el día de Iván (23-10): sin ubicación de 08:20 a 13:12", () => {
    const huecos = huecosDelRecorrido({
      entrada: at("07:58"),
      puntos: [at("08:01"), at("08:01"), at("08:09"), at("08:14"), at("08:20"), at("13:12")],
      enJornada: true,
      ahora: ahora("13:20"),
    });
    expect(huecos).toEqual([{ desde: at("08:20"), hasta: at("13:12"), minutos: 292 }]);
  });

  it("con la jornada abierta, el tramo final llega hasta ahora", () => {
    const huecos = huecosDelRecorrido({
      entrada: at("07:58"),
      puntos: [at("08:20")],
      enJornada: true,
      ahora: ahora("13:07"),
    });
    expect(huecos).toEqual([{ desde: at("08:20"), hasta: null, minutos: 287 }]);
  });

  it("un punto cada 30 min (o con unos minutos de atraso) no es hueco", () => {
    expect(
      huecosDelRecorrido({
        entrada: at("08:00"),
        puntos: [at("08:31"), at("09:05"), at("09:38")],
        salida: at("10:10"),
      }),
    ).toEqual([]);
  });

  it("sin puntos desde la entrada hasta la salida: todo el día", () => {
    expect(huecosDelRecorrido({ entrada: at("09:00"), puntos: [], salida: at("18:00") })).toEqual([
      { desde: at("09:00"), hasta: at("18:00"), minutos: 540 },
    ]);
  });

  it("los puntos después de la salida no tapan un hueco", () => {
    expect(
      huecosDelRecorrido({ entrada: at("09:00"), puntos: [at("19:00")], salida: at("12:00") }),
    ).toEqual([{ desde: at("09:00"), hasta: at("12:00"), minutos: 180 }]);
  });

  it("sin entrada ni puntos no hay nada que decir", () => {
    expect(huecosDelRecorrido({ puntos: [] })).toEqual([]);
  });
});
