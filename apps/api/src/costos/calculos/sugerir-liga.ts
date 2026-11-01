/**
 * A qué proyecto va una actividad suelta. El código resuelve lo que se puede con certeza (mismo
 * cliente, nombre en el título, trabajo interno); la IA solo ve lo que queda dudoso. La persona
 * siempre decide: esto es una sugerencia.
 *
 * Módulo puro.
 */
export const TIPOS_LIGA = ['PROYECTO', 'COTIZACION', 'INTERNA'] as const;
export type TipoLiga = (typeof TIPOS_LIGA)[number];

export type ActividadSuelta = {
  titulo: string;
  coreKind?: string | null;
  clientId?: number | null;
  /** Nombre del cliente, para reconocer los de relleno. */
  cliente?: string | null;
  /** Cliente o lugar, en texto: nombre del cliente, sucursal o ciudad. */
  lugar?: string | null;
  cotizacionId?: number | null;
};

export type Candidato = {
  tipo: 'PROYECTO' | 'COTIZACION';
  id: number;
  nombre: string;
  clientId?: number | null;
  cliente?: string | null;
};

export type Sugerencia = {
  tipo: TipoLiga;
  id: number | null;
  nombre: string;
  motivo: string;
  fuente: 'REGLA' | 'IA';
};

/**
 * No distinguen un trabajo de otro: el vocabulario del giro. Con datos reales, «Guía de cableado
 * estructurado» se sugería para la cotización de cableado de un cliente.
 */
const VACIAS = new Set(
  `de del la el los las y o a en con para por un una al su sus que se es lo le cliente proyecto cotizacion
   instalacion servicio sitio sucursal oficina sa cv rl sapi grupo empresa
   cctv camara camaras videovigilancia cableado estructurado red redes datos voz fibra control acceso accesos
   equipo equipos sistema sistemas suministro propuesta tecnica mantenimiento preventivo correctivo soporte
   ampliacion renovacion migracion nivel nueva nuevo nuevas nuevos`.split(/\s+/),
);

export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function palabras(texto: unknown): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
}

/** Clientes de relleno del padrón: compartirlo no dice nada. */
const RE_CLIENTE_DE_RELLENO = /^(a quien corresponda|publico en general|publico general|sin cliente|varios|general)$/;

export function esClienteDeRelleno(nombre: unknown): boolean {
  return RE_CLIENTE_DE_RELLENO.test(normalizar(nombre));
}

/** Trabajo de la propia empresa: nunca se le cobra a un proyecto. */
const RE_INTERNA =
  /\b(ordenar|limpi(ar|eza)|inventario|capacitacion|junta|reunion semanal|lavar|recursos humanos|nomina|factur(a|ar|acion)|cfdi|ingresos|egresos|impuestos|declaracion|papeleria|bodega|almacen|oficina|cursos?|manual interno|pagar|depositar|deposito|banco|administrativ[oa]s?|mantenimiento (de|del) (la )?(camioneta|vehiculo|auto))\b/;

/** Lo que nombra a un cliente o un trabajo concreto, aunque diga bodega u oficina. */
const RE_TRABAJO_DE_CLIENTE = /\b(camaras?|cctv|nvr|dvr|cableado|fibra|acceso|lectora|torniquete|switch|rack|levantamiento|cotizar|propuesta)\b/;

function coincidencia(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const conjunto = new Set(b);
  return a.filter((p) => conjunto.has(p)).length;
}

/**
 * Sugerencia por reglas, o null si no hay certeza. Solo la da cuando un candidato gana claro; un
 * empate va a la IA, porque dos proyectos del mismo cliente no se distinguen por el cliente.
 */
export function sugerirPorReglas(a: ActividadSuelta, candidatos: readonly Candidato[]): Sugerencia | null {
  if (a.cotizacionId) {
    const c = candidatos.find((x) => x.tipo === 'COTIZACION' && x.id === a.cotizacionId);
    return {
      tipo: 'COTIZACION',
      id: a.cotizacionId,
      nombre: c?.nombre ?? `Cotización ${a.cotizacionId}`,
      motivo: 'Es la actividad comercial de esa cotización',
      fuente: 'REGLA',
    };
  }

  const relleno = esClienteDeRelleno(a.cliente);
  const lugar = relleno ? String(a.lugar ?? '').replace(String(a.cliente), '') : a.lugar;
  const titulo = palabras(`${a.titulo} ${lugar ?? ''}`);
  const puntos = candidatos
    .map((c) => {
      const clienteVale = !esClienteDeRelleno(c.cliente);
      const delCliente = Boolean(!relleno && clienteVale && a.clientId && c.clientId && a.clientId === c.clientId);
      const porNombre = coincidencia(palabras(c.nombre), titulo);
      const porCliente = clienteVale ? coincidencia(palabras(c.cliente), titulo) : 0;
      return { c, delCliente, porNombre, porCliente, total: (delCliente ? 3 : 0) + porNombre * 2 + porCliente * 2 };
    })
    .filter((x) => x.total >= 3)
    .sort((x, y) => y.total - x.total || (x.c.tipo === 'PROYECTO' ? -1 : 1));

  const [mejor, segundo] = puntos;
  if (mejor && (!segundo || mejor.total > segundo.total)) {
    const motivo = mejor.delCliente
      ? 'Es del mismo cliente'
      : mejor.porNombre > 0
        ? 'El título nombra ese trabajo'
        : 'El título nombra a ese cliente';
    return { tipo: mejor.c.tipo, id: mejor.c.id, nombre: mejor.c.nombre, motivo, fuente: 'REGLA' };
  }
  if (mejor) return null;

  const texto = normalizar(a.titulo);
  const sinCliente = !a.clientId || relleno;
  if (RE_INTERNA.test(texto) && !RE_TRABAJO_DE_CLIENTE.test(texto) && sinCliente) {
    return { tipo: 'INTERNA', id: null, nombre: 'Trabajo interno', motivo: 'No es de un cliente: va a indirectos', fuente: 'REGLA' };
  }
  return null;
}

