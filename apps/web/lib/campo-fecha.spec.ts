import { describe, expect, it } from "vitest";
import { aCampoDia, aCampoFechaHora, deCampoFechaHora, fechasCambiadas, fechasParaEditar } from "./campo-fecha";

/**
 * Los campos de fecha y hora de un formulario trabajan en la hora de quien los llena. Antes se
 * llenaban recortando el instante del API, que viaja en hora universal: las 9:00 de la mañana
 * aparecían como 15:00 y, al guardar sin tocar nada, la actividad se recorría seis horas.
 *
 * Las pruebas de la web corren en hora de México (vitest.config.mts).
 */
describe("campos de fecha y hora de un formulario", () => {
  const NUEVE_AM = "2026-11-21T15:00:00.000Z"; // 21 de noviembre, 9:00 en México
  const ENTREGA_TARDE = "2026-11-22T00:45:00.000Z"; // 21 de noviembre, 18:45 en México

  it("muestra la hora de quien mira, no la universal", () => {
    expect(aCampoFechaHora(NUEVE_AM)).toBe("2026-11-21T09:00");
  });

  it("lo que muestra se vuelve a leer como el mismo instante", () => {
    expect(deCampoFechaHora(aCampoFechaHora(NUEVE_AM))).toBe(NUEVE_AM);
  });

  it("una entrega de las 18:45 es del mismo día, no del siguiente", () => {
    expect(aCampoDia(ENTREGA_TARDE)).toBe("2026-11-21");
  });

  it("sin fecha, o con algo que no es fecha, el campo queda vacío", () => {
    expect(aCampoFechaHora(null)).toBe("");
    expect(aCampoFechaHora("no es fecha")).toBe("");
    expect(aCampoDia(undefined)).toBe("");
    expect(deCampoFechaHora("")).toBeNull();
    expect(deCampoFechaHora("no es fecha")).toBeNull();
  });

  describe("al guardar la ficha de una actividad", () => {
    const actividad = { fechaInicio: NUEVE_AM, fechaEntregaEsperada: ENTREGA_TARDE, fechaFinalizacion: null };

    it("abrir y guardar sin tocar las fechas no manda ninguna", () => {
      expect(fechasCambiadas(fechasParaEditar(actividad), actividad)).toEqual({});
    });

    it("un inicio con segundos tampoco cuenta como cambio", () => {
      const conSegundos = { ...actividad, fechaInicio: "2026-11-21T15:00:42.000Z" };

      expect(fechasCambiadas(fechasParaEditar(conSegundos), conSegundos)).toEqual({});
    });

    it("mover el inicio a las 10:30 manda las 10:30 de México", () => {
      const form = { ...fechasParaEditar(actividad), fechaInicio: "2026-11-21T10:30" };

      expect(fechasCambiadas(form, actividad)).toEqual({ fechaInicio: "2026-11-21T16:30:00.000Z" });
    });

    it("capturar la hora en que se terminó manda esa hora", () => {
      const form = { ...fechasParaEditar(actividad), fechaFinalizacion: "2026-11-21T17:15" };

      expect(fechasCambiadas(form, actividad)).toEqual({ fechaFinalizacion: "2026-11-21T23:15:00.000Z" });
    });

    it("cambiar solo el día de la entrega conserva la hora que tenía", () => {
      const form = { ...fechasParaEditar(actividad), fechaEntregaEsperada: "2026-11-23" };

      // 23 de noviembre, 18:45 en México.
      expect(fechasCambiadas(form, actividad)).toEqual({ fechaEntregaEsperada: "2026-11-24T00:45:00.000Z" });
    });

    it("una entrega que no existía queda al final de ese día", () => {
      const sinEntrega = { ...actividad, fechaEntregaEsperada: null };
      const form = { ...fechasParaEditar(sinEntrega), fechaEntregaEsperada: "2026-11-23" };

      // 23 de noviembre, 23:59 en México.
      expect(fechasCambiadas(form, sinEntrega)).toEqual({ fechaEntregaEsperada: "2026-11-24T05:59:00.000Z" });
    });
  });
});
