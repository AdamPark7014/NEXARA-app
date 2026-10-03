import { BadRequestException } from '@nestjs/common';
import { ActivityEvidenceService } from '../evidence/activity-evidence.service';
import { ActivityTeamService } from '../activity-team.service';
import { AttendanceService } from '../../attendance/attendance.service';
import { PETICION_APP } from '../../attendance/peticion-de-app.testing';
import { MENSAJE_TOPE_12H } from './sesiones-trabajo';

/**
 * Los puntos donde el resto del sistema toca las sesiones de trabajo:
 * la evidencia (inicio, cualquier paso, foto de salida), la checada de salida
 * y el tiempo estimado al asignar. Si alguien quita una de estas llamadas, el reloj
 * de las actividades vuelve a correr sin fin y nadie lo nota hasta ver los KPI.
 */

function evidencia(estado: 'ENTRY_PHOTO' | 'EVIDENCE_PHOTOS' | 'EXIT_PHOTO') {
  const evidence: any = {
    id: 55,
    activityId: 7,
    userId: 3,
    companyId: 1,
    status: estado,
    reviewStatus: 'PENDING',
    entryLatitude: 19.0414,
    entryLongitude: -98.2063,
    entryPhotoUploadedAt: estado === 'ENTRY_PHOTO' ? null : new Date('2026-09-17T15:00:00Z'),
    exitPhotoUploadedAt: null,
    evidencePhotos: [],
    evidencePhotosGeo: null,
  };
  const activity: any = {
    id: 7,
    companyId: 1,
    estatus: 'En Proceso',
    coreKind: 'tarea',
    workType: null,
    evidencePhotoRequired: 4,
    responsableId: 3,
    indicaciones: null,
    titulo: 'Mantenimiento',
    anNumber: 'AN-0007',
    prioridad: 'MEDIA',
    fechaInicio: null,
    clientId: null,
    branchName: null,
    branchNumber: null,
  };
  const prisma: any = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(activity),
      findUnique: jest.fn().mockResolvedValue(activity),
      update: jest.fn(async ({ data }: any) => Object.assign(activity, data)),
    },
    activityEvidence: {
      findFirst: jest.fn().mockResolvedValue(evidence),
      findMany: jest.fn().mockResolvedValue([{ userId: 3, status: 'COMPLETED' }]),
      update: jest.fn(async ({ data }: any) => Object.assign(evidence, data)),
    },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue({ id: 9, aceptadaAt: null, inicioRealAt: null, finRealAt: null, horasReales: null }),
      // Con `finRealAt: null` pregunta por otras actividades del día (ninguna); si no, el equipo.
      findMany: jest.fn(async ({ where }: any) => (where?.finRealAt === null ? [] : [{ userId: 3, rol: 'TECNICO' }])),
      update: jest.fn(async ({ data }: any) => data),
    },
    activityEvidenceField: { findMany: jest.fn().mockResolvedValue([]) },
    serviceClientBranch: { findFirst: jest.fn().mockResolvedValue(null) },
    clientTicketRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 3, nombre: 'Antonio', managerId: null }) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const avisos: any = {
    notifyActivityProgress: jest.fn(),
    notifyEvidenceSubmitted: jest.fn(),
    notifyActivityAutoCompleted: jest.fn(),
    notifyActivityStartFlagged: jest.fn(),
  };
  const sesiones = {
    asegurarAbierta: jest.fn().mockResolvedValue({ abierta: true }),
    abrir: jest.fn().mockResolvedValue({ abierta: true }),
    terminar: jest.fn().mockResolvedValue(undefined),
  };
  const geofence: any = { validarSalida: jest.fn().mockResolvedValue(undefined) };
  const service = new ActivityEvidenceService(prisma, {} as any, avisos, geofence, undefined, sesiones as any);
  return { service, sesiones, evidence };
}

