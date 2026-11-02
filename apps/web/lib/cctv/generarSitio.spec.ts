import { afterEach, describe, expect, it } from "vitest";
import { registrarCatalogo, type ModeloCamara } from "./catalogo";
import { GRABACION_POR_OMISION } from "./infraestructura";
import { generarSitio, PLANTILLAS, type EspecSitio } from "./generarSitio";
import { listaNiveles } from "./niveles";
import { conexionesDelSistema, revisionDelSistema } from "./sistema";

const K = 0.02;

describe("Armar un diseño a partir de unos cuantos datos", () => {
  afterEach(() => registrarCatalogo([], []));

  it("una frase corta alcanza para un sitio completo", () => {
    const { raiz, resumen } = generarSitio({ areas: [{ nombre: "Bodega", tipo: "bodega" }, { nombre: "Oficinas", tipo: "oficina" }, { nombre: "Cuarto de TI", tipo: "ti" }] });
    expect(raiz.muros.length).toBeGreaterThan(4);
    expect(raiz.camaras.length).toBeGreaterThan(3);
    expect(raiz.obstaculos.some((o) => o.nombre === "Anaquel")).toBe(true);
    expect(raiz.escala.calibracion).toBeTruthy();
    expect(raiz.equipos?.some((e) => e.tipo === "gabinete")).toBe(true);
    expect(resumen).toContain("cámaras");
  });

  it("respeta las medidas y las áreas que le dieron", () => {
    const { raiz } = generarSitio({ anchoM: 40, fondoM: 25, areas: [{ nombre: "Nave", tipo: "bodega", m2: 800 }, { nombre: "Recepción", tipo: "recepcion", m2: 40 }] });
    const xs = raiz.muros.flatMap((m) => [m.a.x, m.b.x]).map((x) => x * K);
    const ys = raiz.muros.flatMap((m) => [m.a.y, m.b.y]).map((y) => y * K);
    expect(Math.max(...xs)).toBeCloseTo(40);
    expect(Math.max(...ys)).toBeCloseTo(25);
    expect((raiz.areas ?? []).map((a) => a.nombre).sort()).toEqual(["Nave", "Recepción"]);
  });

  it("pone exactamente las cámaras que le pidieron, y las de cada área si las dicen", () => {
    expect(generarSitio({ camaras: 12, areas: [{ nombre: "Bodega", tipo: "bodega" }, { nombre: "Oficinas", tipo: "oficina" }, { nombre: "TI", tipo: "ti" }] }).raiz.camaras).toHaveLength(12);
    expect(generarSitio({ camaras: 2, areas: [{ nombre: "Bodega", tipo: "bodega" }, { nombre: "Oficinas", tipo: "oficina" }, { nombre: "TI", tipo: "ti" }] }).raiz.camaras).toHaveLength(2);
    const conArea = generarSitio({ areas: [{ nombre: "Caja", tipo: "otro", m2: 20, camaras: 3 }, { nombre: "Venta", tipo: "tienda", m2: 100, camaras: 1 }] }).raiz;
    expect(conArea.camaras.filter((c) => c.nombre.startsWith("Caja"))).toHaveLength(3);
  });

  it("cada cámara queda adentro del sitio y apuntando hacia adentro", () => {
    const { raiz } = generarSitio(PLANTILLAS[1].espec);
    const W = PLANTILLAS[1].espec.anchoM as number;
    const D = PLANTILLAS[1].espec.fondoM as number;
    for (const c of raiz.camaras) {
      expect(c.pos.x * K).toBeGreaterThanOrEqual(0);
      expect(c.pos.x * K).toBeLessThanOrEqual(W);
      expect(c.pos.y * K).toBeGreaterThanOrEqual(0);
      expect(c.pos.y * K).toBeLessThanOrEqual(D);
      expect(c.rumboDeg).toBeGreaterThanOrEqual(0);
      expect(c.rumboDeg).toBeLessThan(361);
    }
  });

  it("el gabinete queda armado con grabador y switch suficientes: la revisión no se queja", () => {
    const { raiz } = generarSitio({ camaras: 30, accesos: 2, areas: [{ nombre: "Bodega", tipo: "bodega", m2: 1500 }, { nombre: "Recepción", tipo: "recepcion" }, { nombre: "Cuarto de TI", tipo: "ti" }] });
    const dentro = (raiz.equipos ?? []).filter((e) => e.gabineteId);
    expect(dentro.some((e) => e.tipo === "nvr" && (e.datos.canales ?? 0) >= 30)).toBe(true);
    expect(dentro.filter((e) => e.tipo === "switch").length).toBeGreaterThanOrEqual(2);
    const r = revisionDelSistema(raiz, { camaras: 30, mbps: 100, tb: 5, cobertura: null } as never, GRABACION_POR_OMISION);
    expect(r.find((x) => x.titulo === "Canales del grabador")?.ok).toBe(true);
    expect(r.find((x) => x.titulo === "Puertos del switch")).toBeUndefined();
    expect(conexionesDelSistema(raiz).length).toBeGreaterThan(30);
  });

  it("la terminal queda ligada a su puerta", () => {
    const { raiz } = generarSitio({ accesos: 2, areas: [{ nombre: "Bodega", tipo: "bodega" }, { nombre: "Recepción", tipo: "recepcion" }, { nombre: "Cuarto de TI", tipo: "ti" }] });
    const terminales = (raiz.equipos ?? []).filter((e) => e.tipo === "terminal");
    expect(terminales).toHaveLength(2);
    for (const t of terminales) expect(t.puertaId).toBeTruthy();
  });

  it("afuera pone reja, barrera y fachada con balas", () => {
    const { raiz } = generarSitio({ barrera: true, areas: [{ nombre: "Bodega", tipo: "bodega" }, { nombre: "Patio", tipo: "patio", m2: 400 }] });
    expect(raiz.muros.some((m) => m.tipo === "reja")).toBe(true);
    expect((raiz.equipos ?? []).some((e) => e.tipo === "barrera")).toBe(true);
    expect(raiz.camaras.some((c) => c.nombre.startsWith("Patio"))).toBe(true);
    expect(raiz.camaras.some((c) => c.montaje === "poste")).toBe(true);
  });

  it("varios pisos: cada uno con lo suyo, la numeración sigue y el gabinete de abajo los atiende", () => {
    const { raiz } = generarSitio({ camaras: 8, areas: [{ nombre: "Abajo", tipo: "oficina", m2: 200 }, { nombre: "Cuarto de TI", tipo: "ti", m2: 10 }, { nombre: "Arriba", tipo: "oficina", m2: 200, piso: 1 }] });
    const niveles = listaNiveles(raiz);
    expect(niveles).toHaveLength(2);
    expect(niveles[1].plano.camaras.length).toBeGreaterThan(0);
    const numeros = niveles.flatMap((n) => n.plano.camaras.map((c) => c.numero));
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(numeros).toHaveLength(8);
    expect(conexionesDelSistema(raiz).some((c) => c.nivelId === niveles[1].nivel.id)).toBe(true);
  });

  it("usa la marca pedida si está en el catálogo, y avisa si no", () => {
    const dahua = (id: string, tipo: ModeloCamara["tipo"]): ModeloCamara => ({ id, marca: "Dahua Technology", modelo: id, tipo, descripcion: "", optica: { pxHoriz: 2688, pxVert: 1520, focalMm: 2.8, hfovDeclaradoDeg: 95 }, caracteristicas: [], fuente: "ficha", verificado: false });
    registrarCatalogo([dahua("db-1", "domo"), dahua("db-2", "turret")], []);
    const con = generarSitio({ marca: "Dahua", areas: [{ nombre: "Oficinas", tipo: "oficina", m2: 100 }] });
    expect(con.raiz.camaras.every((c) => c.productoId?.startsWith("db-"))).toBe(true);
    expect(con.avisos).toEqual([]);
    const sin = generarSitio({ marca: "Bosch", areas: [{ nombre: "Oficinas", tipo: "oficina", m2: 100 }] });
    expect(sin.avisos[0]).toContain("Bosch");
    expect(sin.raiz.camaras.length).toBeGreaterThan(0);
  });

  it("con nada dicho, sale una plantilla, nunca un error", () => {
    expect(generarSitio({ areas: [] }).raiz.muros.length).toBeGreaterThan(4);
    expect(generarSitio({ areas: [{ nombre: "Patio", tipo: "patio" }] }).raiz.muros.length).toBeGreaterThan(3);
  });

  it("todas las plantillas salen sin avisos y con todo su equipo", () => {
    for (const p of PLANTILLAS) {
      const r = generarSitio(p.espec as EspecSitio);
      expect(r.avisos, p.id).toEqual([]);
      expect(listaNiveles(r.raiz).flatMap((n) => n.plano.camaras).length, p.id).toBeGreaterThan(1);
      expect((r.raiz.equipos ?? []).some((e) => e.tipo === "gabinete"), p.id).toBe(true);
    }
  });
});
