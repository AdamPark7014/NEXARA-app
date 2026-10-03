import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_RECHAZO } from './asistencia-confiable.js';
import { PETICION_APP } from './peticion-de-app.testing.js';
import { abrirJornadaDeGuardia } from './entrada-guardia.js';
import { ActivityEvidenceService } from '../activities/evidence/activity-evidence.service';
import { MENSAJE_FIN_DE_SEMANA_SIN_GUARDIA, esFinDeSemana } from '../guardias/guardias-reglas.js';

/**
 * Regla del dueño: el sábado y el domingo solo abre jornada quien tiene guardia ese día.
 * Quien la tiene no pasa por la geocerca de oficina, y su entrada sale sola al iniciar su
 * primer servicio o tarea del día, con la hora y la ubicación de ese inicio.
 *
 * Los días se miden en hora de México: el viernes a las 19:00 ya es sábado en UTC.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';
/** Sábado 3 de octubre de 2026, 10:00 en México. */
const SAB_10 = new Date('2026-10-03T16:00:00Z');
/** Viernes 2 de octubre, 19:00 en México (sábado 01:00 UTC). */
const VIE_19 = new Date('2026-10-03T01:00:00Z');
/** Domingo 4 de octubre, 23:00 en México (lunes 05:00 UTC). */
const DOM_23 = new Date('2026-10-05T05:00:00Z');
/** Lunes 5 de octubre, 09:00 en México. */
const LUN_09 = new Date('2026-10-05T15:00:00Z');
/** Una obra en Cholula, a varios km de la oficina. */
const OBRA = { latitude: 19.0633, longitude: -98.3064 };

afterEach(() => jest.useRealTimers());

function build(opts: { conGuardia?: boolean; sinTabla?: boolean; over?: Record<string, any> } = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Joan' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Joan' } }),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    attendanceRejection: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    user: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    ...(opts.sinTabla
      ? {}
      : { guardia: { findFirst: jest.fn().mockResolvedValue(opts.conGuardia ? { id: 9 } : null) } }),
    ...opts.over,
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

const entrada = (extra: Record<string, unknown> = {}) =>
  ({ type: 'entrada', photoBase64: FOTO, ...OBRA, accuracyM: 10, ...extra }) as any;

describe('qué es fin de semana', () => {
  it('sábado y domingo en hora de México, no en UTC', () => {
    expect(esFinDeSemana(SAB_10)).toBe(true);
    expect(esFinDeSemana(DOM_23)).toBe(true);
    expect(esFinDeSemana(VIE_19)).toBe(false);
    expect(esFinDeSemana(LUN_09)).toBe(false);
  });
});

