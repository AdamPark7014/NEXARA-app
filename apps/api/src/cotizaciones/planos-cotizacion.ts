/**
 * 03 Planos: orden y nombre de los anexos propios de la cotización.
 *
 * Los planos se agregan subiendo el archivo (`POST /cotizaciones/:id/planos`) y se quitan con su
 * endpoint. El `PUT` de la cotización solo puede **reordenarlos y renombrarlos**: una URL que no
 * estaba no entra por aquí (el PDF lee los planos del disco a partir de su URL, así que una URL
 * inventada no debe poder colarse), y un plano que el cliente no mandó no se pierde.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export type PlanoGuardado = {
  url: string;
  nombre?: string | null;
  tipo?: string | null;
  origen?: string | null;
  at?: string | null;
  [otro: string]: unknown;
};

const MAX_NOMBRE = 120;

function lista(valor: unknown): Array<Record<string, unknown>> {
  return Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object') : [];
}

export function ordenarPlanos(existentes: unknown, entrantes: unknown): PlanoGuardado[] {
  const guardados = lista(existentes).filter((p) => typeof p['url'] === 'string' && p['url']) as PlanoGuardado[];
  const porUrl = new Map(guardados.map((p) => [p.url, p]));
  const usados = new Set<string>();
  const salida: PlanoGuardado[] = [];

  for (const entrante of lista(entrantes)) {
    const url = String(entrante['url'] ?? '');
    const guardado = porUrl.get(url);
    if (!guardado || usados.has(url)) continue;
    usados.add(url);
    const nombre = String(entrante['nombre'] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE);
    salida.push({ ...guardado, nombre: nombre || guardado.nombre || 'Plano' });
  }

  for (const guardado of guardados) {
    if (!usados.has(guardado.url)) salida.push(guardado);
  }
  return salida;
}
