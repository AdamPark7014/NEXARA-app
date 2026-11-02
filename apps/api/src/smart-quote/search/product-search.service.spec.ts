import { ProductSearchService } from './product-search.service';

type Fila = { id: number; clave: string; modelo: string; existencia: Record<string, number> };

const fila = (id: number, modelo: string, existencia: Record<string, number> = {}): Fila => ({
  id,
  clave: `CLV${id}`,
  modelo,
  existencia,
});

const conPiezas = (id: number, modelo: string, piezas = 5) => fila(id, modelo, { PUE: piezas });

const completar = (f: Fila) => ({
  numParte: null,
  nombre: `Producto ${f.modelo}`,
  marca: 'ACME',
  categoria: null,
  subcategoria: null,
  descripcion_corta: null,
  imagen: null,
  imageUrl: null,
  thumbnailUrl: null,
  ean: null,
  upc: null,
  precio: 10,
  moneda: 'MXN',
  tipoCambio: null,
  protegido: false,
  activo: true,
  sustituto: null,
  promociones: [],
  ...f,
});

/** Responde según la condición de existencia del `where`, como lo haría la base. */
function armar(catalogo: Fila[], idsExactos: number[] = []) {
  const findMany = jest.fn(async ({ where, take }: { where: { AND: Array<Record<string, any>> }; take?: number }) => {
    const condiciones = where.AND;
    let filas = catalogo;
    const porId = condiciones.find((c) => c.id?.in);
    if (porId) filas = filas.filter((f) => porId.id.in.includes(f.id));
    if (condiciones.some((c) => c.NOT)) filas = filas.filter((f) => Object.keys(f.existencia).length > 0);
    if (condiciones.some((c) => c.existencia)) filas = filas.filter((f) => Object.keys(f.existencia).length === 0);
    return filas.slice(0, take ?? filas.length).map(completar);
  });
  const prisma = { productCT: { findMany }, $queryRaw: jest.fn().mockResolvedValue(idsExactos.map((id) => ({ id }))) };
  const sync = { preferredWarehouse: () => 'PUE' };
  return { servicio: new ProductSearchService(prisma as never, sync as never), prisma, findMany };
}

const modelos = (data: Array<{ modelo: string | null }>) => data.map((o) => o.modelo);

describe('ProductSearchService.search', () => {
  it('con inStockOnly no enseña lo que no tiene piezas', async () => {
    const { servicio } = armar([fila(1, 'SIN'), conPiezas(2, 'CON')]);

    const { data } = await servicio.search({ q: 'monitor' });

    expect(modelos(data)).toEqual(['CON']);
  });

  it('lo que no hay no le quita lugar a lo que hay', async () => {
    // Antes salían los primeros por clave y luego se filtraba: el corte se llenaba con lo que no hay.
    const sinPiezas = Array.from({ length: 100 }, (_, i) => fila(i + 1, `SIN${i}`));
    const { servicio, findMany } = armar([...sinPiezas, conPiezas(200, 'CON')]);

    const { data } = await servicio.search({ q: 'monitor', take: 6 });

    expect(modelos(data)).toEqual(['CON']);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('sin inStockOnly llena primero con lo que hay y sigue con lo que no', async () => {
    const { servicio, findMany } = armar([fila(1, 'SIN'), conPiezas(2, 'CON')]);

    const { data } = await servicio.search({ q: 'monitor', take: 6, inStockOnly: false });

    expect(modelos(data).sort()).toEqual(['CON', 'SIN']);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]![0].take).toBe(11);
  });

  it('si ya se llenó con lo que hay, no busca lo que no hay', async () => {
    const hay = Array.from({ length: 30 }, (_, i) => conPiezas(i + 1, `CON${i}`));
    const { servicio, findMany } = armar([...hay, fila(99, 'SIN')]);

    const { data } = await servicio.search({ q: 'monitor', take: 6, inStockOnly: false });

    expect(data).toHaveLength(6);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  describe('modelo exacto', () => {
    it('va primero aunque hoy no tenga piezas y lo demás tenga más', async () => {
      const hay = Array.from({ length: 30 }, (_, i) => conPiezas(i + 1, `RBC35-${i}`, 50));
      const { servicio } = armar([...hay, fila(99, 'RBC35')], [99]);

      const { data } = await servicio.search({ q: 'RBC35', take: 6, inStockOnly: false });

      expect(data).toHaveLength(6);
      expect(data[0]!.modelo).toBe('RBC35');
      expect(data[0]!.stockTotal).toBe(0);
    });

    it('con inStockOnly tampoco se cuela si no tiene piezas', async () => {
      const { servicio } = armar([conPiezas(1, 'RBC35-X'), fila(99, 'RBC35')], [99]);

      const { data } = await servicio.search({ q: 'RBC35', take: 6 });

      expect(modelos(data)).toEqual(['RBC35-X']);
    });

    it('no sale repetido si también entró por palabras', async () => {
      const { servicio } = armar([conPiezas(99, 'RBC35')], [99]);

      const { data } = await servicio.search({ q: 'RBC35', take: 6 });

      expect(data).toHaveLength(1);
    });

    it('compara sin guiones ni espacios y no pregunta por textos cortos', async () => {
      const { servicio, prisma } = armar([]);

      await servicio.search({ q: 'ds-2fa 1208/k', inStockOnly: false });
      const [partes, ...valores] = prisma.$queryRaw.mock.calls[0]!;
      expect(partes.join('?')).toContain('regexp_replace');
      expect(valores).toEqual(['DS2FA1208K', 'DS2FA1208K', 'DS2FA1208K']);

      prisma.$queryRaw.mockClear();
      await servicio.search({ q: 'ab', inStockOnly: false });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('respeta el filtro de marca', async () => {
      const { servicio, findMany } = armar([fila(99, 'RBC35')], [99]);

      await servicio.search({ q: 'RBC35', brand: 'APC', inStockOnly: false });

      const exacta = findMany.mock.calls.map(([a]) => a).find((a) => a.where.AND.some((c) => c.id?.in))!;
      expect(exacta.where.AND[0]!.marca).toEqual({ contains: 'APC', mode: 'insensitive' });
    });
  });
});