describe('checada en fin de semana', () => {
  it('sin guardia: se rechaza con el mensaje claro y queda el intento (sin despertar a sus jefes)', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const { service, prisma, notifyAttendanceFlagged } = build();

    const intento = service.register(entrada(), 3, PETICION_APP, 7);
    await expect(intento).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(intento).rejects.toThrow(MENSAJE_FIN_DE_SEMANA_SIN_GUARDIA);

    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRejection.create.mock.calls[0][0].data).toMatchObject({
      userId: 3,
      type: 'entrada',
      motivo: MOTIVO_RECHAZO.finDeSemanaSinGuardia,
      companyId: 7,
    });
    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });

  it('con guardia: entra desde donde esté, sin geocerca de oficina', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const { service, prisma } = build({ conGuardia: true });

    await service.register(entrada(), 3, PETICION_APP, 7);

    expect(prisma.guardia.findFirst.mock.calls[0][0].where).toEqual({
      userId: 3,
      companyId: 7,
      fecha: new Date('2026-10-03T00:00:00.000Z'),
    });
    const data = prisma.attendance.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'entrada', entryLatitude: OBRA.latitude, fueraDeSitio: false, companyId: 7 });
  });

  it('el domingo a las 23:00 de México sigue siendo fin de semana aunque en UTC ya sea lunes', async () => {
    jest.useFakeTimers().setSystemTime(DOM_23);
    const { service, prisma } = build();
    await expect(service.register(entrada(), 3, PETICION_APP, 7)).rejects.toThrow(MENSAJE_FIN_DE_SEMANA_SIN_GUARDIA);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('el viernes a las 19:00 de México es entre semana aunque en UTC ya sea sábado', async () => {
    jest.useFakeTimers().setSystemTime(VIE_19);
    const { service, prisma } = build();
    await service.register(entrada(), 3, PETICION_APP, 7);
    expect(prisma.guardia.findFirst).not.toHaveBeenCalled();
    expect(prisma.attendance.create).toHaveBeenCalled();
  });

  it('entre semana nada cambia: la geocerca sigue marcando fuera de sitio', async () => {
    jest.useFakeTimers().setSystemTime(LUN_09);
    const { service, prisma } = build();
    await service.register(entrada(), 3, PETICION_APP, 7);
    expect(prisma.guardia.findFirst).not.toHaveBeenCalled();
    expect(prisma.attendance.create.mock.calls[0][0].data.fueraDeSitio).toBe(true);
  });

  it('la salida no se bloquea: una jornada abierta siempre se puede cerrar', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const { service, prisma } = build({
      over: {
        attendanceDay: {
          findFirst: jest.fn().mockResolvedValue({ id: 1, isOpen: true, lastEntryAt: new Date(SAB_10.getTime() - 3_600_000) }),
          upsert: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 1 }),
        },
      },
    });
    await service.register({ type: 'salida', photoBase64: FOTO, ...OBRA } as any, 3, PETICION_APP, 7);
    expect(prisma.attendance.create.mock.calls[0][0].data.type).toBe('salida');
  });

  it('si la tabla de guardias no existe todavía, se checa como antes', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const { service, prisma } = build({ sinTabla: true });
    await service.register(entrada(), 3, PETICION_APP, 7);
    expect(prisma.attendance.create).toHaveBeenCalled();
  });

  it('su jefe tampoco le abre jornada en fin de semana si no tiene guardia', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const { service, prisma } = build();
    const ceo = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
    await expect(
      service.registrarPorJefe(ceo, { userId: 3, type: 'entrada', motivo: 'Se le descompuso el teléfono' }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });
});

