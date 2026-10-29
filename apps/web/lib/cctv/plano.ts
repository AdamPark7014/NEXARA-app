/**
 * Modelo del plano del Diseñador de videovigilancia.
 *
 * La geometría se guarda en píxeles del croquis (el dibujo que subió el arquitecto o el
 * encargado) y una escala la pasa a metros. Así, recalibrar con otra cota mueve todo junto
 * y los muros siguen encima de sus trazos. Sin croquis, el lienzo en blanco usa 50 px por
 * metro.
 *
 * Ejes del plano: x a la derecha, y hacia abajo (como el SVG). El rumbo de una cámara se
 * mide en grados en el sentido del reloj desde «arriba» del dibujo; el norte real del
 * terreno se guarda aparte (`norteDeg`) y solo se pinta.
 */
import type { Optica } from "./optica";

export type Punto = { x: number; y: number };

/** Muro: un trazo recto con altura y grosor. `vidrio` y `reja` no tapan la vista. */
export type Muro = {
  id: string;
  a: Punto;
  b: Punto;
  alturaM: number;
  grosorM: number;
  tipo: "muro" | "vidrio" | "reja";
};

/**
 * Hueco en un muro, como fracción de su largo (`desde`/`hasta` de 0 a 1 desde `a`).
 * - puerta: hoja que gira 90° si está abierta (de `bisagra`, hacia el lado `sentido`).
 * - ventana: tapa si no es transparente; arriba y abajo sigue el muro.
 * - acceso: hueco libre (portón abierto, cortina, paso).
 */
export type Abertura = {
  id: string;
  muroId: string;
  tipo: "puerta" | "ventana" | "acceso";
  desde: number;
  hasta: number;
  /** Altura del antepecho (0 en puertas y accesos). */
  baseM: number;
  alturaM: number;
  abierta: boolean;
  transparente: boolean;
  hojas: 1 | 2;
  bisagra: "inicio" | "fin";
  sentido: 1 | -1;
};

/** Volumen que tapa: columna, anaquel, rack, contenedor. Polígono en planta + altura. */
export type Obstaculo = {
  id: string;
  nombre?: string;
  puntos: Punto[];
  alturaM: number;
};

/** Texto del plano: nombre de un área («Área almacenamiento»). */
export type Etiqueta = { id: string; texto: string; pos: Punto; tamano?: number };

/** Cota: distancia acotada entre dos puntos (las amarillas del croquis). */
export type Cota = { id: string; a: Punto; b: Punto; texto?: string };

export type Lente = { optica: Optica; desfaseRumboDeg: number };

export type CamaraPlano = {
  id: string;
  /** Número en el plano y en la propuesta (1, 2, 3…). */
  numero: number;
  nombre: string;
  /** Producto del catálogo (clave SYSCOM o modelo Hikvision) y su etiqueta. */
  productoId?: string | null;
  modelo: string;
  pos: Punto;
  rumboDeg: number;
  /** Largo del cono: hasta dónde se dibuja la cobertura. */
  distanciaM: number;
  alturaM: number;
  inclinacionDeg: number;
  lentes: Lente[];
  esPtz?: boolean;
  /** Lugar de montaje para la cuadrilla: «muro», «poste», «techo». */
  montaje?: "muro" | "poste" | "techo";
};

/** Humanoide de referencia: se arrastra para ver cómo lo capta cada cámara. */
export type Persona = { id: string; pos: Punto; rumboDeg: number };

export type Escala = {
  /** Metros por píxel del croquis. */
  metrosPorPx: number;
  /** Cota que se usó para calibrar (para poder revisarla). */
  calibracion?: { a: Punto; b: Punto; metros: number } | null;
};

export type Plano = {
  version: 1;
  croquis?: { url: string; anchoPx: number; altoPx: number; opacidad: number } | null;
  escala: Escala;
  norteDeg: number;
  muros: Muro[];
  aberturas: Abertura[];
  obstaculos: Obstaculo[];
  etiquetas: Etiqueta[];
  cotas: Cota[];
  camaras: CamaraPlano[];
  personas: Persona[];
};

