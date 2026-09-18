import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProyectoProgramacionService } from './proyecto-programacion.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function proyecto(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: 'CCTV Plaza Norte',
    description: null,
    scopeSummary: 'Instalación de 40 cámaras',
    status: 'ACTIVE',
    startDate: d('2026-09-21'),
    endDate: d('2026-10-30'),
    siteCount: null,
    responsableId: 3,
    clientId: 11,
    companyId: 1,
    milestones: [
      { id: 101, name: 'Levantamiento', description: null, plannedDate: d('2026-09-25'), status: 'PENDIENTE', responsableId: 4 },
      { id: 102, name: 'Instalación', description: 'Cableado y equipos', plannedDate: d('2026-10-16'), status: 'PENDIENTE', responsableId: null },
      { id: 103, name: 'Entrega', description: null, plannedDate: d('2026-10-30'), status: 'PENDIENTE', responsableId: null },
    ],
    activities: [] as unknown[],
    ...over,
  };
}

function build(p = proyecto(), activos = [3, 4, 5, 6]) {
  let folio = 40;
  const prisma = {
    operationalProject: { findFirst: jest.fn().mockResolvedValue(p) },
    user: {
      findMany: jest.fn(({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => activos.includes(id)).map((id) => ({ id }))),
      ),
    },
  };
  const activities = {
    create: jest.fn((dto: Record<string, unknown>) => {
      folio += 1;
      return Promise.resolve({
        id: folio,
        anNumber: `AN-00${folio}`,
        titulo: dto.titulo,
        estatus: 'Pendiente',
        responsableId: dto.responsableId,
        periodoInicio: d(String(dto.periodoInicio)),
        periodoFin: d(String(dto.periodoFin)),
      });
    }),
  };
  const team = { addMember: jest.fn().mockResolvedValue({}) };
  const proyectos = {
    assertAlcanzaA: jest.fn().mockResolvedValue(undefined),
    detalle: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const service = new ProyectoProgramacionService(
    prisma as never,
    activities as never,
    team as never,
    proyectos as never,
  );
  return { service, prisma, activities, team, proyectos };
}

describe('propuesta de programación', () => {
  it('encadena las etapas desde el inicio del proyecto y toma su responsable', async () => {
    const { service } = build();
    const r = await service.propuesta(7, 1);
    expect(r.proyecto).toMatchObject({ inicio: '2026-09-21', fin: '2026-10-30' });
    expect(r.etapas.map((e) => [e.hitoId, e.inicio, e.fin, e.dias])).toEqual([
      [101, '2026-09-21', '2026-09-25', 5],
      [102, '2026-09-26', '2026-10-16', 21],
      [103, '2026-10-17', '2026-10-30', 14],
    ]);
    // La etapa sin responsable cae en el del proyecto.
    expect(r.etapas.map((e) => e.responsableId)).toEqual([4, 3, 3]);
    expect(r.etapas.every((e) => e.sugerida)).toBe(true);
  });

  it('no sugiere lo cumplido ni lo que ya tiene actividad', async () => {
    const p = proyecto({
      activities: [
        {
          id: 9,
          anNumber: 'AN-0009',
          titulo: 'Levantamiento',
          estatus: 'En Proceso',
          branchNumber: null,
          responsableId: 4,
          projectMilestoneId: 101,
          periodoInicio: d('2026-09-21'),
          periodoFin: d('2026-09-25'),
        },
        // Cancelada: no cuenta, la etapa se puede volver a programar.
        {
          id: 10,
          anNumber: 'AN-0010',
          titulo: 'Entrega',
          estatus: 'Cancelada',
          branchNumber: null,
          responsableId: 3,
          projectMilestoneId: 103,
          periodoInicio: null,
          periodoFin: null,
        },
      ],
    });
    p.milestones[1].status = 'CUMPLIDO';
    const { service } = build(p);
    const r = await service.propuesta(7, 1);
    expect(r.etapas.map((e) => e.sugerida)).toEqual([false, false, true]);
    expect(r.etapas[0].programadas[0]).toMatchObject({ anNumber: 'AN-0009', periodo: { inicio: '2026-09-21', dias: 5 } });
    expect(r.etapas[2].programadas).toEqual([]);
  });
});

describe('programar actividades', () => {
  it('crea una por etapa con su periodo, reusando la creación normal, y suma el apoyo', async () => {
    const { service, activities, team, proyectos } = build();
    const r = await service.programar(
      7,
      {
        etapas: [
          { hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 },
          { hitoId: 102, inicio: '2026-09-26', fin: '2026-10-16', responsableId: 5, apoyoIds: [6, 5, 6] },
        ],
      },
      { id: 3 },
      1,
    );
    expect(activities.create).toHaveBeenCalledTimes(2);
    expect(activities.create.mock.calls[0][0]).toMatchObject({
      titulo: 'CCTV Plaza Norte — Levantamiento',
      projectId: 7,
      clientId: 11,
      coreKind: 'proyecto',
      creadoPorId: 3,
      responsableId: 4,
      periodoInicio: '2026-09-21',
      periodoFin: '2026-09-25',
      projectMilestoneId: 101,
    });
    expect(activities.create.mock.calls[0][1]).toBe(1);
    // El responsable no se suma dos veces como apoyo, ni el apoyo repetido.
    expect(team.addMember).toHaveBeenCalledTimes(1);
    expect(team.addMember).toHaveBeenCalledWith(42, { userId: 6, rol: 'TECNICO' }, 1, 3);
    expect(proyectos.assertAlcanzaA).toHaveBeenCalledWith({ id: 3 }, [4, 5, 6]);
    expect(r.creadas.map((c) => [c.hitoId, c.periodo?.dias])).toEqual([
      [101, 5],
      [102, 21],
    ]);
    expect(r.omitidas).toEqual([]);
  });

  it('por sitio: una por etapa × sucursal', async () => {
    const { service, activities } = build(proyecto({ siteCount: 3 }));
    const r = await service.programar(
      7,
      { porSitio: true, etapas: [{ hitoId: 102, inicio: '2026-09-26', fin: '2026-10-16', responsableId: 5 }] },
      { id: 3 },
      1,
    );
    expect(r.creadas).toHaveLength(3);
    expect(activities.create.mock.calls.map((c) => [c[0].branchNumber, c[0].titulo])).toEqual([
      ['1', 'CCTV Plaza Norte — Instalación · Sucursal 1'],
      ['2', 'CCTV Plaza Norte — Instalación · Sucursal 2'],
      ['3', 'CCTV Plaza Norte — Instalación · Sucursal 3'],
    ]);
  });

  it('no duplica lo que ya está programado', async () => {
    const p = proyecto({
      activities: [
        {
          id: 9,
          anNumber: 'AN-0009',
          titulo: 'Levantamiento',
          estatus: 'Pendiente',
          branchNumber: null,
          responsableId: 4,
          projectMilestoneId: 101,
          periodoInicio: d('2026-09-21'),
          periodoFin: d('2026-09-25'),
        },
      ],
    });
    const { service, activities } = build(p);
    const r = await service.programar(
      7,
      { etapas: [{ hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 }] },
      { id: 3 },
      1,
    );
    expect(activities.create).not.toHaveBeenCalled();
    expect(r.omitidas).toEqual([
      { hitoId: 101, sitio: null, motivo: 'Ya tiene la actividad AN-0009', activityId: 9 },
    ]);
  });

  it('valida todo antes de crear la primera', async () => {
    const { service, activities } = build();
    await expect(
      service.programar(
        7,
        {
          etapas: [
            { hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 },
            { hitoId: 102, inicio: '2026-10-16', fin: '2026-09-26', responsableId: 5 },
          ],
        },
        { id: 3 },
        1,
      ),
    ).rejects.toThrow('Etapa «Instalación»: El día de fin no puede ser anterior al día de inicio');
    await expect(
      service.programar(7, { etapas: [{ hitoId: 999, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 }] }, { id: 3 }, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.programar(
        7,
        {
          etapas: [
            { hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 },
            { hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 },
          ],
        },
        { id: 3 },
        1,
      ),
    ).rejects.toThrow('viene dos veces');
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('rechaza personas inactivas y proyectos cancelados', async () => {
    const { service, activities } = build(proyecto(), [3, 4]);
    await expect(
      service.programar(7, { etapas: [{ hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 99 }] }, { id: 3 }, 1),
    ).rejects.toThrow('ya no está activa');

    const cancelado = build(proyecto({ status: 'CANCELLED' }));
    await expect(
      cancelado.service.programar(
        7,
        { etapas: [{ hitoId: 101, inicio: '2026-09-21', fin: '2026-09-25', responsableId: 4 }] },
        { id: 3 },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(activities.create).not.toHaveBeenCalled();
  });
});