describe('entrada automática al iniciar la actividad', () => {
  function db(opts: { conGuardia?: boolean; coreKind?: string; yaEntro?: boolean } = {}) {
    return {
      guardia: { findFirst: jest.fn().mockResolvedValue(opts.conGuardia === false ? null : { id: 9 }) },
      activity: { findFirst: jest.fn().mockResolvedValue({ coreKind: opts.coreKind ?? 'servicio', titulo: 'Mantenimiento CCTV' }) },
      attendance: {
        findFirst: jest.fn().mockResolvedValue(opts.yaEntro ? { id: 5 } : null),
        create: jest.fn().mockResolvedValue({ id: 77, user: { nombre: 'Joan Sánchez' } }),
      },
      attendanceDay: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
  }
  const inicio = { userId: 3, companyId: 7, activityId: 10, at: SAB_10, ...OBRA, photoUrl: '/uploads/activities/entrada.jpg' };

  it('con guardia, el primer servicio del sábado abre la jornada con la hora, la ubicación y la foto del inicio', async () => {
    const d = db();
    const r = await abrirJornadaDeGuardia(d, inicio);

    expect(r).toMatchObject({ creada: true, attendanceId: 77, nombre: 'Joan Sánchez' });
    expect(d.attendance.create.mock.calls[0][0].data).toMatchObject({
      userId: 3,
      type: 'entrada',
      timestamp: SAB_10,
      workDate: new Date('2026-10-03T00:00:00.000Z'),
      entryLatitude: OBRA.latitude,
      entryLongitude: OBRA.longitude,
      photoUrl: '/uploads/activities/entrada.jpg',
      fueraDeSitio: false,
      validacion: 'OK',
      companyId: 7,
    });
    expect(d.attendance.create.mock.calls[0][0].data.deviceInfo).toMatch(/guardia/);
    expect(d.attendanceDay.upsert.mock.calls[0][0]).toMatchObject({
      where: { companyId_userId_date: { companyId: 7, userId: 3, date: new Date('2026-10-03T00:00:00.000Z') } },
      create: { isOpen: true, lastEntryAt: SAB_10, companyId: 7 },
    });
  });

  it('una tarea también abre la jornada', async () => {
    const d = db({ coreKind: 'tarea' });
    expect((await abrirJornadaDeGuardia(d, inicio)).creada).toBe(true);
  });

  it('un proyecto o una actividad comercial no: tiene que ser servicio o tarea', async () => {
    for (const coreKind of ['proyecto', 'comercial']) {
      const d = db({ coreKind });
      expect((await abrirJornadaDeGuardia(d, inicio)).creada).toBe(false);
      expect(d.attendance.create).not.toHaveBeenCalled();
    }
  });

  it('sin guardia no se genera entrada', async () => {
    const d = db({ conGuardia: false });
    expect((await abrirJornadaDeGuardia(d, inicio)).creada).toBe(false);
    expect(d.attendance.create).not.toHaveBeenCalled();
  });

  it('si ya checó entrada ese día, la segunda actividad no crea otra', async () => {
    const d = db({ yaEntro: true });
    expect((await abrirJornadaDeGuardia(d, inicio)).creada).toBe(false);
    expect(d.attendance.create).not.toHaveBeenCalled();
  });

  it('entre semana no hace nada (ni pregunta por guardias)', async () => {
    const d = db();
    expect((await abrirJornadaDeGuardia(d, { ...inicio, at: LUN_09 })).creada).toBe(false);
    expect(d.guardia.findFirst).not.toHaveBeenCalled();
  });

  it('nunca lanza: si la base falla, el inicio de la actividad sigue', async () => {
    const d = db();
    d.attendance.create.mockRejectedValue(new Error('base caída'));
    await expect(abrirJornadaDeGuardia(d, inicio)).resolves.toEqual({ creada: false });
  });

  it('la foto de entrada de la actividad es la que dispara la entrada, y sus jefes se enteran', async () => {
    jest.useFakeTimers().setSystemTime(SAB_10);
    const evidence: any = {
      id: 55,
      activityId: 10,
      userId: 3,
      companyId: 7,
      status: 'ENTRY_PHOTO',
      reviewStatus: 'PENDING',
      evidencePhotos: [],
    };
    const activity: any = {
      id: 10,
      companyId: 7,
      estatus: 'Pendiente',
      coreKind: 'servicio',
      titulo: 'Mantenimiento CCTV',
      responsableId: 3,
      prioridad: 'MEDIA',
      fechaInicio: null,
      clientId: null,
    };
    const d = db();
    const prisma: any = {
      ...d,
      activity: {
        findFirst: jest.fn().mockResolvedValue(activity),
        findUnique: jest.fn().mockResolvedValue(activity),
        update: jest.fn().mockResolvedValue(activity),
      },
      activityEvidence: {
        findFirst: jest.fn().mockResolvedValue(evidence),
        update: jest.fn(async ({ data }: any) => Object.assign(evidence, data)),
      },
      activityAssignee: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      serviceClientBranch: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const avisos: any = {
      notifyActivityProgress: jest.fn(),
      notifyActivityStartFlagged: jest.fn(),
      notifyAttendanceChange: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ActivityEvidenceService(prisma, {} as any, avisos);

    await service.saveEntryPhoto(10, 3, '/uploads/activities/entrada.jpg', OBRA.latitude, OBRA.longitude, 7);

    expect(prisma.attendance.create.mock.calls[0][0].data).toMatchObject({
      type: 'entrada',
      timestamp: SAB_10,
      entryLatitude: OBRA.latitude,
      photoUrl: '/uploads/activities/entrada.jpg',
    });
    expect(avisos.notifyAttendanceChange).toHaveBeenCalledWith(
      3,
      'ATTENDANCE_CHECKIN',
      'Joan Sánchez',
      expect.stringMatching(/guardia/),
      SAB_10,
    );
  });
});
