import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "./catalogo";
import { agregarAbertura, agregarCamara, agregarMuro, existe, resumenDelPlano } from "./editor";
import {
  ID_PLANTA_BAJA,
  actualizarNivel,
  agregarNivel,
  copiarMurosDeAbajo,
  elevacionTexto,
  listaNiveles,
  nivelDeAbajo,
  planoDeNivel,
  quitarNivel,
  reemplazarNivel,
  siguienteNumeroGlobal,
  todasLasCamaras,
} from "./niveles";
import { planoVacio, type Plano } from "./plano";

const base = (): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } });

describe("niveles", () => {
  it("un diseño de un solo nivel es su planta baja", () => {
    const raiz = base();
    const lista = listaNiveles(raiz);
    expect(lista).toHaveLength(1);
    expect(lista[0].nivel).toEqual({ id: ID_PLANTA_BAJA, nombre: "Planta baja", elevacionM: 0 });
    expect(planoDeNivel(raiz, ID_PLANTA_BAJA)).toBe(raiz);
  });

  it("agrega un nivel 3.5 m arriba con la escala de la planta baja y se ordenan por elevación", () => {
    let { raiz, id } = agregarNivel(base(), { nombre: "Mezzanine oficinas" });
    expect(listaNiveles(raiz)[1].nivel).toMatchObject({ id, nombre: "Mezzanine oficinas", elevacionM: 3.5 });
    expect(planoDeNivel(raiz, id).escala.metrosPorPx).toBe(0.1);
    const azotea = agregarNivel(raiz);
    raiz = azotea.raiz;
    expect(listaNiveles(raiz).map((n) => n.nivel.elevacionM)).toEqual([0, 3.5, 7]);
    raiz = actualizarNivel(raiz, azotea.id, { nombre: "Azotea", elevacionM: 7.2 });
    expect(listaNiveles(raiz)[2].nivel).toMatchObject({ nombre: "Azotea", elevacionM: 7.2 });
    expect(nivelDeAbajo(raiz, azotea.id)?.nivel.id).toBe(id);
    expect(nivelDeAbajo(raiz, ID_PLANTA_BAJA)).toBeNull();
    expect(listaNiveles(quitarNivel(raiz, id))).toHaveLength(2);
    expect(quitarNivel(raiz, ID_PLANTA_BAJA)).toBe(raiz);
  });

  it("editar un nivel no toca los demás y la selección se encuentra en cualquier piso", () => {
    const { raiz, id } = agregarNivel(base());
    const arriba = agregarCamara(planoDeNivel(raiz, id), { x: 10, y: 10 }, MODELOS_CAMARA[0]);
    const nueva = reemplazarNivel(raiz, id, arriba.plano);
    expect(planoDeNivel(nueva, id).camaras).toHaveLength(1);
    expect(nueva.camaras).toHaveLength(0);
    expect(existe(nueva, { tipo: "camara", id: arriba.camara.id })).toBe(true);
    // reemplazar la planta baja conserva los niveles de arriba
    const pb = reemplazarNivel(nueva, ID_PLANTA_BAJA, agregarMuro(nueva, { x: 0, y: 0 }, { x: 50, y: 0 }).plano);
    expect(pb.muros).toHaveLength(1);
    expect(pb.niveles).toHaveLength(1);
  });

  it("la numeración de cámaras sigue entre niveles", () => {
    let raiz = base();
    for (let i = 0; i < 14; i++) raiz = agregarCamara(raiz, { x: i * 5, y: 0 }, MODELOS_CAMARA[0]).plano;
    const { raiz: conMezz, id } = agregarNivel(raiz);
    expect(siguienteNumeroGlobal(conMezz)).toBe(15);
    const n = siguienteNumeroGlobal(conMezz);
    const arriba = agregarCamara(planoDeNivel(conMezz, id), { x: 1, y: 1 }, MODELOS_CAMARA[0], { numero: n, nombre: `Cámara ${n}` });
    const final = reemplazarNivel(conMezz, id, arriba.plano);
    expect(todasLasCamaras(final).map((c) => c.camara.numero).slice(-2)).toEqual([14, 15]);
    expect(todasLasCamaras(final).at(-1)?.nivel.id).toBe(id);
    expect(resumenDelPlano(final).camaras).toBe(15);
  });

  it("copia los muros de abajo con sus huecos, ids nuevos y la altura libre del nivel", () => {
    let raiz = base();
    const m = agregarMuro(raiz, { x: 0, y: 0 }, { x: 100, y: 0 }, { alturaM: 5 });
    raiz = agregarAbertura(m.plano, m.muro!.id, 0.5, "puerta").plano;
    const { raiz: conMezz, id } = agregarNivel(raiz);
    const copiado = planoDeNivel(copiarMurosDeAbajo(conMezz, id), id);
    expect(copiado.muros).toHaveLength(1);
    expect(copiado.muros[0].id).not.toBe(m.muro!.id);
    expect(copiado.muros[0].alturaM).toBe(2.8);
    expect(copiado.aberturas[0].muroId).toBe(copiado.muros[0].id);
    expect(copiado.aberturas[0].alturaM).toBe(2.1);
    expect(copiado.muros[0].b).toEqual({ x: 100, y: 0 });
  });

  it("escribe la elevación como en el plano", () => {
    expect(elevacionTexto(0)).toBe("±0.00 m");
    expect(elevacionTexto(3.5)).toBe("+3.50 m");
    expect(elevacionTexto(-2.4)).toBe("−2.40 m");
  });
});
