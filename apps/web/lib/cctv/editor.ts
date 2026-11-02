/**
 * Operaciones del editor del Diseñador de videovigilancia sobre el `Plano` (en px del croquis):
 * dibujar muros con imán, poner puertas y ventanas sobre un muro, colocar y apuntar cámaras,
 * mover, borrar, calibrar y el resumen que se guarda con el diseño. Todas son puras: reciben un
 * plano y devuelven otro, así el deshacer es una pila de planos.
 */
import { claveEquipo } from "./medidas";
import { MODELO_GENERICO, PREFIJO_TIPO, TIPOS_DE_RACK, etiquetaModelo, type ModeloCamara, type ModeloEquipo, type TipoEquipo } from "./catalogo";
import { almacenamientoTB, anchoBandaMbps, type Grabacion, GRABACION_POR_OMISION } from "./infraestructura";
import { RESOLUCIONES, alcancesDori, hfovDeg, inclinacionHacia } from "./optica";
import {
  calibrar,
  distancia,
  rumboEntre,
  siguienteNumero,
  tapasDelPlano,
  type Abertura,
  type Area,
  type CamaraPlano,
  type EquipoPlano,
  type MaterialPiso,
  type Mueble,
  type Muro,
  type Obstaculo,
  type Plano,
  type Punto,
  type TipoMueble,
} from "./plano";
import { camaraEnMetros, repartoDeArea } from "./visibilidad";
import { nuevoId } from "./ids";
import { listaNiveles } from "./niveles";

export type TipoElemento = "muro" | "abertura" | "obstaculo" | "etiqueta" | "cota" | "camara" | "persona" | "area" | "mueble" | "equipo";
export type Seleccion = { tipo: TipoElemento; id: string };

export { nuevoId };

const pxDe = (plano: Plano, metros: number) => metros / plano.escala.metrosPorPx;
const mDe = (plano: Plano, px: number) => px * plano.escala.metrosPorPx;

/* ── Imán ───────────────────────────────────────────────────────────────────────── */

/** Extremos de todos los muros (para engancharse a ellos al dibujar). */
export function extremosDeMuros(plano: Plano, excepto?: string): Punto[] {
  return plano.muros.filter((m) => m.id !== excepto).flatMap((m) => [m.a, m.b]);
}

/**
 * Ajusta un punto mientras se dibuja: primero se engancha al extremo de un muro cercano (a
 * `radioPx` en pantalla, que se pasa ya convertido a px del plano); si no, y hay un punto de
 * partida, endereza a 0°, 45° o 90° cuando el trazo cae a menos de 6° de esos ángulos.
 */
export function ajustarPunto(
  plano: Plano,
  p: Punto,
  opciones: { radio: number; desde?: Punto | null; exceptoMuro?: string; libre?: boolean },
): { punto: Punto; enganche: "extremo" | "angulo" | null } {
  if (opciones.libre) return { punto: p, enganche: null };
  let mejor: Punto | null = null;
  let mejorD = opciones.radio;
  for (const q of extremosDeMuros(plano, opciones.exceptoMuro)) {
    const d = distancia(p, q);
    if (d <= mejorD) {
      mejor = q;
      mejorD = d;
    }
  }
  if (mejor) return { punto: { ...mejor }, enganche: "extremo" };
  const desde = opciones.desde;
  if (desde) {
    const largo = distancia(desde, p);
    if (largo > 0) {
      const ang = (Math.atan2(p.y - desde.y, p.x - desde.x) * 180) / Math.PI;
      const recto = Math.round(ang / 45) * 45;
      if (Math.abs(ang - recto) <= 6) {
        const r = (recto * Math.PI) / 180;
        return { punto: { x: desde.x + Math.cos(r) * largo, y: desde.y + Math.sin(r) * largo }, enganche: "angulo" };
      }
    }
  }
  return { punto: p, enganche: null };
}

/** El muro más cercano a un punto, con la fracción a lo largo del muro (0 en `a`, 1 en `b`). */
export function muroMasCercano(plano: Plano, p: Punto, maxPx: number): { muro: Muro; t: number; dist: number } | null {
  let mejor: { muro: Muro; t: number; dist: number } | null = null;
  for (const m of plano.muros) {
    const ab = { x: m.b.x - m.a.x, y: m.b.y - m.a.y };
    const l2 = ab.x ** 2 + ab.y ** 2;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - m.a.x) * ab.x + (p.y - m.a.y) * ab.y) / l2));
    const d = distancia(p, { x: m.a.x + ab.x * t, y: m.a.y + ab.y * t });
    if (d <= maxPx && (!mejor || d < mejor.dist)) mejor = { muro: m, t, dist: d };
  }
  return mejor;
}

/* ── Muros, aberturas y obstáculos ─────────────────────────────────────────────── */

export const ALTURA_MURO_M = 2.8;
export const GROSOR_MURO_M = 0.15;

