import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_RECHAZO } from './asistencia-confiable.js';
import { mensajeFrenoSalida, salidaConfirmada, VENTANA_CONFIRMAR_SALIDA_MS } from './freno-salida.js';
import { PETICION_APP } from './peticion-de-app.testing.js';

/**
 * Adam (01-11-2026): «se confunden y marcan salida en asistencia en lugar de salida de su actividad».
 * Medido: 49 de 280 salidas con reloj corriendo, al menos 9 siguieron trabajando, y desde el 28-10 la
 * salida deja «No cumplida». Va en el servidor para que alcance a las apps ya instaladas.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';
const HOY = new Date();

function build(opciones: { relojes?: any[]; actividades?: any[]; avisoAt?: Date | null } = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue({ id: 9, isOpen: true, lastEntryAt: new Date(HOY.getTime() - 60_000) }),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 9, isOpen: true }),
      update: jest.fn().mockResolvedValue({ id: 9, isOpen: false }),
    },
    attendanceRejection: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(opciones.avisoAt ? { at: opciones.avisoAt } : null),
    },
    activityWorkSession: {
      findMany: jest.fn().mockResolvedValue(opciones.relojes ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    activity: { findMany: jest.fn().mockResolvedValue(opciones.actividades ?? []) },
    user: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

const reloj = () => ({ id: 1, startedAt: new Date(Date.now() - 60_000), endedAt: null, activity: { anNumber: 'AN-0368' } });

const salida = (extra: Record<string, unknown> = {}) =>
  ({ type: 'salida', photoBase64: FOTO, latitude: 19.07, longitude: -98.27, ...extra }) as any;

const vencidaHoy = (extra: Record<string, unknown> = {}) => ({
  anNumber: 'AN-0368',
  responsableId: 3,
  assignmentCharge: null,
  fechaInicio: null,
  fechaMaxima: HOY,
  fechaEntregaEsperada: HOY,
  periodoInicio: null,
  periodoFin: null,
  assignees: [],
  activityEvidences: [],
  ...extra,
});

describe('mensajeFrenoSalida', () => {
  it('sin nada en juego no frena', () => {
    expect(mensajeFrenoSalida({ corriendo: [], porCerrar: [] })).toBeNull();
  });

  it('nombra la actividad y dice cómo seguir por los dos caminos', () => {
    const texto = mensajeFrenoSalida({ corriendo: ['AN-0368'], porCerrar: ['AN-0368'] })!;
    expect(texto).toContain('AN-0368 corriendo');
    expect(texto).toContain('«No cumplida»');
    expect(texto).toContain('toma su foto final');
    expect(texto).toContain('vuelve a tocar Salida');
  });

  it('con varias, las cuenta en lugar de listarlas', () => {
    const texto = mensajeFrenoSalida({ corriendo: ['A', 'B'], porCerrar: ['A', 'B', 'C'] })!;
    expect(texto).toContain('2 actividades corriendo y sus relojes');
    expect(texto).toContain('3 actividades vencen hoy');
  });

  it('no dispara la ayuda de otros rechazos que ya traen las apps', () => {
    const texto = mensajeFrenoSalida({ corriendo: ['AN-1'], porCerrar: ['AN-2'] })!.toLowerCase();
    for (const palabra of ['app nexara', 'guardia', 'fin de semana', 'simulada', 'gps falso', 'ubicación vieja', 'no se labora']) {
      expect(texto).not.toContain(palabra);
    }
  });
});

describe('salidaConfirmada', () => {
  const ahora = new Date('2026-11-03T22:00:00.000Z');
  it('solo vale dentro de la ventana', () => {
    expect(salidaConfirmada(null, ahora)).toBe(false);
    expect(salidaConfirmada(new Date(ahora.getTime() - 60_000), ahora)).toBe(true);
    expect(salidaConfirmada(new Date(ahora.getTime() - VENTANA_CONFIRMAR_SALIDA_MS - 1), ahora)).toBe(false);
  });
});

describe('freno al checar salida', () => {
  it('con reloj corriendo: 422, no registra, deja constancia y no despierta a los jefes', async () => {
    const { service, prisma, notifyAttendanceFlagged } = build({
      relojes: [reloj()],
    });
    await expect(service.register(salida(), 3, PETICION_APP, 7)).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(prisma.activityWorkSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.attendanceRejection.create.mock.calls[0][0].data).toMatchObject({
      userId: 3,
      type: 'salida',
      motivo: MOTIVO_RECHAZO.salidaSinConfirmar,
    });
    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });

  it('vence hoy sin entregar: también avisa, aunque no tenga reloj', async () => {
    const { service } = build({ actividades: [vencidaHoy()] });
    await expect(service.register(salida(), 3, PETICION_APP, 7)).rejects.toThrow('quedaría «No cumplida»');
  });

  it('ya la entregó: no frena', async () => {
    const { service, prisma } = build({
      actividades: [vencidaHoy({ activityEvidences: [{ userId: 3, status: 'COMPLETED' }] })],
    });
    await service.register(salida(), 3, PETICION_APP, 7);
    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
    expect(prisma.attendance.create).toHaveBeenCalled();
  });

  it('volver a tocar dentro de la ventana registra la salida', async () => {
    const { service, prisma } = build({
      relojes: [reloj()],
      avisoAt: new Date(Date.now() - 30_000),
    });
    await service.register(salida(), 3, PETICION_APP, 7);
    expect(prisma.attendance.create).toHaveBeenCalled();
    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
    expect(prisma.activityWorkSession.updateMany).toHaveBeenCalled();
  });

  it('sin nada en juego registra al primer toque', async () => {
    const { service, prisma } = build();
    await service.register(salida(), 3, PETICION_APP, 7);
    expect(prisma.attendance.create).toHaveBeenCalled();
    expect(prisma.attendanceRejection.findFirst).not.toHaveBeenCalled();
  });

  it('con la hoja de la app ya confirmada no se vuelve a frenar', async () => {
    const { service, prisma } = build({ relojes: [reloj()] });
    await service.register(salida({ confirmada: true }), 3, PETICION_APP, 7);
    expect(prisma.attendance.create).toHaveBeenCalled();
    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
  });

  it('el riesgo dice qué se detiene y qué vence, sin registrar nada', async () => {
    const { service, prisma } = build({
      relojes: [{ activity: { id: 1, anNumber: 'AN-1', titulo: 'Rack' } }],
      actividades: [vencidaHoy({ id: 2, anNumber: 'AN-2', titulo: 'Facturas' })],
    });
    const r = await service.riesgoSalida(3, 7);
    expect(r.corriendo).toEqual([{ id: 1, folio: 'AN-1', titulo: 'Rack' }]);
    expect(r.porCerrar).toEqual([{ id: 2, folio: 'AN-2', titulo: 'Facturas' }]);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('lo capturado sin conexión no se frena: ya no hay a quién preguntarle', async () => {
    const { service, prisma } = build({ relojes: [reloj()] });
    await service.register(salida({ offline: true, capturedAt: new Date().toISOString() }), 3, PETICION_APP, 7);
    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
  });
});
