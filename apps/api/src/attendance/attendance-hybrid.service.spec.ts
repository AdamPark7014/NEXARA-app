import { AttendanceHybridService } from './attendance-hybrid.service.js';

/**
 * La vista híbrida marca el retardo con la horaEntrada de work_schedules.
 * Sin HH:MM, oficina y contratista siguen en 10:00. 24/7 y visitante no marcan.
 * graciaMin sustituye los 15 minutos solo cuando viene en la fila.
 */

function persona(id: number, roleKey: string) {
  return {
    id,
    nombre: `Persona ${id}`,
    email: `p${id}@nexara.test`,
    employeeNumber: `E${id}`,
    departmentId: 1,
    roleKey,
    tipoContrato: null,
    department: { nombre: 'Operaciones' },
    role: { accesoConsoleAdmin: false, orgRoleKey: null },
  };
}

function entrada(userId: number, iso: string) {
  return { userId, type: 'entrada', timestamp: new Date(iso), photoUrl: null };
}

describe('AttendanceHybridService retardo con horario propio', () => {
  it('usa horaEntrada y graciaMin, y si no hay fila deja la plantilla', async () => {
    const users = [
      persona(1, 'administrativo'),
      persona(2, 'administrativo'),
      persona(3, 'ceo'),
      persona(4, 'cliente'),
    ];
    const prisma = {
      user: { findMany: jest.fn(async () => users) },
      userCompany: { findMany: jest.fn(async () => []) },
      attendance: {
        findMany: jest.fn(async () => [
          entrada(1, '2026-10-20T14:10:00.000Z'), // 08:10 MX, tarde contra 08:00 con 5 min
          entrada(2, '2026-10-20T16:10:00.000Z'), // 10:10 MX, a tiempo contra 10:00 + 15
          entrada(3, '2026-10-20T18:00:00.000Z'), // 12:00 MX, 24/7 sin hora
          entrada(4, '2026-10-20T17:00:00.000Z'), // 11:00 MX, visitante sin hora
        ]),
      },
      attendanceDay: { findMany: jest.fn(async () => []) },
      integraPerson: { findMany: jest.fn(async () => []) },
      workSchedule: {
        findMany: jest.fn(async () => [{ userId: 1, horaEntrada: '08:00', graciaMin: 5 }]),
      },
    };
    const integraPush = { attendance: jest.fn(async () => ({ items: [] })) };
    const svc = new AttendanceHybridService(prisma as any, integraPush as any, {} as any);

    const out = await svc.getHybridDay({ id: 9, isSuperAdmin: true }, '2026-10-20', 7);
    const porId = new Map(out.items.map((item) => [item.user?.id, item]));

    expect(prisma.workSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 7, userId: { in: [1, 2, 3, 4] } },
        select: { userId: true, horaEntrada: true, graciaMin: true },
      }),
    );

    expect(porId.get(1)?.expectedStart).toBe('08:00');
    expect(porId.get(1)?.flags).toContain('retardo');

    expect(porId.get(2)?.expectedStart).toBe('10:00');
    expect(porId.get(2)?.flags).not.toContain('retardo');

    expect(porId.get(3)?.expectedStart).toBeNull();
    expect(porId.get(3)?.flags).not.toContain('retardo');

    expect(porId.get(4)?.expectedStart).toBeNull();
    expect(porId.get(4)?.flags).not.toContain('retardo');
  });
});
