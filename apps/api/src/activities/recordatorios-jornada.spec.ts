import {
  avisoPorVencer,
  avisoSinActividad,
  ejecutoresDeActividad,
  horarioDeRecordatorios,
  minutosAlLimite,
  necesitaActividad,
  tocaAvisoPorVencer,
  yaEntrego,
} from './recordatorios-jornada';
import { RecordatoriosJornadaService } from './recordatorios-jornada.service';

// Jueves 29-10-2026, 11:00 en México (UTC−6).
const AHORA = new Date('2026-10-29T17:00:00Z');
const minDespues = (m: number) => new Date(AHORA.getTime() + m * 60_000);

describe('reglas de los recordatorios de jornada', () => {
  it('solo de lunes a sábado, de 7:00 a 20:00 de México', () => {
    expect(horarioDeRecordatorios(AHORA)).toBe(true);
    expect(horarioDeRecordatorios(new Date('2026-10-29T12:30:00Z'))).toBe(false); // 6:30
    expect(horarioDeRecordatorios(new Date('2026-10-30T02:30:00Z'))).toBe(false); // jue 20:30
    expect(horarioDeRecordatorios(new Date('2026-11-01T17:00:00Z'))).toBe(false); // domingo
  });

  it('insiste a quien está en jornada sin reloj corriendo; no en su comida ni fuera de jornada', () => {
    expect(necesitaActividad({ enJornada: true, enComida: false, relojCorriendo: false })).toBe(true);
    expect(necesitaActividad({ enJornada: true, enComida: false, relojCorriendo: true })).toBe(false);
    expect(necesitaActividad({ enJornada: true, enComida: true, relojCorriendo: false })).toBe(false);
    expect(necesitaActividad({ enJornada: false, enComida: false, relojCorriendo: false })).toBe(false);
  });

  it('el texto dice si tiene algo abierto o nada', () => {
    expect(avisoSinActividad(0).title).toBe('No tienes ninguna actividad abierta');
    expect(avisoSinActividad(1).message).toContain('Tienes 1 actividad abierta');
    expect(avisoSinActividad(3).message).toContain('Tienes 3 actividades abiertas');
  });

  it('minutos al límite: positivo antes, negativo después, null sin límite', () => {
    expect(minutosAlLimite(minDespues(25), AHORA)).toBe(25);
    expect(minutosAlLimite(minDespues(-40), AHORA)).toBe(-40);
    expect(minutosAlLimite(null, AHORA)).toBeNull();
  });

  it('se insiste desde 30 min antes del límite y después, si no la entregó y el límite es de hoy', () => {
    const base = { entregada: false, enJornada: true, limiteEsDeHoy: true };
    expect(tocaAvisoPorVencer({ ...base, minutos: 31 })).toBe(false);
    expect(tocaAvisoPorVencer({ ...base, minutos: 30 })).toBe(true);
    expect(tocaAvisoPorVencer({ ...base, minutos: -90 })).toBe(true);
    expect(tocaAvisoPorVencer({ ...base, minutos: 10, entregada: true })).toBe(false);
    expect(tocaAvisoPorVencer({ ...base, minutos: 10, enJornada: false })).toBe(false);
    expect(tocaAvisoPorVencer({ ...base, minutos: -9000, limiteEsDeHoy: false })).toBe(false);
    expect(tocaAvisoPorVencer({ ...base, minutos: null })).toBe(false);
  });

  it('el aviso dice cuánto falta o cuánto se pasó', () => {
    expect(avisoPorVencer({ anNumber: 'AN-0400', titulo: 'Peinado de cable', minutos: 20 }).title).toBe(
      'AN-0400 vence en 20 min',
    );
    expect(avisoPorVencer({ anNumber: 'AN-0400', titulo: 'x', minutos: 0 }).title).toBe('AN-0400 vence ahora');
    const pasada = avisoPorVencer({ anNumber: 'AN-0400', titulo: 'x', minutos: -75 });
    expect(pasada.title).toBe('AN-0400 ya pasó su límite (1 h 15 min)');
    expect(pasada.message).toContain('antes de checar tu salida');
  });

  it('en despacho, quien solo la reparte no la ejecuta; sin equipo, el responsable', () => {
    const t = new Date('2026-10-29T15:00:00Z');
    expect(
      ejecutoresDeActividad({
        responsableId: 39,
        assignmentCharge: 'despacho',
        assignees: [
          { userId: 39, rol: 'LEAD', asignadoAt: t },
          { userId: 40, rol: 'TECNICO', asignadoAt: t },
        ],
      }),
    ).toEqual([40]);
    expect(ejecutoresDeActividad({ responsableId: 8, assignmentCharge: 'ejecucion', assignees: [] })).toEqual([8]);
  });

  it('ya entregó con su fin real o con la evidencia completa', () => {
    const a = {
      assignees: [
        { userId: 1, finRealAt: AHORA },
        { userId: 2, finRealAt: null },
        { userId: 3, finRealAt: null },
      ],
      activityEvidences: [
        { userId: 2, status: 'COMPLETED' },
        { userId: 3, status: 'EXIT_PHOTO' },
      ],
    };
    expect(yaEntrego(1, a)).toBe(true);
    expect(yaEntrego(2, a)).toBe(true);
    expect(yaEntrego(3, a)).toBe(false);
  });
});

