import { describe, expect, it } from "vitest";
import { cuerposParaGuardar, faltaResponsable, juntarNotas, propuestasDe, type Minuta, type NotasGuardadas } from "./grabacion-api";

const minuta = {
  acuerdos: [
    {
      descripcion: "Enviar la contrapropuesta a Grupo Tox",
      textoResponsable: "Mafer",
      responsable: { id: 4, nombre: "María Fernanda Ruiz Cano" },
      responsableCandidatos: [],
      fechaCompromiso: "2026-10-23",
      prioridad: "alta",
    },
    { descripcion: "Mandar el plano", textoResponsable: "Ing. Ochoa", responsable: null, responsableCandidatos: [], fechaCompromiso: null, prioridad: "media" },
  ],
  lecciones: ["Validar existencias antes de cotizar"],
  riesgos: [{ riesgo: "El tipo de cambio puede subir", mitigacion: "Cotizar en pesos" }],
} as unknown as Minuta;

describe("minuta con IA en la web", () => {
  it("propone los acuerdos marcados como actividad y las lecciones y riesgos sin marcar", () => {
    const p = propuestasDe(minuta);
    expect(p.map((x) => [x.tipo, x.incluir, x.crearActividad])).toEqual([
      ["ACUERDO", true, true],
      ["ACUERDO", true, true],
      ["LECCION", false, false],
      ["RIESGO", false, false],
    ]);
    expect(p[3].descripcion).toBe("El tipo de cambio puede subir (mitigación: Cotizar en pesos)");
    expect(faltaResponsable(p[1])).toBe(true);
  });

  it("guarda solo lo marcado y con responsable; la prioridad viaja a la actividad", () => {
    const p = propuestasDe(minuta);
    p[1].incluir = false;
    p[2].incluir = true;
    expect(cuerposParaGuardar(p)).toEqual([
      { tipo: "ACUERDO", descripcion: "Enviar la contrapropuesta a Grupo Tox", responsableId: 4, fechaCompromiso: "2026-10-23", prioridad: "alta", crearActividad: true },
      { tipo: "LECCION", descripcion: "Validar existencias antes de cotizar", responsableId: null, fechaCompromiso: null, prioridad: "media", crearActividad: false },
    ]);
  });

  it("junta las notas nuevas sin duplicar las que ya estaban", () => {
    const n = (desde: number) => ({ desde, hasta: desde + 3 }) as NotasGuardadas;
    expect(juntarNotas([n(1), n(5)], [n(5), n(9)], 1).map((x) => x.desde)).toEqual([1, 5, 9]);
    expect(juntarNotas([n(1)], [], 1).map((x) => x.desde)).toEqual([1]);
  });
});
