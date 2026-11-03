import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "./catalogo";
import { agregarCamara, agregarMuro } from "./editor";
import { GRABACION_POR_OMISION } from "./infraestructura";
import { memoriaDelDiseno } from "./memoriaCotizacion";
import { planoVacio, type Plano } from "./plano";

const sala: Plano["areas"] = [
  { id: "a1", nombre: "Bodega", piso: "concreto", puntos: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 400 }, { x: 0, y: 400 }] },
];

function plano(): Plano {
  let p: Plano = { ...planoVacio(), areas: sala };
  p = agregarMuro(p, { x: 0, y: 0 }, { x: 800, y: 0 }, { alturaM: 4 }).plano;
  p = agregarCamara(p, { x: 400, y: 5 }, MODELOS_CAMARA[0], { nombre: "Pasillo", rumboDeg: 180, alturaM: 3 }).plano;
  p = agregarCamara(p, { x: 700, y: 5 }, MODELOS_CAMARA[0], { nombre: "Andén", rumboDeg: 180, alturaM: 3 }).plano;
  return agregarCamara(p, { x: 400, y: 900 }, MODELOS_CAMARA[0], { nombre: "Patio", rumboDeg: 180, alturaM: 3 }).plano;
}

describe("memoriaDelDiseno", () => {
  it("agrupa por modelo y anota dónde va cada una", () => {
    const m = memoriaDelDiseno(plano(), null, GRABACION_POR_OMISION);
    expect(m.camaras).toBe(3);
    expect(m.lineas).toHaveLength(1);
    expect(m.lineas[0]).toMatchObject({ cantidad: 3, modelo: MODELOS_CAMARA[0].modelo, marca: MODELOS_CAMARA[0].marca, ubicaciones: ["Pasillo", "Andén", "Patio"] });
  });

  it("la zona sale del área dibujada; fuera de todas, exterior", () => {
    const { levantamiento, zonas } = memoriaDelDiseno(plano(), null, GRABACION_POR_OMISION);
    expect(zonas).toEqual(["Bodega", "Exterior y perímetro"]);
    const clave = levantamiento.columnas[0].clave;
    expect(levantamiento.filas.map((f) => [f.zona, f.piezas[clave]])).toEqual([
      ["Bodega", 2],
      ["Exterior y perímetro", 1],
    ]);
  });

  it("el levantamiento cuadra con las cámaras", () => {
    const { levantamiento, camaras } = memoriaDelDiseno(plano(), null, GRABACION_POR_OMISION);
    const suma = levantamiento.filas.reduce((s, f) => s + Object.values(f.piezas).reduce((a, b) => a + b, 0), 0);
    expect(suma).toBe(camaras);
  });

  it("sin grabador no inventa canales, y sin calibrar lo dice", () => {
    const m = memoriaDelDiseno(plano(), null, GRABACION_POR_OMISION);
    expect(m.canales).toBeNull();
    expect(m.calibrado).toBe(false);
    expect(m.cobertura).toBeNull();
    expect(m.centro).toEqual([]);
  });

  it("no repite en los datos lo que ya dicen la resolución y la visión nocturna", () => {
    const m = memoriaDelDiseno(plano(), null, GRABACION_POR_OMISION);
    const repetidos = m.lineas[0].datos.filter((d) => /infrarrojo|iluminador ir/i.test(d));
    expect(repetidos).toEqual([]);
    expect(m.lineas[0].datos.length).toBeLessThanOrEqual(5);
  });
});
