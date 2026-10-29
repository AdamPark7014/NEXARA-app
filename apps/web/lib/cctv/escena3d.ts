/**
 * Vista 3D del sitio en proyección axonométrica (la isométrica del mockup aprobado): piso con el
 * croquis, conos DORI en el piso, muros extruidos a su altura con huecos de puertas y ventanas,
 * obstáculos, humanoides y cámaras a su altura de montaje con su número.
 *
 * Se dibuja en SVG con el algoritmo del pintor (lo lejano primero), sin WebGL: así no pesa en el
 * resto de Core ni choca con la CSP. La cámara de la vista gira alrededor de la vertical (azimut)
 * y se inclina (elevación: 90° = vista superior).
 *
 * Entradas en metros, ejes del plano (x derecha, y abajo, z arriba); salidas en px de pantalla.
 */
import type { NivelCobertura } from "./optica";
import { dirRumbo, type Plano, type Punto, type Tapa } from "./plano";
import { camaraEnMetros, type PoligonoCobertura } from "./visibilidad";

export type Vista3D = {
  azimutDeg: number;
  elevacionDeg: number;
  /** Px de pantalla por metro. */
  pxPorMetro: number;
  /** Punto del plano (m) que queda al centro de la pantalla. */
  centro: Punto;
  ancho: number;
  alto: number;
};

export const VISTA_ISOMETRICA = { azimutDeg: -28, elevacionDeg: 36 } as const;
export const VISTA_SUPERIOR = { azimutDeg: 0, elevacionDeg: 90 } as const;

type P3 = { x: number; y: number; z: number };
export type P2 = { x: number; y: number };

export type Proyector = {
  pantalla: (p: P3) => P2;
  profundidad: (p: P3) => number;
  /** ¿Una cara vertical con esta normal (en planta) mira hacia quien ve? */
  miraAlFrente: (normal: Punto) => boolean;
  /** Matriz SVG que lleva px del croquis (con `metrosPorPx`) al piso de la vista, a la altura `z`. */
  matrizPiso: (metrosPorPx: number, z?: number) => [number, number, number, number, number, number];
};

const rad = (g: number) => (g * Math.PI) / 180;

export function proyector(v: Vista3D): Proyector {
  const a = rad(v.azimutDeg);
  const e = rad(Math.min(Math.max(v.elevacionDeg, 5), 90));
  const s = v.pxPorMetro;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const se = Math.sin(e);
  const ce = Math.cos(e);
  const rot = (p: P3) => {
    const dx = p.x - v.centro.x;
    const dy = p.y - v.centro.y;
    return { xr: dx * ca - dy * sa, yr: dx * sa + dy * ca };
  };
  return {
    pantalla: (p) => {
      const { xr, yr } = rot(p);
      return { x: v.ancho / 2 + xr * s, y: v.alto / 2 + (yr * se - p.z * ce) * s };
    },
    profundidad: (p) => {
      const { yr } = rot(p);
      return yr * ce + p.z * se;
    },
    miraAlFrente: (n) => ce > 1e-3 && n.x * sa + n.y * ca > 1e-6,
    matrizPiso: (k, z = 0) => {
      // pantalla = A·(px·k − centro) + desplazamiento
      const m = [s * k * ca, s * k * se * sa, -s * k * sa, s * k * se * ca] as const;
      const cx = -(v.centro.x * ca - v.centro.y * sa) * s + v.ancho / 2;
      const cy = -(v.centro.x * sa + v.centro.y * ca) * se * s + v.alto / 2;
      return [m[0], m[1], m[2], m[3], cx, cy - z * ce * s];
    },
  };
}

