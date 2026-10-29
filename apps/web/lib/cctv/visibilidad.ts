/**
 * Qué ve cada cámara dentro del plano: el cuadro de la lente (proyección de cámara
 * estenopeica), los muros que tapan, la cobertura DORI recortada y cómo capta a cada
 * humanoide de referencia.
 *
 * Todo en metros, con los ejes del plano (x derecha, y abajo) y la altura z hacia arriba
 * desde el piso. Se usa la misma prueba que el diseñador de SYSCOM (ver
 * `docs/DISENADOR-CCTV.md` §4), con dos diferencias: los anillos se miden en el piso con
 * la altura descontada y la persona no desaparece por quedar más allá del cono dibujado.
 */
import {
  HFOV_PANORAMICO_DEG,
  NIVELES_DORI,
  aRad,
  alcancesDoriPiso,
  distanciaInclinadaM,
  hfovDeg,
  nivelDori,
  ppm,
  tramoVisible,
  vfovDeg,
  type NivelCobertura,
} from "./optica";
import {
  aMetros,
  difRumbo,
  dirRumbo,
  distancia,
  rumboEntre,
  type CamaraPlano,
  type Escala,
  type Punto,
  type Tapa,
} from "./plano";

/** Cámara ya en metros, con una sola lente elegida. */
export type CamaraM = {
  pos: Punto;
  alturaM: number;
  rumboDeg: number;
  inclinacionDeg: number;
  distanciaM: number;
  hfovDeg: number;
  vfovDeg: number;
  pxHoriz: number;
  pxVert: number;
};

/**
 * Pasa una cámara del plano a metros. Con varias lentes (multisensor, panorámicas de dos
 * lentes), `lente` elige cuál; su desfase se suma al rumbo. Null si la ficha no permite
 * calcular el ángulo.
 */
export function camaraEnMetros(c: CamaraPlano, escala: Escala, lente = 0): CamaraM | null {
  const l = c.lentes[Math.min(lente, c.lentes.length - 1)];
  if (!l) return null;
  const h = hfovDeg(l.optica);
  const v = vfovDeg(l.optica);
  if (h == null || v == null) return null;
  return {
    pos: aMetros(c.pos, escala),
    alturaM: c.alturaM,
    rumboDeg: c.rumboDeg + l.desfaseRumboDeg,
    inclinacionDeg: c.inclinacionDeg,
    distanciaM: c.distanciaM,
    hfovDeg: h,
    vfovDeg: v,
    pxHoriz: l.optica.pxHoriz,
    pxVert: l.optica.pxVert,
  };
}

/**
 * Coordenadas del punto en el marco de la cámara: `adelante` a lo largo del eje óptico,
 * `lado` a la derecha y `arriba` en el cuadro (positivo, encima del centro).
 */
export function marcoCamara(cam: CamaraM, p: Punto, alturaM: number) {
  const f = dirRumbo(cam.rumboDeg);
  const d = { x: f.y * -1, y: f.x }; // derecha: el rumbo girado 90° en el sentido del reloj
  const v = { x: p.x - cam.pos.x, y: p.y - cam.pos.y };
  const enPlanta = v.x * f.x + v.y * f.y;
  const lado = v.x * d.x + v.y * d.y;
  const dz = alturaM - cam.alturaM;
  const o = aRad(cam.inclinacionDeg);
  return {
    enPlanta,
    lado,
    adelante: enPlanta * Math.cos(o) - dz * Math.sin(o),
    arriba: enPlanta * Math.sin(o) + dz * Math.cos(o),
  };
}

