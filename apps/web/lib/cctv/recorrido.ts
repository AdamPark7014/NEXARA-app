/**
 * Caminar por el sitio a la altura de una persona: por dónde se puede pasar, en qué área se está y qué
 * cámaras te ven ahí. Va aparte del motor para probarlo sin WebGL.
 */
import { claveCamara } from "./medidas";
import { ETIQUETA_NIVEL, type NivelCobertura } from "./optica";
import { aMetros, distancia, type Plano, type Punto, type Tapa } from "./plano";
import { camaraEnMetros, leerPersona, type EstadoPersona } from "./visibilidad";

export const ALTURA_OJOS_M = 1.6;
export const RADIO_PERSONA_M = 0.28;

export type Tramo = { a: Punto; b: Punto };

/** Lo que no deja pasar, en metros: los muros menos sus puertas y accesos, y el contorno de lo que estorba. Las ventanas no se cruzan. */
export function tramosDelPlano(plano: Pick<Plano, "muros" | "aberturas" | "obstaculos" | "escala">): Tramo[] {
  const salida: Tramo[] = [];
  for (const muro of plano.muros) {
    const a = aMetros(muro.a, plano.escala);
    const b = aMetros(muro.b, plano.escala);
    const huecos = plano.aberturas
      .filter((h) => h.muroId === muro.id && h.tipo !== "ventana")
      .map((h) => [Math.min(h.desde, h.hasta), Math.max(h.desde, h.hasta)] as const)
      .sort((x, y) => x[0] - y[0]);
    let t = 0;
    const punto = (u: number) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    for (const [desde, hasta] of huecos) {
      if (desde > t) salida.push({ a: punto(t), b: punto(desde) });
      t = Math.max(t, hasta);
    }
    if (t < 1) salida.push({ a: punto(t), b: punto(1) });
  }
  for (const o of plano.obstaculos) {
    const ps = o.puntos.map((p) => aMetros(p, plano.escala));
    ps.forEach((p, i) => salida.push({ a: p, b: ps[(i + 1) % ps.length] }));
  }
  return salida;
}

function masCercano(p: Punto, t: Tramo): Punto {
  const dx = t.b.x - t.a.x;
  const dy = t.b.y - t.a.y;
  const l = dx * dx + dy * dy;
  const u = l ? Math.min(Math.max(((p.x - t.a.x) * dx + (p.y - t.a.y) * dy) / l, 0), 1) : 0;
  return { x: t.a.x + dx * u, y: t.a.y + dy * u };
}

function separar(tramos: readonly Tramo[], p: Punto, radio: number): Punto {
  let q = p;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    let tocó = false;
    for (const t of tramos) {
      const c = masCercano(q, t);
      const d = distancia(q, c);
      if (d >= radio || d < 1e-6) continue;
      q = { x: c.x + ((q.x - c.x) / d) * radio, y: c.y + ((q.y - c.y) / d) * radio };
      tocó = true;
    }
    if (!tocó) break;
  }
  return q;
}

/** ¿Algo corta el paso de `a` a `b`? Aquí un muro no se cruza aunque el paso sea largo. */
function cruza(tramos: readonly Tramo[], a: Punto, b: Punto): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const t of tramos) {
    const ex = t.b.x - t.a.x;
    const ey = t.b.y - t.a.y;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const u = ((t.a.x - a.x) * ey - (t.a.y - a.y) * ex) / det;
    const v = ((t.a.x - a.x) * dy - (t.a.y - a.y) * dx) / det;
    if (u > 0 && u <= 1 && v >= 0 && v <= 1) return true;
  }
  return false;
}

/**
 * A dónde se llega caminando de `desde` a `hacia`: si hay muro, se resbala a lo largo de él en vez de
 * detenerse en seco. Va en pasos cortos, para que ni un cuadro lento atraviese un muro.
 */
export function moverConChoques(tramos: readonly Tramo[], desde: Punto, hacia: Punto, radio = RADIO_PERSONA_M): Punto {
  const largo = distancia(desde, hacia);
  const pasos = Math.max(1, Math.ceil(largo / (radio * 0.7)));
  let q = desde;
  for (let i = 1; i <= pasos; i++) {
    const siguiente = { x: q.x + (hacia.x - desde.x) / pasos, y: q.y + (hacia.y - desde.y) / pasos };
    const fuera = separar(tramos, siguiente, radio);
    if (!cruza(tramos, q, fuera)) q = fuera;
  }
  return q;
}

/** ¿Está el punto dentro del polígono? */
export function dentroDe(p: Punto, poligono: readonly Punto[]): boolean {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) adentro = !adentro;
  }
  return adentro;
}

/** El nombre del área donde se está parado. */
export function areaEn(plano: Pick<Plano, "areas" | "escala">, pos: Punto): string | null {
  const areas = plano.areas ?? [];
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i];
    if (a.nombre && dentroDe(pos, a.puntos.map((p) => aMetros(p, plano.escala)))) return a.nombre;
  }
  return null;
}

export type TeVe = { id: string; clave: string; nombre: string; ppm: number; nivel: NivelCobertura; etiqueta: string; estado: EstadoPersona };