export function agregarMuro(plano: Plano, a: Punto, b: Punto, extra: Partial<Muro> = {}): { plano: Plano; muro: Muro | null } {
  if (mDe(plano, distancia(a, b)) < 0.1) return { plano, muro: null };
  const muro: Muro = {
    id: nuevoId("m"),
    a,
    b,
    alturaM: ALTURA_MURO_M,
    grosorM: GROSOR_MURO_M,
    tipo: "muro",
    ...extra,
  };
  return { plano: { ...plano, muros: [...plano.muros, muro] }, muro };
}

/** Ancho por omisión de cada hueco (m). */
export const ANCHO_ABERTURA_M: Readonly<Record<Abertura["tipo"], number>> = { puerta: 0.9, ventana: 1.2, acceso: 3 };

/**
 * Pone una puerta, ventana o acceso centrado en `t` del muro, con su ancho por omisión.
 * Se recorta a los extremos del muro y no se deja encimar con otra abertura.
 */
export function agregarAbertura(
  plano: Plano,
  muroId: string,
  t: number,
  tipo: Abertura["tipo"],
): { plano: Plano; abertura: Abertura | null; error?: string } {
  const muro = plano.muros.find((m) => m.id === muroId);
  if (!muro) return { plano, abertura: null, error: "Ese muro ya no existe." };
  const largoM = mDe(plano, distancia(muro.a, muro.b));
  const anchoM = Math.min(ANCHO_ABERTURA_M[tipo], largoM * 0.9);
  const mitad = anchoM / largoM / 2;
  const centro = Math.min(Math.max(t, mitad), 1 - mitad);
  const desde = centro - mitad;
  const hasta = centro + mitad;
  if (plano.aberturas.some((o) => o.muroId === muroId && o.desde < hasta && o.hasta > desde)) {
    return { plano, abertura: null, error: "Ahí ya hay otra abertura en ese muro." };
  }
  const altura = tipo === "ventana" ? Math.min(1.2, muro.alturaM - 1) : tipo === "acceso" ? Math.min(4.5, muro.alturaM) : Math.min(2.1, muro.alturaM);
  const abertura: Abertura = {
    id: nuevoId(tipo === "puerta" ? "pu" : tipo === "ventana" ? "ve" : "ac"),
    muroId,
    tipo,
    desde,
    hasta,
    baseM: tipo === "ventana" ? Math.min(1, Math.max(muro.alturaM - altura, 0)) : 0,
    alturaM: Math.max(altura, 0.1),
    abierta: true,
    transparente: tipo === "ventana",
    hojas: 1,
    bisagra: "inicio",
    sentido: 1,
  };
  return { plano: { ...plano, aberturas: [...plano.aberturas, abertura] }, abertura };
}

/** Rectángulo de obstáculo (anaquel, columna, rack) entre dos esquinas. */
export function agregarObstaculo(plano: Plano, a: Punto, b: Punto, alturaM = 2.4): { plano: Plano; obstaculo: Obstaculo | null } {
  if (mDe(plano, Math.abs(b.x - a.x)) < 0.1 || mDe(plano, Math.abs(b.y - a.y)) < 0.1) return { plano, obstaculo: null };
  const obstaculo: Obstaculo = {
    id: nuevoId("ob"),
    nombre: "Obstáculo",
    puntos: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }],
    alturaM,
  };
  return { plano: { ...plano, obstaculos: [...plano.obstaculos, obstaculo] }, obstaculo };
}

/** Rectángulo de área con su piso, entre dos esquinas. */
export function agregarArea(plano: Plano, a: Punto, b: Punto, piso: MaterialPiso = "concreto"): { plano: Plano; area: Area | null } {
  if (mDe(plano, Math.abs(b.x - a.x)) < 0.3 || mDe(plano, Math.abs(b.y - a.y)) < 0.3) return { plano, area: null };
  const area: Area = { id: nuevoId("ar"), nombre: null, piso, puntos: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] };
  return { plano: { ...plano, areas: [...(plano.areas ?? []), area] }, area };
}

export function agregarMueble(plano: Plano, pos: Punto, tipo: TipoMueble, rumboDeg = 180): { plano: Plano; mueble: Mueble } {
  const mueble: Mueble = { id: nuevoId("mu"), tipo, pos, rumboDeg };
  return { plano: { ...plano, muebles: [...(plano.muebles ?? []), mueble] }, mueble };
}

/* ── Equipos que no son cámara ─────────────────────────────────────────────────── */

/** Altura típica de instalación de cada tipo. */
const ALTURA_EQUIPO: Readonly<Record<TipoEquipo, number>> = {
  nvr: 0,
  switch: 0,
  servidor: 0,
  ups: 0,
  gabinete: 0,
  terminal: 1.15,
  barrera: 0,
  sirena: 2.2,
  sismica: 1.9,
  panel: 1.5,
  generico: 1.5,
};

