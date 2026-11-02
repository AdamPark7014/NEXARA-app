/**
 * El imán de lo que se instala en un muro: una cámara va pegada a una esquina o a un muro, no flotando a
 * unos centímetros. Se calcula de un solo lado, el del puntero, para que quede adentro del cuarto donde se
 * está trabajando y mirando hacia él. Con Alt se suelta y queda donde se deje.
 */
import { actualizarCamara, actualizarEquipo, DE_MURO, puertaCercana } from "./editor";
import { distancia, dirRumbo, rumboEntre, type Plano, type Punto, type CamaraPlano } from "./plano";

/** Qué tanto se acerca el puntero antes de pegarse. Quien llama lo sube cuando el plano se ve de lejos. */
export const RADIO_PEGADO_M = 0.9;
const DESPEGUE_M = 0.04;
/** Cuánto se puede salir un muro de su largo y seguir contando como esquina (los muros rara vez cierran exacto). */
const HOLGURA_ESQUINA_M = 0.35;

export type Pegado = {
  /** Dónde queda, en px del plano. */
  pos: Punto;
  /** Hacia dónde mira: al centro de la esquina o de frente al muro. */
  rumboDeg: number;
  tipo: "esquina" | "muro";
  /** Más alto que el muro no se puede montar. */
  alturaMaxM: number;
  /** Hacia dónde está el cuarto, por cada muro. */
  normales: Punto[];
};

type MuroCerca = { a: Punto; u: Punto; n: Punto; largo: number; t: number; d: number; g: number; alturaM: number };

function murosCerca(plano: Pick<Plano, "muros" | "escala">, q: Punto, radioM: number): MuroCerca[] {
  const k = plano.escala.metrosPorPx;
  const salida: MuroCerca[] = [];
  for (const m of plano.muros) {
    if (m.tipo === "reja") continue;
    const a = { x: m.a.x * k, y: m.a.y * k };
    const b = { x: m.b.x * k, y: m.b.y * k };
    const largo = distancia(a, b);
    if (largo < 1e-3) continue;
    const u = { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo };
    const t = (q.x - a.x) * u.x + (q.y - a.y) * u.y;
    const tRecortado = Math.min(Math.max(t, 0), largo);
    const d = distancia(q, { x: a.x + u.x * tRecortado, y: a.y + u.y * tRecortado });
    if (d > radioM + m.grosorM / 2) continue;
    const lado = (q.x - a.x) * -u.y + (q.y - a.y) * u.x;
    salida.push({ a, u, n: lado >= 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x }, largo, t: tRecortado, d, g: m.grosorM, alturaM: m.alturaM });
  }
  return salida.sort((x, y) => x.d - y.d);
}

const rumboDe = (d: Punto) => Math.round(rumboEntre({ x: 0, y: 0 }, d) * 10) / 10;

/** La esquina de adentro entre dos muros, si los dos llegan a ella y el puntero está de ese lado. */
function esquinaEntre(m1: MuroCerca, m2: MuroCerca, q: Punto, radioM: number, despegue: number): { pos: Punto; centro: Punto } | null {
  const cruz = m1.u.x * m2.u.y - m1.u.y * m2.u.x;
  if (Math.abs(cruz) < 0.2) return null;
  // Donde se cruzan sus ejes.
  const w = { x: m2.a.x - m1.a.x, y: m2.a.y - m1.a.y };
  const t1 = (w.x * m2.u.y - w.y * m2.u.x) / cruz;
  const t2 = (w.x * m1.u.y - w.y * m1.u.x) / cruz;
  if (t1 < -HOLGURA_ESQUINA_M || t1 > m1.largo + HOLGURA_ESQUINA_M || t2 < -HOLGURA_ESQUINA_M || t2 > m2.largo + HOLGURA_ESQUINA_M) return null;
  const centro = { x: m1.a.x + m1.u.x * t1, y: m1.a.y + m1.u.y * t1 };
  if (distancia(q, centro) > radioM) return null;
  // Donde se cruzan sus caras, del lado del puntero.
  const o1 = m1.g / 2 + despegue;
  const o2 = m2.g / 2 + despegue;
  const a1 = { x: m1.a.x + m1.n.x * o1, y: m1.a.y + m1.n.y * o1 };
  const a2 = { x: m2.a.x + m2.n.x * o2, y: m2.a.y + m2.n.y * o2 };
  const v = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = (v.x * m2.u.y - v.y * m2.u.x) / cruz;
  const pos = { x: a1.x + m1.u.x * s, y: a1.y + m1.u.y * s };
  // Por fuera de una esquina no hay dónde apoyarse: ahí el punto cae más allá de donde acaban los muros.
  const sobre = (m: MuroCerca) => {
    const r = (pos.x - m.a.x) * m.u.x + (pos.y - m.a.y) * m.u.y;
    return r >= -0.01 && r <= m.largo + 0.01;
  };
  return sobre(m1) && sobre(m2) ? { pos, centro } : null;
}

