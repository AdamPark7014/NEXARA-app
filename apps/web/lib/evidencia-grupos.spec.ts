import { describe, expect, it } from "vitest";
import { agruparCampos, desagrupar, mismosMomentos, nombreBase, resumenGrupos } from "./evidencia-grupos";

const MOM = ["ANTES", "EN_PROGRESO", "DESPUES"];
const nota = "Antes: punto. · Durante: fijada. · Después: en vivo.";

function cams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    nombre: `Cámara ${i + 1}`,
    momentos: [...MOM],
    notas: nota,
  }));
}

describe("evidencia-grupos", () => {
  it("nombreBase quita el numero final", () => {
    expect(nombreBase("Cámara 1")).toBe("Cámara");
    expect(nombreBase("Grabador (NVR)")).toBe("Grabador (NVR)");
    expect(nombreBase("Cámara")).toBe("Cámara");
  });

  it("agrupa 4 camaras iguales en un grupo", () => {
    const g = agruparCampos(cams(4));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ base: "Cámara", cantidad: 4, notas: nota });
    expect(g[0].indices).toEqual([0, 1, 2, 3]);
  });

  it("deja Grabador y Pruebas como grupos sueltos", () => {
    const g = agruparCampos([
      ...cams(4),
      { nombre: "Grabador (NVR)", momentos: [...MOM], notas: "NVR" },
      { nombre: "Pruebas y entrega", momentos: ["DESPUES"], notas: "ok" },
    ]);
    expect(g.map((x) => [x.base, x.cantidad])).toEqual([
      ["Cámara", 4],
      ["Grabador (NVR)", 1],
      ["Pruebas y entrega", 1],
    ]);
  });

  it("no junta camaras con notas distintas", () => {
    const g = agruparCampos([
      { nombre: "Cámara 1", momentos: [...MOM], notas: "a" },
      { nombre: "Cámara 2", momentos: [...MOM], notas: "b" },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].base).toBe("Cámara 1");
    expect(g[1].base).toBe("Cámara 2");
  });

  it("desagrupar expande cantidad y respeta singular", () => {
    const seis = desagrupar([{ base: "Cámara", cantidad: 6, momentos: MOM, notas: nota, indices: [] }]);
    expect(seis.map((c) => c.nombre)).toEqual(["Cámara 1", "Cámara 2", "Cámara 3", "Cámara 4", "Cámara 5", "Cámara 6"]);
    expect(desagrupar([{ base: "Cámara", cantidad: 1, momentos: MOM, notas: "", indices: [] }])[0].nombre).toBe("Cámara");
    expect(desagrupar([{ base: "Grabador (NVR)", cantidad: 1, momentos: MOM, notas: "", indices: [] }])[0].nombre).toBe("Grabador (NVR)");
  });

  it("ida y vuelta sin perdida", () => {
    const orig = [
      ...cams(4),
      { nombre: "Grabador (NVR)", momentos: [...MOM], notas: "nvr" },
      { nombre: "Pruebas y entrega", momentos: ["DESPUES"], notas: "fin" },
    ];
    const back = desagrupar(agruparCampos(orig));
    expect(back.map((c) => c.nombre)).toEqual(orig.map((c) => c.nombre));
    expect(back.map((c) => c.notas)).toEqual(orig.map((c) => c.notas));
    expect(back.map((c) => c.momentos)).toEqual(orig.map((c) => c.momentos));
  });

  it("resumenGrupos usa rango tipografico", () => {
    const texto = resumenGrupos([
      { base: "Cámara", cantidad: 4, momentos: MOM, notas: "", indices: [0, 1, 2, 3] },
      { base: "Grabador (NVR)", cantidad: 1, momentos: MOM, notas: "", indices: [4] },
      { base: "Pruebas y entrega", cantidad: 1, momentos: ["DESPUES"], notas: "", indices: [5] },
    ]);
    expect(texto).toBe("Cámara 1\u20134, Grabador (NVR), Pruebas y entrega");
  });

  it("individuales evita fusionar", () => {
    const g = agruparCampos(cams(4), new Set([0, 1, 2, 3]));
    expect(g).toHaveLength(4);
    expect(g.map((x) => x.base)).toEqual(["Cámara 1", "Cámara 2", "Cámara 3", "Cámara 4"]);
  });

  it("mismosMomentos compara en orden", () => {
    expect(mismosMomentos(["A", "B"], ["A", "B"])).toBe(true);
    expect(mismosMomentos(["A", "B"], ["B", "A"])).toBe(false);
  });
});