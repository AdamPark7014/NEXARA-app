/**
 * ¿Este cliente ya está en el padrón con otro nombre? Claude solo ve lo que el código no pudo
 * decidir (`ventas/clientes-parecidos.ts` resuelve siglas, acentos, formas jurídicas y errores de
 * dedo): nombres que hay que conocer, como «ITESM» y «Tecnológico de Monterrey» o «Seguro Social» e
 * «IMSS». Solo avisa: la persona decide. Modelo y parámetros medidos con el eval
 * (`npm run eval:duplicados -w apps/api`).
 */

export type FichaPadron = { id: number; name: string; legalName?: string | null };

export type CoincidenciaIa = { id: number; seguridad: 'alta' | 'media'; porque: string };

type SalidaDuplicados = { nombreOficial?: string; coincidencias: CoincidenciaIa[] };

export const ESQUEMA_DUPLICADOS: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['nombreOficial', 'coincidencias'],
  properties: {
    nombreOficial: { type: 'string' },
    coincidencias: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'seguridad', 'porque'],
        properties: {
          id: { type: 'integer' },
          seguridad: { type: 'string', enum: ['alta', 'media'] },
          porque: { type: 'string' },
        },
      },
    },
  },
};

export const PROMPT_DUPLICADOS = `Detectas clientes repetidos en el padrón de una empresa mexicana. Recibes el NOMBRE de un cliente que se quiere dar de alta y el PADRÓN, una línea por cliente: id | nombre | razón social. Lo normal es que el cliente sea nuevo y la lista salga vacía.

Paso 1. En «nombreOficial» escribe qué organización es el NOMBRE, con su nombre oficial completo tal como lo conoces. Si no la conoces, copia el NOMBRE.

Paso 2. En «coincidencias» pon solo los del padrón que sean exactamente ESA organización:
- Siglas y nombre completo: ITESM y Tecnológico de Monterrey; Lotenal y Lotería Nacional.
- Nombre corto o coloquial: Seguro Social e IMSS; la Autónoma de Puebla y BUAP.
- Marca y razón social de la misma empresa: Banorte y Banco Mercantil del Norte.

Nunca pongas:
- Otra organización con siglas o nombre parecido: UPAEP (Universidad Popular Autónoma del Estado de Puebla) y BUAP; ISSSTE e IMSS; Cinemex y Cinépolis; UDLAP y BUAP.
- Otra empresa del mismo grupo o con otra marca: Bodega Aurrerá y Walmart; Suburbia y Liverpool.
- Algo que solo comparte giro, ciudad o una palabra: Colegio Americano y Colegio Humboldt; Hospital Puebla y Hospital Ángeles Puebla; Tecnológico de Puebla y Tecnológico de Monterrey.
- Un nombre del padrón que no reconoces como esa organización: un aviso falso estorba más que uno que falta.

«seguridad»: «alta» si lo sabes, «media» si es muy probable. Nunca inventes un id. «porque»: máximo 8 palabras, en español.`;

export const CONFIG_DUPLICADOS = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 260,
  timeoutMs: 5_000,
  reintentos: 0,
};

/** Tope de líneas del padrón: arriba de esto, el aviso se queda con lo que resuelve el código. */
export const MAX_PADRON_IA = 400;

const limpio = (s: string | null | undefined) => String(s ?? '').replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** La petición completa a Claude (el servicio y el eval mandan exactamente lo mismo). */
export function peticionDuplicados(nombre: string, padron: FichaPadron[]) {
  const lineas = padron.slice(0, MAX_PADRON_IA).map((c) => {
    const razon = limpio(c.legalName);
    return `${c.id} | ${limpio(c.name)}${razon && razon !== limpio(c.name) ? ` | ${razon}` : ''}`;
  });
  return {
    sistema: [PROMPT_DUPLICADOS],
    usuario: `NOMBRE: ${limpio(nombre).slice(0, 200)}\n\nPADRÓN:\n${lineas.join('\n')}`,
    esquema: ESQUEMA_DUPLICADOS,
    modelo: CONFIG_DUPLICADOS.modelo,
    esfuerzo: CONFIG_DUPLICADOS.esfuerzo,
    pensar: CONFIG_DUPLICADOS.pensar,
    maxTokens: CONFIG_DUPLICADOS.maxTokens,
    timeoutMs: CONFIG_DUPLICADOS.timeoutMs,
    reintentos: CONFIG_DUPLICADOS.reintentos,
  };
}

/** Solo ids que existen en lo que se le mandó, sin repetir. */
export function limpiarDuplicados(datos: Partial<SalidaDuplicados> | null | undefined, padron: FichaPadron[]): CoincidenciaIa[] {
  const validos = new Set(padron.map((c) => c.id));
  const vistos = new Set<number>();
  const salida: CoincidenciaIa[] = [];
  for (const c of Array.isArray(datos?.coincidencias) ? datos.coincidencias : []) {
    const id = Number(c?.id);
    if (!validos.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    salida.push({ id, seguridad: c?.seguridad === 'alta' ? 'alta' : 'media', porque: limpio(c?.porque).slice(0, 80) });
  }
  return salida.slice(0, 3);
}
