import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO, type ModeloEquipo } from "./catalogo";
import { agregarCamara, agregarEquipo, type ResumenDiseno } from "./editor";
import { GRABACION_POR_OMISION } from "./infraestructura";
import { planoVacio, type EquipoPlano, type Plano } from "./plano";
import { balanceDelSistema, coberturaDeAlarmas, conexionesDelSistema, gruposDeEquipos, revisionDelSistema, rutaCable } from "./sistema";

const K = 0.02;
const px = (m: number) => m / K;
const modelo = (tipo: string): ModeloEquipo => MODELOS_EQUIPO.find((m) => m.tipo === tipo)!;

function sitio(anchoM = 30, altoM = 20): Plano {
  const p = planoVacio();
  const esq = [
    [0, 0],
    [anchoM, 0],
    [anchoM, altoM],
    [0, altoM],
  ];
  return {
    ...p,
    escala: { metrosPorPx: K, calibracion: null },
    muros: esq.map(([x, y], i) => {
      const [x2, y2] = esq[(i + 1) % 4];
      return { id: `m${i}`, a: { x: px(x), y: px(y) }, b: { x: px(x2), y: px(y2) }, alturaM: 3, grosorM: 0.2, tipo: "muro" as const };
    }),
  };
}

function poner(p: Plano, tipo: string, xM: number, yM: number): { plano: Plano; equipo: EquipoPlano } {
  const n = (p.equipos ?? []).filter((e) => e.tipo === tipo).length + 1;
  return agregarEquipo(p, { x: px(xM), y: px(yM) }, modelo(tipo), n);
}

function conCamaras(p: Plano, n: number): Plano {
  let actual = p;
  for (let i = 0; i < n; i++) actual = agregarCamara(actual, { x: px(2 + i * 2), y: px(2) }, MODELOS_CAMARA[0], { numero: i + 1, nombre: `Cámara ${i + 1}` }).plano;
  return actual;
}

const RESUMEN = (mbps: number, tb: number, camaras: number): ResumenDiseno => ({ camaras, mbps, tb, cobertura: null });

describe("Rutas de cable", () => {
  it("va en ángulos rectos y prefiere correr pegada a los muros", () => {
    const muros = [{ a: { x: 0, y: 0 }, b: { x: 20, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 20 } }];
    const ruta = rutaCable({ x: 1, y: 15 }, { x: 15, y: 1 }, muros);
    for (let i = 1; i < ruta.length; i++) expect(ruta[i].x === ruta[i - 1].x || ruta[i].y === ruta[i - 1].y).toBe(true);
    // Pasa por las líneas de los muros, no cruza en diagonal por en medio.
    expect(ruta.some((p) => p.x === 0 || p.y === 0)).toBe(true);
  });

  it("sin muros es una L", () => {
    expect(rutaCable({ x: 0, y: 0 }, { x: 5, y: 5 }, [])).toHaveLength(3);
  });

  it("sin gabinete no hay nada que trazar", () => {
    expect(conexionesDelSistema(conCamaras(sitio(), 2))).toEqual([]);
  });

  it("cada equipo suelto lleva su cable; lo que va adentro del gabinete, no", () => {
    let p = conCamaras(sitio(), 2);
    p = poner(p, "gabinete", 1, 10).plano;
    p = poner(p, "nvr", 1, 10).plano;
    p = poner(p, "sirena", 15, 0.3).plano;
    const c = conexionesDelSistema(p);
    expect(c.map((x) => x.clave).sort()).toEqual(["CAM-01", "CAM-02", "SI-01"]);
    expect(c.find((x) => x.clave === "SI-01")?.clase).toBe("alarmas");
    expect(c.find((x) => x.clave === "CAM-01")?.clase).toBe("video");
  });

  it("marca lo que se pasa del límite del UTP", () => {
    let p = sitio(120, 20);
    p = poner(p, "gabinete", 1, 1).plano;
    p = agregarCamara(p, { x: px(115), y: px(18) }, MODELOS_CAMARA[0], { numero: 1, nombre: "Lejos" }).plano;
    const [c] = conexionesDelSistema(p);
    expect(c.largoM).toBeGreaterThan(100);
    expect(c.estado).toBe("excede");
  });
});