/** ¿El punto cae dentro del cuadro de la lente? (sin muros) */
export function enCuadro(cam: CamaraM, p: Punto, alturaM: number): boolean {
  const m = marcoCamara(cam, p, alturaM);
  if (cam.hfovDeg >= HFOV_PANORAMICO_DEG) {
    const horiz = Math.hypot(m.enPlanta, m.lado);
    const angH = Math.abs(Math.atan2(m.lado, m.enPlanta));
    const angV = Math.atan2(cam.alturaM - alturaM, horiz) - aRad(cam.inclinacionDeg);
    return angH <= aRad(cam.hfovDeg / 2) && Math.abs(angV) <= aRad(cam.vfovDeg / 2);
  }
  return (
    m.adelante > 0 &&
    Math.abs(m.lado) <= m.adelante * Math.tan(aRad(cam.hfovDeg / 2)) &&
    Math.abs(m.arriba) <= m.adelante * Math.tan(aRad(cam.vfovDeg / 2))
  );
}

/**
 * Posición del punto en la imagen de la cámara, de -1 a 1 en cada eje (0,0 al centro,
 * y positivo hacia arriba). Sirve para pintar etiquetas sobre la vista de la cámara.
 * Null si queda detrás de la lente.
 */
export function proyectar(cam: CamaraM, p: Punto, alturaM: number): { x: number; y: number } | null {
  const m = marcoCamara(cam, p, alturaM);
  if (m.adelante <= 1e-6) return null;
  return {
    x: m.lado / (m.adelante * Math.tan(aRad(cam.hfovDeg / 2))),
    y: m.arriba / (m.adelante * Math.tan(aRad(cam.vfovDeg / 2))),
  };
}

/* ── Oclusión ───────────────────────────────────────────────────────────────────── */

/**
 * Las cámaras van montadas sobre muros: lo que cruza la visual a menos de esto de la
 * lente es el muro donde está atornillada y no cuenta.
 */
export const HOLGURA_MONTAJE_M = 0.3;

const cruz = (a: Punto, b: Punto) => a.x * b.y - a.y * b.x;

/**
 * ¿Algún muro tapa la visual de `desde` (con su altura) a `hasta`? Se corta la visual
 * con cada tramo en planta y se mira si a esa distancia la visual pasa por debajo del
 * tope del tramo y por encima de su base.
 */
export function tapado(
  tapas: readonly Tapa[],
  desde: Punto,
  alturaDesde: number,
  hasta: Punto,
  alturaHasta: number,
  holguraM = HOLGURA_MONTAJE_M,
): boolean {
  const r = { x: hasta.x - desde.x, y: hasta.y - desde.y };
  const largo = Math.hypot(r.x, r.y);
  if (largo < 1e-6) return false;
  const tMin = Math.min(holguraM / largo, 0.999);
  for (const t of tapas) {
    const s = { x: t.b.x - t.a.x, y: t.b.y - t.a.y };
    const den = cruz(r, s);
    if (Math.abs(den) < 1e-12) continue;
    const q = { x: t.a.x - desde.x, y: t.a.y - desde.y };
    const u = cruz(q, s) / den; // a lo largo de la visual
    const w = cruz(q, r) / den; // a lo largo del tramo
    if (u <= tMin || u >= 1 - 1e-9 || w < 0 || w > 1) continue;
    const z = alturaDesde + (alturaHasta - alturaDesde) * u;
    if (z >= t.baseM - 1e-9 && z <= t.topeM + 1e-9) return true;
  }
  return false;
}

/** Solo los tramos que pueden estorbarle a una cámara (los que quedan a su alcance). */
export function tapasCercanas(tapas: readonly Tapa[], centro: Punto, radioM: number): Tapa[] {
  return tapas.filter((t) => distanciaPuntoSegmento(centro, t.a, t.b) <= radioM);
}

