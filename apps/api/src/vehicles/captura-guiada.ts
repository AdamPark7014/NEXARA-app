/**
 * Captura guiada de vehículo: 5 pasos en vivo al salir y al devolver.
 *
 * Lo que pidió la dirección (21-11-2026): «una sola toma alrededor del coche, asientos de atrás,
 * asientos de adelante, tablero completo y un acercamiento al kilometraje y la gasolina; la IA lo
 * interpreta todo y la persona solo confirma».
 *
 *   1. Vuelta completa: video de 10 a 20 s caminando alrededor de la unidad. La app saca 8 cuadros,
 *      uno por lado (`vuelta-1` … `vuelta-8`, empezando por el frente y hacia la derecha) y los sube
 *      junto con el video.
 *   2. Asientos traseros.
 *   3. Asientos delanteros.
 *   4. Tablero completo.
 *   5. Acercamiento a kilometraje y gasolina: la IA lo lee y la persona confirma o corrige.
 *
 * Reglas puras, sin Prisma ni Nest. El checklist de 7 fotos (`checklist-entrega.ts`) se sigue
 * aceptando mientras haya apps viejas en la calle.
 */
import {
  VENTANA_CAPTURA_HORAS,
  aCoordenada,
  aInstante,
  combustiblePctDesdeNivel,
  type ChecklistNormalizado,
  type ErrorChecklist,
  type FotoChecklist,
  type MetaEntrada,
} from './checklist-entrega.js';

/** Los 8 cuadros de la vuelta, en el orden en que se camina. */
export const VISTAS_VUELTA = [
  { slot: 'vuelta-1', etiqueta: 'Frente' },
  { slot: 'vuelta-2', etiqueta: 'Frente derecho' },
  { slot: 'vuelta-3', etiqueta: 'Lado derecho' },
  { slot: 'vuelta-4', etiqueta: 'Trasera derecha' },
  { slot: 'vuelta-5', etiqueta: 'Trasera' },
  { slot: 'vuelta-6', etiqueta: 'Trasera izquierda' },
  { slot: 'vuelta-7', etiqueta: 'Lado izquierdo' },
  { slot: 'vuelta-8', etiqueta: 'Frente izquierdo' },
] as const;

export const SLOTS_VUELTA = VISTAS_VUELTA.map((v) => v.slot);

/** Pasos 2 a 5: una foto cada uno. */
export const FOTOS_GUIADAS = [
  { slot: 'asientos-traseros', etiqueta: 'Asientos traseros' },
  { slot: 'asientos-delanteros', etiqueta: 'Asientos delanteros' },
  { slot: 'tablero', etiqueta: 'Tablero completo' },
  { slot: 'km-gasolina', etiqueta: 'Kilometraje y gasolina' },
] as const;

export const SLOT_KM_GASOLINA = 'km-gasolina';

export const SLOTS_GUIADA: readonly string[] = [...SLOTS_VUELTA, ...FOTOS_GUIADAS.map((f) => f.slot)];

/** Campo del multipart con el video de la vuelta. */
export const CAMPO_VIDEO_VUELTA = 'video-vuelta';

/** Duración aceptada de la vuelta. Un segundo de gracia por el redondeo del teléfono. */
export const DURACION_VUELTA_SEG = { min: 10, max: 20, gracia: 1 } as const;

/** Los 5 pasos tal como los enseñan la web y las apps. La regla vive aquí; las pantallas la consumen. */
export const PASOS_CAPTURA = [
  {
    paso: 1,
    id: 'vuelta',
    etiqueta: 'Vuelta completa',
    instruccion:
      'Camina una vuelta completa alrededor de la unidad, empezando por el frente y hacia tu derecha, sin detenerte. Entre 10 y 20 segundos.',
  },
  { paso: 2, id: 'asientos-traseros', etiqueta: 'Asientos traseros', instruccion: 'Abre una puerta trasera y toma todo el asiento de atrás.' },
  { paso: 3, id: 'asientos-delanteros', etiqueta: 'Asientos delanteros', instruccion: 'Toma los dos asientos de adelante desde la puerta del conductor.' },
  { paso: 4, id: 'tablero', etiqueta: 'Tablero completo', instruccion: 'Con el motor encendido, toma el tablero completo: volante, pantalla y testigos.' },
  {
    paso: 5,
    id: SLOT_KM_GASOLINA,
    etiqueta: 'Kilometraje y gasolina',
    instruccion: 'Acércate al odómetro y a la aguja de gasolina. La IA los lee y tú confirmas.',
  },
] as const;

