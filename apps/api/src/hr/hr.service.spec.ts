import { HrService } from './hr.service.js';

describe('HrService aprobaciones de permisos', () => {
  function crear() {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 5, managerId: 8 }) },
      leaveRequest: {
        create: jest.fn().mockResolvedValue({ id: 12, user: { nombre: 'Persona ficticia' } }),
        findFirst: jest.fn().mockResolvedValue({ id: 12, companyId: 7, userId: 5, status: 'PENDING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 12, status: 'CANCELLED' }),
      },
      solicitudAprobacionRh: {
        findFirst: jest.fn().mockResolvedValue({ id: 30 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
    const aprobaciones: any = {
      crear: jest.fn().mockResolvedValue({ id: 30, aprobadorActualId: 8 }),
      avisar: jest.fn(), decidir: jest.fn(), idsDireccion: jest.fn().mockResolvedValue([9]),
    };
    return { prisma, aprobaciones, svc: new HrService(prisma, aprobaciones) };
  }

  it('crea permiso y aprobación dentro de la misma transacción, avisa después', async () => {
    const { svc, prisma, aprobaciones } = crear();
    await svc.createLeave({ type: 'VACATION', startDate: '2026-12-01', endDate: '2026-12-02' }, 5, 7);
    expect(aprobaciones.crear).toHaveBeenCalledWith(expect.objectContaining({ leaveRequestId: 12, companyId: 7, aprobadorActualId: 8 }), prisma);
    expect(aprobaciones.avisar).toHaveBeenCalledWith([8], expect.objectContaining({ relatedEntityId: 30, companyId: 7 }));
  });

  it('no oculta un fallo creando la aprobación ni avisa', async () => {
    const { svc, aprobaciones } = crear();
    aprobaciones.crear.mockRejectedValue(new Error('No se pudo guardar'));
    await expect(svc.createLeave({ type: 'VACATION', startDate: '2026-12-01', endDate: '2026-12-02' }, 5, 7)).rejects.toThrow('No se pudo guardar');
    expect(aprobaciones.avisar).not.toHaveBeenCalled();
  });

  it('la ruta anterior de aprobar usa los permisos del patrón único', async () => {
    const { svc, aprobaciones } = crear();
    aprobaciones.decidir.mockRejectedValue(new Error('No te corresponde decidir'));
    await expect(svc.approveLeave(12, 99, 7)).rejects.toThrow('No te corresponde');
    expect(aprobaciones.decidir).toHaveBeenCalledWith(30, 7, 99, 'APROBADA');
  });

  it('cancelar sincroniza ambos estados y no cancela un permiso ya decidido', async () => {
    const { svc, prisma } = crear();
    prisma.solicitudAprobacionRh.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.cancelLeave(12, 5, 7)).rejects.toThrow('ya cambió');
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it('incorpora permisos antiguos al patrón antes de decidirlos', async () => {
    const { svc, prisma, aprobaciones } = crear();
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue(null);
    await svc.approveLeave(12, 8, 7);
    expect(aprobaciones.crear).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, userId: 5, leaveRequestId: 12, aprobadorActualId: 8 }));
    expect(aprobaciones.decidir).toHaveBeenCalledWith(30, 7, 8, 'APROBADA');
  });

  it('permite cancelar un permiso antiguo sin solicitud vinculada', async () => {
    const { svc, prisma } = crear();
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue(null);
    prisma.solicitudAprobacionRh.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.cancelLeave(12, 5, 7)).resolves.toEqual({ id: 12, status: 'CANCELLED' });
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, companyId: 7, userId: 5, status: 'PENDING' } }));
  });
});

describe('HrService performance reviews tenant IDOR', () => {
  const prisma = {
    performanceReview: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const svc = new HrService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('listReviews requires companyId', async () => {
    await expect(svc.listReviews(undefined, undefined, null)).rejects.toThrow(/Empresa requerida/);
    expect(prisma.performanceReview.findMany).not.toHaveBeenCalled();
  });

  it('getReview scopes and denies missing row', async () => {
    prisma.performanceReview.findFirst.mockResolvedValue(null);
    await expect(svc.getReview(5, 10)).rejects.toThrow();
    expect(prisma.performanceReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5, companyId: 10 }),
      }),
    );
  });

  it('createReview stamps companyId', async () => {
    prisma.performanceReview.create.mockResolvedValue({ id: 1 });
    await svc.createReview(
      {
        userId: 2,
        period: 'ANNUAL',
        reviewDate: '2026-01-01',
        overallRating: 4,
      },
      3,
      77,
    );
    expect(prisma.performanceReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 77, reviewerId: 3 }),
      }),
    );
  });
});