export function pegarAMuros(plano: Pick<Plano, "muros" | "escala">, p: Punto, opciones: { radioM?: number; soloMuro?: boolean; despegueM?: number } = {}): Pegado | null {
  const k = plano.escala.metrosPorPx;
  const radioM = opciones.radioM ?? RADIO_PEGADO_M;
  const despegue = opciones.despegueM ?? DESPEGUE_M;
  const q = { x: p.x * k, y: p.y * k };
  const cerca = murosCerca(plano, q, radioM);
  if (!cerca.length) return null;
  const aPx = (m: Punto) => ({ x: m.x / k, y: m.y / k });
  if (!opciones.soloMuro) {
    let mejor: { pos: Punto; d: number; m1: MuroCerca; m2: MuroCerca } | null = null;
    for (let i = 0; i < cerca.length; i++) {
      for (let j = i + 1; j < cerca.length; j++) {
        const e = esquinaEntre(cerca[i], cerca[j], q, radioM, despegue);
        const d = e ? distancia(q, e.centro) : Infinity;
        if (e && (!mejor || d < mejor.d)) mejor = { pos: e.pos, d, m1: cerca[i], m2: cerca[j] };
      }
    }
    if (mejor) {
      const b = { x: mejor.m1.n.x + mejor.m2.n.x, y: mejor.m1.n.y + mejor.m2.n.y };
      return { pos: aPx(mejor.pos), rumboDeg: rumboDe(b), tipo: "esquina", alturaMaxM: Math.min(mejor.m1.alturaM, mejor.m2.alturaM) - 0.15, normales: [mejor.m1.n, mejor.m2.n] };
    }
  }
  const m = cerca[0];
  // Al muro se pega con menos distancia: si no, todo lo que pasa cerca se quedaría pegado.
  if (m.d > radioM * 0.7 + m.g / 2) return null;
  const o = m.g / 2 + despegue;
  return {
    pos: aPx({ x: m.a.x + m.u.x * m.t + m.n.x * o, y: m.a.y + m.u.y * m.t + m.n.y * o }),
    rumboDeg: rumboDe(m.n),
    tipo: "muro",
    alturaMaxM: m.alturaM - 0.15,
    normales: [m.n],
  };
}

/**
 * Al mover una cámara ya apuntada se respeta hacia dónde miraba, si desde ahí todavía ve al cuarto.
 * Si quedaría viendo el muro, voltea hacia el cuarto.
 */
export function rumboAlPegar(rumboActualDeg: number, pegado: Pick<Pegado, "rumboDeg" | "normales">): number {
  const d = dirRumbo(rumboActualDeg);
  return pegado.normales.every((n) => n.x * d.x + n.y * d.y > 0.17) ? rumboActualDeg : pegado.rumboDeg;
}

export function moverCamaraPegada(plano: Plano, id: string, p: Punto, opciones: { radioM?: number; libre?: boolean } = {}): { plano: Plano; pegado: Pegado | null } {
  const c = plano.camaras.find((x) => x.id === id);
  if (!c) return { plano, pegado: null };
  const pegado = opciones.libre || c.montaje === "poste" || c.montaje === "techo" ? null : pegarAMuros(plano, p, { radioM: opciones.radioM });
  if (!pegado) return { plano: actualizarCamara(plano, id, { pos: p }), pegado: null };
  return {
    plano: actualizarCamara(plano, id, { pos: pegado.pos, rumboDeg: rumboAlPegar(c.rumboDeg, pegado), alturaM: Math.min(c.alturaM, Math.round(pegado.alturaMaxM * 10) / 10) }),
    pegado,
  };
}

/** Lo que se instala en un muro (terminal, sirena, alerta) se queda en el muro; lo demás se mueve libre. */
export function moverEquipoPegado(plano: Plano, id: string, p: Punto, opciones: { radioM?: number; libre?: boolean } = {}): { plano: Plano; pegado: Pegado | null } {
  const e = plano.equipos?.find((x) => x.id === id);
  if (!e) return { plano, pegado: null };
  const pegado = !opciones.libre && DE_MURO.has(e.tipo) ? pegarAMuros(plano, p, { radioM: opciones.radioM, soloMuro: true, despegueM: 0 }) : null;
  const pos = pegado?.pos ?? p;
  const cambios = { pos, ...(pegado ? { rumboDeg: Math.round(pegado.rumboDeg) } : {}), ...(e.tipo === "terminal" ? { puertaId: puertaCercana(plano, pos) } : {}) };
  // Lo que va adentro de un gabinete viaja con él.
  const conHijos = plano.equipos?.some((x) => x.gabineteId === id) ? { ...plano, equipos: (plano.equipos ?? []).map((x) => (x.gabineteId === id ? { ...x, pos } : x)) } : plano;
  return { plano: actualizarEquipo(conHijos, id, cambios), pegado };
}

/** Dónde y cómo queda una cámara nueva al ponerla ahí. */
export function lugarParaCamara(plano: Pick<Plano, "muros" | "escala">, p: Punto, opciones: { radioM?: number; libre?: boolean; alturaM?: number } = {}): { pos: Punto; extra: Partial<CamaraPlano>; pegado: Pegado | null } {
  const pegado = opciones.libre ? null : pegarAMuros(plano, p, { radioM: opciones.radioM });
  const alturaM = opciones.alturaM ?? 3;
  if (!pegado) return { pos: p, extra: opciones.alturaM != null ? { alturaM } : {}, pegado: null };
  return { pos: pegado.pos, extra: { rumboDeg: pegado.rumboDeg, alturaM: Math.min(alturaM, Math.round(pegado.alturaMaxM * 10) / 10) }, pegado };
}