export function distanciaPuntoSegmento(p: Punto, a: Punto, b: Punto): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const l2 = ab.x ** 2 + ab.y ** 2;
  if (l2 < 1e-12) return distancia(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return distancia(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/* ── Cobertura en el plano ──────────────────────────────────────────────────────── */

export type PoligonoCobertura = { nivel: NivelCobertura; puntos: Punto[] };

export type OpcionesCobertura = {
  /** A qué altura se mide «se le ve»: la cabeza de una persona de pie. */
  alturaObjetivoM?: number;
  /** Muestras a lo largo de cada rayo. */
  pasos?: number;
};

/**
 * Cobertura de una cámara recortada por muros, como polígonos por nivel DORI. Se lanza un
 * abanico de rayos (uno cada 2° como mucho); en cada rayo se buscan los tramos donde la
 * cabeza de una persona cae en el cuadro sin muro de por medio, se afinan los bordes por
 * bisección y se cortan por los radios DORI. Los rayos vecinos con la misma forma se
 * cosen en un solo polígono.
 */
export function coberturaCamara(
  cam: CamaraM,
  tapas: readonly Tapa[],
  opciones: OpcionesCobertura = {},
): PoligonoCobertura[] {
  const alturaObj = opciones.alturaObjetivoM ?? 1.5;
  const pasos = opciones.pasos ?? 64;
  const cercanas = tapasCercanas(tapas, cam.pos, cam.distanciaM + 0.5);
  const sectores = Math.max(32, Math.ceil(cam.hfovDeg / 2));
  const paso = cam.distanciaM / pasos;
  const inicioDeg = cam.rumboDeg - cam.hfovDeg / 2;
  const anchoDeg = cam.hfovDeg / sectores;
  const enRayo = (rumbo: number, r: number): Punto => {
    const d = dirRumbo(rumbo);
    return { x: cam.pos.x + d.x * r, y: cam.pos.y + d.y * r };
  };
  const visible = (rumbo: number, r: number) => {
    const p = enRayo(rumbo, r);
    return enCuadro(cam, p, alturaObj) && !tapado(cercanas, cam.pos, cam.alturaM, p, alturaObj);
  };
  const afinar = (rumbo: number, dentro: number, fuera: number) => {
    for (let i = 0; i < 7; i++) {
      const m = (dentro + fuera) / 2;
      if (visible(rumbo, m)) dentro = m;
      else fuera = m;
    }
    return dentro;
  };

  // Radios de los anillos en el piso (la cabeza también se mide a su distancia real).
  const limites = alcancesDoriPiso(cam.pxHoriz, cam.hfovDeg, cam.alturaM);
  const cortes: Array<[number, NivelCobertura]> = [
    ...NIVELES_DORI.map((n) => [limites[n], n] as [number, NivelCobertura]),
    [Number.POSITIVE_INFINITY, "general"],
  ];

  type Tramo = [number, number];
  const porSector: Array<Map<NivelCobertura, Tramo[]>> = [];
  for (let s = 0; s < sectores; s++) {
    const rumbo = inicioDeg + anchoDeg * (s + 0.5);
    const tramos: Tramo[] = [];
    let abierto: number | null = null;
    let ultimoVisible = 0;
    for (let k = 0; k <= pasos; k++) {
      const r = Math.min((k + 0.5) * paso, cam.distanciaM);
      const v = k < pasos && visible(rumbo, r);
      if (v && abierto == null) abierto = k === 0 ? 0 : afinar(rumbo, r, (k - 0.5) * paso);
      if (!v && abierto != null) {
        const fin = k < pasos ? afinar(rumbo, ultimoVisible, r) : cam.distanciaM;
        tramos.push([abierto, fin]);
        abierto = null;
      }
      if (v) ultimoVisible = r;
    }
    const porNivel = new Map<NivelCobertura, Tramo[]>();
    let desde = 0;
    for (const [hasta, nivel] of cortes) {
      const lista: Tramo[] = [];
      for (const [a, b] of tramos) {
        const i0 = Math.max(a, desde);
        const i1 = Math.min(b, hasta);
        if (i1 - i0 > 0.01) lista.push([i0, i1]);
      }
      if (lista.length) porNivel.set(nivel, lista);
      desde = Math.max(desde, hasta);
    }
    porSector.push(porNivel);
  }

  // Coser: por nivel, mientras sector tras sector haya los mismos tramos y se toquen. El
  // contorno pasa por el rayo central de cada sector (ahí se midió); solo las puntas de
  // cada franja se estiran al borde del sector para no dejar rendijas.
  const salida: PoligonoCobertura[] = [];
  for (const [, nivel] of cortes) {
    let abiertas: Array<{ fuera: Punto[]; dentro: Punto[]; ultimo: Tramo; rumboFin: number }> = [];
    const cerrar = () => {
      for (const t of abiertas) {
        t.fuera.push(enRayo(t.rumboFin, t.ultimo[1]));
        t.dentro.push(enRayo(t.rumboFin, t.ultimo[0]));
        salida.push({ nivel, puntos: [...t.fuera, ...t.dentro.reverse()] });
      }
      abiertas = [];
    };
    for (let s = 0; s < sectores; s++) {
      const tramos = porSector[s].get(nivel) ?? [];
      const r0 = inicioDeg + anchoDeg * s;
      const siguen =
        abiertas.length === tramos.length &&
        tramos.every(([a, b], i) => a <= abiertas[i].ultimo[1] && b >= abiertas[i].ultimo[0]);
      if (!siguen) {
        cerrar();
        abiertas = tramos.map(([a, b]) => ({
          fuera: [enRayo(r0, b)],
          dentro: [enRayo(r0, a)],
          ultimo: [a, b] as Tramo,
          rumboFin: r0,
        }));
      }
      tramos.forEach(([a, b], i) => {
        abiertas[i].fuera.push(enRayo(r0 + anchoDeg / 2, b));
        abiertas[i].dentro.push(enRayo(r0 + anchoDeg / 2, a));
        abiertas[i].ultimo = [a, b];
        abiertas[i].rumboFin = r0 + anchoDeg;
      });
    }
    cerrar();
  }
  return salida;
}

/** Área de un polígono en m² (fórmula del zapatero). */
export function areaPoligono(puntos: readonly Punto[]): number {
  let s = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/* ── Humanoides ─────────────────────────────────────────────────────────────────── */

export type EstadoPersona = "visible" | "parcial" | "oculta" | "fuera";

export const ETIQUETA_ESTADO_PERSONA: Readonly<Record<EstadoPersona, string>> = {
  visible: "Visible",
  parcial: "Parcialmente visible",
  oculta: "Oculta por un muro",
  fuera: "Fuera de cuadro",
};

/** Alturas que se revisan en una persona: tobillos, rodillas, cadera y cabeza. */
export const ALTURAS_PERSONA_M = [0.15, 0.65, 1.15, 1.65] as const;

export type LecturaPersona = {
  estado: EstadoPersona;
  distanciaPisoM: number;
  distanciaVisualM: number;
  ppm: number;
  nivel: NivelCobertura;
};

/**
 * Cómo capta una cámara a una persona parada en `p`: cuántas de sus cuatro alturas caen
 * en el cuadro y cuántas sin muro de por medio, y su densidad («134 PPM · Reconocimiento
 * · persona a 10 m»).
 */
export function leerPersona(cam: CamaraM, tapas: readonly Tapa[], p: Punto): LecturaPersona {
  let enCuadroN = 0;
  let libres = 0;
  for (const h of ALTURAS_PERSONA_M) {
    if (!enCuadro(cam, p, h)) continue;
    enCuadroN++;
    if (!tapado(tapas, cam.pos, cam.alturaM, p, h)) libres++;
  }
  const estado: EstadoPersona =
    enCuadroN === 0 ? "fuera" : libres === 0 ? "oculta" : libres < ALTURAS_PERSONA_M.length ? "parcial" : "visible";
  const distanciaPisoM = Math.max(distancia(cam.pos, p), 0.1);
  const distanciaVisualM = distanciaInclinadaM(distanciaPisoM, cam.alturaM);
  const densidad = ppm(cam.pxHoriz, distanciaVisualM, cam.hfovDeg);
  return { estado, distanciaPisoM, distanciaVisualM, ppm: densidad, nivel: nivelDori(densidad) };
}

/**
 * La persona que le toca a una cámara en su recuadro de vista: la más cercana dentro de su
 * ángulo horizontal. Si no hay ninguna, null (se usa el punto de referencia al 60 % del cono).
 */
export function personaDeCamara<T extends { pos: Punto }>(cam: CamaraM, personas: readonly T[]): T | null {
  let mejor: T | null = null;
  let mejorD = Number.POSITIVE_INFINITY;
  for (const per of personas) {
    const d = distancia(cam.pos, per.pos);
    if (d < 0.1) continue;
    if (Math.abs(difRumbo(rumboEntre(cam.pos, per.pos), cam.rumboDeg)) > cam.hfovDeg / 2) continue;
    if (d < mejorD) {
      mejorD = d;
      mejor = per;
    }
  }
  return mejor;
}

/** Punto de referencia cuando no hay persona: al 60 % del cono, sobre el eje. */
export function puntoReferencia(cam: CamaraM): Punto {
  const d = dirRumbo(cam.rumboDeg);
  return { x: cam.pos.x + d.x * cam.distanciaM * 0.6, y: cam.pos.y + d.y * cam.distanciaM * 0.6 };
}

/* ── Mapa de calor: el mejor nivel en cada punto ────────────────────────────────── */

const ORDEN_NIVEL: Readonly<Record<NivelCobertura, number>> = {
  identificacion: 4,
  reconocimiento: 3,
  observacion: 2,
  deteccion: 1,
  general: 0,
};

/**
 * El mejor nivel con que alguna cámara ve la cabeza de una persona en `p`; null si
 * ninguna la ve. Base del mapa de calor y del «% del área con reconocimiento».
 */
export function mejorNivelEn(
  camaras: readonly CamaraM[],
  tapas: readonly Tapa[],
  p: Punto,
  alturaObjetivoM = 1.5,
): NivelCobertura | null {
  let mejor: NivelCobertura | null = null;
  for (const cam of camaras) {
    const dPiso = distancia(cam.pos, p);
    if (dPiso > cam.distanciaM) continue;
    if (!enCuadro(cam, p, alturaObjetivoM)) continue;
    if (tapado(tapas, cam.pos, cam.alturaM, p, alturaObjetivoM)) continue;
    const n = nivelDori(ppm(cam.pxHoriz, distanciaInclinadaM(dPiso, cam.alturaM), cam.hfovDeg));
    if (mejor == null || ORDEN_NIVEL[n] > ORDEN_NIVEL[mejor]) mejor = n;
  }
  return mejor;
}

/**
 * Reparto del área en una cuadrícula: qué fracción de las celdas alcanza cada nivel o
 * mejor. `dentro` decide qué celdas cuentan (el interior del predio).
 */
export function repartoDeArea(params: {
  camaras: readonly CamaraM[];
  tapas: readonly Tapa[];
  min: Punto;
  max: Punto;
  celdaM?: number;
  dentro?: (p: Punto) => boolean;
}): { celdas: number; porNivel: Record<NivelCobertura, number>; sinCobertura: number } {
  const celda = params.celdaM ?? 0.5;
  const porNivel: Record<NivelCobertura, number> = {
    identificacion: 0,
    reconocimiento: 0,
    observacion: 0,
    deteccion: 0,
    general: 0,
  };
  let celdas = 0;
  let sinCobertura = 0;
  for (let y = params.min.y + celda / 2; y < params.max.y; y += celda) {
    for (let x = params.min.x + celda / 2; x < params.max.x; x += celda) {
      const p = { x, y };
      if (params.dentro && !params.dentro(p)) continue;
      celdas++;
      const n = mejorNivelEn(params.camaras, params.tapas, p);
      if (n == null) sinCobertura++;
      else porNivel[n]++;
    }
  }
  return { celdas, porNivel, sinCobertura };
}

/** Tramo del piso dentro del cuadro para la ficha (zona ciega y alcance del borde superior). */
export function tramoEnPiso(cam: CamaraM) {
  return tramoVisible(cam.alturaM, cam.inclinacionDeg, cam.vfovDeg);
}
