import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KpisEquipoService } from './kpis-equipo.service.js';

/** Hora de México (UTC−6). */
const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`);

const ana = { id: 20, nombre: 'Ana', email: 'ana@nexara.com.mx', avatarUrl: null, puesto: 'Técnica', managerId: 10 };
const beto = { id: 21, nombre: 'Beto', email: 'beto@nexara.com.mx', avatarUrl: null, puesto: 'Auxiliar', managerId: 10 };

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 20, isActive: true, roleKey: 'ing_campo', tipoContrato: null, fechaIngreso: null, role: { orgRoleKey: null } },
        { id: 21, isActive: true, roleKey: 'administrativo', tipoContrato: null, fechaIngreso: null, role: { orgRoleKey: null } },
      ]),
    },
    attendance: {
      findMany: jest.fn().mockResolvedValue([
        // Ana (contratista, 08:00): llega 08:30 → retardo de 30 min; revisaron su uniforme.
        { id: 1, userId: 20, type: 'entrada', timestamp: M('15', '08:30'), cierreAutomatico: false, uniformeOk: true },
        { id: 2, userId: 20, type: 'salida', timestamp: M('15', '17:30'), cierreAutomatico: false, uniformeOk: null },
        // Beto (oficina, 09:00): a tiempo.
        { id: 3, userId: 21, type: 'entrada', timestamp: M('15', '09:00'), cierreAutomatico: false, uniformeOk: null },
        { id: 4, userId: 21, type: 'salida', timestamp: M('15', '18:00'), cierreAutomatico: false, uniformeOk: null },
      ]),
    },
    lunchBreak: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 20, checkinTime: M('15', '15:00'), checkoutTime: M('15', '16:00') },
      ]),
    },
    activityAssignee: {
      findMany: jest
        .fn()
        // Por ventana: la actividad 100 de Ana tiene inicio/fin real (sección B).
        .mockResolvedValueOnce([
          { activityId: 100, userId: 20, inicioRealAt: M('15', '09:00'), finRealAt: M('15', '12:00') },
        ])
        // Filas complementarias de las actividades encontradas.
        .mockResolvedValueOnce([
          { activityId: 100, userId: 20, inicioRealAt: M('15', '09:00'), finRealAt: M('15', '12:00') },
          { activityId: 101, userId: 20, inicioRealAt: null, finRealAt: null },
        ]),
    },
    activityEvidence: {
      findMany: jest
        .fn()
        // La 101 solo se conoce por sus fotos (app vieja, sin `inicioRealAt`).
        .mockResolvedValueOnce([
          {
            activityId: 101,
            userId: 20,
            status: 'COMPLETED',
            entryPhotoUploadedAt: M('15', '11:00'),
            exitPhotoUploadedAt: M('15', '13:00'),
            completedAt: M('15', '13:05'),
          },
        ])
        .mockResolvedValueOnce([]),
    },
    activity: {
      findMany: jest.fn().mockResolvedValue([
        { id: 100, anNumber: 'AN-100', titulo: 'Mantenimiento', estatus: 'Finalizada', coreKind: 'servicio', fechaFinalizacion: null, deletedAt: null },
        { id: 101, anNumber: 'AN-101', titulo: 'Proyecto CCTV', estatus: 'En proceso', coreKind: 'proyecto', fechaFinalizacion: null, deletedAt: null },
      ]),
    },
    attendanceJustification: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  };
  const teamBoard: any = {
    resolveRange: jest.fn((d?: string | null, h?: string | null) => ({
      desde: new Date(`${d ?? '2026-09-15'}T06:00:00Z`),
      hasta: new Date(`${h ?? d ?? '2026-09-15'}T06:00:00Z`),
    })),
    resolveScope: jest.fn().mockResolvedValue({ companyWide: false, scoped: [ana, beto], now: M('18', '12:00') }),
  };
  return { service: new KpisEquipoService(prisma, teamBoard), prisma, teamBoard };
}

const jefe = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };

describe('KpisEquipoService', () => {
  it('arma la fila de cada persona con su horario y el total del equipo', async () => {
    const { service } = build();
    const res = await service.getEquipo(jefe, 7, { desde: '2026-09-15', hasta: '2026-09-15' });

    expect(res.scope).toBe('subtree');
    const [a, b] = res.personas;
    expect(a.persona.nombre).toBe('Ana');
    expect(a.horario).toMatchObject({ clave: 'contractor', entrada: '08:00' });
    expect(a.totales).toMatchObject({
      retardos: 1,
      minutosTarde: 30,
      // 08:30–17:30 menos la comida = 8 h
      minutosLaborados: 480,
      // 09:00–12:00 ∪ 11:00–13:00 = 4 h, sin contar doble
      minutosProductivos: 240,
      minutosInactivos: 240,
      productividadPct: 50,
      uniforme: { revisadas: 1, ok: 1, noOk: 0, sinRevisar: 0, pct: 100 },
    });
    expect(a.motivos).toContain('1 retardo (30 min tarde)');
    expect(b.horario.clave).toBe('office_hours');
    expect(b.totales).toMatchObject({ retardos: 0, minutosLaborados: 540, minutosProductivos: 0 });
    expect(res.equipo.totales).toMatchObject({ minutosLaborados: 1020, minutosProductivos: 240, retardos: 1 });
    expect(res.supuestos.length).toBeGreaterThan(0);
  });

  it('filtra por tenant en todas las lecturas', async () => {
    const { service, prisma } = build();
    await service.getEquipo(jefe, 7, { desde: '2026-09-15', hasta: '2026-09-15' });
    for (const q of [
      prisma.attendance.findMany,
      prisma.lunchBreak.findMany,
      prisma.activityEvidence.findMany,
      prisma.attendanceJustification.findMany,
    ]) {
      expect(q.mock.calls[0][0].where.companyId).toBe(7);
    }
  });

  it('el detalle trae los días y esconde el título de actividades de otra área', async () => {
    const { service } = build();
    // Luis solo coordina servicios: la 101 (proyecto) cuenta tiempo, pero sin título.
    const luis = { id: 10, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'dir_operaciones' };
    const res = await service.getPersona(luis, 7, 20, { desde: '2026-09-15', hasta: '2026-09-15' });
    expect(res.dias).toHaveLength(1);
    expect(res.dias[0].tramos?.productivo.length).toBe(1);
    expect(res.dias[0].actividades?.map((a) => [a.activityId, a.titulo])).toEqual([
      [100, 'Mantenimiento'],
      [101, 'Actividad de otra área'],
    ]);
  });

  it('fuera de su alcance: 404', async () => {
    const { service } = build();
    await expect(service.getPersona(jefe, 7, 99, { desde: '2026-09-15', hasta: '2026-09-15' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.getEquipo(jefe, 7, { desde: '2026-09-15', hasta: '2026-09-15' }, 99),
    ).rejects.toThrow(NotFoundException);
  });

  it('rango de más de 93 días: 400', () => {
    const { service } = build();
    expect(() => service.resolveDias('2026-01-01', '2026-09-15')).toThrow(BadRequestException);
    expect(service.resolveDias('2026-09-01', '2026-09-15')).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' });
  });
});