describe('HrService puntualidad contra horaEntrada', () => {
  function persona(id: number, roleKey: string) {
    return {
      id,
      nombre: `Persona ${id}`,
      isActive: true,
      estadoRRHH: 'Activo',
      fechaIngreso: new Date('2024-01-01T00:00:00.000Z'),
      fechaCreacion: new Date('2024-01-01T00:00:00.000Z'),
      employeeNumber: `E${id}`,
      roleKey,
      tipoContrato: null,
      role: { orgRoleKey: null },
      department: { nombre: 'Operaciones' },
    };
  }

  function entrada(userId: number, iso: string) {
    return { userId, timestamp: new Date(iso) };
  }

  function armar(opts: {
    staff: ReturnType<typeof persona>[];
    entries: Array<{ userId: number; timestamp: Date }>;
    horarios: Array<{ userId: number; horaEntrada: string | null; graciaMin?: number | null }>;
  }) {
    const vacio = () => ({
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _avg: { overallRating: null } }),
    });
    const prisma = {
      leaveRequest: vacio(),
      performanceReview: vacio(),
      user: { findMany: jest.fn().mockResolvedValue(opts.staff) },
      attendanceDay: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue(opts.entries) },
      lunchBreak: { count: jest.fn().mockResolvedValue(0) },
      workSchedule: { findMany: jest.fn().mockResolvedValue(opts.horarios) },
    };
    return { svc: new HrService(prisma as any), prisma };
  }

  it('cuenta retardo con la horaEntrada guardada y, si no hay, con las 10:00', async () => {
    const { svc, prisma } = armar({
      staff: [
        persona(1, 'administrativo'),
        persona(2, 'administrativo'),
        persona(3, 'ceo'),
        persona(4, 'ceo'),
        persona(5, 'administrativo'),
        persona(6, 'administrativo'),
      ],
      horarios: [
        { userId: 1, horaEntrada: '08:00' },
        { userId: 3, horaEntrada: '09:00' },
        { userId: 6, horaEntrada: 'ocho' },
      ],
      entries: [
        entrada(1, '2026-10-20T14:20:00.000Z'), // 08:20 MX, tarde contra 08:00
        entrada(2, '2026-10-20T14:20:00.000Z'), // 08:20 MX, a tiempo contra 10:00
        entrada(3, '2026-10-20T15:20:00.000Z'), // 09:20 MX, tarde contra 09:00
        entrada(4, '2026-10-20T18:00:00.000Z'), // 12:00 MX, 24/7 sin hora: no cuenta
        entrada(5, '2026-10-20T16:20:00.000Z'), // 10:20 MX, tarde contra las 10:00
        entrada(6, '2026-10-20T14:20:00.000Z'), // hora inválida: vuelve a las 10:00, a tiempo
      ],
    });

    const out = await svc.getPeopleInsights(7);

    expect(prisma.workSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 7 },
        select: { userId: true, horaEntrada: true, graciaMin: true },
      }),
    );
    expect(out.kpis.lateEvents30d).toBe(3);
    expect(out.kpis.punctualityPct).toBe(40);
    expect(out.lateLeaders.map((l) => l.userId).sort()).toEqual([1, 3, 5]);
  });

  it('con graciaMin 5 cuenta las 10:10; sin gracia se queda en 15 y no', async () => {
    const { svc } = armar({
      staff: [persona(1, 'administrativo'), persona(2, 'administrativo')],
      horarios: [{ userId: 1, horaEntrada: null, graciaMin: 5 }],
      entries: [
        entrada(1, '2026-10-20T16:10:00.000Z'),
        entrada(2, '2026-10-20T16:10:00.000Z'),
      ],
    });

    const out = await svc.getPeopleInsights(7);
    expect(out.kpis.lateEvents30d).toBe(1);
    expect(out.kpis.punctualityPct).toBe(50);
    expect(out.lateLeaders.map((l) => l.userId)).toEqual([1]);
  });
});