export const DE_MURO: ReadonlySet<TipoEquipo> = new Set<TipoEquipo>(["terminal", "sirena", "sismica", "panel", "generico"]);

/** Siguiente número libre para ese prefijo en todo el edificio: los AC y los GAB llevan cuenta aparte. */
export function siguienteNumeroEquipo(raiz: Plano, tipo: TipoEquipo): number {
  const prefijo = PREFIJO_TIPO[tipo];
  let mayor = 0;
  for (const { plano } of listaNiveles(raiz)) {
    for (const e of plano.equipos ?? []) if (PREFIJO_TIPO[e.tipo] === prefijo) mayor = Math.max(mayor, e.numero);
  }
  return mayor + 1;
}

export function equiposDelGabinete(plano: Plano, gabineteId: string): EquipoPlano[] {
  return (plano.equipos ?? []).filter((e) => e.gabineteId === gabineteId).sort((a, b) => (b.unidad ?? 0) - (a.unidad ?? 0));
}

const unidadesDe = (e: Pick<EquipoPlano, "datos">) => Math.max(1, Math.round(e.datos.unidades ?? 1));

/** La unidad libre más alta donde cabe un equipo de ese alto. Null si ya no cabe. */
export function unidadLibre(plano: Plano, gabinete: EquipoPlano, alto: number, excepto?: string): number | null {
  const total = unidadesDe(gabinete);
  const ocupadas = new Set<number>();
  for (const e of equiposDelGabinete(plano, gabinete.id)) {
    if (e.id === excepto || e.unidad == null) continue;
    for (let u = 0; u < unidadesDe(e); u++) ocupadas.add(e.unidad + u);
  }
  // Se deja libre la de arriba de todo, para el organizador de cable.
  for (let u = total - alto; u >= 1; u--) {
    let cabe = true;
    for (let i = 0; i < alto; i++) if (ocupadas.has(u + i)) cabe = false;
    if (cabe) return u;
  }
  return null;
}

/** El gabinete más cercano de este nivel. */
export function gabineteCercano(plano: Plano, pos: Punto): EquipoPlano | null {
  let mejor: EquipoPlano | null = null;
  let d = Infinity;
  for (const e of plano.equipos ?? []) {
    if (e.tipo !== "gabinete") continue;
    const x = distancia(e.pos, pos);
    if (x < d) {
      d = x;
      mejor = e;
    }
  }
  return mejor;
}

/** La puerta más cercana, a menos de `maxM` metros. Con ella se liga una terminal de acceso. */
export function puertaCercana(plano: Plano, pos: Punto, maxM = 3): string | null {
  let mejor: string | null = null;
  let d = maxM / plano.escala.metrosPorPx;
  for (const a of plano.aberturas) {
    if (a.tipo !== "puerta") continue;
    const m = plano.muros.find((x) => x.id === a.muroId);
    if (!m) continue;
    const t = (a.desde + a.hasta) / 2;
    const x = distancia(pos, { x: m.a.x + (m.b.x - m.a.x) * t, y: m.a.y + (m.b.y - m.a.y) * t });
    if (x < d) {
      d = x;
      mejor = a.id;
    }
  }
  return mejor;
}

/**
 * Coloca un equipo con el comportamiento de su tipo:
 * - los de rack entran al gabinete que haya, en la unidad libre más alta;
 * - los de muro se pegan al muro cercano y miran hacia donde se tocó;
 * - la terminal se liga a la puerta más cercana.
 */
export function agregarEquipo(plano: Plano, pos: Punto, modelo: ModeloEquipo, numero: number): { plano: Plano; equipo: EquipoPlano } {
  const base: EquipoPlano = {
    id: nuevoId("eq"),
    numero,
    tipo: modelo.tipo,
    nombre: modelo.modelo,
    productoId: modelo.id,
    modelo: etiquetaModelo(modelo),
    pos,
    rumboDeg: 180,
    alturaM: ALTURA_EQUIPO[modelo.tipo] ?? 1.5,
    // Pocas fichas dicen hasta dónde se escucha: sin ese dato se usa un estimado, editable y dicho como tal.
    datos: { ...modelo.datos, ...((modelo.tipo === "sirena" || modelo.tipo === "sismica") && !modelo.datos.alcanceM ? { alcanceM: 20 } : {}) },
  };
  let equipo = base;
  if (TIPOS_DE_RACK.has(modelo.tipo)) {
    const g = gabineteCercano(plano, pos);
    const u = g ? unidadLibre(plano, g, unidadesDe(base)) : null;
    if (g && u != null) equipo = { ...base, gabineteId: g.id, unidad: u, pos: { ...g.pos }, rumboDeg: g.rumboDeg, alturaM: 0 };
  } else if (DE_MURO.has(modelo.tipo)) {
    const cerca = muroMasCercano(plano, pos, 1 / plano.escala.metrosPorPx);
    if (cerca && cerca.muro.tipo === "muro") {
      const m = cerca.muro;
      const p = { x: m.a.x + (m.b.x - m.a.x) * cerca.t, y: m.a.y + (m.b.y - m.a.y) * cerca.t };
      const largo = distancia(m.a, m.b);
      let n = { x: -(m.b.y - m.a.y) / largo, y: (m.b.x - m.a.x) / largo };
      if ((pos.x - p.x) * n.x + (pos.y - p.y) * n.y < 0) n = { x: -n.x, y: -n.y };
      const cara = pxDe(plano, m.grosorM / 2);
      equipo = { ...base, pos: { x: p.x + n.x * cara, y: p.y + n.y * cara }, rumboDeg: Math.round(rumboEntre({ x: 0, y: 0 }, n)) };
    }
    if (modelo.tipo === "terminal") equipo = { ...equipo, puertaId: puertaCercana(plano, equipo.pos) };
  }
  const conEquipo = { ...plano, equipos: [...(plano.equipos ?? []), equipo] };
  // Lo que quedó suelto esperando gabinete, entra al que se acaba de poner.
  return { plano: modelo.tipo === "gabinete" ? montarSueltos(conEquipo, equipo) : conEquipo, equipo };
}

