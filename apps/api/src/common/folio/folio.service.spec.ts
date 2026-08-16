import { FolioService } from './folio.service.js';
import { FOLIO_SERIES, assertIdentificadorSeguro, formatFolio, resolvePrefijo } from './folio-series.js';

/**
 * El doble imita a Postgres en lo que importa: el UPDATE sólo devuelve fila si
 * el contador existe, y el INSERT ... ON CONFLICT incrementa si ya está.
 */
function build(estado: { contadores?: Record<string, number>; maxExistente?: number } = {}) {
  const contadores: Record<string, number> = { ...(estado.contadores ?? {}) };
  const consultas: string[] = [];

  const prisma = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...valores: any[]) => {
      const sql = strings.join('?');
      consultas.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));

      if (sql.includes('UPDATE folio_counters')) {
        const [companyId, serie] = valores;
        const clave = `${companyId}|${serie}`;
        if (!(clave in contadores)) return [];
        contadores[clave] += 1;
        return [{ valor: contadores[clave] }];
      }

      if (sql.includes('INSERT INTO folio_counters')) {
        const [companyId, serie, inicial] = valores;
        const clave = `${companyId}|${serie}`;
        contadores[clave] = clave in contadores ? contadores[clave] + 1 : Number(inicial);
        return [{ valor: contadores[clave] }];
      }

      // maxExistente
      return [{ max: estado.maxExistente ?? 0 }];
    }),
  };

  return { service: new FolioService(prisma as any), prisma, contadores, consultas };
}

describe('catálogo de series', () => {
  it('toda serie declara tabla, columna y ancho', () => {
    for (const [clave, def] of Object.entries(FOLIO_SERIES)) {
      expect(def.tabla).toBeTruthy();
      expect(def.columna).toBeTruthy();
      expect(def.ancho).toBeGreaterThan(0);
      expect(resolvePrefijo(clave as any)).toBeTruthy();
    }
  });

  it('los identificadores del catálogo son seguros para interpolar en SQL', () => {
    // Se interpolan como identificadores; si alguien mete algo raro, que falle
    // aquí y no en una inyección.
    for (const def of Object.values(FOLIO_SERIES)) {
      expect(() => assertIdentificadorSeguro(def.tabla)).not.toThrow();
      expect(() => assertIdentificadorSeguro(def.columna)).not.toThrow();
    }
  });

  it('rechaza un identificador con comillas o punto y coma', () => {
    expect(() => assertIdentificadorSeguro('users"; DROP TABLE x --')).toThrow();
    expect(() => assertIdentificadorSeguro('mi tabla')).toThrow();
  });

  it('la licitación lleva el año en la serie, para reiniciar cada enero', () => {
    expect(resolvePrefijo('TENDER', new Date('2026-05-01'))).toBe('LIC-2026-');
    expect(resolvePrefijo('TENDER', new Date('2027-01-02'))).toBe('LIC-2027-');
  });

  it('formatea con el ancho declarado', () => {
    expect(formatFolio('PURCHASE_ORDER', 7)).toBe('PO-000007');
    expect(formatFolio('MAINTENANCE_CONTRACT', 7)).toBe('MC-00007');
  });
});

describe('siguiente folio', () => {
  it('incrementa el contador existente', async () => {
    const { service } = build({ contadores: { '7|PO-': 41 } });
    expect(await service.next('PURCHASE_ORDER', 7)).toBe('PO-000042');
  });

  it('dos llamadas seguidas nunca devuelven el mismo folio', async () => {
    // Era el fallo de concurrencia: dos altas leían el mismo `count`.
    const { service } = build({ contadores: { '7|PO-': 0 } });
    const a = await service.next('PURCHASE_ORDER', 7);
    const b = await service.next('PURCHASE_ORDER', 7);
    expect(a).not.toBe(b);
    expect([a, b]).toEqual(['PO-000001', 'PO-000002']);
  });

  it('la primera vez siembra desde el máximo que ya existe', async () => {
    // Sin esto, una empresa con 120 órdenes empezaría de nuevo en PO-000001.
    const { service } = build({ maxExistente: 120 });
    expect(await service.next('PURCHASE_ORDER', 7)).toBe('PO-000121');
  });

  it('NO retrocede aunque se hayan borrado registros', async () => {
    // El fallo grave: `count()` excluía lo borrado por el middleware, así que
    // borrar una factura hacía que el siguiente folio chocara con uno vivo.
    // La semilla sale de SQL crudo, que sí ve las filas borradas.
    const { service, prisma } = build({ maxExistente: 500 });
    expect(await service.next('INVOICE', 7)).toBe('INV-000501');

    const sqlSemilla = (prisma.$queryRaw as jest.Mock).mock.calls
      .map((c) => c[0].join('?'))
      .find((s: string) => s.includes('MAX('));
    expect(sqlSemilla).toBeDefined();
    expect(sqlSemilla).not.toContain('deletedAt');
  });

  it('cada empresa lleva su propia numeración', async () => {
    const { service } = build({ contadores: { '7|PO-': 10, '9|PO-': 3 } });
    expect(await service.next('PURCHASE_ORDER', 7)).toBe('PO-000011');
    expect(await service.next('PURCHASE_ORDER', 9)).toBe('PO-000004');
  });

  it('cada serie lleva la suya dentro de la misma empresa', async () => {
    const { service } = build({ contadores: { '7|PO-': 10, '7|INV-': 88 } });
    expect(await service.next('PURCHASE_ORDER', 7)).toBe('PO-000011');
    expect(await service.next('INVOICE', 7)).toBe('INV-000089');
  });

  it('sin empresa no genera folio', async () => {
    const { service } = build();
    await expect(service.next('INVOICE', 0)).rejects.toThrow('empresa');
  });

  it('el camino rápido es una sola consulta cuando el contador existe', async () => {
    const { service, prisma } = build({ contadores: { '7|PO-': 1 } });
    await service.next('PURCHASE_ORDER', 7);
    expect((prisma.$queryRaw as jest.Mock).mock.calls).toHaveLength(1);
  });
});

describe('folio libre', () => {
  it('avanza si el número ya estaba ocupado por otra vía', async () => {
    // Una importación pudo escribir folios a mano; mejor avanzar que devolver
    // un 500 opaco.
    const { service } = build({ contadores: { '7|PO-': 0 } });
    const ocupados = new Set(['PO-000001', 'PO-000002']);
    const folio = await service.nextDisponible('PURCHASE_ORDER', 7, async (f) => ocupados.has(f));
    expect(folio).toBe('PO-000003');
  });

  it('se rinde con un mensaje claro en vez de girar para siempre', async () => {
    const { service } = build({ contadores: { '7|PO-': 0 } });
    await expect(
      service.nextDisponible('PURCHASE_ORDER', 7, async () => true, 3),
    ).rejects.toThrow('3 intentos');
  });
});
