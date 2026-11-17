/**
 * Selección múltiple, portapapeles y capas bloqueables del dibujo 2D.
 */
import { nuevoId, type Seleccion, type TipoElemento } from "./editor";
import type { CamaraPlano, EquipoPlano, Plano, Punto } from "./plano";

export type IdCapa = "camaras" | "acceso" | "red" | "cable" | "muros";

export type EstadoCapa = { visible: boolean; bloqueada: boolean };

export type CapasEditor = Record<IdCapa, EstadoCapa>;

export const CAPAS_INICIALES: CapasEditor = {
  camaras: { visible: true, bloqueada: false },
  acceso: { visible: true, bloqueada: false },
  red: { visible: true, bloqueada: false },
  cable: { visible: true, bloqueada: false },
  muros: { visible: true, bloqueada: false },
};

export const ETIQUETA_CAPA: Record<IdCapa, string> = {
  camaras: "Cámaras",
  acceso: "Control de acceso",
  red: "Red y equipos",
  cable: "Cable",
  muros: "Muros",
};

const ACCESO: ReadonlySet<string> = new Set(["terminal", "barrera", "sirena", "sismica", "panel"]);
const RED: ReadonlySet<string> = new Set(["nvr", "switch", "servidor", "ups", "gabinete", "generico"]);

export function capaDe(sel: Seleccion, plano: Plano): IdCapa | null {
  if (sel.tipo === "camara") return "camaras";
  if (sel.tipo === "muro" || sel.tipo === "abertura") return "muros";
  if (sel.tipo === "equipo") {
    const e = plano.equipos?.find((x) => x.id === sel.id);
    if (!e) return "red";
    if (ACCESO.has(e.tipo)) return "acceso";
    return "red";
  }
  return null;
}

export function estaBloqueado(sel: Seleccion, plano: Plano, capas: CapasEditor): boolean {
  const capa = capaDe(sel, plano);
  return capa ? capas[capa].bloqueada : false;
}

export function estaVisible(sel: Seleccion, plano: Plano, capas: CapasEditor): boolean {
  const capa = capaDe(sel, plano);
  return capa ? capas[capa].visible : true;
}

/** Une o quita de la selección múltiple (Shift+clic). */
export function alternarEnGrupo(grupo: readonly Seleccion[], sel: Seleccion): Seleccion[] {
  const i = grupo.findIndex((s) => s.tipo === sel.tipo && s.id === sel.id);
  if (i >= 0) return grupo.filter((_, j) => j !== i);
  return [...grupo, sel];
}

/** Elementos cuyo punto cae dentro del rectángulo (px del plano). */
export function seleccionEnRect(
  plano: Plano,
  a: Punto,
  b: Punto,
  capas: CapasEditor,
): Seleccion[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const dentro = (p: Punto) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const out: Seleccion[] = [];
  if (capas.camaras.visible && !capas.camaras.bloqueada) {
    for (const c of plano.camaras) if (dentro(c.pos)) out.push({ tipo: "camara", id: c.id });
  }
  if (capas.red.visible || capas.acceso.visible) {
    for (const e of plano.equipos ?? []) {
      if (e.gabineteId) continue;
      const sel: Seleccion = { tipo: "equipo", id: e.id };
      if (!estaVisible(sel, plano, capas) || estaBloqueado(sel, plano, capas)) continue;
      if (dentro(e.pos)) out.push(sel);
    }
  }
  return out;
}

export type PortapapelesCctv = {
  camaras: CamaraPlano[];
  equipos: EquipoPlano[];
};

export function copiarSeleccion(plano: Plano, sels: readonly Seleccion[]): PortapapelesCctv {
  const idsC = new Set(sels.filter((s) => s.tipo === "camara").map((s) => s.id));
  const idsE = new Set(sels.filter((s) => s.tipo === "equipo").map((s) => s.id));
  return {
    camaras: plano.camaras.filter((c) => idsC.has(c.id)).map((c) => ({ ...c, lentes: c.lentes.map((l) => ({ ...l, optica: { ...l.optica } })) })),
    equipos: (plano.equipos ?? []).filter((e) => idsE.has(e.id)).map((e) => ({ ...e, datos: { ...e.datos } })),
  };
}

/** Pega desplazado 1 m en X e Y; nuevos ids. */
export function pegarPortapapeles(plano: Plano, clip: PortapapelesCctv): { plano: Plano; seleccion: Seleccion[] } {
  const d = 1 / plano.escala.metrosPorPx;
  const camaras: CamaraPlano[] = clip.camaras.map((c) => ({
    ...c,
    id: nuevoId("c"),
    numero: c.numero,
    nombre: c.nombre,
    pos: { x: c.pos.x + d, y: c.pos.y + d },
    lentes: c.lentes.map((l) => ({ ...l, optica: { ...l.optica } })),
  }));
  const equipos: EquipoPlano[] = clip.equipos.map((e) => ({
    ...e,
    id: nuevoId("eq"),
    pos: { x: e.pos.x + d, y: e.pos.y + d },
    datos: { ...e.datos },
  }));
  const seleccion: Seleccion[] = [
    ...camaras.map((c) => ({ tipo: "camara" as const, id: c.id })),
    ...equipos.map((e) => ({ tipo: "equipo" as const, id: e.id })),
  ];
  return {
    plano: {
      ...plano,
      camaras: [...plano.camaras, ...camaras],
      equipos: [...(plano.equipos ?? []), ...equipos],
    },
    seleccion,
  };
}

/** Mueve varios a la vez (delta en px). Respeta capas bloqueadas. */
export function moverVarios(plano: Plano, sels: readonly Seleccion[], delta: Punto, capas: CapasEditor): Plano {
  let p = plano;
  for (const s of sels) {
    if (estaBloqueado(s, p, capas)) continue;
    if (s.tipo === "camara") {
      p = {
        ...p,
        camaras: p.camaras.map((c) => (c.id === s.id ? { ...c, pos: { x: c.pos.x + delta.x, y: c.pos.y + delta.y } } : c)),
      };
    } else if (s.tipo === "equipo") {
      p = {
        ...p,
        equipos: (p.equipos ?? []).map((e) => (e.id === s.id ? { ...e, pos: { x: e.pos.x + delta.x, y: e.pos.y + delta.y } } : e)),
      };
    }
  }
  return p;
}

/** Borra varios. */
export function borrarVarios(plano: Plano, sels: readonly Seleccion[], capas: CapasEditor): Plano {
  const bloq = new Set(sels.filter((s) => estaBloqueado(s, plano, capas)).map((s) => `${s.tipo}:${s.id}`));
  const idsC = new Set(sels.filter((s) => s.tipo === "camara" && !bloq.has(`camara:${s.id}`)).map((s) => s.id));
  const idsE = new Set(sels.filter((s) => s.tipo === "equipo" && !bloq.has(`equipo:${s.id}`)).map((s) => s.id));
  return {
    ...plano,
    camaras: plano.camaras.filter((c) => !idsC.has(c.id)),
    equipos: (plano.equipos ?? []).filter((e) => !idsE.has(e.id)),
  };
}

/** Rumbo con Shift: salta de 15 en 15. */
export function rumboConManija(rumboActual: number, rumboLibre: number, shift: boolean): number {
  let r = ((rumboLibre % 360) + 360) % 360;
  if (shift) r = Math.round(r / 15) * 15 % 360;
  return r;
}

export type { TipoElemento };
