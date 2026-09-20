/**
 * Check list de entrega y recepción de vehículos utilitarios.
 *
 * Lo que pidió la dirección, en sus palabras: «Solicitud y entrega de autos
 * utilitarios, con evidencia fotográfica 360° en ambos casos, así como del
 * tablero visualizando el kilometraje y tanque de gasolina inicial y final».
 *
 * Aquí viven las reglas puras —sin Prisma, sin Nest— para que las cumplan por
 * igual TODAS las rutas que abren o cierran una asignación:
 *   - `POST vehicles/:id/start-use`   /  `POST vehicles/:id/end-use`
 *   - `POST vehicles/inventory/:id/checkout` / `POST vehicles/inventory/:id/return`
 *
 * Antes la pareja de inventario aceptaba de 0 a 10 fotos sueltas, sin
 * kilometraje ni combustible. Ya no: una salida sin tablero no es una salida.
 */

/** Las cuatro caras del 360°. El orden es el que ve el usuario en pantalla. */
export const SLOTS_EXTERIOR = ['frontal', 'trasera', 'lateral-izq', 'lateral-der'] as const;

/** Interior: habitáculo y cajuela. */
export const SLOTS_INTERIOR = ['interior-delantera', 'interior-trasera'] as const;

/** El tablero: odómetro y aguja de gasolina en la misma foto. */
export const SLOT_TABLERO = 'tablero';

export const SLOTS_CHECKLIST = [
  ...SLOTS_EXTERIOR,
  ...SLOTS_INTERIOR,
  SLOT_TABLERO,
] as const;

export type SlotChecklist = (typeof SLOTS_CHECKLIST)[number];

/** Etiqueta corta para la app y la web. Sin prosa: cabe en un botón. */
export const ETIQUETA_SLOT: Record<SlotChecklist, string> = {
  frontal: 'Frente',
  trasera: 'Trasera',
  'lateral-izq': 'Lateral izq.',
  'lateral-der': 'Lateral der.',
  'interior-delantera': 'Interior frente',
  'interior-trasera': 'Interior atrás',
  tablero: 'Tablero',
};

export function esSlotChecklist(valor: unknown): valor is SlotChecklist {
  return typeof valor === 'string' && (SLOTS_CHECKLIST as readonly string[]).includes(valor);
}

// ─── Combustible ────────────────────────────────────────────────────────────

/**
 * Selector rápido junto a la foto del tablero. Nadie lee una aguja en
 * porcentajes: se lee E, ¼, ½, ¾, F. El porcentaje es lo que guardamos.
 */
export const NIVELES_COMBUSTIBLE = [
  { nivel: 'E', pct: 0 },
  { nivel: '1/4', pct: 25 },
  { nivel: '1/2', pct: 50 },
  { nivel: '3/4', pct: 75 },
  { nivel: 'F', pct: 100 },
] as const;

export type NivelCombustible = (typeof NIVELES_COMBUSTIBLE)[number]['nivel'];

/** `'1/2'` → 50. Un porcentaje directo (0–100) también vale. */
export function combustiblePctDesdeNivel(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return valor >= 0 && valor <= 100 ? Math.round(valor) : null;
  }
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  const nivel = NIVELES_COMBUSTIBLE.find((n) => n.nivel === limpio);
  if (nivel) return nivel.pct;
  const num = Number(limpio.replace('%', '').trim());
  if (!Number.isFinite(num)) return null;
  return num >= 0 && num <= 100 ? Math.round(num) : null;
}

/** 40 → '1/2' (el más cercano). Para pintar la aguja de vuelta en pantalla. */
export function nivelDesdeCombustiblePct(pct?: number | null): NivelCombustible | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  let mejor: (typeof NIVELES_COMBUSTIBLE)[number] = NIVELES_COMBUSTIBLE[0];
  for (const n of NIVELES_COMBUSTIBLE) {
    if (Math.abs(n.pct - pct) < Math.abs(mejor.pct - pct)) mejor = n;
  }
  return mejor.nivel;
}

// ─── Metadatos de captura (foto en vivo, no de galería) ─────────────────────

/**
 * Lo que la cámara en vivo entrega por foto. Sin `capturedAt` no hay forma de
 * distinguir una foto de hoy de una que el técnico tenía guardada del mes
 * pasado, así que sin `capturedAt` la foto no cuenta.
 */
export type FotoChecklist = {
  slot: SlotChecklist;
  url: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
};

export type MetaEntrada = {
  capturedAt?: unknown;
  lat?: unknown;
  lng?: unknown;
};

function aCoordenada(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const num = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(num)) return null;
  // 0,0 es el Golfo de Guinea: es «no tengo señal», no una ubicación.
  if (num === 0) return null;
  return num;
}

