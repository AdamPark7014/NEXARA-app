import { ConflictException } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { JornadaAbiertaInterceptor } from './candado-jornada.interceptor.js';
import { CODIGO_JORNADA_NO_ABIERTA } from './candado-jornada.js';

const tecnico = { id: 7, email: 'tecnico@ejemplo.test', roleKey: 'tecnico' };

describe('JornadaAbiertaInterceptor offline y auditoria', () => {
  const contexto = (req: Record<string, unknown>) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) }) as never;
  const siguiente = { handle: jest.fn(() => of('ok')) };
  beforeEach(() => {
    delete process.env.JORNADA_OBLIGATORIA;
    siguiente.handle.mockClear();
  });

  it('offline: captura dentro de jornada que estuvo abierta deja pasar', async () => {
    const findDay = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 9, isOpen: false, lastEntryAt: new Date('2026-11-20T15:00:00Z') });
    const findAttendance = jest.fn().mockResolvedValue({ timestamp: new Date('2026-11-20T23:00:00Z') });
    const i = new JornadaAbiertaInterceptor({
      attendanceDay: { findFirst: findDay },
      attendance: { findFirst: findAttendance },
    }) as never;
    const req = {
      method: 'POST',
      originalUrl: '/api/activity-evidence/5/fotos',
      user: tecnico,
      body: { clientCapturedAt: '2026-11-20T18:00:00.000Z', offline: true },
    };
    await expect(lastValueFrom(await i.intercept(contexto(req), siguiente))).resolves.toBe('ok');
    expect(siguiente.handle).toHaveBeenCalled();
  });

  it('sin jornada abierta registra auditoria JORNADA_NO_ABIERTA', async () => {
    const create = jest.fn().mockResolvedValue({});
    const i = new JornadaAbiertaInterceptor({
      attendanceDay: { findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { create },
    }) as never;
    const req = { method: 'POST', originalUrl: '/api/me/activities/5/iniciar', user: tecnico, companyId: 1 };
    await expect(i.intercept(contexto(req), siguiente)).rejects.toBeInstanceOf(ConflictException);
    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0][0].data.action).toBe(CODIGO_JORNADA_NO_ABIERTA);
    expect(create.mock.calls[0][0].data.entityId).toBe(7);
  });

  it('offline: captura fuera de la jornada cerrada se rechaza', async () => {
    const findDay = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 9, isOpen: false, lastEntryAt: new Date('2026-11-20T15:00:00Z') });
    const findAttendance = jest.fn().mockResolvedValue({ timestamp: new Date('2026-11-20T17:00:00Z') });
    const i = new JornadaAbiertaInterceptor({
      attendanceDay: { findFirst: findDay },
      attendance: { findFirst: findAttendance },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }) as never;
    const req = {
      method: 'POST',
      originalUrl: '/api/activity-evidence/5/fotos',
      user: tecnico,
      body: { clientCapturedAt: '2026-11-20T19:00:00.000Z', offline: true },
    };
    await expect(i.intercept(contexto(req), siguiente)).rejects.toBeInstanceOf(ConflictException);
    expect(siguiente.handle).not.toHaveBeenCalled();
  });
});