/** Qué pasó al colocar un equipo, cuando no se ve a simple vista. */
export function avisoDeEquipo(plano: Plano, equipo: EquipoPlano): string | null {
  if (TIPOS_DE_RACK.has(equipo.tipo)) {
    if (equipo.gabineteId) {
      const g = (plano.equipos ?? []).find((e) => e.id === equipo.gabineteId);
      return `${equipo.nombre} entró a ${g ? claveEquipo(g) : "el gabinete"}, unidad ${equipo.unidad}.`;
    }
    return gabineteCercano(plano, equipo.pos) ? "Ya no cabe en el gabinete: quedó suelto a un lado." : "Cuando pongas un gabinete, este equipo entra solo.";
  }
  if (equipo.tipo === "gabinete") {
    const dentro = equiposDelGabinete(plano, equipo.id).length;
    return dentro ? `${dentro} ${dentro === 1 ? "equipo entró" : "equipos entraron"} a ${claveEquipo(equipo)}.` : null;
  }
  if (equipo.tipo === "terminal") return equipo.puertaId ? "Quedó ligada a la puerta más cercana." : "No hay puerta cerca: elige la que controla en el panel.";
  return null;
}

/** Sube o baja un equipo dentro de su gabinete, si no choca con otro. */
export function moverEnGabinete(plano: Plano, id: string, unidad: number): Plano {
  const e = (plano.equipos ?? []).find((x) => x.id === id);
  const g = e?.gabineteId ? (plano.equipos ?? []).find((x) => x.id === e.gabineteId) : null;
  if (!e || !g) return plano;
  const alto = unidadesDe(e);
  if (unidad < 1 || unidad + alto - 1 > unidadesDe(g)) return plano;
  for (const o of equiposDelGabinete(plano, g.id)) {
    if (o.id === id || o.unidad == null) continue;
    if (unidad < o.unidad + unidadesDe(o) && o.unidad < unidad + alto) return plano;
  }
  return actualizarEquipo(plano, id, { unidad });
}

/** Mete al gabinete un equipo que estaba suelto. */
export function montarEnGabinete(plano: Plano, id: string, gabineteId: string): { plano: Plano; error?: string } {
  const e = (plano.equipos ?? []).find((x) => x.id === id);
  const g = (plano.equipos ?? []).find((x) => x.id === gabineteId);
  if (!e || !g) return { plano };
  const u = unidadLibre(plano, g, unidadesDe(e), id);
  if (u == null) return { plano, error: `Ya no cabe en ${claveEquipo(g)}.` };
  return { plano: actualizarEquipo(plano, id, { gabineteId, unidad: u, pos: { ...g.pos }, rumboDeg: g.rumboDeg, alturaM: 0 }) };
}

export function actualizarEquipo(plano: Plano, id: string, cambios: Partial<EquipoPlano>): Plano {
  return { ...plano, equipos: (plano.equipos ?? []).map((e) => (e.id === id ? { ...e, ...cambios } : e)) };
}

/** Saca un equipo del gabinete: queda suelto junto a él. */
export function sacarDelGabinete(plano: Plano, id: string): Plano {
  const e = (plano.equipos ?? []).find((x) => x.id === id);
  if (!e?.gabineteId) return plano;
  const separacion = pxDe(plano, 1);
  return actualizarEquipo(plano, id, { gabineteId: null, unidad: null, pos: { x: e.pos.x + separacion, y: e.pos.y } });
}

/** Monta en el gabinete lo que quedó suelto. Lo que ya no cabe sigue suelto. */
export function montarSueltos(plano: Plano, gabinete: EquipoPlano): Plano {
  let actual = plano;
  for (const e of plano.equipos ?? []) {
    if (!TIPOS_DE_RACK.has(e.tipo) || e.gabineteId) continue;
    const u = unidadLibre(actual, gabinete, unidadesDe(e));
    if (u != null) actual = actualizarEquipo(actual, e.id, { gabineteId: gabinete.id, unidad: u, pos: { ...gabinete.pos }, rumboDeg: gabinete.rumboDeg, alturaM: 0 });
  }
  return actual;
}

