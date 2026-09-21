import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listUsers } from './users-api';

/**
 * El tope real vive en la API (`PaginationQueryDto`, `@Max(100)`). Pedir más
 * devolvía 400 y dejaba el catálogo vacío sin que se notara: tres pantallas
 * llamaban con `limit: 200` y una cuarta sin parámetros, quedándose con los 20
 * del valor por omisión creyendo que eran todos.
 */
describe('listUsers · paginado', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const fila = (id: number) => ({ id, nombre: `Usuario ${id}` });

  /** Responde como la API: `{ data, meta }`, recortando por `page` y `limit`. */
  const servidorCon = (totalFilas: number) => {
    const todas = Array.from({ length: totalFilas }, (_, i) => fila(i + 1));
    return vi.fn(async (url: string) => {
      const query = new URL(url, 'http://x').searchParams;
      const limit = Number(query.get('limit'));
      const page = Number(query.get('page') || 1);
      if (limit > 100) {
        return new Response(
          JSON.stringify({ message: 'limit must not be greater than 100' }),
          { status: 400 },
        );
      }
      const desde = (page - 1) * limit;
      return new Response(
        JSON.stringify({ data: todas.slice(desde, desde + limit), meta: { total: totalFilas } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const usar = (total: number) => {
    fetchMock = servidorCon(total);
    vi.stubGlobal('fetch', fetchMock);
  };

  it('nunca pide más de 100 por llamada, aunque le pidan 200', async () => {
    usar(250);
    await listUsers('tok', { limit: 200 });
    for (const [url] of fetchMock.mock.calls) {
      expect(Number(new URL(url as string, 'http://x').searchParams.get('limit'))).toBeLessThanOrEqual(100);
    }
  });

  it('devuelve los 200 pedidos recorriendo páginas', async () => {
    usar(250);
    const filas = await listUsers('tok', { limit: 200 });
    expect(filas).toHaveLength(200);
    expect(filas[0].id).toBe(1);
    expect(filas[199].id).toBe(200);
  });

  it('sin parámetros trae la lista entera, no los primeros 20', async () => {
    usar(137);
    const filas = await listUsers('tok');
    expect(filas).toHaveLength(137);
  });

  it('para en cuanto el servidor devuelve una página incompleta', async () => {
    usar(40);
    const filas = await listUsers('tok');
    expect(filas).toHaveLength(40);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con `page` explícito pide esa página y ninguna más', async () => {
    usar(250);
    const filas = await listUsers('tok', { page: 2, limit: 50 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(filas).toHaveLength(50);
    expect(filas[0].id).toBe(51);
  });
});
