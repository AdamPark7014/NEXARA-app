/**
 * Lo que ve una cámara, dibujado en 2D: piso, cobertura DORI, muros, hojas de puerta y
 * humanoides proyectados con la óptica real de la lente (cámara estenopeica), del fondo al
 * frente. Es el recuadro «134 PPM · Reconocimiento · persona a 10 m» del editor y la vista de
 * la ficha; el 3D con texturas es la fase 3.
 *
 * Todo entra en metros (ejes del plano) y sale en píxeles de una imagen `ancho` × `alto`.
 */
import type { NivelCobertura } from "./optica";
import type { Punto, Tapa } from "./plano";
import { dirRumbo } from "./plano";
import { marcoCamara, type CamaraM, type PoligonoCobertura } from "./visibilidad";

export type FiguraVista =
  | { tipo: "piso" | "terreno"; puntos: Punto[] }
  | { tipo: "cobertura"; nivel: NivelCobertura; propia: boolean; puntos: Punto[] }
  | { tipo: "muro"; frente: boolean; puntos: Punto[] }
  | { tipo: "hoja"; puntos: Punto[] }
  | { tipo: "persona"; puntos: Punto[]; cabeza: { x: number; y: number; r: number } };

type V3 = { a: number; l: number; u: number };

/** Plano de corte cercano: lo que queda a menos de 5 cm de la lente no se dibuja. */
const CERCA_M = 0.05;

/** Recorta un polígono contra el plano «adelante ≥ 5 cm» (Sutherland-Hodgman). */
function recortar(poly: V3[]): V3[] {
  const fuera: V3[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dentroA = a.a >= CERCA_M;
    const dentroB = b.a >= CERCA_M;
    if (dentroA) fuera.push(a);
    if (dentroA !== dentroB) {
      const t = (CERCA_M - a.a) / (b.a - a.a);
      fuera.push({ a: CERCA_M, l: a.l + (b.l - a.l) * t, u: a.u + (b.u - a.u) * t });
    }
  }
  return fuera;
}

/**
 * Vista desde la cámara. `piso` son las esquinas del terreno a pintar (el contorno de los
 * muros); `personas`, los humanoides en metros.
 */