/** Qué cámaras captan a alguien parado aquí, de la que mejor lo ve a la que peor. Es la misma cuenta que la persona de prueba. */
export function camarasQueTeVen(plano: Pick<Plano, "camaras" | "escala">, tapas: readonly Tapa[], pos: Punto): TeVe[] {
  const salida: TeVe[] = [];
  for (const c of plano.camaras) {
    let mejor: TeVe | null = null;
    for (let i = 0; i < c.lentes.length; i++) {
      const cm = camaraEnMetros(c, plano.escala, i);
      if (!cm) continue;
      const l = leerPersona(cm, tapas, pos);
      if (l.estado !== "visible" && l.estado !== "parcial") continue;
      if (!mejor || l.ppm > mejor.ppm) {
        mejor = { id: c.id, clave: claveCamara(c.numero), nombre: c.nombre, ppm: Math.round(l.ppm), nivel: l.nivel, etiqueta: ETIQUETA_NIVEL[l.nivel], estado: l.estado };
      }
    }
    if (mejor) salida.push(mejor);
  }
  return salida.sort((a, b) => b.ppm - a.ppm);
}

export type Parada = { nombre: string; pos: Punto; rumboDeg: number };

const superficie = (ps: readonly Punto[]) => {
  let s = 0;
  ps.forEach((p, i) => {
    const q = ps[(i + 1) % ps.length];
    s += p.x * q.y - q.x * p.y;
  });
  return Math.abs(s) / 2;
};

/** Distancia libre desde `p` en esa dirección, hasta `tope` metros. */
function libreHacia(tramos: readonly Tramo[], p: Punto, rumboDeg: number, tope: number): number {
  const r = (rumboDeg * Math.PI) / 180;
  const dx = Math.sin(r);
  const dy = -Math.cos(r);
  let mejor = tope;
  for (const t of tramos) {
    const ex = t.b.x - t.a.x;
    const ey = t.b.y - t.a.y;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const u = ((t.a.x - p.x) * ey - (t.a.y - p.y) * ex) / det;
    const v = ((t.a.x - p.x) * dy - (t.a.y - p.y) * dx) / det;
    if (u > 0 && u < mejor && v >= 0 && v <= 1) mejor = u;
  }
  return mejor;
}

/**
 * Dónde pararse en una zona para verla bien: el punto con más aire alrededor, mirando hacia donde más
 * se alcanza a ver. En una bodega cae en un pasillo mirando a lo largo, no con la cara en un anaquel.
 */
export function mejorPuntoDe(poligono: readonly Punto[], tramos: readonly Tramo[]): { pos: Punto; rumboDeg: number } {
  const xs = poligono.map((p) => p.x);
  const ys = poligono.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const tope = Math.hypot(x1 - x0, y1 - y0) || 1;
  // El borde de la zona cuenta como muro: se trata de ver la zona, no lo que hay tras su puerta.
  const todos = [...tramos, ...poligono.map((a, i) => ({ a, b: poligono[(i + 1) % poligono.length] }))];
  const holgura = (p: Punto) => todos.reduce((d, t) => Math.min(d, distancia(p, masCercano(p, t))), tope);
  const medir = (p: Punto) => {
    let rumboDeg = 0;
    let vista = -1;
    let suma = 0;
    for (let g = 0; g < 360; g += 45) {
      const libre = libreHacia(todos, p, g, tope);
      suma += libre;
      if (libre > vista) {
        vista = libre;
        rumboDeg = g;
      }
    }
    // Lo que importa es poder ver lejos sin rozar nada, y que no quede pegado a un rincón.
    const nota = Math.min(holgura(p), 1.6) * 3 + suma / 8 + vista * 0.5 - distancia(p, c) * 0.08;
    return { rumboDeg, nota };
  };
  let mejor = { pos: c, rumboDeg: 0, nota: -Infinity };
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 12; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * j) / 12 };
      if (!dentroDe(p, poligono)) continue;
      if (holgura(p) < RADIO_PERSONA_M + 0.2) continue;
      const m = medir(p);
      if (m.nota > mejor.nota) mejor = { pos: p, rumboDeg: m.rumboDeg, nota: m.nota };
    }
  }
  if (mejor.nota === -Infinity) return { pos: separar(tramos, c, RADIO_PERSONA_M + 0.2), rumboDeg: 0 };
  return { pos: mejor.pos, rumboDeg: mejor.rumboDeg };
}

/** Cada área con nombre, de la más grande a la más chica, en un punto donde se pueda estar parado. */
export function paradasDelSitio(plano: Plano, tramos: readonly Tramo[] = tramosDelPlano(plano)): Parada[] {
  return (plano.areas ?? [])
    .filter((a) => a.nombre && a.puntos.length >= 3)
    .map((a) => {
      const ps = a.puntos.map((p) => aMetros(p, plano.escala));
      return { nombre: a.nombre as string, m2: superficie(ps), ...mejorPuntoDe(ps, tramos) };
    })
    .sort((a, b) => b.m2 - a.m2)
    .map(({ nombre, pos, rumboDeg }) => ({ nombre, pos, rumboDeg }));
}

/** Dónde empezar a caminar: en el área principal, o en medio de lo dibujado. */
export function inicioDelRecorrido(plano: Plano, tramos: readonly Tramo[] = tramosDelPlano(plano)): { pos: Punto; rumboDeg: number } {
  const parada = paradasDelSitio(plano, tramos)[0];
  if (parada) return { pos: parada.pos, rumboDeg: parada.rumboDeg };
  const muros = plano.muros.filter((m) => m.tipo !== "reja").flatMap((m) => [aMetros(m.a, plano.escala), aMetros(m.b, plano.escala)]);
  if (!muros.length) return { pos: { x: 0, y: 0 }, rumboDeg: 0 };
  const xs = muros.map((p) => p.x);
  const ys = muros.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return mejorPuntoDe([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], tramos);
}
