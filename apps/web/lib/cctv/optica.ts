/**
 * Óptica de una cámara de videovigilancia: ángulo de visión, densidad de píxeles (PPM),
 * alcances DORI y zona ciega al pie.
 *
 * Es el mismo cálculo que hace el «Diseñador de Videovigilancia» de SYSCOM (ingeniería
 * inversa en `docs/DISENADOR-CCTV.md`): con sus datos reproduce las cifras de la propuesta
 * «Proyecto CCTV Bodegas VDM» (14 m · 109 PPM · Observación, zona ciega 2.4 m, etc.).
 *
 * Todo en metros y grados. Nada de esto sabe de planos ni de muros: eso está en
 * `visibilidad.ts`.
 */

const RAD = Math.PI / 180;
export const aRad = (g: number) => g * RAD;
export const aGrados = (r: number) => r / RAD;

/**
 * Ancho nominal del sensor por formato óptico («1/3"» → 4.8 mm). Es la tabla de la
 * industria (formatos de tubo Vidicon): el ancho real del chip varía, pero los fabricantes
 * declaran el ángulo con este valor y así sale el «81°» de un 2.8 mm en 1/3".
 */
export const ANCHO_SENSOR_MM: Readonly<Record<string, number>> = {
  "1/5": 2.9,
  "1/4": 3.6,
  "1/3.2": 4.5,
  "1/3": 4.8,
  "1/2.9": 5.0,
  "1/2.8": 5.1,
  "1/2.7": 5.4,
  "1/2.6": 5.5,
  "1/2.5": 5.8,
  "1/2.4": 6.0,
  "1/2.3": 6.2,
  "1/2": 6.4,
  "1/1.9": 6.7,
  "1/1.8": 7.1,
  "1/1.79": 7.2,
  "1/1.7": 7.5,
  "1/1.6": 8.1,
  "1/1.2": 10.7,
  "1/1.1": 11.6,
  "2/3": 8.8,
  "1": 12.8,
  "4/3": 17.3,
};

/** Resoluciones comunes, para cuando la ficha solo dice «4 MP». */
export const RESOLUCIONES = [
  { clave: "d1", etiqueta: "D1 (analógica)", mp: 0.4, pxHoriz: 704, pxVert: 480 },
  { clave: "720p", etiqueta: "720p (1 MP)", mp: 1, pxHoriz: 1280, pxVert: 720 },
  { clave: "1.3mp", etiqueta: "1.3 MP", mp: 1.3, pxHoriz: 1280, pxVert: 960 },
  { clave: "2mp", etiqueta: "2 MP (1080p)", mp: 2, pxHoriz: 1920, pxVert: 1080 },
  { clave: "3mp", etiqueta: "3 MP", mp: 3, pxHoriz: 2048, pxVert: 1536 },
  { clave: "4mp", etiqueta: "4 MP", mp: 4, pxHoriz: 2560, pxVert: 1440 },
  { clave: "5mp", etiqueta: "5 MP", mp: 5, pxHoriz: 2592, pxVert: 1944 },
  { clave: "6mp", etiqueta: "6 MP", mp: 6, pxHoriz: 3072, pxVert: 2048 },
  { clave: "8mp", etiqueta: "8 MP (4K)", mp: 8, pxHoriz: 3840, pxVert: 2160 },
  { clave: "12mp", etiqueta: "12 MP", mp: 12, pxHoriz: 4000, pxVert: 3000 },
] as const;

/**
 * Lo que hace falta de una lente para calcular. Viene de la ficha del catálogo; lo que la
 * ficha no trae se deja en null y se usa el respaldo (ángulo declarado o formato).
 */
export type Optica = {
  pxHoriz: number;
  pxVert: number;
  /** Focal en uso. En varifocal o PTZ se mueve entre `focalMinMm` y `focalMaxMm`. */
  focalMm: number;
  focalMinMm?: number | null;
  focalMaxMm?: number | null;
  /** Ancho del sensor; si falta, sale de `sensorFormato` con `ANCHO_SENSOR_MM`. */
  sensorAnchoMm?: number | null;
  sensorFormato?: string | null;
  /**
   * Ángulo horizontal que declara el fabricante. Manda sobre el calculado: los ojos de pez
   * y las panorámicas (≥ 150°) no siguen la fórmula rectilínea.
   */
  hfovDeclaradoDeg?: number | null;
  vfovDeclaradoDeg?: number | null;
  irM?: number | null;
};