export type Figura3D =
  | { tipo: "piso"; puntos: P2[] }
  | { tipo: "cobertura"; nivel: NivelCobertura; propia: boolean; puntos: P2[] }
  | {
      tipo: "cara";
      puntos: P2[];
      tono: number;
      superior: boolean;
      /** Cara de afuera que mira a quien ve: es la que tapa el interior (corte tipo «casa de muñecas»). */
      exterior: boolean;
      origen: string;
      material: "muro" | "hoja" | "obstaculo" | "vidrio";
      d: number;
    }
  | { tipo: "persona"; id: string; anillo: P2[]; pie: P2; cadera: P2; cuello: P2; cabeza: P2; radio: number; d: number }
  | { tipo: "camara"; id: string; numero: number; nombre: string; montaje: P2; insignia: P2; d: number }
  /** Campo de visión de la cámara elegida: de la lente a las esquinas de lo que ve en el piso. */
  | { tipo: "rayos"; id: string; lente: P2; cerca: P2[]; lejos: P2[] }
  | { tipo: "etiqueta"; id: string; texto: string; pos: P2; d: number };

type Ordenable = Extract<Figura3D, { d: number }>;

/** Luz desde arriba a la izquierda (noroeste): las caras que la miran se ven más claras. */
const LUZ = (() => {
  const l = { x: -0.6, y: -0.8 };
  const n = Math.hypot(l.x, l.y);
  return { x: l.x / n, y: l.y / n };
})();

/**
 * Arma la escena. `coberturas` en metros por id de cámara; `seleccionada` resalta su cono.
 * Las tapas se parten en tramos de ~1 m para que el pintor no se equivoque con muros largos.
 */
