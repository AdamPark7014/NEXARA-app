import { describe, expect, it } from "vitest";
import { cuerposParaGuardar, faltaResponsable, limpiarTranscripcion, type AcuerdoEditable } from "./acta-ia";

const a = (x: Partial<AcuerdoEditable>): AcuerdoEditable => ({
  incluir: true,
  tipo: "ACUERDO",
  descripcion: "Enviar cotización",
  responsableId: "7",
  fechaCompromiso: "2026-10-16",
  crearActividad: true,
  ...x,
});

describe("acta con IA", () => {
  it("guarda solo lo marcado y con responsable cuando es acuerdo", () => {
    const cuerpos = cuerposParaGuardar([
      a({}),
      a({ incluir: false }),
      a({ responsableId: "" }),
      a({ tipo: "RIESGO", responsableId: "", fechaCompromiso: "2026-10-20" }),
    ]);
    expect(cuerpos).toEqual([
      { tipo: "ACUERDO", descripcion: "Enviar cotización", responsableId: 7, fechaCompromiso: "2026-10-16", crearActividad: true },
      { tipo: "RIESGO", descripcion: "Enviar cotización", responsableId: null, fechaCompromiso: null, crearActividad: false },
    ]);
    expect(faltaResponsable(a({ responsableId: "" }))).toBe(true);
    expect(faltaResponsable(a({ responsableId: "", incluir: false }))).toBe(false);
  });

  it("solo un acuerdo con responsable y la casilla marcada crea actividad", () => {
    const [con, sin] = cuerposParaGuardar([a({}), a({ crearActividad: false })]);
    expect(con.crearActividad).toBe(true);
    expect(sin.crearActividad).toBe(false);
  });

  it("quita números y tiempos de un archivo de subtítulos", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nAntonio: hola\n\n2\n00:00:05.000 --> 00:00:07.000\nCarolina: ¿qué tal?";
    expect(limpiarTranscripcion(vtt)).toBe("Antonio: hola\n\nCarolina: ¿qué tal?");
  });
});
