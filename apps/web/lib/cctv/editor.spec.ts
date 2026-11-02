import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO } from "./catalogo";
import {
  agregarEquipo,
  avisoDeEquipo,
  moverEnGabinete,
  siguienteNumeroEquipo,
  agregarAbertura,
  agregarCamara,
  agregarMuro,
  agregarObstaculo,
  agregarPersona,
  ajustarPunto,
  apuntarCamara,
  borrar,
  calibrarPlano,
  cambiarAlturaEnLote,
  cambiarModelo,
  distanciaInicial,
  duplicarCamara,
  estadoInicial,
  gruposDeAltura,
  mover,
  moverExtremo,
  muroMasCercano,
  reducirEditor,
  resumenDelPlano,
  agregarArea,
  agregarMueble,
  existe,
} from "./editor";
import { planoVacio, type Plano, tapasDelPlano } from "./plano";

// 10 px por metro para leer las cuentas.
const base = (): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } });
const domo = MODELOS_CAMARA[0];

describe("dibujar muros", () => {
  it("agrega un muro y descarta uno sin largo", () => {
    const { plano, muro } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(plano.muros).toHaveLength(1);
    expect(muro?.alturaM).toBe(2.8);
    expect(agregarMuro(plano, { x: 0, y: 0 }, { x: 0.5, y: 0 }).muro).toBeNull();
  });

  it("se engancha al extremo cercano y si no, endereza a 0/45/90°", () => {
    const { plano } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(ajustarPunto(plano, { x: 103, y: 2 }, { radio: 6 })).toEqual({ punto: { x: 100, y: 0 }, enganche: "extremo" });
    const recto = ajustarPunto(plano, { x: 200, y: 54 }, { radio: 6, desde: { x: 100, y: 50 } });
    expect(recto.enganche).toBe("angulo");
    expect(recto.punto.y).toBeCloseTo(50, 6);
    expect(ajustarPunto(plano, { x: 200, y: 80 }, { radio: 6, desde: { x: 100, y: 50 } }).enganche).toBeNull();
    expect(ajustarPunto(plano, { x: 103, y: 2 }, { radio: 6, libre: true }).enganche).toBeNull();
  });

  it("encuentra el muro más cercano con su fracción", () => {
    const { plano, muro } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 });
    const r = muroMasCercano(plano, { x: 25, y: 4 }, 10)!;
    expect(r.muro.id).toBe(muro!.id);
    expect(r.t).toBeCloseTo(0.25, 9);
    expect(muroMasCercano(plano, { x: 25, y: 40 }, 10)).toBeNull();
  });
});

describe("aberturas", () => {
  it("pone una puerta de 0.9 m centrada y no deja encimar otra", () => {
    const { plano, muro } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 }); // 10 m
    const r = agregarAbertura(plano, muro!.id, 0.5, "puerta");
    expect(r.abertura!.hasta - r.abertura!.desde).toBeCloseTo(0.09, 9);
    expect(r.abertura!.alturaM).toBe(2.1);
    const encimada = agregarAbertura(r.plano, muro!.id, 0.52, "ventana");
    expect(encimada.abertura).toBeNull();
    expect(encimada.error).toMatch(/otra abertura/);
  });

  it("en la orilla se recorre para caber; la ventana va sobre antepecho y transparente", () => {
    const { plano, muro } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 });
    const r = agregarAbertura(plano, muro!.id, 0, "ventana");
    expect(r.abertura!.desde).toBe(0);
    expect(r.abertura!.baseM).toBe(1);
    expect(r.abertura!.transparente).toBe(true);
  });

  it("al borrar el muro se van sus aberturas", () => {
    const { plano, muro } = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 });
    const r = agregarAbertura(plano, muro!.id, 0.5, "puerta");
    const sin = borrar(r.plano, { tipo: "muro", id: muro!.id });
    expect(sin.muros).toHaveLength(0);
    expect(sin.aberturas).toHaveLength(0);
  });
});