/** A partir de este ángulo la lente se trata como panorámica (escena = arco, no tangente). */
export const HFOV_PANORAMICO_DEG = 150;

/** Ancho del sensor en mm: el declarado, o el del formato; null si no hay ninguno. */
export function anchoSensorMm(o: Pick<Optica, "sensorAnchoMm" | "sensorFormato">): number | null {
  if (o.sensorAnchoMm != null && Number.isFinite(o.sensorAnchoMm) && o.sensorAnchoMm > 0) return o.sensorAnchoMm;
  const f = normalizarFormato(o.sensorFormato);
  return f ? ANCHO_SENSOR_MM[f] ?? null : null;
}

/** «1/2.8"», «1/2.8 pulgadas», « 1/2.8 » → «1/2.8». */
export function normalizarFormato(f: string | null | undefined): string | null {
  if (!f) return null;
  const limpio = f.replace(/["”″]|pulgadas?|in\b/gi, "").replace(/\s+/g, "").trim();
  return limpio || null;
}

/** Ángulo horizontal con la fórmula rectilínea: 2·atan(ancho / (2·focal)). */
export function hfovPorFocal(anchoMm: number, focalMm: number): number {
  return aGrados(2 * Math.atan(anchoMm / (2 * focalMm)));
}

/**
 * Ángulo horizontal de la lente: el declarado si existe; si no, el de focal y sensor
 * (tope 149°, porque arriba de eso la fórmula ya no describe la lente). Si no hay ni
 * ángulo ni sensor, null: la ficha está incompleta.
 */
export function hfovDeg(o: Optica): number | null {
  if (o.hfovDeclaradoDeg != null && Number.isFinite(o.hfovDeclaradoDeg) && o.hfovDeclaradoDeg > 0) {
    return Math.min(Math.max(o.hfovDeclaradoDeg, 1), 360);
  }
  const ancho = anchoSensorMm(o);
  if (ancho == null || !(o.focalMm > 0)) return null;
  return Math.min(Math.max(hfovPorFocal(ancho, o.focalMm), 1), HFOV_PANORAMICO_DEG - 1);
}

/**
 * Ángulo vertical: el declarado, o el del sensor recortado a la proporción de la imagen
 * (16:9 en casi todas las IP). Si solo se conoce el horizontal, se deriva de él con la
 * misma proporción.
 */
export function vfovDeg(o: Optica): number | null {
  if (o.vfovDeclaradoDeg != null && Number.isFinite(o.vfovDeclaradoDeg) && o.vfovDeclaradoDeg > 0) {
    return Math.min(o.vfovDeclaradoDeg, 180);
  }
  const proporcion = o.pxVert / o.pxHoriz;
  const ancho = anchoSensorMm(o);
  if (ancho != null && o.focalMm > 0 && o.hfovDeclaradoDeg == null) {
    return aGrados(2 * Math.atan((ancho * proporcion) / (2 * o.focalMm)));
  }
  const h = hfovDeg(o);
  if (h == null) return null;
  if (h >= HFOV_PANORAMICO_DEG) return Math.min(h * proporcion, 180);
  return aGrados(2 * Math.atan(Math.tan(aRad(h) / 2) * proporcion));
}

/** Ancho de la escena a `distanciaM`: 2·d·tan(hfov/2); en panorámicas, el arco d·hfov. */
export function anchoEscenaM(distanciaM: number, hfov: number): number {
  return hfov >= HFOV_PANORAMICO_DEG ? distanciaM * aRad(hfov) : 2 * distanciaM * Math.tan(aRad(hfov) / 2);
}

/** Píxeles por metro a una distancia: píxeles horizontales ÷ ancho de la escena. */
export function ppm(pxHoriz: number, distanciaM: number, hfov: number): number {
  const ancho = anchoEscenaM(Math.max(distanciaM, 0.01), hfov);
  return pxHoriz / ancho;
}

/** Distancia a la que se alcanza una densidad dada (la inversa de `ppm`). */
export function distanciaParaPpm(pxHoriz: number, ppmObjetivo: number, hfov: number): number {
  return pxHoriz / (ppmObjetivo * anchoEscenaM(1, hfov));
}

/* ── DORI (IEC 62676-4) ─────────────────────────────────────────────────────────── */

export type NivelDori = "identificacion" | "reconocimiento" | "observacion" | "deteccion";
export type NivelCobertura = NivelDori | "general";

/**
 * Umbrales de IEC 62676-4 en píxeles por metro. La norma pone observación en 62.5;
 * SYSCOM lo redondea a 62. Se usa el de la norma.
 */
export const UMBRAL_DORI: Readonly<Record<NivelDori, number>> = {
  identificacion: 250,
  reconocimiento: 125,
  observacion: 62.5,
  deteccion: 25,
};

export const NIVELES_DORI: readonly NivelDori[] = ["identificacion", "reconocimiento", "observacion", "deteccion"];

export const ETIQUETA_NIVEL: Readonly<Record<NivelCobertura, string>> = {
  identificacion: "Identificación",
  reconocimiento: "Reconocimiento",
  observacion: "Observación",
  deteccion: "Detección",
  general: "Cobertura general",
};

/** Lo que permite cada nivel, en palabras del cliente (va en la leyenda de la propuesta). */
export const DESCRIPCION_NIVEL: Readonly<Record<NivelCobertura, string>> = {
  identificacion: "Detalle suficiente para identificar rostros y placas sin lugar a dudas.",
  reconocimiento: "Permite reconocer a una persona que ya conoces.",
  observacion: "Se distingue la vestimenta y la actividad de las personas.",
  deteccion: "Se detecta la presencia de una persona o un vehículo.",
  general: "Se ve el área, pero no alcanza para detectar con certeza.",
};

export function nivelDori(densidad: number): NivelCobertura {
  for (const n of NIVELES_DORI) if (densidad >= UMBRAL_DORI[n]) return n;
  return "general";
}

/** Hasta qué distancia llega cada nivel (sin recortar por cono, muros ni zona ciega). */
export function alcancesDori(pxHoriz: number, hfov: number): Record<NivelDori, number> {
  return {
    identificacion: distanciaParaPpm(pxHoriz, UMBRAL_DORI.identificacion, hfov),
    reconocimiento: distanciaParaPpm(pxHoriz, UMBRAL_DORI.reconocimiento, hfov),
    observacion: distanciaParaPpm(pxHoriz, UMBRAL_DORI.observacion, hfov),
    deteccion: distanciaParaPpm(pxHoriz, UMBRAL_DORI.deteccion, hfov),
  };
}

/* ── Montaje: inclinación y zona ciega ──────────────────────────────────────────── */

/**
 * Tramo del piso que cae dentro del cuadro, medido desde el pie de la cámara:
 * - `dMinM` es la zona ciega: el borde inferior del cuadro toca el piso ahí.
 * - `dMaxM` es donde el borde superior toca el piso (∞ si apunta por encima del horizonte).
 * Para un objetivo a cierta altura (la cabeza a 1.5 m) se pasa `alturaObjetivoM`.
 */
export function tramoVisible(
  alturaCamM: number,
  inclinacionDeg: number,
  vfov: number,
  alturaObjetivoM = 0,
): { dMinM: number; dMaxM: number } {
  const caida = alturaCamM - alturaObjetivoM;
  const abajo = inclinacionDeg + vfov / 2;
  const arriba = inclinacionDeg - vfov / 2;
  if (caida <= 0) return { dMinM: 0, dMaxM: Number.POSITIVE_INFINITY };
  const dMinM = abajo >= 90 ? 0 : abajo <= 0 ? Number.POSITIVE_INFINITY : caida / Math.tan(aRad(abajo));
  const dMaxM = arriba >= 90 ? 0 : arriba <= 0 ? Number.POSITIVE_INFINITY : caida / Math.tan(aRad(arriba));
  return { dMinM, dMaxM };
}

export function zonaCiegaM(alturaCamM: number, inclinacionDeg: number, vfov: number): number {
  return tramoVisible(alturaCamM, inclinacionDeg, vfov).dMinM;
}

/**
 * Inclinación que pone el centro del cuadro en un punto del piso a `distanciaM`. Es la que
 * se propone al colocar una cámara (SYSCOM usa lo mismo cuando no hay inclinación).
 */
export function inclinacionHacia(alturaCamM: number, distanciaM: number, alturaObjetivoM = 0): number {
  return aGrados(Math.atan2(alturaCamM - alturaObjetivoM, Math.max(distanciaM, 0.01)));
}

/** Altura del punto de una persona donde se mide la densidad (centro de 1.70 m). */
export const ALTURA_MEDICION_PERSONA_M = 0.85;

/**
 * Distancia real lente → persona: la horizontal en el piso combinada con la diferencia de
 * altura entre la lente y el centro de la persona. Es la que usa la PPM «persona a 10 m».
 */
export function distanciaInclinadaM(distanciaPisoM: number, alturaCamM: number | null | undefined): number {
  if (alturaCamM == null) return distanciaPisoM;
  return Math.hypot(distanciaPisoM, Math.max(alturaCamM - ALTURA_MEDICION_PERSONA_M, 0));
}

/**
 * La inversa: a qué distancia en el piso (desde el pie de la cámara) queda una persona
 * cuya visual mide `distanciaVisualM`. SYSCOM tiende en el piso la distancia de la visual,
 * y con la cámara a 5 m eso promete identificación «hasta 6 m» cuando llega a 4.3 m.
 */
export function alcancePisoM(distanciaVisualM: number, alturaCamM: number | null | undefined): number {
  if (alturaCamM == null) return distanciaVisualM;
  const caida = Math.max(alturaCamM - ALTURA_MEDICION_PERSONA_M, 0);
  return distanciaVisualM <= caida ? 0 : Math.sqrt(distanciaVisualM ** 2 - caida ** 2);
}

/* ── Bandas DORI de una cámara ──────────────────────────────────────────────────── */

export type BandaDori = { desdeM: number; hastaM: number; nivel: NivelCobertura };

/** Hasta dónde llega cada nivel medido en el piso, con la altura de montaje ya descontada. */
export function alcancesDoriPiso(pxHoriz: number, hfov: number, alturaCamM?: number | null): Record<NivelDori, number> {
  const visual = alcancesDori(pxHoriz, hfov);
  return {
    identificacion: alcancePisoM(visual.identificacion, alturaCamM),
    reconocimiento: alcancePisoM(visual.reconocimiento, alturaCamM),
    observacion: alcancePisoM(visual.observacion, alturaCamM),
    deteccion: alcancePisoM(visual.deteccion, alturaCamM),
  };
}

/**
 * Anillos de cobertura de una cámara sobre el piso, de la zona ciega al final del cono:
 * identificación, reconocimiento, observación, detección y lo que sobre (general). Las
 * distancias son en el piso desde el pie de la cámara. Sin muros: el recorte por
 * obstáculos lo hace `visibilidad.ts`.
 */
export function bandasDori(params: {
  optica: Optica;
  distanciaM: number;
  alturaCamM?: number | null;
  inclinacionDeg?: number | null;
}): { bandas: BandaDori[]; zonaCiegaM: number; finM: number } | null {
  const h = hfovDeg(params.optica);
  if (h == null) return null;
  let inicio = 0;
  let fin = params.distanciaM;
  const v = vfovDeg(params.optica);
  if (params.alturaCamM != null && params.inclinacionDeg != null && v != null) {
    const t = tramoVisible(params.alturaCamM, params.inclinacionDeg, v);
    inicio = Math.min(t.dMinM, params.distanciaM);
    fin = Math.min(params.distanciaM, t.dMaxM);
  }
  const limites = alcancesDoriPiso(params.optica.pxHoriz, h, params.alturaCamM);
  const cortes: Array<[number, NivelCobertura]> = [
    ...NIVELES_DORI.map((n) => [Math.min(limites[n], fin), n] as [number, NivelCobertura]),
    [fin, "general"],
  ];
  const bandas: BandaDori[] = [];
  let desde = inicio;
  for (const [hasta, nivel] of cortes) {
    if (hasta - desde > 0.001) bandas.push({ desdeM: desde, hastaM: hasta, nivel });
    desde = Math.max(desde, hasta);
  }
  return { bandas, zonaCiegaM: inicio, finM: fin };
}

/* ── Resumen de la ficha ────────────────────────────────────────────────────────── */

export type ResumenOptico = {
  hfovDeg: number;
  vfovDeg: number | null;
  /** «hasta X m» por nivel en el piso desde el pie de la cámara, recortado al final del cono. */
  alcances: Record<NivelDori, number>;
  /** Lo mismo medido por la visual (lo que reporta SYSCOM), para comparar. */
  alcancesVisual: Record<NivelDori, number>;
  /** Densidad y nivel al final del cono («Al final del cono (13.8 m): 104 PPM — observación»). */
  ppmFinal: number;
  nivelFinal: NivelCobertura;
  zonaCiegaM: number | null;
};

/** Las cifras de la ficha de una cámara en la propuesta. */
export function resumenOptico(params: {
  optica: Optica;
  distanciaM: number;
  alturaCamM?: number | null;
  inclinacionDeg?: number | null;
}): ResumenOptico | null {
  const h = hfovDeg(params.optica);
  if (h == null) return null;
  const v = vfovDeg(params.optica);
  const recorta = (l: Record<NivelDori, number>) =>
    Object.fromEntries(NIVELES_DORI.map((n) => [n, Math.min(l[n], params.distanciaM)])) as Record<NivelDori, number>;
  const ppmFinal = ppm(params.optica.pxHoriz, distanciaInclinadaM(params.distanciaM, params.alturaCamM), h);
  const zona =
    params.alturaCamM != null && params.inclinacionDeg != null && v != null
      ? zonaCiegaM(params.alturaCamM, params.inclinacionDeg, v)
      : null;
  return {
    hfovDeg: h,
    vfovDeg: v,
    alcances: recorta(alcancesDoriPiso(params.optica.pxHoriz, h, params.alturaCamM)),
    alcancesVisual: recorta(alcancesDori(params.optica.pxHoriz, h)),
    ppmFinal,
    nivelFinal: nivelDori(ppmFinal),
    zonaCiegaM: zona,
  };
}

/**
 * Foco de una varifocal o PTZ para un ángulo dado (al arrastrar el borde del cono). Se
 * limita al rango de la lente; null si es fija o no hay sensor para despejar.
 */
export function focalParaHfov(o: Optica, hfovObjetivo: number): number | null {
  const min = o.focalMinMm ?? o.focalMm;
  const max = o.focalMaxMm ?? o.focalMm;
  if (!(max > min)) return null;
  const ancho = anchoSensorMm(o);
  if (ancho == null) return null;
  const f = ancho / (2 * Math.tan(aRad(Math.min(Math.max(hfovObjetivo, 1), HFOV_PANORAMICO_DEG - 1)) / 2));
  return Math.min(Math.max(f, min), max);
}

/** Megapíxeles → píxeles horizontales de la resolución conocida más cercana. */
export function pxPorMegapixeles(mp: number): { pxHoriz: number; pxVert: number } | null {
  const r = RESOLUCIONES.find((x) => Math.abs(x.mp - mp) < 0.26);
  return r ? { pxHoriz: r.pxHoriz, pxVert: r.pxVert } : null;
}

/* ── Formato de cifras ──────────────────────────────────────────────────────────── */

/** «13.8 m», «6 m», «11.9 m»: un decimal, sin «.0». */
export function metros(m: number): string {
  if (!Number.isFinite(m)) return "—";
  const r = Math.round(m * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)} m`;
}

/** Etiqueta del final del cono en el plano: «14 m · 109 PPM · Observación». */
export function etiquetaCono(distanciaM: number, densidad: number): string {
  return `${Math.round(distanciaM)} m · ${Math.round(densidad)} PPM · ${ETIQUETA_NIVEL[nivelDori(densidad)]}`;
}
