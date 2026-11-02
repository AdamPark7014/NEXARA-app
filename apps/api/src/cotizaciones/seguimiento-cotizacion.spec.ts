import { etapaDeSeguimiento, textoBorradores, textoSeguimiento } from './seguimiento-cotizacion.js';
import { SeguimientoCotizacionService } from './seguimiento-cotizacion.service.js';

const AHORA = new Date('2026-11-05T16:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

describe('etapaDeSeguimiento', () => {
  it('a los 3 y a los 7 días, una vez cada una', () => {
    expect(etapaDeSeguimiento({ sentAt: hace(2), etapaActual: 0, ahora: AHORA })).toBeNull();
    expect(etapaDeSeguimiento({ sentAt: hace(3), etapaActual: 0, ahora: AHORA })).toBe(1);
    expect(etapaDeSeguimiento({ sentAt: hace(5), etapaActual: 1, ahora: AHORA })).toBeNull();
    expect(etapaDeSeguimiento({ sentAt: hace(7), etapaActual: 1, ahora: AHORA })).toBe(2);
    expect(etapaDeSeguimiento({ sentAt: hace(30), etapaActual: 2, ahora: AHORA })).toBeNull();
  });
  it('si se pasó de las dos, manda una sola', () => {
    expect(etapaDeSeguimiento({ sentAt: hace(20), etapaActual: 0, ahora: AHORA })).toBe(2);
  });
});

describe('textos', () => {
  it('nombran a la empresa y cuántos días lleva', () => {
    const t = textoSeguimiento({ quoteNumber: 'NEX-1', clientCompany: 'Hotel Sol', clientName: 'Eva', sentAt: hace(3), ahora: AHORA });
    expect(t.title).toBe('¿Ya hubo respuesta de Hotel Sol?');
    expect(t.message).toContain('NEX-1 salió hace 3 días');
  });
  it('sin empresa usa a la persona y singular', () => {
    expect(textoSeguimiento({ quoteNumber: 'N', clientName: 'Eva', sentAt: hace(1), ahora: AHORA }).message).toContain('hace 1 día.');
    expect(textoSeguimiento({ quoteNumber: 'N', clientName: 'Eva', sentAt: hace(1), ahora: AHORA }).title).toContain('Eva');
  });
  it('borradores en singular y plural', () => {
    expect(textoBorradores(1).title).toBe('¿Ya mandaste tu cotización?');
    expect(textoBorradores(18).title).toBe('¿Ya mandaste tus 18 cotizaciones?');
  });
});

describe('SeguimientoCotizacionService', () => {
  function armar(opts: { enviadas?: unknown[]; borradores?: unknown[]; marcadas?: number } = {}) {
    const prisma: any = {
      cotizacion: {
        findMany: jest.fn(async ({ where }: any) => (where.status === 'SENT' ? (opts.enviadas ?? []) : (opts.borradores ?? []))),
        updateMany: jest.fn(async ({ where }: any) => ({
          count: opts.marcadas ?? (where.id?.in ? where.id.in.length : 1),
        })),
      },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
    return { service: new SeguimientoCotizacionService(prisma, notifications as never), prisma, notifications };
  }
  const enviada = (extra = {}) => ({
    id: 4,
    quoteNumber: 'NEX-4',
    clientCompany: 'Hotel Sol',
    clientName: null,
    sentAt: hace(3),
    seguimientoEtapa: 0,
    createdById: 9,
    companyId: 1,
    ...extra,
  });

  it('pregunta a quien la hizo y avanza la etapa', async () => {
    const { service, prisma, notifications } = armar({ enviadas: [enviada()] });
    expect(await service.revisar(AHORA)).toEqual({ seguimientos: 1, borradores: 0 });
    expect(prisma.cotizacion.updateMany).toHaveBeenCalledWith({
      where: { id: 4, seguimientoEtapa: 0 },
      data: { seguimientoEtapa: 1 },
    });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, entrega: 'siempre', title: '¿Ya hubo respuesta de Hotel Sol?' }),
    );
  });

  it('si otra instancia ya la marcó, no repite', async () => {
    const { service, notifications } = armar({ enviadas: [enviada()], marcadas: 0 });
    expect((await service.revisar(AHORA)).seguimientos).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('los borradores viejos: una sola tarjeta por autor', async () => {
    const { service, notifications } = armar({
      borradores: [
        { id: 1, createdById: 9, companyId: 1 },
        { id: 2, createdById: 9, companyId: 1 },
        { id: 3, createdById: 8, companyId: 1 },
      ],
    });
    expect((await service.revisar(AHORA)).borradores).toBe(2);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, title: '¿Ya mandaste tus 2 cotizaciones?', relatedUrl: '/erp/cotizaciones' }),
    );
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8, title: '¿Ya mandaste tu cotización?' }),
    );
  });
});