const ETIQUETAS: Record<string, string> = Object.fromEntries([
  ...VISTAS_VUELTA.map((v) => [v.slot, v.etiqueta]),
  ...FOTOS_GUIADAS.map((f) => [f.slot, f.etiqueta]),
]);

export function etiquetaSlotGuiado(slot: string): string | null {
  return ETIQUETAS[slot] ?? null;
}

/** ¿El multipart trae la captura guiada (y no el checklist de 7 fotos)? */
export function esCapturaGuiada(fotos: Partial<Record<string, string>>, body?: Record<string, unknown> | null): boolean {
  if (String(body?.['capturaVersion'] ?? '').trim() === '2') return true;
  return SLOTS_VUELTA.some((s) => Boolean(fotos[s])) || Boolean(fotos[SLOT_KM_GASOLINA]);
}

export type LecturaKm = { odometroKm: number | null; combustiblePct: number | null };

export type EntradaGuiada = {
  /** slot → URL ya guardada (incluye `video-vuelta`). */
  fotos: Partial<Record<string, string>>;
  /** slot → { capturedAt, lat, lng }; el video además trae `duracionSeg`. */
  meta?: Record<string, (MetaEntrada & { duracionSeg?: unknown }) | undefined>;
  odometroKm?: unknown;
  combustible?: unknown;
  /** Lo que la IA leyó en el paso 5 antes de que la persona confirmara. */
  lecturaIa?: unknown;
  /** En la devolución: el kilometraje con el que salió. */
  odometroInicio?: number | null;
  ahora?: Date;
};

/** Igual que una foto del checklist, pero con los slots de la captura guiada. */
export type FotoGuiada = Omit<FotoChecklist, 'slot'> & { slot: string };

export type GuiadaNormalizada = Omit<ChecklistNormalizado, 'fotos'> & {
  fotos: FotoGuiada[];
  version: 2;
  videoUrl: string;
  duracionVideoSeg: number;
  lectura: { ia: LecturaKm | null; confirmado: LecturaKm; corregido: boolean };
};