describe("Balance del sistema", () => {
  it("compara lo colocado contra lo que da el equipo", () => {
    let p = conCamaras(sitio(), 3);
    p = poner(p, "gabinete", 1, 10).plano;
    p = poner(p, "nvr", 1, 10).plano;
    p = poner(p, "switch", 1, 10).plano;
    const b = balanceDelSistema(p, RESUMEN(30, 5, 3), conexionesDelSistema(p));
    expect(b.camaras).toBe(3);
    expect(b.canales).toBe(8);
    expect(b.mbpsEntrada).toBe(80);
    expect(b.poeDisponibleW).toBe(370);
    expect(b.puertos).toBe(24);
    expect(b.cableM).toBeGreaterThan(0);
    expect(b.bobinas).toBeGreaterThanOrEqual(1);
  });

  it("agrupa por modelo, con las cámaras primero", () => {
    let p = conCamaras(sitio(), 2);
    p = poner(p, "terminal", 5, 0.3).plano;
    p = poner(p, "terminal", 9, 0.3).plano;
    const g = gruposDeEquipos(p, GRABACION_POR_OMISION);
    expect(g[0].familia).toBe("camaras");
    expect(g[0].cantidad).toBe(2);
    const t = g.find((x) => x.tipo === "terminal")!;
    expect(t.cantidad).toBe(2);
    expect(t.claves).toEqual(["AC-01", "AC-02"]);
    expect(t.watts).toBe(24);
  });
});

describe("Revisión del sistema", () => {
  const titulos = (r: ReturnType<typeof revisionDelSistema>) => r.map((x) => x.titulo);

  it("dice cuando faltan canales, con el modelo y por cuánto", () => {
    let p = conCamaras(sitio(), 10);
    p = poner(p, "gabinete", 1, 10).plano;
    p = poner(p, "nvr", 1, 10).plano;
    const r = revisionDelSistema(p, RESUMEN(40, 10, 10), GRABACION_POR_OMISION).find((x) => x.titulo === "Canales del grabador")!;
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("Hay 10 cámaras y el DS-7608NXI-K2 tiene 8 canales");
    expect(r.detalle).toContain("16 canales");
  });

  it("avisa si el consumo no alcanza, los puertos no bastan o faltan bahías", () => {
    let p = conCamaras(sitio(), 3);
    p = poner(p, "gabinete", 1, 10).plano;
    p = poner(p, "nvr", 1, 10).plano;
    const sw = poner(p, "switch", 1, 10);
    p = { ...sw.plano, equipos: sw.plano.equipos!.map((e) => (e.id === sw.equipo.id ? { ...e, datos: { ...e.datos, poeTotalW: 10, puertos: 2 } } : e)) };
    const r = revisionDelSistema(p, RESUMEN(30, 40, 3), GRABACION_POR_OMISION);
    expect(r.find((x) => x.titulo === "Consumo PoE")?.ok).toBe(false);
    expect(r.find((x) => x.titulo === "Consumo PoE")?.detalle).toContain("faltan");
    expect(r.find((x) => x.titulo === "Puertos del switch")?.detalle).toContain("faltan 1");
    expect(r.find((x) => x.titulo === "Grabación")?.ok).toBe(false);
  });

  it("pide el gabinete para poder medir el cable", () => {
    const r = revisionDelSistema(conCamaras(sitio(), 1), null, GRABACION_POR_OMISION);
    expect(r.find((x) => x.titulo === "Gabinete")?.detalle).toContain("Coloca el gabinete");
  });

  it("señala la terminal sin puerta", () => {
    const p = poner(sitio(), "terminal", 5, 0.3).plano;
    expect(revisionDelSistema(p, null, GRABACION_POR_OMISION).find((x) => x.titulo === "Control de acceso")?.detalle).toContain("AC-01");
  });

  it("con todo bien, no marca de más", () => {
    let p = conCamaras(sitio(), 3);
    p = poner(p, "gabinete", 1, 10).plano;
    p = poner(p, "nvr", 1, 10).plano;
    p = poner(p, "switch", 1, 10).plano;
    const r = revisionDelSistema(p, RESUMEN(30, 5, 3), GRABACION_POR_OMISION);
    expect(titulos(r)).toEqual(expect.arrayContaining(["Consumo PoE", "Canales del grabador", "Ancho de banda", "Grabación", "Cable"]));
    expect(r.filter((x) => !x.ok).map((x) => x.titulo).filter((t) => t !== "Escala")).toEqual([]);
  });

  it("estima dónde se escuchan las alarmas y lo dice como estimado", () => {
    const p = poner(sitio(100, 20), "sirena", 1, 0.3).plano;
    const pct = coberturaDeAlarmas(p);
    expect(pct).toBeGreaterThan(5);
    expect(pct).toBeLessThan(40);
    const r = revisionDelSistema(p, null, GRABACION_POR_OMISION).find((x) => x.titulo === "Alarmas")!;
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("estimado");
  });
});
