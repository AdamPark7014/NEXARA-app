import {
  claseDeAviso,
  dentroDeHorarioDeAvisos,
  entregaDeAvisoNormal,
  esVencidaDeActividad,
  textoResumenAvisos,
  TOPE_DIARIO_AVISOS,
} from './presupuesto-avisos.js';
import { NotificationsService } from './notifications.service.js';

// Jueves 29-10-2026, 11:00 de México.
const EN_HORARIO = new Date('2026-10-29T17:00:00Z');
const DE_NOCHE = new Date('2026-10-30T03:00:00Z');
const DOMINGO = new Date('2026-11-01T18:00:00Z');

describe('claseDeAviso', () => {
  it('lo que te toca a ti nunca espera', () => {
    for (const type of ['ACTIVITY_ASSIGNED', 'EVIDENCE_REJECTED', 'QUOTE_EXPIRING', 'WORKFLOW_PENDING', 'CHAT_MENTION']) {
      expect(claseDeAviso({ type })).toBe('siempre');
    }
    expect(claseDeAviso({ type: 'WORKFLOW_PENDING', category: 'resumen-ceo' })).toBe('siempre');
    expect(claseDeAviso({ type: 'X', category: 'security' })).toBe('siempre');
    expect(claseDeAviso({ type: 'LUNCH_CHECKIN', category: 'lunch_break' })).toBe('siempre');
  });

  it('«Fulano hizo tal cosa» va al resumen, salvo lo que pide algo al jefe', () => {
    expect(claseDeAviso({ type: 'ATTENDANCE_CHECKIN', category: 'attendance' })).toBe('resumen');
    expect(claseDeAviso({ type: 'ACTIVITY_STARTED', category: 'activities' })).toBe('resumen');
    // Retardo y comida a destiempo por revisar.
    expect(claseDeAviso({ type: 'ATTENDANCE_CHECKIN', priority: 'high' })).toBe('normal');
    expect(claseDeAviso({ type: 'LUNCH_CHECKIN', priority: 'high' })).toBe('normal');
  });

  it('la vencida de otra persona le llega a su jefe en el resumen; a su dueño, no', () => {
    expect(claseDeAviso({ type: 'SLA_BREACH', triggerUserId: 7 })).toBe('resumen');
    expect(claseDeAviso({ type: 'SLA_BREACH' })).toBe('normal');
    expect(claseDeAviso({ type: 'ACTIVITY_OVERDUE' })).toBe('normal');
  });

  it('quien emite puede pedir la entrega de forma explícita', () => {
    expect(claseDeAviso({ type: 'SLA_ALERT', entrega: 'recordatorio' })).toBe('recordatorio');
    expect(claseDeAviso({ type: 'ATTENDANCE_CHECKIN', entrega: 'siempre' })).toBe('siempre');
  });

  it('lo demás entra al presupuesto', () => {
    expect(claseDeAviso({ type: 'EVIDENCE_SUBMITTED', category: 'evidences' })).toBe('normal');
    expect(claseDeAviso({ type: 'SALES_PROJECT_MARGIN_ALERT', priority: 'high' })).toBe('normal');
  });
});

describe('esVencidaDeActividad', () => {
  it('solo actividades y no el recordatorio propio', () => {
    expect(esVencidaDeActividad({ type: 'SLA_BREACH', entityType: 'Activity' })).toBe(true);
    expect(esVencidaDeActividad({ type: 'ACTIVITY_OVERDUE', entityType: 'Activity', entrega: 'recordatorio' })).toBe(false);
    expect(esVencidaDeActividad({ type: 'SLA_BREACH', entityType: 'Otra' })).toBe(false);
    expect(esVencidaDeActividad({ type: 'SLA_ALERT', entityType: 'Activity' })).toBe(false);
  });
});