/** `{"odometroKm":48215,"combustiblePct":50}` (texto o ya objeto) → lectura limpia; basura → null. */
export function leerLecturaIa(valor: unknown): LecturaKm | null {
  let crudo: unknown = valor;
  if (typeof valor === 'string') {
    if (!valor.trim()) return null;
    try {
      crudo = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (!crudo || typeof crudo !== 'object') return null;
  const o = crudo as Record<string, unknown>;
  const km = Number(o['odometroKm']);
  const pct = combustiblePctDesdeNivel(o['combustiblePct'] ?? o['combustible']);
  const odometroKm = o['odometroKm'] != null && Number.isFinite(km) && km >= 0 ? Math.round(km) : null;
  if (odometroKm == null && pct == null) return null;
  return { odometroKm, combustiblePct: pct };
}

function revisarFoto(
  slot: string,
  url: string | undefined,
  meta: MetaEntrada | undefined,
  ahora: Date,
  errores: ErrorChecklist[],
): FotoGuiada | null {
  const etiqueta = ETIQUETAS[slot] ?? slot;
  if (!url) {
    errores.push({ campo: slot, mensaje: `Falta la foto: ${etiqueta}` });
    return null;
  }
  const capturedAt = aInstante(meta?.capturedAt);
  if (!capturedAt) {
    errores.push({ campo: slot, mensaje: `${etiqueta}: tómala con la cámara en vivo, no de la galería` });
    return null;
  }
  const edadHoras = (ahora.getTime() - new Date(capturedAt).getTime()) / 3_600_000;
  if (edadHoras > VENTANA_CAPTURA_HORAS) {
    errores.push({ campo: slot, mensaje: `${etiqueta}: la foto no es de ahora, vuelve a tomarla` });
    return null;
  }
  return { slot, url, capturedAt, lat: aCoordenada(meta?.lat), lng: aCoordenada(meta?.lng) };
}

/**
 * Valida y normaliza una salida o devolución con captura guiada. Devuelve todos los errores juntos,
 * para que nadie descubra el segundo después de arreglar el primero, parado junto a la unidad.
 */
export function revisarCapturaGuiada(
  entrada: EntradaGuiada,
): { ok: true; datos: GuiadaNormalizada } | { ok: false; errores: ErrorChecklist[] } {
  const errores: ErrorChecklist[] = [];
  const ahora = entrada.ahora ?? new Date();
  const fotos: GuiadaNormalizada['fotos'] = [];

  // Paso 1: el video y sus 8 cuadros.
  const videoUrl = entrada.fotos?.[CAMPO_VIDEO_VUELTA];
  const metaVideo = entrada.meta?.[CAMPO_VIDEO_VUELTA];
  const duracion = Number(metaVideo?.duracionSeg);
  if (!videoUrl) {
    errores.push({ campo: CAMPO_VIDEO_VUELTA, mensaje: 'Falta el video de la vuelta completa' });
  } else if (!aInstante(metaVideo?.capturedAt)) {
    errores.push({ campo: CAMPO_VIDEO_VUELTA, mensaje: 'Graba la vuelta con la cámara en vivo, no de la galería' });
  } else if (
    !Number.isFinite(duracion) ||
    duracion < DURACION_VUELTA_SEG.min - DURACION_VUELTA_SEG.gracia ||
    duracion > DURACION_VUELTA_SEG.max + DURACION_VUELTA_SEG.gracia
  ) {
    errores.push({
      campo: CAMPO_VIDEO_VUELTA,
      mensaje: `La vuelta debe durar entre ${DURACION_VUELTA_SEG.min} y ${DURACION_VUELTA_SEG.max} segundos`,
    });
  }
  for (const slot of SLOTS_VUELTA) {
    const foto = revisarFoto(slot, entrada.fotos?.[slot], entrada.meta?.[slot], ahora, errores);
    if (foto) fotos.push(foto);
  }

  // Pasos 2 a 5.
  for (const { slot } of FOTOS_GUIADAS) {
    const foto = revisarFoto(slot, entrada.fotos?.[slot], entrada.meta?.[slot], ahora, errores);
    if (foto) fotos.push(foto);
  }

  const odometroKm = Number(entrada.odometroKm);
  if (entrada.odometroKm == null || entrada.odometroKm === '' || !Number.isFinite(odometroKm) || odometroKm < 0) {
    errores.push({ campo: 'odometroKm', mensaje: 'Confirma el kilometraje del tablero' });
  } else if (entrada.odometroInicio != null && odometroKm < entrada.odometroInicio) {
    errores.push({
      campo: 'odometroKm',
      mensaje: `El kilometraje final no puede ser menor al de salida (${entrada.odometroInicio} km)`,
    });
  }

  const combustiblePct = combustiblePctDesdeNivel(entrada.combustible);
  if (combustiblePct == null) {
    errores.push({ campo: 'combustible', mensaje: 'Confirma el nivel de gasolina (E, ¼, ½, ¾, F)' });
  }

  if (errores.length) return { ok: false, errores };

  const confirmado: LecturaKm = { odometroKm: Math.round(odometroKm), combustiblePct: combustiblePct! };
  const ia = leerLecturaIa(entrada.lecturaIa);
  const corregido = Boolean(
    ia &&
      ((ia.odometroKm != null && ia.odometroKm !== confirmado.odometroKm) ||
        (ia.combustiblePct != null && ia.combustiblePct !== confirmado.combustiblePct)),
  );

  return {
    ok: true,
    datos: {
      version: 2,
      fotos,
      fotoTableroUrl: fotos.find((f) => f.slot === SLOT_KM_GASOLINA)!.url,
      odometroKm: confirmado.odometroKm!,
      combustiblePct: confirmado.combustiblePct!,
      videoUrl: videoUrl!,
      duracionVideoSeg: Math.round(duracion),
      lectura: { ia, confirmado, corregido },
    },
  };
}

/**
 * Metadatos del multipart para la captura guiada. Igual que el checklist: un campo `meta` con JSON de
 * todos los slots, o `meta-<slot>` por separado (más fácil desde Android).
 */
export function leerMetaGuiada(body: Record<string, unknown> | undefined | null): Record<string, MetaEntrada & { duracionSeg?: unknown }> {
  const meta: Record<string, MetaEntrada & { duracionSeg?: unknown }> = {};
  if (!body) return meta;
  const validos = new Set([...SLOTS_GUIADA, CAMPO_VIDEO_VUELTA]);
  const poner = (slot: string, valor: unknown) => {
    if (validos.has(slot) && valor && typeof valor === 'object') meta[slot] = valor as MetaEntrada;
  };
  const crudo = body['meta'] ?? body['fotosMeta'];
  if (typeof crudo === 'string' && crudo.trim()) {
    try {
      const parsed = JSON.parse(crudo);
      if (parsed && typeof parsed === 'object') for (const [k, v] of Object.entries(parsed)) poner(k, v);
    } catch {
      /* ilegible = ausente: la revisión pide tomar la foto en vivo */
    }
  } else if (crudo && typeof crudo === 'object') {
    for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) poner(k, v);
  }
  for (const slot of validos) {
    const suelto = body[`meta-${slot}`];
    if (typeof suelto === 'string' && suelto.trim()) {
      try {
        poner(slot, JSON.parse(suelto));
      } catch {
        /* igual que arriba */
      }
    }
  }
  return meta;
}
