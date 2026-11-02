/**
 * «Cotizar con IA»: Claude solo pasa la frase a renglones. No ve el catálogo, los clientes ni los
 * precios; eso lo resuelve el código (`cotizaciones/emparejar-partidas.ts`) con lo que ella devuelve.
 * Y solo llega lo que el código no pudo leer solo (`cotizaciones/cotizar-frase.ts`).
 * Modelo y parámetros medidos con el eval (`npm run eval:cotizar -w apps/api`).
 */

export const UNIDADES_IA = ['Metro', 'Servicio', 'Lote', 'Licencia', 'Caja', 'Kit', 'Hora'] as const;
export type UnidadIa = (typeof UNIDADES_IA)[number];

export type LineaIa = { cant: number | null; unidad: UnidadIa | null; concepto: string };
export type SalidaCotizar = { cliente: string | null; proyecto: string | null; lineas: LineaIa[] };

export const ESQUEMA_COTIZAR: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['cliente', 'proyecto', 'lineas'],
  properties: {
    cliente: { type: ['string', 'null'] },
    proyecto: { type: ['string', 'null'] },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cant', 'unidad', 'concepto'],
        properties: {
          cant: { type: ['integer', 'null'] },
          unidad: { anyOf: [{ type: 'string', enum: [...UNIDADES_IA] }, { type: 'null' }] },
          concepto: { type: 'string' },
        },
      },
    },
  },
};

export const PROMPT_COTIZAR = `Pasas a renglones lo que alguien de una empresa mexicana de CCTV, redes, control de acceso y cómputo pide cotizar. Puede venir dictado y con errores. No inventes productos ni precios.

lineas: un renglón por cada cosa que se pide, en el orden dicho.
- cant: cuántas se piden; «un par» = 2, «una docena» = 12; null si no lo dijeron. Lo que describe al producto no es cantidad: «cable HDMI de 5 metros» es 1, «licencia de 300 usuarios y 40 dispositivos» es 1, «switch de 48 puertos» es 1. «120 metros de cable» y «120 metros de tendido» sí son 120.
- unidad: Metro si la cantidad va en metros; Servicio para instalación, configuración, mantenimiento o mano de obra; Lote para canalización o un conjunto sin cantidad; Licencia, Caja, Kit u Hora si lo dijeron así. null en lo demás.
- concepto: el producto con sus datos (tipo, marca, modelo, capacidad, canales), sin la cantidad y sin verbos, con las palabras que usaron: no traduzcas ni renombres («body cam» sigue siendo «body cam»). «NVR de 32» es «NVR 32 canales». Corrige lo mal oído: «en ve erre» es NVR, «de ve erre» es DVR, «pe o e» es PoE, «u pe ese» es UPS.
- Si el producto lleva «instaladas» o «con instalación», agrega «Instalación de <lo que se instala>» con la misma cantidad y unidad Servicio. Si la instalación se dice aparte y sin cantidad («... e instalación y configuración»), es un solo renglón con cant null. «Traslado e instalación de X» también es uno.
- «con» puede describir el mismo producto o sumar otro: «cámaras con audio» es un renglón; «cámaras con NVR» son dos, y «con envío» agrega un renglón de 1.
- Un servicio sobre equipos es un solo renglón: «mantenimiento a 29 cámaras» es 29 de «Mantenimiento a cámaras».
- No agregues nada que no pidieron: ni armado, ni póliza, ni renglones de título.

cliente: a quién se le cotiza, solo su nombre, sin «la bodega de» ni «el área de». null si no lo dijeron.
proyecto: de 2 a 6 palabras con qué se cotiza y dónde, para el título. Ejemplos: «Videovigilancia en bodega», «Suministro de laptops». null si solo es una pieza suelta.`;

export const CONFIG_COTIZAR = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 800,
  timeoutMs: 8_000,
  reintentos: 1,
};

/** Lo más largo que se le manda: una frase, no una ficha técnica. */
export const MAX_FRASE_IA = 1_500;

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionCotizar(frase: string) {
  return {
    sistema: [PROMPT_COTIZAR],
    usuario: frase.replace(/\s+/g, ' ').trim().slice(0, MAX_FRASE_IA),
    esquema: ESQUEMA_COTIZAR,
    modelo: CONFIG_COTIZAR.modelo,
    esfuerzo: CONFIG_COTIZAR.esfuerzo,
    pensar: CONFIG_COTIZAR.pensar,
    maxTokens: CONFIG_COTIZAR.maxTokens,
    timeoutMs: CONFIG_COTIZAR.timeoutMs,
    reintentos: CONFIG_COTIZAR.reintentos,
  };
}

/** Lo que devuelve la IA, sin renglones vacíos ni cantidades absurdas. */
export function limpiarSalidaCotizar(datos: SalidaCotizar | null | undefined): SalidaCotizar {
  const lineas = (Array.isArray(datos?.lineas) ? datos!.lineas : [])
    .map((l) => ({
      cant: Number.isInteger(l?.cant) && Number(l.cant) > 0 && Number(l.cant) <= 1_000_000 ? Number(l.cant) : null,
      unidad: UNIDADES_IA.includes(l?.unidad as UnidadIa) ? (l.unidad as UnidadIa) : null,
      concepto: String(l?.concepto ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((l) => l.concepto);
  return {
    cliente: String(datos?.cliente ?? '').trim() || null,
    proyecto: String(datos?.proyecto ?? '').trim() || null,
    lineas,
  };
}
