import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO } from "./catalogo";
import { agregarCamara, agregarEquipo } from "./editor";
import { planoVacio, type Plano } from "./plano";
import {
  CAPAS_INICIALES,
  alternarEnGrupo,
  borrarVarios,
  copiarSeleccion,
  estaBloqueado,
  pegarPortapapeles,
  rumboConManija,
  seleccionEnRect,
} from "./seleccionMultiple";

const base = (): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } });

describe("seleccionMultiple", () => {
  it("alterna en el grupo y selecciona por rectángulo", () => {
    const { plano, camara } = agregarCamara(base(), { x: 50, y: 50 }, MODELOS_CAMARA[0]!);
    const g1 = alternarEnGrupo([], { tipo: "camara", id: camara.id });
    expect(g1).toHaveLength(1);
    expect(alternarEnGrupo(g1, { tipo: "camara", id: camara.id })).toHaveLength(0);
    const en = seleccionEnRect(plano, { x: 0, y: 0 }, { x: 100, y: 100 }, CAPAS_INICIALES);
    expect(en.some((s) => s.id === camara.id)).toBe(true);
  });

  it("copia y pega desplazado 1 m; capa bloqueada no se borra", () => {
    let p = agregarCamara(base(), { x: 0, y: 0 }, MODELOS_CAMARA[0]!).plano;
    const id = p.camaras[0]!.id;
    const clip = copiarSeleccion(p, [{ tipo: "camara", id }]);
    const pegado = pegarPortapapeles(p, clip);
    expect(pegado.plano.camaras).toHaveLength(2);
    expect(pegado.plano.camaras[1]!.pos.x).toBeCloseTo(10); // 1 m / 0.1
    expect(pegado.seleccion).toHaveLength(1);

    const capas = { ...CAPAS_INICIALES, camaras: { visible: true, bloqueada: true } };
    expect(estaBloqueado({ tipo: "camara", id }, pegado.plano, capas)).toBe(true);
    const sin = borrarVarios(pegado.plano, [{ tipo: "camara", id }], capas);
    expect(sin.camaras.some((c) => c.id === id)).toBe(true);
  });

  it("manija de rotación con Shift salta de 15°", () => {
    expect(rumboConManija(0, 37, false)).toBeCloseTo(37);
    expect(rumboConManija(0, 37, true)).toBe(30);
    expect(rumboConManija(0, 38, true)).toBe(45);
  });

  it("copia también equipos", () => {
    const eq = MODELOS_EQUIPO.find((m) => m.tipo === "nvr")!;
    const { plano: basePlano } = agregarEquipo(base(), { x: 20, y: 20 }, eq, 1);
    const clip = copiarSeleccion(basePlano, [{ tipo: "equipo", id: basePlano.equipos![0]!.id }]);
    expect(clip.equipos).toHaveLength(1);
    const pegado = pegarPortapapeles(basePlano, clip);
    expect(pegado.plano.equipos).toHaveLength(2);
  });
});