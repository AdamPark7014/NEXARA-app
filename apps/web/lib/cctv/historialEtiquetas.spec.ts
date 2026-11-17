import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "./catalogo";
import { agregarCamara, actualizarCamara, borrar, mover } from "./editor";
import { etiquetaDeCambio, ultimosPasos } from "./historialEtiquetas";
import { planoVacio, type Plano } from "./plano";

const modelo = MODELOS_CAMARA[0]!;
const base = (): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } });

describe("historialEtiquetas", () => {
  it("etiqueta agregar, mover, girar y quitar cámara", () => {
    const vacio = base();
    const { plano: con, camara } = agregarCamara(vacio, { x: 10, y: 10 }, modelo);
    expect(etiquetaDeCambio(vacio, con)).toMatch(/^Agregué /);
    const movido = mover(con, { tipo: "camara", id: camara.id }, { x: 6, y: 0 });
    expect(etiquetaDeCambio(con, movido)).toMatch(/Moví .+ 0\.6 m/);
    const girado = actualizarCamara(con, camara.id, { rumboDeg: 34 });
    expect(etiquetaDeCambio(con, girado)).toMatch(/Giré .+ a 34°/);
    expect(etiquetaDeCambio(con, borrar(con, { tipo: "camara", id: camara.id }))).toMatch(/^Quité /);
    expect(etiquetaDeCambio(vacio, con, "digitalizar-ia")).toBe("Digitalicé el plano con IA");
  });

  it("ultimosPasos lista las últimas acciones con índice al pasado", () => {
    let p = base();
    const pasado: Plano[] = [];
    for (let i = 0; i < 3; i++) {
      pasado.push(p);
      p = agregarCamara(p, { x: i * 10, y: 0 }, modelo).plano;
    }
    const pasos = ultimosPasos(pasado, p, 8);
    expect(pasos).toHaveLength(3);
    expect(pasos[0]!.indicePasado).toBe(2);
    expect(pasos[0]!.etiqueta).toMatch(/^Agregué /);
  });
});