describe('entregaDeAvisoNormal', () => {
  it('hasta el tope suena; después espera al resumen', () => {
    expect(entregaDeAvisoNormal({ ahora: EN_HORARIO, enviadosHoy: TOPE_DIARIO_AVISOS - 1 })).toBe('push');
    expect(entregaDeAvisoNormal({ ahora: EN_HORARIO, enviadosHoy: TOPE_DIARIO_AVISOS })).toBe('resumen');
  });

  it('de noche y en domingo no suena', () => {
    expect(dentroDeHorarioDeAvisos(EN_HORARIO)).toBe(true);
    expect(dentroDeHorarioDeAvisos(DE_NOCHE)).toBe(false);
    expect(dentroDeHorarioDeAvisos(DOMINGO)).toBe(false);
    expect(entregaDeAvisoNormal({ ahora: DE_NOCHE, enviadosHoy: 0 })).toBe('resumen');
  });
});

describe('textoResumenAvisos', () => {
  it('lo de más volumen primero, con su nombre', () => {
    const t = textoResumenAvisos(['evidences', 'sla-breach', 'sla-breach', 'attendance', 'algo-raro']);
    expect(t.title).toBe('Resumen: 5 avisos agrupados');
    expect(t.message).toBe('2 vencidas · 1 de asistencia · 1 de evidencias · 1 otros');
  });
  it('singular', () => {
    expect(textoResumenAvisos(['sales']).title).toBe('Resumen: 1 aviso agrupado');
  });
});

describe('NotificationsService con presupuesto', () => {
  function crear(opts: { enviadosHoy?: number; yaHoy?: boolean; ahora?: Date } = {}) {
    jest.useFakeTimers({ now: opts.ahora ?? EN_HORARIO });
    const create = jest.fn(async ({ data }: any) => ({ id: 1, ...data, triggerUser: null }));
    const prisma: any = {
      notification: {
        create,
        findFirst: jest.fn(async () => (opts.yaHoy ? { id: 9 } : null)),
        count: jest.fn(async () => opts.enviadosHoy ?? 0),
      },
    };
    const push = { sendToUser: jest.fn(async () => undefined) };
    const gateway = { notifyUser: jest.fn(), emitToUser: jest.fn() };
    const servicio = new NotificationsService(prisma, push as any, gateway as any);
    return { servicio, create, push, prisma, gateway };
  }
  afterEach(() => jest.useRealTimers());

  const normal = { userId: 5, type: 'SALES_PROJECT_MARGIN_ALERT', category: 'sales', title: 't', message: 'm' };

  it('dentro del tope: fila «push» y suena', async () => {
    const { servicio, create, push } = crear({ enviadosHoy: 3 });
    await servicio.createNotification(normal);
    expect(create.mock.calls[0][0].data.entrega).toBe('push');
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('pasado el tope: queda la fila para el resumen y no suena', async () => {
    const { servicio, create, push, gateway } = crear({ enviadosHoy: TOPE_DIARIO_AVISOS });
    await servicio.createNotification(normal);
    expect(create.mock.calls[0][0].data.entrega).toBe('resumen');
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(gateway.notifyUser).not.toHaveBeenCalled();
  });

  it('lo que te toca suena aunque ya pasaste el tope, y no consulta el conteo', async () => {
    const { servicio, create, push, prisma } = crear({ enviadosHoy: 99 });
    await servicio.createNotification({ ...normal, type: 'ACTIVITY_ASSIGNED' });
    expect(create.mock.calls[0][0].data.entrega).toBe('siempre');
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(prisma.notification.count).not.toHaveBeenCalled();
  });

  it('el recordatorio suena y no se cuenta', async () => {
    const { servicio, create, push, prisma } = crear({ enviadosHoy: 99 });
    await servicio.createNotification({ ...normal, type: 'SLA_ALERT', entrega: 'recordatorio' });
    expect(create.mock.calls[0][0].data.entrega).toBe('recordatorio');
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(prisma.notification.count).not.toHaveBeenCalled();
  });

  it('una actividad vencida, un aviso al día por persona', async () => {
    const { servicio, create } = crear({ yaHoy: true });
    await servicio.createNotification({ ...normal, type: 'SLA_BREACH', entityType: 'Activity', relatedEntityId: 4, dedupeSeconds: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('si no se puede contar, se avisa: ante la duda no se esconde nada', async () => {
    const { servicio, create, prisma } = crear();
    prisma.notification.count.mockRejectedValueOnce(new Error('caída'));
    await servicio.createNotification(normal);
    expect(create.mock.calls[0][0].data.entrega).toBe('push');
  });
});
