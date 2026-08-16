import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingsService } from './meetings.service.js';

// `close()` relee la reunión con sus acuerdos al terminar, así que el doble
// tiene que parecerse a lo que devuelve el `include`, no sólo al `select`.
const REUNION = {
  id: 5,
  estado: 'PROGRAMADA',
  realizadaAt: null,
  notas: null,
  asistentes: [],
  acuerdos: [],
};
const ACUERDO = {
  id: 8,
  estado: 'PENDIENTE',
  tipo: 'ACUERDO',
  cumplidoAt: null,
  responsableId: 3,
  fechaCompromiso: null,
};

function build(over: Record<string, any> = {}) {
  const prisma = {
    operationalMeeting: {
      findFirst: jest.fn().mockResolvedValue(REUNION),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 5 }),
      update: jest.fn().mockResolvedValue({ id: 5 }),
    },
    meetingAgreement: {
      findFirst: jest.fn().mockResolvedValue(ACUERDO),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ ...ACUERDO }),
      update: jest.fn().mockResolvedValue({ ...ACUERDO }),
    },
    meetingAttendee: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
    },
    user: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.id.in.map((id: number) => ({ id })))) },
    activity: { findFirst: jest.fn().mockResolvedValue({ id: 10 }) },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        meetingAttendee: prismaRef.meetingAttendee,
      }),
    ),
    ...over,
  };
  const prismaRef = prisma;

  return { service: new MeetingsService(prisma as any), prisma };
}