export function agregarEtiqueta(plano: Plano, pos: Punto, texto: string): Plano {
  const limpio = texto.trim();
  if (!limpio) return plano;
  return { ...plano, etiquetas: [...plano.etiquetas, { id: nuevoId("et"), texto: limpio, pos }] };
}

/** Recalibra con una cota y la deja dibujada. Null si la medida no sirve. */
export function calibrarPlano(plano: Plano, a: Punto, b: Punto, metros: number): Plano | null {
  const escala = calibrar(a, b, metros);
  if (!escala) return null;
  const texto = metros.toFixed(2);
  return { ...plano, escala, cotas: [...plano.cotas, { id: nuevoId("co"), a, b, texto }] };
}

/** Cambia de un golpe la altura de todos los muros que hoy miden `desdeM` (p. ej. divisorias de 2.8 → 3). */
export function cambiarAlturaEnLote(plano: Plano, desdeM: number, hastaM: number): Plano {
  if (!(hastaM > 0)) return plano;
  const iguales = (x: number) => Math.abs(x - desdeM) < 0.005;
  return {
    ...plano,
    muros: plano.muros.map((m) => (iguales(m.alturaM) ? { ...m, alturaM: hastaM } : m)),
    aberturas: plano.aberturas.map((ab) => {
      const m = plano.muros.find((x) => x.id === ab.muroId);
      if (!m || !iguales(m.alturaM)) return ab;
      const alturaM = Math.min(ab.alturaM, hastaM - ab.baseM);
      return alturaM > 0.1 ? { ...ab, alturaM } : ab;
    }),
  };
}

/** Grupos de altura de los muros (para «Cambiar en lote»): `[{ alturaM: 5, muros: 4 }, …]`. */
export function gruposDeAltura(plano: Plano): Array<{ alturaM: number; muros: number }> {
  const conteo = new Map<number, number>();
  for (const m of plano.muros) {
    const h = Math.round(m.alturaM * 100) / 100;
    conteo.set(h, (conteo.get(h) ?? 0) + 1);
  }
  return [...conteo.entries()].map(([alturaM, muros]) => ({ alturaM, muros })).sort((a, b) => b.alturaM - a.alturaM);
}

/* ── Cámaras y personas ─────────────────────────────────────────────────────────── */

/** Largo de cono que se propone al colocar: la detección o 15 m, lo que sea menor. */
export function distanciaInicial(modelo: ModeloCamara): number {
  const h = hfovDeg(modelo.optica);
  if (h == null) return 12;
  return Math.round(Math.min(alcancesDori(modelo.optica.pxHoriz, h).deteccion, 15) * 10) / 10;
}

export function agregarCamara(
  plano: Plano,
  pos: Punto,
  modelo: ModeloCamara = MODELO_GENERICO,
  extra: Partial<CamaraPlano> = {},
): { plano: Plano; camara: CamaraPlano } {
  const numero = siguienteNumero(plano.camaras);
  const alturaM = extra.alturaM ?? 3;
  const distanciaM = extra.distanciaM ?? distanciaInicial(modelo);
  const camara: CamaraPlano = {
    id: nuevoId("c"),
    numero,
    nombre: `Cámara ${numero}`,
    productoId: modelo.id,
    modelo: etiquetaModelo(modelo),
    pos,
    rumboDeg: 90,
    distanciaM,
    alturaM,
    inclinacionDeg: Math.round(inclinacionHacia(alturaM, distanciaM * 0.6)),
    lentes: [{ optica: { ...modelo.optica }, desfaseRumboDeg: 0 }],
    montaje: "muro",
    ...extra,
  };
  return { plano: { ...plano, camaras: [...plano.camaras, camara] }, camara };
}

export function actualizarCamara(plano: Plano, id: string, cambios: Partial<CamaraPlano>): Plano {
  return { ...plano, camaras: plano.camaras.map((c) => (c.id === id ? { ...c, ...cambios } : c)) };
}

/** Cambia el modelo de una cámara: toma la óptica del catálogo y conserva montaje y rumbo. */
export function cambiarModelo(plano: Plano, id: string, modelo: ModeloCamara): Plano {
  return actualizarCamara(plano, id, {
    productoId: modelo.id,
    modelo: etiquetaModelo(modelo),
    lentes: [{ optica: { ...modelo.optica }, desfaseRumboDeg: 0 }],
  });
}

/**
 * Apunta una cámara hacia un punto (la manija del cono): fija rumbo y largo del cono.
 * El largo no baja de 1 m.
 */
