import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_RECHAZO, MOTIVO_VALIDACION, ventanaWebCheckin } from './asistencia-confiable.js';
import { PETICION_APP } from './peticion-de-app.testing.js';

/**
 * Excepción temporal a «nadie checa desde el navegador»: la ventana que dirección abre por empresa
 * (`attendance.web_checkin_until`). Fuera de la ventana todo sigue igual; dentro, la web puede checar y
 * la checada queda marcada como hecha desde el navegador.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';
const OFICINA = { latitude: 19.074, longitude: -98.278 };
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36';
const WEB = { headers: { 'user-agent': CHROME } };

const enUnaHora = () => new Date(Date.now() + 3_600_000).toISOString();
const haceUnaHora = () => new Date(Date.now() - 3_600_000).toISOString();

function build(ajuste?: string | null | 'falla') {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    attendanceRejection: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    user: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    systemSetting: {
      findMany: jest.fn(async () => {
        if (ajuste === 'falla') throw new Error('base caída');
        return ajuste == null ? [] : [{ companyId: 7, value: ajuste }];
      }),
    },
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

const entrada = (extra: Record<string, unknown> = {}) => ({ type: 'entrada' as const, photoBase64: FOTO, ...OFICINA, accuracyM: 10, ...extra });

describe('ventanaWebCheckin', () => {
  const ahora = new Date('2026-09-28T18:00:00Z');
  it('abierta hasta la hora indicada y cerrada después; lo raro cuenta como cerrada', () => {
    expect(ventanaWebCheckin('2026-09-29T18:00:00Z', ahora)).toEqual({ abierta: true, hasta: new Date('2026-09-29T18:00:00Z') });
    expect(ventanaWebCheckin('2026-09-28T18:00:00Z', ahora).abierta).toBe(false); // justo a la hora: ya cerró
    expect(ventanaWebCheckin('2026-09-27T00:00:00Z', ahora).abierta).toBe(false);
    for (const raro of [null, undefined, '', 'mañana', 'true', '0']) {
      expect(ventanaWebCheckin(raro as any, ahora)).toEqual({ abierta: false, hasta: null });
    }
  });
});

describe('checar desde el navegador', () => {
  it('sin ventana abierta sigue rechazándose (422) y queda registrado el intento', async () => {
    const { service, prisma } = build(null);
    await expect(service.register(entrada() as any, 3, WEB, 7)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRejection.create.mock.calls[0][0].data).toMatchObject({ motivo: MOTIVO_RECHAZO.desdeNavegador, origen: 'WEB' });
  });

  it('una ventana ya vencida o mal escrita también rechaza; si la base falla, ante la duda, cerrada', async () => {
    for (const ajuste of [haceUnaHora(), 'cuando se pueda', 'falla'] as const) {
      const { service, prisma } = build(ajuste);
      await expect(service.register(entrada() as any, 3, WEB, 7)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    }
  });

  it('con la ventana abierta la web puede checar, y la checada queda marcada como hecha desde el navegador', async () => {
    const { service, prisma, notifyAttendanceFlagged } = build(enUnaHora());
    await service.register(entrada() as any, 3, WEB, 7);

    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
    const fila = prisma.attendance.create.mock.calls[0][0].data;
    expect(fila).toMatchObject({ origen: 'WEB', validacion: 'PENDIENTE' });
    expect(fila.motivoValidacion).toContain(MOTIVO_VALIDACION.checadaWeb);
    // Pendiente, no «revisar»: los jefes no reciben un aviso por cada checada mientras dura la excepción.
    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });

  it('la ventana es de una empresa: otra empresa sigue sin poder checar desde la web', async () => {
    const { service, prisma } = build(enUnaHora());
    prisma.systemSetting.findMany.mockImplementation(async (a: any) =>
      a.where.OR.some((o: any) => o.companyId === 7) ? [{ companyId: 7, value: enUnaHora() }] : [],
    );
    await expect(service.register(entrada() as any, 3, WEB, 9)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.register(entrada() as any, 4, WEB, 7)).resolves.toBeTruthy();
  });

  it('la app no cambia: sigue entrando sin marca de navegador', async () => {
    const { service, prisma } = build(enUnaHora());
    await service.register(entrada() as any, 3, PETICION_APP, 7);
    const fila = prisma.attendance.create.mock.calls[0][0].data;
    expect(fila.origen).toBe('ANDROID');
    expect(String(fila.motivoValidacion ?? '')).not.toContain(MOTIVO_VALIDACION.checadaWeb);
  });

  it('el estado que consulta la pantalla dice hasta cuándo', async () => {
    const hasta = enUnaHora();
    const { service } = build(hasta);
    expect(await service.ventanaWeb(7)).toEqual({ abierta: true, hasta: new Date(hasta) });
    expect((await build(null).service.ventanaWeb(7)).abierta).toBe(false);
  });
});