export function escena3D(params: {
  plano: Plano;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  vista: Vista3D;
  seleccionada?: string | null;
  limites: { min: Punto; max: Punto } | null;
  /** Elevación del piso de este nivel (m): todo el nivel se dibuja encima de ella. */
  elevacionM?: number;
}): Figura3D[] {
  const { plano, vista } = params;
  const z0 = params.elevacionM ?? 0;
  const base = proyector(vista);
  const pr: Proyector = {
    ...base,
    pantalla: (p) => base.pantalla({ ...p, z: p.z + z0 }),
    profundidad: (p) => base.profundidad({ ...p, z: p.z + z0 }),
  };
  const k = plano.escala.metrosPorPx;
  const fondo: Figura3D[] = [];

  if (params.limites) {
    const { min, max } = params.limites;
    const m = 2;
    fondo.push({
      tipo: "piso",
      puntos: [
        { x: min.x - m, y: min.y - m, z: 0 },
        { x: max.x + m, y: min.y - m, z: 0 },
        { x: max.x + m, y: max.y + m, z: 0 },
        { x: min.x - m, y: max.y + m, z: 0 },
      ].map(pr.pantalla),
    });
  }
  const conos: Figura3D[] = [];
  for (const [id, pols] of params.coberturas) {
    for (const pol of pols) {
      conos.push({
        tipo: "cobertura",
        nivel: pol.nivel,
        propia: id === params.seleccionada,
        puntos: pol.puntos.map((p) => pr.pantalla({ x: p.x, y: p.y, z: 0.02 })),
      });
    }
  }
  // La seleccionada encima de las demás.
  conos.sort((a, b) => Number(a.tipo === "cobertura" && a.propia) - Number(b.tipo === "cobertura" && b.propia));

  const ordenables: Ordenable[] = [];
  const muros = new Map(plano.muros.map((m) => [m.id, m]));
  const esHoja = (t: Tapa) => !muros.has(t.origen) && !plano.obstaculos.some((o) => o.id === t.origen);
  const esObstaculo = (t: Tapa) => plano.obstaculos.some((o) => o.id === t.origen);

  const extruir = (a: Punto, b: Punto, base: number, tope: number, grosor: number, origen: string, material: "muro" | "hoja" | "obstaculo" | "vidrio") => {
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    if (largo < 1e-6) return;
    const n = { x: -(b.y - a.y) / largo, y: (b.x - a.x) / largo };
    const tramos = Math.max(1, Math.ceil(largo / 1));
    const g = grosor / 2;
    for (let i = 0; i < tramos; i++) {
      const p0 = { x: a.x + ((b.x - a.x) * i) / tramos, y: a.y + ((b.y - a.y) * i) / tramos };
      const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / tramos, y: a.y + ((b.y - a.y) * (i + 1)) / tramos };
      const lado = pr.miraAlFrente(n) ? 1 : -1;
      const normal = { x: n.x * lado, y: n.y * lado };
      const f0 = { x: p0.x + normal.x * g, y: p0.y + normal.y * g };
      const f1 = { x: p1.x + normal.x * g, y: p1.y + normal.y * g };
      const t0 = { x: p0.x - normal.x * g, y: p0.y - normal.y * g };
      const t1 = { x: p1.x - normal.x * g, y: p1.y - normal.y * g };
      const medio = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (base + tope) / 2 };
      const d = pr.profundidad(medio);
      const tono = 0.7 + 0.26 * Math.max(0, normal.x * LUZ.x + normal.y * LUZ.y);
      // Un paso afuera de la cara que se ve: si cae fuera del edificio, esa cara es la de afuera.
      const asoma = { x: (p0.x + p1.x) / 2 + normal.x * (g + 0.3), y: (p0.y + p1.y) / 2 + normal.y * (g + 0.3) };
      const lim = params.limites;
      const exterior = Boolean(lim && (asoma.x < lim.min.x || asoma.x > lim.max.x || asoma.y < lim.min.y || asoma.y > lim.max.y));
      if (vista.elevacionDeg < 89.5) {
        ordenables.push({
          tipo: "cara",
          material,
          origen,
          superior: false,
          exterior,
          tono,
          d,
          puntos: [
            { ...f0, z: base },
            { ...f1, z: base },
            { ...f1, z: tope },
            { ...f0, z: tope },
          ].map(pr.pantalla),
        });
      }
      ordenables.push({
        tipo: "cara",
        material,
        origen,
        superior: true,
        exterior: false,
        tono: 1,
        d: d + 1e-3,
        puntos: [
          { ...f0, z: tope },
          { ...f1, z: tope },
          { ...t1, z: tope },
          { ...t0, z: tope },
        ].map(pr.pantalla),
      });
    }
  };

  for (const t of params.tapas) {
    const muro = muros.get(t.origen);
    const material = esObstaculo(t) ? "obstaculo" : esHoja(t) ? "hoja" : "muro";
    const grosor = muro?.grosorM ?? (material === "hoja" ? 0.05 : 0.08);
    extruir(t.a, t.b, t.baseM, t.topeM, grosor, muro?.id ?? t.origen, material);
  }
  // Vidrio y reja no tapan la vista, pero se ven: planos translúcidos.
  for (const m of plano.muros) {
    if (m.tipo === "muro") continue;
    extruir({ x: m.a.x * k, y: m.a.y * k }, { x: m.b.x * k, y: m.b.y * k }, 0, m.alturaM, 0.04, m.id, "vidrio");
  }

  for (const h of plano.personas) {
    const p = { x: h.pos.x * k, y: h.pos.y * k };
    const anillo = Array.from({ length: 20 }, (_, i) => {
      const t = (i / 20) * Math.PI * 2;
      return pr.pantalla({ x: p.x + Math.cos(t) * 0.45, y: p.y + Math.sin(t) * 0.45, z: 0.03 });
    });
    ordenables.push({
      tipo: "persona",
      id: h.id,
      anillo,
      pie: pr.pantalla({ ...p, z: 0.1 }),
      cadera: pr.pantalla({ ...p, z: 0.95 }),
      cuello: pr.pantalla({ ...p, z: 1.45 }),
      cabeza: pr.pantalla({ ...p, z: 1.62 }),
      radio: 0.2 * vista.pxPorMetro,
      d: pr.profundidad({ ...p, z: 0.9 }),
    });
  }

  for (const c of plano.camaras) {
    const p = { x: c.pos.x * k, y: c.pos.y * k };
    const dir = dirRumbo(c.rumboDeg);
    ordenables.push({
      tipo: "camara",
      id: c.id,
      numero: c.numero,
      nombre: c.nombre,
      montaje: pr.pantalla({ ...p, z: c.alturaM }),
      insignia: pr.pantalla({ x: p.x + dir.x * 0.9, y: p.y + dir.y * 0.9, z: c.alturaM + 1.4 }),
      d: pr.profundidad({ ...p, z: c.alturaM }) + 0.3,
    });
  }

  for (const e of plano.etiquetas) {
    const p = { x: e.pos.x * k, y: e.pos.y * k, z: 0.05 };
    ordenables.push({ tipo: "etiqueta", id: e.id, texto: e.texto, pos: pr.pantalla(p), d: pr.profundidad(p) });
  }

  ordenables.sort((a, b) => a.d - b.d);

  // La cámara elegida enseña su campo de visión: rayos de la lente al pie de la zona ciega y al
  // final del cono, en los dos bordes del ángulo horizontal. Va encima de todo, como una guía.
  const rayos: Figura3D[] = [];
  const sel = params.seleccionada ? plano.camaras.find((c) => c.id === params.seleccionada) : null;
  const cm = sel ? camaraEnMetros(sel, plano.escala) : null;
  if (sel && cm) {
    const bajo = cm.inclinacionDeg + cm.vfovDeg / 2;
    const ciega = bajo < 89.5 ? Math.min(cm.alturaM / Math.tan(rad(bajo)), cm.distanciaM) : 0;
    const punto = (dist: number, lado: number) => {
      const d = dirRumbo(cm.rumboDeg + (lado * Math.min(cm.hfovDeg, 179)) / 2);
      return pr.pantalla({ x: cm.pos.x + d.x * dist, y: cm.pos.y + d.y * dist, z: 0 });
    };
    rayos.push({
      tipo: "rayos",
      id: sel.id,
      lente: pr.pantalla({ ...cm.pos, z: cm.alturaM }),
      cerca: [punto(ciega, -1), punto(ciega, 1)],
      lejos: [punto(cm.distanciaM, -1), punto(cm.distanciaM, 1)],
    });
  }
  return [...fondo, ...conos, ...ordenables, ...rayos];
}