describe('RecordatoriosJornadaService', () => {
  function armar(opts: {
    dias?: Array<{ userId: number; companyId: number; user: { email: string; isActive: boolean } }>;
    comidas?: number[];
    relojes?: number[];
    actividades?: unknown[];
  }) {
    const prisma = {
      attendanceDay: { findMany: jest.fn().mockResolvedValue(opts.dias ?? []) },
      lunchBreak: { findMany: jest.fn().mockResolvedValue((opts.comidas ?? []).map((userId) => ({ userId }))) },
      activityWorkSession: { findMany: jest.fn().mockResolvedValue((opts.relojes ?? []).map((userId) => ({ userId }))) },
      activity: { findMany: jest.fn().mockResolvedValue(opts.actividades ?? []) },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
    return { service: new RecordatoriosJornadaService(prisma as never, notifications as never), prisma, notifications };
  }
  const persona = (userId: number, email = `p${userId}@nexara.com.mx`) => ({
    userId,
    companyId: 1,
    user: { email, isActive: true },
  });
  const actividad = (over: Record<string, unknown> = {}) => ({
    id: 400,
    companyId: 1,
    anNumber: 'AN-0400',
    titulo: 'Peinado de cable',
    responsableId: 10,
    assignmentCharge: 'ejecucion',
    fechaInicio: new Date('2026-10-29T15:00:00Z'),
    fechaMaxima: minDespues(20),
    fechaEntregaEsperada: minDespues(20),
    periodoInicio: null,
    periodoFin: null,
    assignees: [{ userId: 10, rol: 'LEAD', asignadoAt: new Date('2026-10-29T14:00:00Z'), finRealAt: null }],
    activityEvidences: [],
    ...over,
  });

  it('fuera de horario no consulta nada', async () => {
    const { service, prisma } = armar({ dias: [persona(10)] });
    expect(await service.revisar(new Date('2026-11-01T17:00:00Z'))).toEqual({ sinActividad: 0, porVencer: 0 });
    expect(prisma.attendanceDay.findMany).not.toHaveBeenCalled();
  });

  it('avisa cada 5 min a quien no tiene reloj; no a quien trabaja, come o no es empleado', async () => {
    const { service, notifications } = armar({
      dias: [persona(7), persona(8), persona(9), persona(2, 'developer@nexara.com.mx')],
      relojes: [8],
      comidas: [9],
    });
    const r = await service.revisar(AHORA);
    expect(r.sinActividad).toBe(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: 'SLA_ALERT',
        priority: 'high',
        title: 'No tienes ninguna actividad abierta',
        collapseKey: 'nx_sin_actividad_u7',
        dedupeSeconds: 240,
      }),
    );
  });

  it('a quien se le vence una actividad sin entregar, cada 10 min; con lo abierto en el texto de «sin actividad»', async () => {
    const { service, notifications } = armar({ dias: [persona(10)], actividades: [actividad()] });
    const r = await service.revisar(AHORA);
    expect(r).toEqual({ sinActividad: 1, porVencer: 1 });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'ACTIVITY_OVERDUE',
        title: 'AN-0400 vence en 20 min',
        relatedEntityId: 400,
        relatedUrl: '/erp/actividades/400',
        collapseKey: 'nx_vence_400_u10',
        dedupeSeconds: 540,
      }),
    );
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, message: expect.stringContaining('Tienes 1 actividad abierta') }),
    );
  });

  it('no insiste por vencer si ya entregó su evidencia', async () => {
    const { service, notifications } = armar({
      dias: [persona(10)],
      relojes: [10],
      actividades: [actividad({ activityEvidences: [{ userId: 10, status: 'COMPLETED' }] })],
    });
    expect(await service.revisar(AHORA)).toEqual({ sinActividad: 0, porVencer: 0 });
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('solo busca actividades que corren plazo (sin «Por Validar» ni cerradas)', async () => {
    const { service, prisma } = armar({ dias: [persona(10)], relojes: [10] });
    await service.revisar(AHORA);
    const estatus = prisma.activity.findMany.mock.calls[0][0].where.estatus.in as string[];
    expect(estatus).toEqual(expect.arrayContaining(['En Proceso', 'Asignada']));
    expect(estatus).not.toContain('Por Validar');
    expect(estatus).not.toContain('Finalizada');
  });
});