describe('convocar una reunión', () => {
  it('la diaria se convoca sin escribir nada: título, hora y agenda salen del tipo', async () => {
    const { service, prisma } = build();
    await service.create({ tipo: 'DIARIA', fecha: '2026-08-17' }, 3, 7);

    const data = prisma.operationalMeeting.create.mock.calls[0][0].data;
    expect(data.titulo).toBe('Reunión diaria');
    expect(data.horaInicio).toBe('10:00');
    expect(data.agenda).toContain('Prioridades del día');
  });

  it('la junta del viernes trae "Lecciones aprendidas" en la agenda', async () => {
    const { service, prisma } = build();
    await service.create({ tipo: 'CIERRE_SEMANAL', fecha: '2026-08-21' }, 3, 7);
    expect(prisma.operationalMeeting.create.mock.calls[0][0].data.agenda).toContain(
      'Lecciones aprendidas',
    );
  });

  it('quien convoca queda como facilitador si no se indica otro', async () => {
    const { service, prisma } = build();
    await service.create({ tipo: 'DIARIA', fecha: '2026-08-17' }, 3, 7);
    expect(prisma.operationalMeeting.create.mock.calls[0][0].data.facilitadorId).toBe(3);
  });

  it('rechaza un tipo que no es de la casa', async () => {
    const { service } = build();
    await expect(service.create({ tipo: 'CAFE' as any, fecha: '2026-08-17' }, 3, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza una fecha inválida', async () => {
    const { service } = build();
    await expect(service.create({ tipo: 'DIARIA', fecha: 'mañana' }, 3, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no convoca a alguien de otra empresa', async () => {
    // La lista de asistencia dejaria de ser prueba de nada.
    const { service } = build({ user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) } });
    await expect(
      service.create({ tipo: 'DIARIA', fecha: '2026-08-17', asistentes: [3, 999] }, 3, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('una hora con formato raro no se inventa: cae al valor del tipo', async () => {
    const { service, prisma } = build();
    await service.create({ tipo: 'DIARIA', fecha: '2026-08-17', horaInicio: '99:99' }, 3, 7);
    expect(prisma.operationalMeeting.create.mock.calls[0][0].data.horaInicio).toBe('10:00');
  });
});

describe('cerrar la reunión', () => {
  it('sella estado y fecha', async () => {
    const { service, prisma } = build();
    await service.close(5, { notas: 'se acordó X' }, 7);

    const data = prisma.operationalMeeting.update.mock.calls[0][0].data;
    expect(data.estado).toBe('REALIZADA');
    expect(data.realizadaAt).toBeInstanceOf(Date);
    expect(data.notas).toBe('se acordó X');
  });

  it('una reunión cancelada no se da por realizada', async () => {
    // Seria un acta de algo que no ocurrio.
    const { service } = build({
      operationalMeeting: {
        findFirst: jest.fn().mockResolvedValue({ ...REUNION, estado: 'CANCELADA' }),
      },
    });
    await expect(service.close(5, {}, 7)).rejects.toThrow(BadRequestException);
  });

  it('no se puede devolver a "programada" una ya realizada', async () => {
    const { service } = build({
      operationalMeeting: {
        findFirst: jest.fn().mockResolvedValue({ ...REUNION, estado: 'REALIZADA' }),
        update: jest.fn(),
      },
    });
    await expect(service.update(5, { estado: 'PROGRAMADA' }, 7)).rejects.toThrow(BadRequestException);
  });
});

describe('acuerdos, lecciones y riesgos', () => {
  it('un acuerdo sin responsable se rechaza', async () => {
    const { service } = build();
    await expect(service.addAgreement(5, { descripcion: 'pedir material' }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('una lección aprendida no necesita responsable', async () => {
    const { service, prisma } = build();
    await service.addAgreement(5, { tipo: 'LECCION', descripcion: 'confirmar acceso la víspera' }, 7);

    const data = prisma.meetingAgreement.create.mock.calls[0][0].data;
    expect(data.tipo).toBe('LECCION');
    expect(data.responsableId).toBeNull();
  });

  it('un riesgo tampoco', async () => {
    const { service, prisma } = build();
    await service.addAgreement(5, { tipo: 'RIESGO', descripcion: 'lluvias la próxima semana' }, 7);
    expect(prisma.meetingAgreement.create.mock.calls[0][0].data.tipo).toBe('RIESGO');
  });

  it('el acuerdo puede colgar de la actividad de la que se habló', async () => {
    const { service, prisma } = build();
    await service.addAgreement(
      5,
      { descripcion: 'reprogramar visita', responsableId: 3, activityId: 10 },
      7,
    );
    expect(prisma.meetingAgreement.create.mock.calls[0][0].data.activityId).toBe(10);
  });

  it('no acepta una actividad de otra empresa', async () => {
    const { service } = build({ activity: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(
      service.addAgreement(5, { descripcion: 'x', responsableId: 3, activityId: 999 }, 7),
    ).rejects.toThrow(NotFoundException);
  });

  it('cumplir sella la fecha', async () => {
    const { service, prisma } = build();
    await service.updateAgreement(5, 8, { estado: 'CUMPLIDO' }, 7);
    expect(prisma.meetingAgreement.update.mock.calls[0][0].data.cumplidoAt).toBeInstanceOf(Date);
  });

  it('reabrir limpia la fecha de cumplimiento', async () => {
    const { service, prisma } = build({
      meetingAgreement: {
        findFirst: jest.fn().mockResolvedValue({ ...ACUERDO, estado: 'CUMPLIDO', cumplidoAt: new Date() }),
        update: jest.fn().mockResolvedValue(ACUERDO),
      },
    });
    await service.updateAgreement(5, 8, { estado: 'PENDIENTE' }, 7);
    expect(prisma.meetingAgreement.update.mock.calls[0][0].data.cumplidoAt).toBeNull();
  });

  it('volver a cerrar conserva la fecha original, que es la evidencia', async () => {
    const original = new Date('2026-03-02T10:00:00Z');
    const { service, prisma } = build({
      meetingAgreement: {
        findFirst: jest.fn().mockResolvedValue({ ...ACUERDO, estado: 'CUMPLIDO', cumplidoAt: original }),
        update: jest.fn().mockResolvedValue(ACUERDO),
      },
    });
    await service.updateAgreement(5, 8, { estado: 'CUMPLIDO' }, 7);
    expect(prisma.meetingAgreement.update.mock.calls[0][0].data.cumplidoAt).toBe(original);
  });

  it('un acuerdo no puede quedarse sin responsable al editarlo', async () => {
    const { service } = build();
    await expect(service.updateAgreement(5, 8, { responsableId: null }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('mis acuerdos', () => {
  it('sólo puedo mover los míos', async () => {
    // Quien no conduce la reunion no debe cerrar el acuerdo de otro.
    const { service } = build({
      meetingAgreement: { findFirst: jest.fn().mockResolvedValue({ ...ACUERDO, responsableId: 99 }) },
    });
    await expect(service.updateMyAgreement(8, 3, { estado: 'CUMPLIDO' }, 7)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el mío sí lo cierro', async () => {
    const { service, prisma } = build();
    await service.updateMyAgreement(8, 3, { estado: 'CUMPLIDO' }, 7);
    expect(prisma.meetingAgreement.update.mock.calls[0][0].data.estado).toBe('CUMPLIDO');
  });

  it('cuenta cuántos de los míos van tarde', async () => {
    const { service } = build({
      meetingAgreement: {
        findMany: jest.fn().mockResolvedValue([
          { estado: 'PENDIENTE', fechaCompromiso: new Date('2020-01-01T00:00:00Z') },
          { estado: 'PENDIENTE', fechaCompromiso: null },
        ]),
      },
    });

    const mios = await service.myAgreements(3, 7);
    expect(mios.total).toBe(2);
    expect(mios.vencidos).toBe(1);
  });
});