/** Une los límites de varios pisos (los que no tienen muros no cuentan). */
export function unirLimites(ls: ReadonlyArray<{ min: Punto; max: Punto } | null>): { min: Punto; max: Punto } | null {
  const v = ls.filter((l): l is { min: Punto; max: Punto } => l != null);
  if (!v.length) return null;
  return {
    min: { x: Math.min(...v.map((l) => l.min.x)), y: Math.min(...v.map((l) => l.min.y)) },
    max: { x: Math.max(...v.map((l) => l.max.x)), y: Math.max(...v.map((l) => l.max.y)) },
  };
}

/** Escala que hace caber los límites del sitio en la pantalla con la vista dada. */
export function encuadrar(
  limites: { min: Punto; max: Punto },
  vista: Omit<Vista3D, "pxPorMetro" | "centro">,
  /** Elevación del nivel más alto que se ve (m). */
  elevacionMaxM = 0,
): Pick<Vista3D, "pxPorMetro" | "centro"> {
  let centro = { x: (limites.min.x + limites.max.x) / 2, y: (limites.min.y + limites.max.y) / 2 };
  const esquinas: P3[] = [];
  for (const x of [limites.min.x, limites.max.x])
    for (const y of [limites.min.y, limites.max.y])
      for (const z of [0, elevacionMaxM + 5]) esquinas.push({ x, y, z });
  let ps = esquinas.map(proyector({ ...vista, pxPorMetro: 1, centro }).pantalla);
  if (elevacionMaxM > 0) {
    // Con pisos encima, se centra en pantalla lo que se ve: el corrimiento de pantalla se lleva al
    // piso con la rotación inversa del azimut.
    const a = rad(vista.azimutDeg);
    const e = rad(Math.min(Math.max(vista.elevacionDeg, 5), 90));
    const u = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2 - vista.ancho / 2;
    const yr = ((Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2 - vista.alto / 2) / Math.sin(e);
    centro = { x: centro.x + u * Math.cos(a) + yr * Math.sin(a), y: centro.y - u * Math.sin(a) + yr * Math.cos(a) };
    ps = esquinas.map(proyector({ ...vista, pxPorMetro: 1, centro }).pantalla);
  }
  const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
  const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
  const pxPorMetro = Math.max(1, Math.min((vista.ancho * 0.88) / Math.max(w, 1e-6), (vista.alto * 0.82) / Math.max(h, 1e-6)));
  return { pxPorMetro, centro };
}