function aInstante(valor: unknown): string | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const d = new Date(valor.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Margen para aceptar una captura como «en vivo». El técnico puede tardar en
 * llenar el formulario y el reloj del teléfono puede ir corrido unos minutos.
 */
export const VENTANA_CAPTURA_HORAS = 12;

export type ErrorChecklist = { campo: string; mensaje: string };

export type EntradaChecklist = {
  /** slot → URL ya guardada del archivo subido. */
  fotos: Partial<Record<string, string>>;
  /** slot → metadatos que mandó el cliente (capturedAt, lat, lng). */
  meta?: Record<string, MetaEntrada | undefined>;
  odometroKm?: unknown;
  combustible?: unknown;
  /** En la devolución: el kilometraje con el que salió. */
  odometroInicio?: number | null;
  /** Para probar la ventana de captura sin depender del reloj real. */
  ahora?: Date;
};

export type ChecklistNormalizado = {
  fotos: FotoChecklist[];
  fotoTableroUrl: string;
  odometroKm: number;
  combustiblePct: number;
};

/**
 * Valida y normaliza una salida o una devolución. Devuelve TODOS los errores
 * juntos: que el técnico no descubra el segundo error después de arreglar el
 * primero, parado junto al coche.
 */
export function revisarChecklist(
  entrada: EntradaChecklist,
): { ok: true; datos: ChecklistNormalizado } | { ok: false; errores: ErrorChecklist[] } {
  const errores: ErrorChecklist[] = [];
  const ahora = entrada.ahora ?? new Date();
  const fotos: FotoChecklist[] = [];

  for (const slot of SLOTS_CHECKLIST) {
    const url = entrada.fotos?.[slot];
    if (!url) {
      errores.push({ campo: slot, mensaje: `Falta la foto: ${ETIQUETA_SLOT[slot]}` });
      continue;
    }
    const meta = entrada.meta?.[slot];
    const capturedAt = aInstante(meta?.capturedAt);
    if (!capturedAt) {
      errores.push({
        campo: slot,
        mensaje: `${ETIQUETA_SLOT[slot]}: toma la foto con la cámara, no de la galería`,
      });
      continue;
    }
    const edadHoras = (ahora.getTime() - new Date(capturedAt).getTime()) / 3_600_000;
    if (edadHoras > VENTANA_CAPTURA_HORAS) {
      errores.push({
        campo: slot,
        mensaje: `${ETIQUETA_SLOT[slot]}: la foto no es de ahora, vuelve a tomarla`,
      });
      continue;
    }
    fotos.push({
      slot,
      url,
      capturedAt,
      lat: aCoordenada(meta?.lat),
      lng: aCoordenada(meta?.lng),
    });
  }

  const odometroKm = Number(entrada.odometroKm);
  if (!Number.isFinite(odometroKm) || odometroKm < 0) {
    errores.push({ campo: 'odometroKm', mensaje: 'Captura el kilometraje del tablero' });
  } else if (entrada.odometroInicio != null && odometroKm < entrada.odometroInicio) {
    errores.push({
      campo: 'odometroKm',
      mensaje: `El kilometraje final no puede ser menor al inicial (${entrada.odometroInicio} km)`,
    });
  }

  const combustiblePct = combustiblePctDesdeNivel(entrada.combustible);
  if (combustiblePct == null) {
    errores.push({ campo: 'combustible', mensaje: 'Marca el nivel de gasolina (E, ¼, ½, ¾, F)' });
  }

  if (errores.length) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      fotos,
      fotoTableroUrl: fotos.find((f) => f.slot === SLOT_TABLERO)!.url,
      odometroKm: Math.round(odometroKm),
      combustiblePct: combustiblePct!,
    },
  };
}

/** Un solo renglón con todo lo que falta, para el mensaje del 400. */
export function mensajeErrores(errores: ErrorChecklist[]): string {
  return errores.map((e) => e.mensaje).join('. ');
}

/**
 * Lee los metadatos que llegan en un multipart. El cliente manda un campo
 * `meta` con JSON `{ "frontal": { capturedAt, lat, lng }, ... }`, o campos
 * sueltos `meta-frontal` con el JSON de esa foto (más fácil desde Android).
 */
export function leerMetaDelBody(body: Record<string, unknown> | undefined | null): Record<string, MetaEntrada> {
  const meta: Record<string, MetaEntrada> = {};
  if (!body) return meta;

  const crudo = body['meta'] ?? body['fotosMeta'];
  if (typeof crudo === 'string' && crudo.trim()) {
    try {
      const parsed = JSON.parse(crudo);
      if (parsed && typeof parsed === 'object') {
        for (const [slot, valor] of Object.entries(parsed as Record<string, unknown>)) {
          if (esSlotChecklist(slot) && valor && typeof valor === 'object') {
            meta[slot] = valor as MetaEntrada;
          }
        }
      }
    } catch {
      // Un meta ilegible se trata como ausente: revisarChecklist lo rechaza con
      // el mensaje de «toma la foto con la cámara», que es lo que el usuario
      // necesita leer.
    }
  } else if (crudo && typeof crudo === 'object') {
    for (const [slot, valor] of Object.entries(crudo as Record<string, unknown>)) {
      if (esSlotChecklist(slot) && valor && typeof valor === 'object') {
        meta[slot] = valor as MetaEntrada;
      }
    }
  }

  for (const slot of SLOTS_CHECKLIST) {
    const suelto = body[`meta-${slot}`];
    if (typeof suelto === 'string' && suelto.trim()) {
      try {
        const parsed = JSON.parse(suelto);
        if (parsed && typeof parsed === 'object') meta[slot] = parsed as MetaEntrada;
      } catch {
        /* igual que arriba */
      }
    }
  }

  return meta;
}