/* ── Lo dudoso, con IA ────────────────────────────────────────────────────── */

export const PROMPT_LIGA = `Clasificas actividades de NEXARA, empresa mexicana de CCTV, redes, control de acceso e infraestructura TI, para saber a qué proyecto se le carga su costo.

Respondes una de estas:
- PROYECTO o COTIZACION con el id de un candidato: si el texto apunta claramente a ese trabajo o a ese cliente.
- INTERNA: trabajo de la propia empresa que no se le cobra a nadie (ordenar la bodega, administración, capacitación, compras generales, mantenimiento de vehículos).
- NINGUNA: si no alcanza para saberlo.

Reglas:
- Solo puedes elegir ids de la lista de candidatos. Nunca inventes uno.
- Si dos candidatos podrían ser y el texto no los distingue, responde NINGUNA.
- Equivocarse le carga el costo al proyecto incorrecto; ante la duda, NINGUNA.
- Una tarea para un cliente que no está en los candidatos es NINGUNA, no INTERNA.
- motivo: máximo 12 palabras, en español, citando lo que leíste en el texto.`;

export const ESQUEMA_LIGA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'id', 'motivo'],
  properties: {
    tipo: { type: 'string', enum: ['PROYECTO', 'COTIZACION', 'INTERNA', 'NINGUNA'] },
    id: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    motivo: { type: 'string' },
  },
};

export const CONFIG_LIGA = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 120,
  timeoutMs: 6_000,
  reintentos: 0,
};

/** A lo mucho estos candidatos por actividad: es lo que más cuesta del mensaje. */
export const TOPE_CANDIDATOS_IA = 12;

/** Los candidatos que más se parecen a la actividad; si ninguno se parece, los primeros. */
export function candidatosParaIa(a: ActividadSuelta, candidatos: readonly Candidato[]): Candidato[] {
  const titulo = palabras(`${a.titulo} ${a.lugar ?? ''}`);
  return candidatos
    .map((c, i) => ({ c, i, p: coincidencia(palabras(`${c.nombre} ${c.cliente ?? ''}`), titulo) }))
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .slice(0, TOPE_CANDIDATOS_IA)
    .map((x) => x.c);
}

export function peticionLiga(a: ActividadSuelta, candidatos: readonly Candidato[]) {
  const lista = candidatos.length
    ? candidatos
        .map((c) => `${c.tipo} ${c.id}: ${c.nombre}${c.cliente ? ` (cliente: ${c.cliente})` : ''}`)
        .join('\n')
    : '(ninguno)';
  const usuario = [
    `Actividad: ${String(a.titulo ?? '').trim().slice(0, 300)}`,
    `Tipo: ${a.coreKind?.trim() || 'sin tipo'}`,
    a.lugar?.trim() ? `Lugar o cliente: ${a.lugar.trim().slice(0, 120)}` : null,
    `Candidatos:\n${lista}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    sistema: [PROMPT_LIGA],
    usuario,
    esquema: ESQUEMA_LIGA,
    modelo: CONFIG_LIGA.modelo,
    esfuerzo: CONFIG_LIGA.esfuerzo,
    pensar: CONFIG_LIGA.pensar,
    maxTokens: CONFIG_LIGA.maxTokens,
    timeoutMs: CONFIG_LIGA.timeoutMs,
    reintentos: CONFIG_LIGA.reintentos,
  };
}

export type RespuestaLiga = { tipo?: unknown; id?: unknown; motivo?: unknown };

/** Lo que responda la IA solo se acepta si apunta a un candidato real. */
export function limpiarLiga(r: RespuestaLiga | null | undefined, candidatos: readonly Candidato[]): Sugerencia | null {
  if (!r) return null;
  const motivo = String(r.motivo ?? '').trim().slice(0, 120);
  if (r.tipo === 'INTERNA') {
    return { tipo: 'INTERNA', id: null, nombre: 'Trabajo interno', motivo: motivo || 'Es trabajo interno', fuente: 'IA' };
  }
  if (r.tipo !== 'PROYECTO' && r.tipo !== 'COTIZACION') return null;
  const c = candidatos.find((x) => x.tipo === r.tipo && x.id === Number(r.id));
  if (!c) return null;
  return { tipo: c.tipo, id: c.id, nombre: c.nombre, motivo: motivo || 'Lo sugiere la IA', fuente: 'IA' };
}