export function apuntarCamara(plano: Plano, id: string, hacia: Punto): Plano {
  const c = plano.camaras.find((x) => x.id === id);
  if (!c) return plano;
  const distanciaM = Math.max(1, Math.round(mDe(plano, distancia(c.pos, hacia)) * 10) / 10);
  return actualizarCamara(plano, id, { rumboDeg: Math.round(rumboEntre(c.pos, hacia) * 10) / 10, distanciaM });
}

/**
 * Apunta una cámara a lo que se está viendo en la maqueta: rumbo e inclinación hacia ese punto, a su altura.
 * El cono no se acorta por mirar algo cercano; solo crece si se apunta más lejos de lo que llegaba.
 */
export function mirarCamaraHacia(plano: Plano, id: string, hacia: Punto, alturaObjetivoM = 0): Plano {
  const c = plano.camaras.find((x) => x.id === id);
  if (!c) return plano;
  const lejos = Math.max(mDe(plano, distancia(c.pos, hacia)), 0.5);
  return actualizarCamara(plano, id, {
    rumboDeg: Math.round(rumboEntre(c.pos, hacia) * 10) / 10,
    inclinacionDeg: Math.round(inclinacionHacia(c.alturaM, lejos, alturaObjetivoM)),
    distanciaM: Math.max(c.distanciaM, Math.round(lejos * 10) / 10),
  });
}

/** `numero`: el que sigue en todo el edificio cuando hay varios niveles. */
export function duplicarCamara(plano: Plano, id: string, numero = siguienteNumero(plano.camaras)): { plano: Plano; camara: CamaraPlano | null } {
  const c = plano.camaras.find((x) => x.id === id);
  if (!c) return { plano, camara: null };
  const desplazo = pxDe(plano, 1);
  const camara: CamaraPlano = {
    ...c,
    id: nuevoId("c"),
    numero,
    nombre: `${c.nombre} (copia)`,
    pos: { x: c.pos.x + desplazo, y: c.pos.y + desplazo },
    lentes: c.lentes.map((l) => ({ ...l, optica: { ...l.optica } })),
  };
  return { plano: { ...plano, camaras: [...plano.camaras, camara] }, camara };
}

export function agregarPersona(plano: Plano, pos: Punto): Plano {
  return { ...plano, personas: [...plano.personas, { id: nuevoId("h"), pos, rumboDeg: 180 }] };
}

/* ── Mover y borrar ─────────────────────────────────────────────────────────────── */

const sumar = (p: Punto, d: Punto): Punto => ({ x: p.x + d.x, y: p.y + d.y });

/** Mueve un elemento completo `delta` px. Las aberturas viajan con su muro. */
export function mover(plano: Plano, sel: Seleccion, delta: Punto): Plano {
  switch (sel.tipo) {
    case "muro":
      return { ...plano, muros: plano.muros.map((m) => (m.id === sel.id ? { ...m, a: sumar(m.a, delta), b: sumar(m.b, delta) } : m)) };
    case "camara":
      return { ...plano, camaras: plano.camaras.map((c) => (c.id === sel.id ? { ...c, pos: sumar(c.pos, delta) } : c)) };
    case "persona":
      return { ...plano, personas: plano.personas.map((p) => (p.id === sel.id ? { ...p, pos: sumar(p.pos, delta) } : p)) };
    case "etiqueta":
      return { ...plano, etiquetas: plano.etiquetas.map((e) => (e.id === sel.id ? { ...e, pos: sumar(e.pos, delta) } : e)) };
    case "obstaculo":
      return {
        ...plano,
        obstaculos: plano.obstaculos.map((o) => (o.id === sel.id ? { ...o, puntos: o.puntos.map((p) => sumar(p, delta)) } : o)),
      };
    case "cota":
      return { ...plano, cotas: plano.cotas.map((c) => (c.id === sel.id ? { ...c, a: sumar(c.a, delta), b: sumar(c.b, delta) } : c)) };
    case "area":
      return { ...plano, areas: (plano.areas ?? []).map((a) => (a.id === sel.id ? { ...a, puntos: a.puntos.map((p) => sumar(p, delta)) } : a)) };
    case "mueble":
      return { ...plano, muebles: (plano.muebles ?? []).map((m) => (m.id === sel.id ? { ...m, pos: sumar(m.pos, delta) } : m)) };
    case "equipo":
      // Lo que va adentro de un gabinete viaja con él; solo no se mueve.
      return {
        ...plano,
        equipos: (plano.equipos ?? []).map((e) => {
          if (e.id === sel.id) return e.gabineteId ? e : { ...e, pos: sumar(e.pos, delta) };
          return e.gabineteId === sel.id ? { ...e, pos: sumar(e.pos, delta) } : e;
        }),
      };
    case "abertura":
      return plano;
  }
}