describe("cámaras y personas", () => {
  it("coloca con número, modelo e inclinación hacia el 60 % del cono", () => {
    const { plano, camara } = agregarCamara(base(), { x: 10, y: 10 }, domo);
    expect(camara.numero).toBe(1);
    expect(camara.modelo).toBe("HIKVISION DS-2CD1143G2-LIUF");
    expect(camara.distanciaM).toBe(distanciaInicial(domo));
    expect(camara.distanciaM).toBe(15);
    expect(camara.inclinacionDeg).toBe(18); // atan(3 / 9) ≈ 18.4°
    expect(agregarCamara(plano, { x: 0, y: 0 }, domo).camara.numero).toBe(2);
  });

  it("la manija apunta: rumbo y largo del cono", () => {
    const { plano, camara } = agregarCamara(base(), { x: 0, y: 0 }, domo);
    const p = apuntarCamara(plano, camara.id, { x: 0, y: 120 });
    const c = p.camaras[0];
    expect(c.rumboDeg).toBe(180);
    expect(c.distanciaM).toBe(12);
    expect(apuntarCamara(plano, camara.id, { x: 1, y: 0 }).camaras[0].distanciaM).toBe(1);
  });

  it("cambia de modelo con su óptica y duplica con número nuevo", () => {
    const { plano, camara } = agregarCamara(base(), { x: 0, y: 0 }, domo);
    const otro = cambiarModelo(plano, camara.id, MODELOS_CAMARA[2]);
    expect(otro.camaras[0].lentes[0].optica.focalMm).toBe(4);
    expect(otro.camaras[0].rumboDeg).toBe(camara.rumboDeg);
    const dup = duplicarCamara(plano, camara.id);
    expect(dup.camara?.numero).toBe(2);
    expect(dup.camara?.pos).toEqual({ x: 10, y: 10 });
  });

  it("mueve cámaras, personas y extremos de muro", () => {
    let { plano, camara } = agregarCamara(base(), { x: 0, y: 0 }, domo);
    plano = agregarPersona(plano, { x: 5, y: 5 });
    plano = mover(plano, { tipo: "camara", id: camara.id }, { x: 3, y: 4 });
    expect(plano.camaras[0].pos).toEqual({ x: 3, y: 4 });
    const { plano: conMuro, muro } = agregarMuro(plano, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(moverExtremo(conMuro, muro!.id, "b", { x: 100, y: 50 }).muros[0].b).toEqual({ x: 100, y: 50 });
    // si el muro quedara sin largo, no se mueve
    expect(moverExtremo(conMuro, muro!.id, "b", { x: 0.2, y: 0 }).muros[0].b).toEqual({ x: 100, y: 0 });
  });
});

describe("lote, obstáculos y calibración", () => {
  it("cambia en lote las alturas iguales y agrupa", () => {
    let p = agregarMuro(base(), { x: 0, y: 0 }, { x: 100, y: 0 }, { alturaM: 5 }).plano;
    p = agregarMuro(p, { x: 0, y: 0 }, { x: 0, y: 100 }).plano;
    p = agregarMuro(p, { x: 50, y: 0 }, { x: 50, y: 100 }).plano;
    expect(gruposDeAltura(p)).toEqual([
      { alturaM: 5, muros: 1 },
      { alturaM: 2.8, muros: 2 },
    ]);
    const q = cambiarAlturaEnLote(p, 2.8, 3);
    expect(q.muros.map((m) => m.alturaM)).toEqual([5, 3, 3]);
  });

  it("obstáculo rectangular y calibración con su cota", () => {
    const o = agregarObstaculo(base(), { x: 0, y: 0 }, { x: 20, y: 10 });
    expect(o.obstaculo?.puntos).toHaveLength(4);
    expect(agregarObstaculo(base(), { x: 0, y: 0 }, { x: 0.5, y: 10 }).obstaculo).toBeNull();
    const cal = calibrarPlano(base(), { x: 0, y: 0 }, { x: 430, y: 0 }, 43)!;
    expect(cal.escala.metrosPorPx).toBeCloseTo(0.1, 9);
    expect(cal.cotas[0].texto).toBe("43.00");
    expect(calibrarPlano(base(), { x: 0, y: 0 }, { x: 0, y: 0 }, 43)).toBeNull();
  });
});

describe("historial", () => {
  it("deshace y rehace; los pasos de un mismo arrastre son uno", () => {
    let e = estadoInicial(base());
    const p1 = agregarPersona(e.plano, { x: 1, y: 1 });
    e = reducirEditor(e, { tipo: "aplicar", plano: p1 });
    const id = p1.personas[0].id;
    e = reducirEditor(e, { tipo: "aplicar", plano: mover(e.plano, { tipo: "persona", id }, { x: 1, y: 0 }), fusion: "arrastre-1" });
    e = reducirEditor(e, { tipo: "aplicar", plano: mover(e.plano, { tipo: "persona", id }, { x: 1, y: 0 }), fusion: "arrastre-1" });
    expect(e.pasado).toHaveLength(2);
    expect(e.plano.personas[0].pos).toEqual({ x: 3, y: 1 });
    e = reducirEditor(e, { tipo: "deshacer" });
    expect(e.plano.personas[0].pos).toEqual({ x: 1, y: 1 });
    e = reducirEditor(e, { tipo: "rehacer" });
    expect(e.plano.personas[0].pos).toEqual({ x: 3, y: 1 });
    expect(e.sucio).toBe(true);
    expect(reducirEditor(e, { tipo: "guardado", plano: e.plano }).sucio).toBe(false);
  });

  it("suelta la selección de lo que se borró", () => {
    let e = estadoInicial(agregarPersona(base(), { x: 1, y: 1 }));
    const sel = { tipo: "persona" as const, id: e.plano.personas[0].id };
    e = reducirEditor(e, { tipo: "seleccionar", seleccion: sel });
    e = reducirEditor(e, { tipo: "aplicar", plano: borrar(e.plano, sel) });
    expect(e.seleccion).toBeNull();
  });
});

describe("resumen", () => {
  it("cuenta cámaras, grabación y cobertura del rectángulo de muros", () => {
    let p = base();
    for (const [a, b] of [
      [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      [{ x: 200, y: 0 }, { x: 200, y: 100 }],
      [{ x: 200, y: 100 }, { x: 0, y: 100 }],
      [{ x: 0, y: 100 }, { x: 0, y: 0 }],
    ]) p = agregarMuro(p, a, b, { alturaM: 5 }).plano;
    expect(resumenDelPlano(p).cobertura?.cubierto).toBe(0);
    p = agregarCamara(p, { x: 2, y: 50 }, domo, { rumboDeg: 90, alturaM: 4, distanciaM: 15, inclinacionDeg: 20 }).plano;
    const r = resumenDelPlano(p);
    expect(r.camaras).toBe(1);
    expect(r.mbps).toBe(3); // clase 4 MP en H.265
    expect(r.cobertura!.cubierto).toBeGreaterThan(30);
    expect(r.cobertura!.cubierto).toBeLessThan(80);
    expect(resumenDelPlano(base()).cobertura).toBeNull();
  });
});

describe("áreas y ambientación", () => {
  const base = () => ({ ...planoVacio(), escala: { metrosPorPx: 0.02, calibracion: null } });

  it("un área necesita tamaño y guarda su piso", () => {
    const chica = agregarArea(base(), { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(chica.area).toBeNull();
    const r = agregarArea(base(), { x: 0, y: 0 }, { x: 100, y: 200 }, "madera");
    expect(r.area?.piso).toBe("madera");
    expect(r.area?.puntos).toHaveLength(4);
    expect(r.plano.areas).toHaveLength(1);
  });

  it("áreas y muebles se mueven, se borran y siguen la selección", () => {
    const conArea = agregarArea(base(), { x: 0, y: 0 }, { x: 100, y: 100 }).plano;
    const area = conArea.areas![0];
    const conTodo = agregarMueble(conArea, { x: 50, y: 50 }, "camion");
    const mueble = conTodo.mueble;
    const movido = mover(mover(conTodo.plano, { tipo: "area", id: area.id }, { x: 10, y: 0 }), { tipo: "mueble", id: mueble.id }, { x: 0, y: 7 });
    expect(movido.areas![0].puntos[0]).toEqual({ x: 10, y: 0 });
    expect(movido.muebles![0].pos).toEqual({ x: 50, y: 57 });
    expect(existe(movido, { tipo: "mueble", id: mueble.id })).toBe(true);
    const sinMueble = borrar(movido, { tipo: "mueble", id: mueble.id });
    expect(sinMueble.muebles).toEqual([]);
    expect(existe(sinMueble, { tipo: "mueble", id: mueble.id })).toBe(false);
    expect(borrar(sinMueble, { tipo: "area", id: area.id }).areas).toEqual([]);
  });

  it("los diseños anteriores, sin esos campos, siguen funcionando", () => {
    const viejo = base();
    expect(existe(viejo, { tipo: "area", id: "x" })).toBe(false);
    expect(mover(viejo, { tipo: "mueble", id: "x" }, { x: 1, y: 1 }).muebles).toEqual([]);
    expect(borrar(viejo, { tipo: "area", id: "x" }).areas).toEqual([]);
    expect(agregarMueble(viejo, { x: 1, y: 1 }, "auto").plano.muebles).toHaveLength(1);
  });

  it("no cambian el cálculo de cobertura: la ambientación no tapa", () => {
    const p = agregarMuro(base(), { x: 0, y: 0 }, { x: 500, y: 0 }).plano;
    const antes = tapasDelPlano(p).length;
    const despues = agregarArea(agregarMueble(p, { x: 10, y: 10 }, "camion").plano, { x: 0, y: 0 }, { x: 100, y: 100 }).plano;
    expect(tapasDelPlano(despues)).toHaveLength(antes);
  });
});

describe("Equipos que no son cámara", () => {
  const K = 0.02;
  const m = (x: number) => x / K;
  const modeloDe = (tipo: string) => MODELOS_EQUIPO.find((e) => e.tipo === tipo)!;
  const base = (): Plano => ({
    ...planoVacio(),
    escala: { metrosPorPx: K, calibracion: null },
    muros: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: m(10), y: 0 }, alturaM: 3, grosorM: 0.2, tipo: "muro" }],
    aberturas: [{ id: "p1", muroId: "m1", tipo: "puerta", desde: 0.45, hasta: 0.55, baseM: 0, alturaM: 2.1, abierta: true, transparente: false, hojas: 1, bisagra: "inicio", sentido: 1 }],
  });

  it("lo de rack entra solo al gabinete, de arriba hacia abajo y sin encimarse", () => {
    const g = agregarEquipo(base(), { x: m(2), y: m(3) }, modeloDe("gabinete"), 1);
    const a = agregarEquipo(g.plano, { x: m(8), y: m(8) }, modeloDe("nvr"), 1);
    expect(a.equipo.gabineteId).toBe(g.equipo.id);
    expect(a.equipo.unidad).toBe(23);
    expect(a.equipo.pos).toEqual(g.equipo.pos);
    const b = agregarEquipo(a.plano, { x: 0, y: 0 }, modeloDe("servidor"), 1);
    expect(b.equipo.unidad).toBe(21);
  });

  it("lo que quedó suelto entra cuando llega el gabinete", () => {
    const a = agregarEquipo(base(), { x: m(8), y: m(8) }, modeloDe("nvr"), 1);
    expect(a.equipo.gabineteId ?? null).toBeNull();
    const g = agregarEquipo(a.plano, { x: m(2), y: m(3) }, modeloDe("gabinete"), 1);
    expect(g.plano.equipos!.find((e) => e.id === a.equipo.id)?.gabineteId).toBe(g.equipo.id);
  });

  it("si ya no cabe, queda suelto y lo dice", () => {
    const g = agregarEquipo(base(), { x: m(2), y: m(3) }, { ...modeloDe("gabinete"), datos: { unidades: 2 } }, 1);
    const a = agregarEquipo(g.plano, { x: m(8), y: m(8) }, modeloDe("servidor"), 1);
    expect(a.equipo.gabineteId ?? null).toBeNull();
    expect(avisoDeEquipo(a.plano, a.equipo)).toContain("Ya no cabe");
  });

  it("al mover el gabinete viaja lo de adentro; solo no se mueve", () => {
    const g = agregarEquipo(base(), { x: m(2), y: m(3) }, modeloDe("gabinete"), 1);
    const a = agregarEquipo(g.plano, { x: 0, y: 0 }, modeloDe("nvr"), 1);
    const movido = mover(a.plano, { tipo: "equipo", id: g.equipo.id }, { x: 50, y: 0 });
    expect(movido.equipos!.find((e) => e.id === a.equipo.id)?.pos.x).toBe(g.equipo.pos.x + 50);
    const solo = mover(movido, { tipo: "equipo", id: a.equipo.id }, { x: 99, y: 0 });
    expect(solo.equipos!.find((e) => e.id === a.equipo.id)?.pos.x).toBe(g.equipo.pos.x + 50);
  });

  it("al quitar el gabinete, lo de adentro queda suelto, no se pierde", () => {
    const g = agregarEquipo(base(), { x: m(2), y: m(3) }, modeloDe("gabinete"), 1);
    const a = agregarEquipo(g.plano, { x: 0, y: 0 }, modeloDe("nvr"), 1);
    const sin = borrar(a.plano, { tipo: "equipo", id: g.equipo.id });
    expect(sin.equipos).toHaveLength(1);
    expect(sin.equipos![0].gabineteId).toBeNull();
    expect(sin.equipos![0].unidad).toBeNull();
  });

  it("no deja encimar unidades dentro del gabinete", () => {
    const g = agregarEquipo(base(), { x: m(2), y: m(3) }, modeloDe("gabinete"), 1);
    const a = agregarEquipo(g.plano, { x: 0, y: 0 }, modeloDe("nvr"), 1);
    const b = agregarEquipo(a.plano, { x: 0, y: 0 }, modeloDe("switch"), 1);
    expect(moverEnGabinete(b.plano, b.equipo.id, a.equipo.unidad!)).toBe(b.plano);
    expect(moverEnGabinete(b.plano, b.equipo.id, 5).equipos!.find((e) => e.id === b.equipo.id)?.unidad).toBe(5);
    expect(moverEnGabinete(b.plano, b.equipo.id, 99)).toBe(b.plano);
  });

  it("la terminal se pega al muro, mira al que llega y se liga a la puerta cercana", () => {
    const r = agregarEquipo(base(), { x: m(5.5), y: m(0.5) }, modeloDe("terminal"), 1);
    expect(r.equipo.pos.y).toBeCloseTo(m(0.1));
    expect(r.equipo.rumboDeg).toBe(180);
    expect(r.equipo.alturaM).toBe(1.15);
    expect(r.equipo.puertaId).toBe("p1");
    expect(avisoDeEquipo(r.plano, r.equipo)).toContain("puerta");
  });

  it("lejos de una puerta no se liga a nada, y al borrar la puerta se suelta", () => {
    expect(agregarEquipo(base(), { x: m(9.5), y: m(0.5) }, modeloDe("terminal"), 1).equipo.puertaId).toBeNull();
    const r = agregarEquipo(base(), { x: m(5.5), y: m(0.5) }, modeloDe("terminal"), 1);
    expect(borrar(r.plano, { tipo: "abertura", id: "p1" }).equipos![0].puertaId).toBeNull();
  });

  it("cada prefijo lleva su cuenta entre niveles", () => {
    const a = agregarEquipo(base(), { x: 0, y: 0 }, modeloDe("terminal"), 1).plano;
    expect(siguienteNumeroEquipo(a, "terminal")).toBe(2);
    expect(siguienteNumeroEquipo(a, "gabinete")).toBe(1);
  });
});
