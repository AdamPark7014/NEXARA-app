/**
 * Operaciones del editor del Diseñador de videovigilancia sobre el `Plano` (en px del croquis):
 * dibujar muros con imán, poner puertas y ventanas sobre un muro, colocar y apuntar cámaras,
 * mover, borrar, calibrar y el resumen que se guarda con el diseño. Todas son puras: reciben un
 * plano y devuelven otro, así el deshacer es una pila de planos.
 */
import { MODELO_GENERICO, etiquetaModelo, type ModeloCamara } from "./catalogo";
import { almacenamientoTB, anchoBandaMbps, type Grabacion, GRABACION_POR_OMISION } from "./infraestructura";
import { RESOLUCIONES, alcancesDori, hfovDeg, inclinacionHacia } from "./optica";
import {
  calibrar,
  distancia,
  rumboEntre,
  siguienteNumero,
  tapasDelPlano,
  type Abertura,
  type CamaraPlano,
  type Muro,
  type Obstaculo,
  type Plano,
  type Punto,
} from "./plano";
import { camaraEnMetros, repartoDeArea } from "./visibilidad";
import { nuevoId } from "./ids";
import { listaNiveles } from "./niveles";

export type TipoElemento = "muro" | "abertura" | "obstaculo" | "etiqueta" | "cota" | "camara" | "persona";
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
      return { ...plano, aberturas: plano.aberturas.filter((a) => a.id !== sel.id) };
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