export const PX_POR_METRO_LIENZO = 50;

export function planoVacio(): Plano {
  return {
    version: 1,
    croquis: null,
    escala: { metrosPorPx: 1 / PX_POR_METRO_LIENZO, calibracion: null },
    norteDeg: 0,
    muros: [],
    aberturas: [],
    obstaculos: [],
    etiquetas: [],
    cotas: [],
    camaras: [],
    personas: [],
  };
}

/* ── Escala ─────────────────────────────────────────────────────────────────────── */

export const distancia = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Calibra con una cota: dos puntos del croquis y la medida real entre ellos. Devuelve
 * null si los puntos están encimados o la medida no sirve.
 */
export function calibrar(a: Punto, b: Punto, metros: number): Escala | null {
  const px = distancia(a, b);
  if (px < 2 || !(metros > 0) || !Number.isFinite(metros)) return null;
  return { metrosPorPx: metros / px, calibracion: { a, b, metros } };
}

/* ── Rumbo ──────────────────────────────────────────────────────────────────────── */

/** Vector unitario del rumbo (0° = arriba, 90° = derecha). */
export function dirRumbo(rumboDeg: number): Punto {
  const r = (rumboDeg * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/** Rumbo de `a` hacia `b`, de 0 a 360. */
export function rumboEntre(a: Punto, b: Punto): number {
  const g = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return (g + 360) % 360;
}

/** Diferencia de rumbos en (-180, 180]. */
export function difRumbo(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/* ── Plano en metros: lo que tapa la vista ──────────────────────────────────────── */

/**
 * Tramo vertical que tapa la vista: un segmento en planta (metros) que ocupa de `baseM`
 * a `topeM`. Es lo único que necesita la oclusión.
 */
export type Tapa = { a: Punto; b: Punto; baseM: number; topeM: number; origen: string };

/** Pasa un punto del croquis a metros. */
export function aMetros(p: Punto, escala: Escala): Punto {
  return { x: p.x * escala.metrosPorPx, y: p.y * escala.metrosPorPx };
}

/**
 * Hojas de una puerta en metros: una (o dos, al centro) que giran 90° sobre la bisagra
 * cuando la puerta está abierta; cerrada, tapa el hueco.
 */
export function hojasPuerta(ab: Abertura, a: Punto, b: Punto): Array<{ a: Punto; b: Punto }> {
  const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const pares: Array<{ eje: Punto; punta: Punto; giro: number }> =
    ab.hojas === 2
      ? [
          { eje: a, punta: medio, giro: ab.sentido },
          { eje: b, punta: medio, giro: -ab.sentido },
        ]
      : ab.bisagra === "fin"
        ? [{ eje: b, punta: a, giro: -ab.sentido }]
        : [{ eje: a, punta: b, giro: ab.sentido }];
  return pares.map(({ eje, punta, giro }) => ({
    a: eje,
    b: ab.abierta
      ? { x: eje.x - (punta.y - eje.y) * giro, y: eje.y + (punta.x - eje.x) * giro }
      : punta,
  }));
}

/**
 * Todo lo que tapa, en metros: cada muro partido por sus aberturas (el antepecho y el
 * dintel siguen tapando), las hojas de las puertas, las ventanas opacas y los costados
 * de cada obstáculo.
 */
export function tapasDelPlano(plano: Pick<Plano, "muros" | "aberturas" | "obstaculos" | "escala">): Tapa[] {
  const tapas: Tapa[] = [];
  for (const muro of plano.muros) {
    if (muro.tipo !== "muro") continue;
    const a = aMetros(muro.a, plano.escala);
    const b = aMetros(muro.b, plano.escala);
    const en = (t: number): Punto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const tramo = (t0: number, t1: number, baseM: number, topeM: number, origen = muro.id) => {
      if (t1 - t0 > 1e-4 && topeM - baseM > 1e-3) tapas.push({ a: en(t0), b: en(t1), baseM, topeM, origen });
    };
    const huecos = plano.aberturas
      .filter((x) => x.muroId === muro.id)
      .map((x) => ({ ...x, desde: Math.max(0, Math.min(x.desde, x.hasta)), hasta: Math.min(1, Math.max(x.desde, x.hasta)) }))
      .sort((x, y) => x.desde - y.desde);
    let cursor = 0;
    for (const h of huecos) {
      const desde = Math.max(h.desde, cursor);
      if (h.hasta <= desde) continue;
      tramo(cursor, desde, 0, muro.alturaM);
      tramo(desde, h.hasta, 0, Math.min(h.baseM, muro.alturaM));
      tramo(desde, h.hasta, Math.min(h.baseM + h.alturaM, muro.alturaM), muro.alturaM);
      if (h.tipo === "puerta") {
        for (const hoja of hojasPuerta(h, en(desde), en(h.hasta))) {
          tapas.push({ ...hoja, baseM: h.baseM, topeM: Math.min(h.baseM + h.alturaM, muro.alturaM), origen: h.id });
        }
      } else if (h.tipo === "ventana" && !h.transparente) {
        tramo(desde, h.hasta, h.baseM, Math.min(h.baseM + h.alturaM, muro.alturaM), h.id);
      }
      cursor = h.hasta;
    }
    tramo(cursor, 1, 0, muro.alturaM);
  }
  for (const o of plano.obstaculos) {
    const pts = o.puntos.map((p) => aMetros(p, plano.escala));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (distancia(a, b) > 1e-4) tapas.push({ a, b, baseM: 0, topeM: o.alturaM, origen: o.id });
    }
  }
  return tapas;
}

/* ── Validación al guardar ──────────────────────────────────────────────────────── */

/** Problemas del plano en palabras para quien lo dibuja. Vacío si está bien. */
export function problemasDelPlano(plano: Plano): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const muros = new Map(plano.muros.map((m) => [m.id, m]));
  for (const m of plano.muros) {
    if (ids.has(m.id)) out.push(`El muro ${m.id} está repetido.`);
    ids.add(m.id);
    if (distancia(m.a, m.b) * plano.escala.metrosPorPx < 0.05) out.push(`El muro ${m.id} no tiene largo.`);
    if (!(m.alturaM > 0)) out.push(`El muro ${m.id} no tiene altura.`);
  }
  for (const ab of plano.aberturas) {
    const m = muros.get(ab.muroId);
    if (!m) {
      out.push(`La ${ab.tipo} ${ab.id} no está en ningún muro.`);
      continue;
    }
    if (ab.hasta - ab.desde < 0.001) out.push(`La ${ab.tipo} ${ab.id} no tiene ancho.`);
    if (ab.baseM + ab.alturaM > m.alturaM + 1e-6) out.push(`La ${ab.tipo} ${ab.id} es más alta que su muro.`);
    const encimada = plano.aberturas.some(
      (o) => o !== ab && o.muroId === ab.muroId && o.desde < ab.hasta && o.hasta > ab.desde,
    );
    if (encimada) out.push(`La ${ab.tipo} ${ab.id} se encima con otra del mismo muro.`);
  }
  const numeros = new Set<number>();
  for (const c of plano.camaras) {
    if (numeros.has(c.numero)) out.push(`Hay dos cámaras con el número ${c.numero}.`);
    numeros.add(c.numero);
    if (!(c.distanciaM > 0)) out.push(`La cámara ${c.numero} no tiene alcance.`);
    if (!(c.alturaM > 0)) out.push(`La cámara ${c.numero} no tiene altura de montaje.`);
    if (!c.lentes.length) out.push(`La cámara ${c.numero} no tiene lente.`);
  }
  return out;
}

/** Siguiente número libre para una cámara nueva. */
export function siguienteNumero(camaras: Pick<CamaraPlano, "numero">[]): number {
  return camaras.reduce((max, c) => Math.max(max, c.numero), 0) + 1;
}
