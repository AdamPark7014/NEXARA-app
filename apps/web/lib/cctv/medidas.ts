/**
 * Medidas del sitio en metros, sin dependencias de dibujo: las usan la maqueta 3D y el plano técnico.
 */
import { aMetros, type Plano, type Punto } from "./plano";
import type { PoligonoCobertura } from "./visibilidad";

export type Limites = { min: Punto; max: Punto };

export function cajaDe(ps: readonly Punto[]): Limites {
  return {
    min: { x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) },
    max: { x: Math.max(...ps.map((p) => p.x)), y: Math.max(...ps.map((p) => p.y)) },
  };
}

export function unirLimites(ls: readonly Limites[]): Limites {
  return cajaDe(ls.flatMap((l) => [l.min, l.max]));
}

/** Rectángulo de los muros en metros (el edificio, sin patio). */
export function limitesEdificio(plano: Plano): Limites | null {
  const ps = plano.muros.flatMap((m) => [aMetros(m.a, plano.escala), aMetros(m.b, plano.escala)]);
  return ps.length ? cajaDe(ps) : null;
}

/** Todo lo que debe caber: muros, cámaras, áreas, ambientación y hasta dónde llegan los conos. */
export function limitesSitio(plano: Plano, coberturas?: ReadonlyMap<string, PoligonoCobertura[]>): Limites {
  const k = plano.escala.metrosPorPx;
  const ps: Punto[] = [];
  for (const m of plano.muros) ps.push(aMetros(m.a, plano.escala), aMetros(m.b, plano.escala));
  for (const c of plano.camaras) ps.push(aMetros(c.pos, plano.escala));
  for (const h of plano.personas) ps.push(aMetros(h.pos, plano.escala));
  for (const o of plano.obstaculos) for (const p of o.puntos) ps.push(aMetros(p, plano.escala));
  for (const a of plano.areas ?? []) for (const p of a.puntos) ps.push(aMetros(p, plano.escala));
  for (const m of plano.muebles ?? []) ps.push({ x: m.pos.x * k, y: m.pos.y * k });
  if (!ps.length) return { min: { x: 0, y: 0 }, max: { x: 20, y: 12 } };
  const base = cajaDe(ps);
  // Un cono largo no debe volver enorme la base: se admite hasta 40 m más allá del edificio.
  if (coberturas) {
    const conos: Punto[] = [];
    for (const pols of coberturas.values()) for (const pol of pols) conos.push(...pol.puntos);
    if (conos.length) {
      const c = cajaDe(conos);
      base.min = { x: Math.min(base.min.x, Math.max(c.min.x, base.min.x - 40)), y: Math.min(base.min.y, Math.max(c.min.y, base.min.y - 40)) };
      base.max = { x: Math.max(base.max.x, Math.min(c.max.x, base.max.x + 40)), y: Math.max(base.max.y, Math.min(c.max.y, base.max.y + 40)) };
    }
  }
  return base;
}

/** «CAM-07»: la clave de la cámara en la maqueta y el plano técnico. */
export function claveCamara(numero: number): string {
  return `CAM-${String(numero).padStart(2, "0")}`;
}

/** ¿Hay WebGL2 en este navegador? Sin él, el editor usa la vista SVG. */
export function hayWebGL(): boolean {
  if (typeof document === "undefined" || typeof WebGL2RenderingContext === "undefined") return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
