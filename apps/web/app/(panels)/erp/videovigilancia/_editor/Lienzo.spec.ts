import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO } from "@/lib/cctv/catalogo";
import { agregarCamara, agregarEquipo } from "@/lib/cctv/editor";
import { planoVacio, type Plano } from "@/lib/cctv/plano";
import {
  CAPAS_INICIALES,
  alternarEnGrupo,
  borrarVarios,
  copiarSeleccion,
  moverVarios,
  pegarPortapapeles,
  seleccionEnRect,
} from "@/lib/cctv/seleccionMultiple";
import { vistaPellizcada } from "./Lienzo";

const planoBase = (): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } });

describe("pellizco en el plano 2D", () => {
  // Vista de 1000 × 500 px del plano en un lienzo de 500 × 250 px de pantalla: 2 px del plano por px.
  const inicio = { dist: 100, enPlano: { x: 700, y: 300 }, centro: { x: 250, y: 125 }, u: 2, vista: { x: 0, y: 0, w: 1000, h: 500 } };
  const bajo = (v: { x: number; y: number; w: number; h: number }, c: { x: number; y: number }, u: number) => ({
    x: v.x + v.w / 2 + (c.x - 250) * u,
    y: v.y + v.h / 2 + (c.y - 125) * u,
  });

  it("abrir los dedos al doble muestra la mitad y deja quieto el punto bajo los dedos", () => {
    const medio = { x: 350, y: 212.5 }; // punto medio de los dedos; ahí quedó (700, 300) del plano al empezar
    const v = vistaPellizcada(inicio, medio, 200);
    expect(v.w).toBeCloseTo(500);
    expect(v.h).toBeCloseTo(250);
    const p = bajo(v, medio, 1);
    expect(p.x).toBeCloseTo(700);
    expect(p.y).toBeCloseTo(300);
  });

  it("mover los dos dedos sin abrirlos solo desplaza la vista", () => {
    const v = vistaPellizcada(inicio, { x: 400, y: 212.5 }, 100);
    expect(v.w).toBeCloseTo(1000);
    expect(v.x).toBeCloseTo(-100);
  });
});

/** Contrato que el Lienzo cablea: Shift+clic, rectángulo, flechas/Supr/copiar y capas bloqueadas. */
describe("integración selección múltiple (Lienzo)", () => {
  it("Shift alterna el grupo y el rectángulo junta cámaras y equipos visibles", () => {
    let p = agregarCamara(planoBase(), { x: 10, y: 10 }, MODELOS_CAMARA[0]!).plano;
    p = agregarCamara(p, { x: 40, y: 40 }, MODELOS_CAMARA[0]!).plano;
    const eq = MODELOS_EQUIPO.find((m) => m.tipo === "nvr")!;
    p = agregarEquipo(p, { x: 20, y: 20 }, eq, 1).plano;
    const c1 = { tipo: "camara" as const, id: p.camaras[0]!.id };
    const c2 = { tipo: "camara" as const, id: p.camaras[1]!.id };
    expect(alternarEnGrupo(alternarEnGrupo([], c1), c2)).toHaveLength(2);
    const en = seleccionEnRect(p, { x: 0, y: 0 }, { x: 50, y: 50 }, CAPAS_INICIALES);
    expect(en.filter((s) => s.tipo === "camara")).toHaveLength(2);
    expect(en.some((s) => s.tipo === "equipo")).toBe(true);
  });

  it("mover/borrar/copiar respetan capas bloqueadas y el pegado desplaza 1 m", () => {
    let p = agregarCamara(planoBase(), { x: 0, y: 0 }, MODELOS_CAMARA[0]!).plano;
    p = agregarCamara(p, { x: 30, y: 0 }, MODELOS_CAMARA[0]!).plano;
    const sels = p.camaras.map((c) => ({ tipo: "camara" as const, id: c.id }));
    const movido = moverVarios(p, sels, { x: 5, y: 0 }, CAPAS_INICIALES);
    expect(movido.camaras.every((c, i) => c.pos.x === p.camaras[i]!.pos.x + 5)).toBe(true);

    const capas = { ...CAPAS_INICIALES, camaras: { visible: true, bloqueada: true } };
    expect(moverVarios(p, sels, { x: 9, y: 0 }, capas).camaras[0]!.pos.x).toBe(0);
    expect(borrarVarios(p, sels, capas).camaras).toHaveLength(2);

    const clip = copiarSeleccion(p, sels);
    const pegado = pegarPortapapeles(p, clip);
    expect(pegado.plano.camaras).toHaveLength(4);
    expect(pegado.seleccion).toHaveLength(2);
    expect(pegado.plano.camaras[2]!.pos.x).toBeCloseTo(10);
  });
});