describe('evidencia → sesiones de trabajo', () => {
  it('la foto de entrada abre la sesión a la hora de la foto', async () => {
    const { service, sesiones, evidence } = evidencia('ENTRY_PHOTO');
    await service.saveEntryPhoto(7, 3, '/activities/entrada.jpg', 19.0414, -98.2063, 1);
    expect(sesiones.abrir).toHaveBeenCalledWith({ activityId: 7, userId: 3, at: evidence.entryPhotoUploadedAt });
  });

  it('cualquier paso de su evidencia reanuda el reloj (las apps publicadas no tienen «Reanudar»)', async () => {
    const { service, sesiones } = evidencia('EVIDENCE_PHOTOS');
    await service.addEvidencePhoto(7, 3, '/activities/foto-1.jpg', null, 1);
    expect(sesiones.asegurarAbierta).toHaveBeenCalledWith({ activityId: 7, userId: 3, companyId: 1 });
  });

  it('la foto de salida cierra la sesión con FIN a la hora de la foto', async () => {
    const { service, sesiones, evidence } = evidencia('EXIT_PHOTO');
    await service.saveExitPhoto(7, 3, '/activities/salida.jpg', 19.0414, -98.2063, 1);
    expect(sesiones.terminar).toHaveBeenCalledWith({ activityId: 7, userId: 3, at: evidence.exitPhotoUploadedAt });
  });

  it('sin el servicio de sesiones (pruebas viejas) la evidencia funciona igual', async () => {
    const { service } = evidencia('EXIT_PHOTO');
    (service as any).sesiones = undefined;
    await expect(service.saveExitPhoto(7, 3, '/activities/salida.jpg', 19.0414, -98.2063, 1)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
  });
});

describe('checada de salida → sesiones de trabajo', () => {
  function asistencia() {
    const sesiones = [
      { id: 1, userId: 3, startedAt: new Date(Date.now() - 2 * 3_600_000), endedAt: null as Date | null, endReason: null as string | null },
    ];
    const prisma: any = {
      attendance: {
        create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      attendanceDay: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, isOpen: true, lastEntryAt: new Date(Date.now() - 3 * 3_600_000) }),
        upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
      activityWorkSession: {
        findMany: jest.fn(async ({ where }: any) =>
          sesiones.filter((s) => s.userId === where.userId && s.endedAt === null),
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const s = sesiones.find((x) => x.id === where.id);
          if (s) Object.assign(s, data);
          return { count: s ? 1 : 0 };
        }),
      },
    };
    const service = new AttendanceService(
      prisma,
      { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
      { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { service, prisma, sesiones };
  }

  it('al marcar su salida se detiene el reloj de lo que tenía en curso, con SALIDA y de su empresa', async () => {
    const { service, prisma, sesiones } = asistencia();
    const antes = Date.now();
    await service.register({ type: 'salida', photoBase64: 'data:image/jpeg;base64,AAAA' } as any, 3, PETICION_APP, 7);

    expect(sesiones[0].endReason).toBe('SALIDA');
    expect(sesiones[0].endedAt!.getTime()).toBeGreaterThanOrEqual(antes);
    expect(prisma.activityWorkSession.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 3,
      endedAt: null,
      companyId: 7,
    });
  });

  it('la entrada no toca las sesiones', async () => {
    const { service, prisma } = asistencia();
    prisma.attendanceDay.findFirst.mockResolvedValue(null);
    await service.register({ type: 'entrada', photoBase64: 'data:image/jpeg;base64,AAAA' } as any, 3, PETICION_APP, 7);
    expect(prisma.activityWorkSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('tiempo estimado al sumar a alguien al equipo', () => {
  function equipo() {
    const prisma: any = {
      activity: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          companyId: 1,
          responsableId: 3,
          anNumber: 'AN-0010',
          titulo: 'Instalar cámaras',
          assignmentCharge: 'ejecucion',
          coreKind: 'tarea',
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 30 }) },
      activityAssignee: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ ...data, user: { id: 30, nombre: 'Joan' } })),
      },
      activityEvidence: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service = new ActivityTeamService(prisma, { notifyActivityDispatched: jest.fn() } as any);
    return { service, prisma };
  }

  it('más de 12 horas no se guarda: dice por qué', async () => {
    const { service, prisma } = equipo();
    const intento = service.addMember(10, { userId: 30, horasPlan: 16 }, 1, 3);
    await expect(intento).rejects.toBeInstanceOf(BadRequestException);
    await expect(intento).rejects.toThrow(MENSAJE_TOPE_12H);
    expect(prisma.activityAssignee.create).not.toHaveBeenCalled();
  });

  it('12 horas o menos, o sin estimado, pasan como siempre', async () => {
    const { service, prisma } = equipo();
    await service.addMember(10, { userId: 30, horasPlan: 12 }, 1, 3);
    await service.addMember(10, { userId: 30 }, 1, 3);
    expect(prisma.activityAssignee.create.mock.calls[0][0].data.horasPlan).toBe(12);
    expect(prisma.activityAssignee.create.mock.calls[1][0].data.horasPlan).toBeNull();
  });
});