/** Mueve un extremo de un muro. Si queda sin largo, no se mueve. */
export function moverExtremo(plano: Plano, muroId: string, extremo: "a" | "b", p: Punto): Plano {
  return {
    ...plano,
    muros: plano.muros.map((m) => {
      if (m.id !== muroId) return m;
      const otro = extremo === "a" ? m.b : m.a;
      if (mDe(plano, distancia(otro, p)) < 0.1) return m;
      return { ...m, [extremo]: p };
    }),
  };
}

/** Borra un elemento. Al borrar un muro se van también sus aberturas. */
export function borrar(plano: Plano, sel: Seleccion): Plano {
  switch (sel.tipo) {
    case "muro":
      return {
        ...plano,
        muros: plano.muros.filter((m) => m.id !== sel.id),
        aberturas: plano.aberturas.filter((a) => a.muroId !== sel.id),
      };
    case "abertura":
      return {
        ...plano,
        aberturas: plano.aberturas.filter((a) => a.id !== sel.id),
        // Una terminal no puede quedar ligada a una puerta que ya no existe.
        ...(plano.equipos?.some((e) => e.puertaId === sel.id) ? { equipos: plano.equipos.map((e) => (e.puertaId === sel.id ? { ...e, puertaId: null } : e)) } : {}),
      };
    case "obstaculo":
      return { ...plano, obstaculos: plano.obstaculos.filter((o) => o.id !== sel.id) };
    case "etiqueta":
      return { ...plano, etiquetas: plano.etiquetas.filter((e) => e.id !== sel.id) };
    case "cota":
      return { ...plano, cotas: plano.cotas.filter((c) => c.id !== sel.id) };
    case "camara":
      return { ...plano, camaras: plano.camaras.filter((c) => c.id !== sel.id) };
    case "persona":
      return { ...plano, personas: plano.personas.filter((p) => p.id !== sel.id) };
    case "area":
      return { ...plano, areas: (plano.areas ?? []).filter((a) => a.id !== sel.id) };
    case "mueble":
      return { ...plano, muebles: (plano.muebles ?? []).filter((m) => m.id !== sel.id) };
    case "equipo": {
      // Al quitar un gabinete, lo de adentro queda suelto en su lugar.
      const quedan = (plano.equipos ?? []).filter((e) => e.id !== sel.id).map((e) => (e.gabineteId === sel.id ? { ...e, gabineteId: null, unidad: null } : e));
      return { ...plano, equipos: quedan };
    }
  }
}

/** ¿Sigue existiendo lo seleccionado? (en cualquier nivel) */
export function existe(plano: Plano, sel: Seleccion | null): boolean {
  if (!sel) return false;
  const listas: Record<TipoElemento, Array<{ id: string }>> = {
    muro: plano.muros,
    abertura: plano.aberturas,
    obstaculo: plano.obstaculos,
    etiqueta: plano.etiquetas,
    cota: plano.cotas,
    camara: plano.camaras,
    persona: plano.personas,
    area: plano.areas ?? [],
    mueble: plano.muebles ?? [],
    equipo: plano.equipos ?? [],
  };
  return listas[sel.tipo].some((x) => x.id === sel.id) || (plano.niveles ?? []).some((n) => existe(n.plano, sel));
}

/* ── Historial ──────────────────────────────────────────────────────────────────── */

export type EstadoEditor = {
  plano: Plano;
  seleccion: Seleccion | null;
  pasado: Plano[];
  futuro: Plano[];
  /** Clave de la última edición: los pasos de un mismo arrastre no llenan el historial. */
  ultimaFusion: string | null;
  /** Cambios sin guardar. */
  sucio: boolean;
};

export type AccionEditor =
  | { tipo: "aplicar"; plano: Plano; seleccion?: Seleccion | null; fusion?: string }
  | { tipo: "seleccionar"; seleccion: Seleccion | null }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" }
  | { tipo: "cargar"; plano: Plano }
  | { tipo: "guardado"; plano: Plano };

export const LIMITE_HISTORIAL = 100;

export function estadoInicial(plano: Plano): EstadoEditor {
  return { plano, seleccion: null, pasado: [], futuro: [], ultimaFusion: null, sucio: false };
}

