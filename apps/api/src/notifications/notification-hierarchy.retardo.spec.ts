import { NotificationHierarchyService } from './notification-hierarchy.service.js';

/**
 * El aviso de entrada mide el retardo contra `work_schedules.horaEntrada`.
 * Si no hay hora guardada (o no es HH:MM), sigue la plantilla: 10:00 en
 * America/Mexico_City, con 15 min de gracia. 24/7 sin hora propia no marca.
 */

const VIGILANTE = 90;

function armar(opts: { roleKey: string; horaEntrada?: string | null; graciaMin?: number | null; sinFila?: boolean }) {
  const createNotification = jest.fn(async () => ({}));
  const tieneHorario = !opts.sinFila && (opts.horaEntrada !== undefined || opts.graciaMin !== undefined);
  const fila = {
    nombre: 'Ana López',
    employeeNumber: 'NXR1',
    roleKey: opts.roleKey,
    tipoContrato: null,
    role: { orgRoleKey: null },
    horario: tieneHorario
      ? { horaEntrada: opts.horaEntrada ?? null, graciaMin: opts.graciaMin ?? null }
      : null,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async (args: { select?: { managerId?: boolean } }) => {
        if (args?.select?.managerId) return { managerId: null };
        return fila;
      }),
      findMany: jest.fn(async () => [{ id: VIGILANTE }]),
    },
  };
  const servicio = new NotificationHierarchyService({ createNotification } as any, prisma as any);
  return { servicio, createNotification };
}

async function aviso(
  opts: { roleKey: string; horaEntrada?: string | null; graciaMin?: number | null; sinFila?: boolean },
  at: string,
) {
  const { servicio, createNotification } = armar(opts);
  await servicio.notifyAttendanceChange(4, 'ATTENDANCE_CHECKIN', 'Ana López', 'Recepción', new Date(at));
  expect(createNotification).toHaveBeenCalledTimes(1);
  return createNotification.mock.calls[0][0] as { title: string; message: string; priority: string; icon: string };
}

describe('aviso de entrada contra el horario propio', () => {
  it('sin horaEntrada, oficina que llega a las 10:30 se marca contra las 10:00', async () => {
    const n = await aviso({ roleKey: 'administrativo', sinFila: true }, '2026-10-20T16:30:00.000Z');
    expect(n.title).toBe('Ana López llegó con retardo');
    expect(n.message).toContain('Su horario inicia a las 10:00');
    expect(n.priority).toBe('high');
    expect(n.icon).toBe('entrada_tarde');
  });

  it('con horaEntrada 08:00, las 09:00 ya son retardo y el aviso dice las 8:00', async () => {
    const n = await aviso({ roleKey: 'administrativo', horaEntrada: '08:00' }, '2026-10-20T15:00:00.000Z');
    expect(n.title).toBe('Ana López llegó con retardo');
    expect(n.message).toContain('Su horario inicia a las 8:00');
    expect(n.priority).toBe('high');
  });

  it('con horaEntrada 11:00, las 10:30 no son retardo aunque la plantilla diga 10:00', async () => {
    const n = await aviso({ roleKey: 'administrativo', horaEntrada: '11:00' }, '2026-10-20T16:30:00.000Z');
    expect(n.title).toBe('Ana López entró a trabajar');
    expect(n.message).not.toContain('Su horario inicia');
    expect(n.priority).toBe('normal');
    expect(n.icon).toBe('entrada');
  });

  it('una horaEntrada que no es HH:MM no inventa hora: vuelve a las 10:00', async () => {
    const n = await aviso({ roleKey: 'administrativo', horaEntrada: 'ocho' }, '2026-10-20T16:30:00.000Z');
    expect(n.title).toBe('Ana López llegó con retardo');
    expect(n.message).toContain('Su horario inicia a las 10:00');
  });

  it('24/7 sin horario propio no marca retardo; con horaEntrada 09:00, sí', async () => {
    const aTiempo = await aviso({ roleKey: 'ceo', sinFila: true }, '2026-10-20T18:00:00.000Z');
    expect(aTiempo.title).toBe('Ana López entró a trabajar');

    const tarde = await aviso({ roleKey: 'ceo', horaEntrada: '09:00' }, '2026-10-20T15:20:00.000Z');
    expect(tarde.title).toBe('Ana López llegó con retardo');
    expect(tarde.message).toContain('Su horario inicia a las 9:00');
  });

  it('con graciaMin 5, las 10:10 ya son retardo contra las 10:00', async () => {
    const n = await aviso({ roleKey: 'administrativo', graciaMin: 5 }, '2026-10-20T16:10:00.000Z');
    expect(n.title).toBe('Ana López llegó con retardo');
    expect(n.message).toContain('Su horario inicia a las 10:00');
  });
});