export function vistaDesdeCamara(params: {
  cam: CamaraM;
  tapas: readonly Tapa[];
  coberturaPropia: readonly PoligonoCobertura[];
  coberturaOtras?: readonly PoligonoCobertura[];
  personas: readonly Punto[];
  piso: { min: Punto; max: Punto } | null;
  ancho: number;
  alto: number;
  /** Las tapas que pertenecen a hojas de puerta (se pintan en madera). */
  esHoja?: (t: Tapa) => boolean;
}): FiguraVista[] {
  const { cam, ancho: W, alto: H } = params;
  const tanH = Math.tan((cam.hfovDeg * Math.PI) / 360);
  const tanV = Math.tan((cam.vfovDeg * Math.PI) / 360);
  const aCam = (p: Punto, z: number): V3 => {
    const m = marcoCamara(cam, p, z);
    return { a: m.adelante, l: m.lado, u: m.arriba };
  };
  const pantalla = (v: V3): Punto => ({
    x: W / 2 + (v.l / (v.a * tanH)) * (W / 2),
    y: H / 2 - (v.u / (v.a * tanV)) * (H / 2),
  });
  const proyectar = (ps: ReadonlyArray<readonly [number, number, number]>): Punto[] | null => {
    const c = recortar(ps.map(([x, y, z]) => aCam({ x, y }, z)));
    return c.length >= 3 ? c.map(pantalla) : null;
  };

  const fondo: FiguraVista[] = [];
  if (params.piso) {
    const { min, max } = params.piso;
    const margen = 40;
    const terreno = proyectar([
      [min.x - margen, min.y - margen, 0],
      [max.x + margen, min.y - margen, 0],
      [max.x + margen, max.y + margen, 0],
      [min.x - margen, max.y + margen, 0],
    ]);
    if (terreno) fondo.push({ tipo: "terreno", puntos: terreno });
    const piso = proyectar([
      [min.x, min.y, 0],
      [max.x, min.y, 0],
      [max.x, max.y, 0],
      [min.x, max.y, 0],
    ]);
    if (piso) fondo.push({ tipo: "piso", puntos: piso });
  }
  for (const pol of params.coberturaOtras ?? []) {
    const pts = proyectar(pol.puntos.map((p) => [p.x, p.y, 0] as const));
    if (pts) fondo.push({ tipo: "cobertura", nivel: pol.nivel, propia: false, puntos: pts });
  }
  for (const pol of params.coberturaPropia) {
    const pts = proyectar(pol.puntos.map((p) => [p.x, p.y, 0] as const));
    if (pts) fondo.push({ tipo: "cobertura", nivel: pol.nivel, propia: true, puntos: pts });
  }

  // Muros y personas, del más lejano al más cercano (pintor). Los muros se parten en tramos de
  // 1.5 m para que el orden aguante muros largos.
  const conProfundidad: Array<{ d: number; figura: FiguraVista }> = [];
  for (const t of params.tapas) {
    const hoja = params.esHoja?.(t) ?? false;
    const largo = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
    const n = Math.max(1, Math.ceil(largo / 1.5));
    for (let k = 0; k < n; k++) {
      const a = { x: t.a.x + ((t.b.x - t.a.x) * k) / n, y: t.a.y + ((t.b.y - t.a.y) * k) / n };
      const b = { x: t.a.x + ((t.b.x - t.a.x) * (k + 1)) / n, y: t.a.y + ((t.b.y - t.a.y) * (k + 1)) / n };
      const medio = aCam({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, (t.baseM + t.topeM) / 2);
      if (medio.a < CERCA_M) continue;
      const pts = proyectar([
        [a.x, a.y, t.baseM],
        [b.x, b.y, t.baseM],
        [b.x, b.y, t.topeM],
        [a.x, a.y, t.topeM],
      ]);
      if (!pts) continue;
      const frente = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
      conProfundidad.push({
        d: Math.hypot(medio.a, medio.l, medio.u),
        figura: hoja ? { tipo: "hoja", puntos: pts } : { tipo: "muro", frente, puntos: pts },
      });
    }
  }
  const lado = dirRumbo(cam.rumboDeg + 90);
  for (const p of params.personas) {
    const centro = aCam(p, 0.9);
    if (centro.a < 0.3) continue;
    const r = 0.24;
    const izq = { x: p.x - lado.x * r, y: p.y - lado.y * r };
    const der = { x: p.x + lado.x * r, y: p.y + lado.y * r };
    const cuerpo = proyectar([
      [izq.x, izq.y, 0],
      [der.x, der.y, 0],
      [der.x, der.y, 1.45],
      [izq.x, izq.y, 1.45],
    ]);
    const cabeza = aCam(p, 1.6);
    if (!cuerpo || cabeza.a < CERCA_M) continue;
    const c = pantalla(cabeza);
    conProfundidad.push({
      d: Math.hypot(centro.a, centro.l, centro.u) - 0.01,
      figura: { tipo: "persona", puntos: cuerpo, cabeza: { x: c.x, y: c.y, r: (0.13 / (cabeza.a * tanH)) * (W / 2) } },
    });
  }
  conProfundidad.sort((x, y) => y.d - x.d);
  return [...fondo, ...conProfundidad.map((x) => x.figura)];
}

/** Dónde poner la etiqueta de PPM de una persona en la imagen (arriba de su cabeza, sin salirse). */
export function puntoEtiqueta(cam: CamaraM, p: Punto, ancho: number, alto: number, margen = 74): Punto | null {
  const m = marcoCamara(cam, p, 1.9);
  if (m.adelante <= CERCA_M) return null;
  const tanH = Math.tan((cam.hfovDeg * Math.PI) / 360);
  const tanV = Math.tan((cam.vfovDeg * Math.PI) / 360);
  const x = ancho / 2 + (m.lado / (m.adelante * tanH)) * (ancho / 2);
  const y = alto / 2 - (m.arriba / (m.adelante * tanV)) * (alto / 2);
  return { x: Math.min(Math.max(x, margen), ancho - margen), y: Math.min(Math.max(y, 28), alto - 8) };
}