export function reducirEditor(estado: EstadoEditor, accion: AccionEditor): EstadoEditor {
  switch (accion.tipo) {
    case "aplicar": {
      if (accion.plano === estado.plano) {
        return accion.seleccion !== undefined ? { ...estado, seleccion: accion.seleccion } : estado;
      }
      const fusiona = accion.fusion != null && accion.fusion === estado.ultimaFusion;
      const pasado = fusiona ? estado.pasado : [...estado.pasado, estado.plano].slice(-LIMITE_HISTORIAL);
      const seleccion = accion.seleccion !== undefined ? accion.seleccion : estado.seleccion;
      return {
        plano: accion.plano,
        seleccion: existe(accion.plano, seleccion) ? seleccion : null,
        pasado,
        futuro: [],
        ultimaFusion: accion.fusion ?? null,
        sucio: true,
      };
    }
    case "seleccionar":
      return { ...estado, seleccion: accion.seleccion, ultimaFusion: null };
    case "deshacer": {
      const previo = estado.pasado[estado.pasado.length - 1];
      if (!previo) return estado;
      return {
        ...estado,
        plano: previo,
        pasado: estado.pasado.slice(0, -1),
        futuro: [estado.plano, ...estado.futuro],
        seleccion: existe(previo, estado.seleccion) ? estado.seleccion : null,
        ultimaFusion: null,
        sucio: true,
      };
    }
    case "rehacer": {
      const siguiente = estado.futuro[0];
      if (!siguiente) return estado;
      return {
        ...estado,
        plano: siguiente,
        pasado: [...estado.pasado, estado.plano],
        futuro: estado.futuro.slice(1),
        seleccion: existe(siguiente, estado.seleccion) ? estado.seleccion : null,
        ultimaFusion: null,
        sucio: true,
      };
    }
    case "cargar":
      return estadoInicial(accion.plano);
    case "guardado":
      // Lo guardado es lo que estaba en pantalla al mandar: si después hubo más cambios, sigue sucio.
      return { ...estado, sucio: estado.plano !== accion.plano };
  }
}

/* ── Resumen que se guarda con el diseño ────────────────────────────────────────── */

export type ResumenDiseno = {
  camaras: number;
  /** Porcentajes del rectángulo que encierra los muros (null si aún no hay muros). */
  cobertura: { cubierto: number; identificacion: number; reconocimiento: number; observacion: number; deteccion: number } | null;
  mbps: number;
  tb: number;
};

/** Rectángulo que encierra los muros, en metros. */
export function limitesEnMetros(plano: Plano): { min: Punto; max: Punto } | null {
  const pts = plano.muros.flatMap((m) => [m.a, m.b]);
  if (!pts.length) return null;
  const k = plano.escala.metrosPorPx;
  return {
    min: { x: Math.min(...pts.map((p) => p.x)) * k, y: Math.min(...pts.map((p) => p.y)) * k },
    max: { x: Math.max(...pts.map((p) => p.x)) * k, y: Math.max(...pts.map((p) => p.y)) * k },
  };
}

/**
 * Megapíxeles comerciales de una cámara para el cálculo de grabación: 2560 × 1440 es la clase
 * «4 MP» aunque sean 3.7 millones de píxeles, y los flujos de la tabla son por clase.
 */
function mpDe(c: CamaraPlano): number {
  const o = c.lentes[0]?.optica;
  if (!o) return 2;
  const conocida = RESOLUCIONES.find((r) => r.pxHoriz === o.pxHoriz && r.pxVert === o.pxVert);
  return conocida ? conocida.mp : (o.pxHoriz * o.pxVert) / 1_000_000;
}

/**
 * Resumen del edificio: cámaras y grabación de todos los niveles, y la cobertura sumando el
 * área de cada piso (cada nivel contra sus propios muros y cámaras).
 */
export function resumenDelPlano(raiz: Plano, grabacion: Grabacion = GRABACION_POR_OMISION, celdaM = 0.5): ResumenDiseno {
  const niveles = listaNiveles(raiz);
  const todas = niveles.flatMap((n) => n.plano.camaras);
  const mp = todas.map(mpDe);
  const base = { camaras: todas.length, mbps: anchoBandaMbps(mp, grabacion), tb: almacenamientoTB(mp, grabacion) };
  const suma = { celdas: 0, sinCobertura: 0, identificacion: 0, reconocimiento: 0, observacion: 0, deteccion: 0, general: 0 };
  for (const { plano } of niveles) {
    const lim = limitesEnMetros(plano);
    if (!lim) continue;
    const camaras = plano.camaras.map((c) => camaraEnMetros(c, plano.escala)).filter((c): c is NonNullable<typeof c> => c != null);
    // Planos enormes: la celda crece para no pasar de ~20 mil celdas por nivel.
    const area = (lim.max.x - lim.min.x) * (lim.max.y - lim.min.y);
    const celda = Math.max(celdaM, Math.sqrt(area / 20_000));
    const r = repartoDeArea({ camaras, tapas: tapasDelPlano(plano), min: lim.min, max: lim.max, celdaM: celda });
    const peso = celda * celda;
    suma.celdas += r.celdas * peso;
    suma.sinCobertura += r.sinCobertura * peso;
    for (const k of ["identificacion", "reconocimiento", "observacion", "deteccion", "general"] as const) suma[k] += r.porNivel[k] * peso;
  }
  if (!suma.celdas) return { ...base, cobertura: null };
  const pct = (n: number) => Math.round((n / suma.celdas) * 1000) / 10;
  return {
    ...base,
    cobertura: {
      cubierto: pct(suma.celdas - suma.sinCobertura),
      identificacion: pct(suma.identificacion),
      reconocimiento: pct(suma.reconocimiento),
      observacion: pct(suma.observacion),
      deteccion: pct(suma.deteccion + suma.general),
    },
  };
}
