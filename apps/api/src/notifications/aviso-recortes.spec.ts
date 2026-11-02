import { AvisoRecortesService, textoAvisoRecortes } from './aviso-recortes.service.js';

const fila = (modelo: string, filtro: string[], veces = 1, tope = 5000) => ({ modelo, tope, filtro, veces });

describe('texto de la tarjeta de recortes', () => {
  it('sin recortes no hay tarjeta', () => {
    expect(textoAvisoRecortes([], 5000)).toBeNull();
  });

  it('dice qué consulta se cortó y cuántas veces, la que más arriba', () => {
    const texto = textoAvisoRecortes(
      [fila('AuditLog', ['entityId', 'entityType']), fila('ProductCT', [], 12)],
      5000,
    );
    expect(texto?.title).toBe('Hay listas que salieron incompletas');
    expect(texto?.message).toBe(
      'Se cortaron al tope de 5,000 filas: ProductCT sin filtro (12 veces); ' +
        'AuditLog filtrando entityId, entityType (1 vez). Hay que paginar esas consultas.',
    );
  });

  it('suma las filas de una misma consulta', () => {
    const texto = textoAvisoRecortes([fila('A', ['x'], 3), fila('A', ['x'], 4), fila('A', ['y'], 1)], 5000);
    expect(texto?.message).toContain('A filtrando x (7 veces); A filtrando y (1 vez)');
  });

  it('una fila con otro tope es una prueba y no avisa', () => {
    expect(textoAvisoRecortes([fila('CompanyProfile', ['isActive'], 1, 1)], 5000)).toBeNull();
    expect(textoAvisoRecortes([fila('CompanyProfile', ['isActive'], 1, 1), fila('A', [])], 5000)?.message).not.toContain(
      'CompanyProfile',
    );
  });

  it('una fila que no se entiende no truena ni avisa', () => {
    expect(textoAvisoRecortes([null, 'x', {}, { modelo: 7, tope: 5000 }], 5000)).toBeNull();
  });

  it('a partir de cinco consultas dice cuántas más hay', () => {
    const texto = textoAvisoRecortes(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((m) => fila(m, [])), 5000);
    expect(texto?.message).toContain('; y 2 más.');
    expect(texto?.message).not.toContain('F sin filtro');
  });
});

describe('AvisoRecortesService', () => {
  const AHORA = new Date('2026-11-03T15:00:00Z');

  function armar(opciones: { cuenta?: { id: number } | null; ultima?: Date; cambios?: unknown[] } = {}) {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(opciones.cuenta === undefined ? { id: 7 } : opciones.cuenta),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(opciones.ultima ? { createdAt: opciones.ultima } : null),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue((opciones.cambios ?? []).map((changes) => ({ changes }))),
      },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
    return { service: new AvisoRecortesService(prisma, notifications as never), prisma, notifications };
  }

  it('sin recortes nuevos no manda nada', async () => {
    const { service, notifications } = armar();
    await expect(service.revisar(AHORA)).resolves.toBe(false);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('con recortes le manda una tarjeta a developer@, y no espera al resumen', async () => {
    const { service, prisma, notifications } = armar({ cambios: [fila('ProductCT', ['activo'], 2)] });
    await expect(service.revisar(AHORA)).resolves.toBe(true);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'developer@nexara.com.mx', isActive: true } }),
    );
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        category: 'recortes-filas',
        entrega: 'siempre',
        message: expect.stringContaining('ProductCT filtrando activo (2 veces)'),
      }),
    );
  });

  it('solo lee lo que hay después de la última tarjeta, para no repetirla', async () => {
    const ultima = new Date('2026-11-02T15:00:00Z');
    const { service, prisma } = armar({ ultima });
    await service.revisar(AHORA);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'PrismaRowCap', entityId: 0, createdAt: { gt: ultima } },
      }),
    );
  });

  it('sin tarjeta previa, o con una muy vieja, mira a lo mucho siete días', async () => {
    const hace7Dias = new Date('2026-10-27T15:00:00Z');
    for (const opciones of [{}, { ultima: new Date('2026-09-01T00:00:00Z') }]) {
      const { service, prisma } = armar(opciones);
      await service.revisar(AHORA);
      expect(prisma.auditLog.findMany.mock.calls[0][0].where.createdAt).toEqual({ gt: hace7Dias });
    }
  });

  it('lee con take propio: esta consulta no debe topar con el tope que vigila', async () => {
    const { service, prisma } = armar();
    await service.revisar(AHORA);
    expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(1000);
  });

  it('sin la cuenta de desarrollo no truena', async () => {
    const { service, notifications } = armar({ cuenta: null, cambios: [fila('A', [])] });
    await expect(service.revisar(AHORA)).resolves.toBe(false);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
