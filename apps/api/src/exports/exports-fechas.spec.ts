import { buildDateWhere, ExportsService } from './exports.service';

/**
 * El rango «del día X al día Y» de la página Exportaciones.
 *
 * El servidor corre en UTC. El rango se armaba con `new Date('2026-11-21')` (medianoche UTC, las
 * 18:00 del día 20 en México) y `setHours(23, 59…)` en la hora del servidor: lo capturado después
 * de las 6 de la tarde quedaba en el archivo del día siguiente. Las columnas con hora se filtran
 * ahora por el día de la empresa; las que guardan solo el día (fecha de factura, de cotización,
 * inicio de proyecto) se siguen comparando por día calendario, sin depender de la zona del servidor.
 */
describe('rango de fechas de Exportaciones', () => {
  const dia = { from: '2026-11-21', to: '2026-11-21' };

  it.each(['clients', 'leads', 'opportunities', 'tenders', 'kb-articles', 'crm-activities'] as const)(
    '%s: el día va de medianoche a medianoche de la empresa',
    (entidad) => {
      expect(buildDateWhere(entidad, dia)).toEqual({
        createdAt: { gte: new Date('2026-11-21T06:00:00.000Z'), lte: new Date('2026-11-22T05:59:59.999Z') },
      });
    },
  );

  it('actividades y usuarios también, cada uno por su columna', () => {
    const rango = { gte: new Date('2026-11-21T06:00:00.000Z'), lte: new Date('2026-11-22T05:59:59.999Z') };
    expect(buildDateWhere('activities', dia)).toEqual({ fechaAsignacion: rango });
    expect(buildDateWhere('users', dia)).toEqual({ fechaCreacion: rango });
  });

  it('lo capturado a las 19:30 de México entra en su día y no en el siguiente', () => {
    const capturado = new Date('2026-11-22T01:30:00.000Z'); // 19:30 del 21 en México
    const delDia = (buildDateWhere('clients', dia) as any).createdAt;
    const delSiguiente = (buildDateWhere('clients', { from: '2026-11-22', to: '2026-11-22' }) as any).createdAt;
    expect(capturado >= delDia.gte && capturado <= delDia.lte).toBe(true);
    expect(capturado >= delSiguiente.gte && capturado <= delSiguiente.lte).toBe(false);
  });

  it.each([
    ['invoices', 'issueDate'],
    ['cotizaciones', 'issueDate'],
    ['projects', 'startDate'],
  ] as const)('%s guarda solo el día: se compara por día calendario', (entidad, columna) => {
    expect(buildDateWhere(entidad, { from: '2026-11-01', to: '2026-11-21' })).toEqual({
      [columna]: { gte: new Date('2026-11-01T00:00:00.000Z'), lte: new Date('2026-11-21T23:59:59.999Z') },
    });
  });

  it('un solo extremo filtra solo por ese lado; una fecha ilegible no filtra', () => {
    expect(buildDateWhere('clients', { from: '2026-11-21' })).toEqual({
      createdAt: { gte: new Date('2026-11-21T06:00:00.000Z') },
    });
    expect(buildDateWhere('invoices', { to: '2026-11-21' })).toEqual({
      issueDate: { lte: new Date('2026-11-21T23:59:59.999Z') },
    });
    expect(buildDateWhere('clients', { from: 'ayer', to: 'hoy' })).toEqual({});
    expect(buildDateWhere('clients', {})).toEqual({});
  });

  it('la consulta lleva el rango y la empresa', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new ExportsService({ salesClient: { findMany } } as any);

    await svc.exportEntity('clients', dia, 7, { id: 1, isSuperAdmin: true } as any);

    expect(findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 7,
      createdAt: { gte: new Date('2026-11-21T06:00:00.000Z'), lte: new Date('2026-11-22T05:59:59.999Z') },
    });
  });
});
