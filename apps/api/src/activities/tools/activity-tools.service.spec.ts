import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityToolsService } from './activity-tools.service.js';

const EMPRESA = 7;
const ACTIVIDAD = 10;

function requisito(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    descripcion: 'Escalera de 6 m',
    cantidad: 1,
    productId: null,
    product: null,
    toolId: null,
    tool: null,
    checks: [],
    ...over,
  };
}

const check = (ok: boolean) => ({
  ok,
  nota: null,
  fotoUrl: null,
  at: new Date('2026-09-19T15:00:00.000Z'),
  user: { id: 3, nombre: 'Técnico' },
});

function build(opts: { requisitos?: unknown[]; actividad?: unknown; asignado?: unknown } = {}) {
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(
        opts.actividad === undefined
          ? { id: ACTIVIDAD, companyId: EMPRESA, estatus: 'Pendiente', titulo: 'Alta de cámaras', anNumber: 'AN-1' }
          : opts.actividad,
      ),
    },
    activityToolRequirement: {
      findMany: jest.fn().mockResolvedValue(opts.requisitos ?? []),
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    activityToolCheck: { create: jest.fn().mockResolvedValue({}) },
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(opts.asignado === undefined ? { id: 50 } : opts.asignado),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { service: new ActivityToolsService(prisma as any), prisma };
}

describe('listar', () => {
  it('arma el checklist con el último palomeo de cada renglón', async () => {
    const { service } = build({
      requisitos: [
        requisito({ id: 1, checks: [check(true)] }),
        requisito({ id: 2, descripcion: 'Taladro', checks: [] }),
      ],
    });
    const res = await service.listar(ACTIVIDAD, EMPRESA);

    expect(res.total).toBe(2);
    expect(res.listos).toBe(1);
    expect(res.completo).toBe(false);
    expect(res.pendientes).toEqual(['Taladro']);
    expect(res.requisitos[0].check).toMatchObject({ ok: true, por: { id: 3, nombre: 'Técnico' } });
  });

  it('trae el producto y la herramienta cuando el renglón los apunta', async () => {
    const { service } = build({
      requisitos: [
        requisito({
          productId: 5,
          product: { id: 5, sku: 'CON-RJ45', name: 'Conector RJ45' },
          toolId: 9,
          tool: { id: 9, toolName: 'Ponchadora', serialNumber: 'SN-1' },
        }),
      ],
    });
    const [renglon] = (await service.listar(ACTIVIDAD, EMPRESA)).requisitos;
    expect(renglon.producto).toEqual({ id: 5, sku: 'CON-RJ45', nombre: 'Conector RJ45' });
    expect(renglon.herramienta).toEqual({ id: 9, nombre: 'Ponchadora', serie: 'SN-1' });
  });

  it('una actividad de otra empresa no existe', async () => {
    const { service } = build({ actividad: null });
    await expect(service.listar(ACTIVIDAD, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('definirRequisitos', () => {
  it('actualiza lo que ya estaba, crea lo nuevo y borra lo que sobra', async () => {
    const { service, prisma } = build({
      requisitos: [
        { id: 1, descripcion: 'Escalera de 6 m', checks: [] },
        { id: 2, descripcion: 'Taladro', checks: [] },
      ],
    });
    await service.definirRequisitos(
      ACTIVIDAD,
      [{ descripcion: 'Escalera de 6 m', cantidad: 2 }, { descripcion: 'Multímetro' }],
      EMPRESA,
    );

    // «Escalera» se empata por descripción y conserva su id (y sus palomeos).
    expect(prisma.activityToolRequirement.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(prisma.activityToolRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ descripcion: 'Multímetro', companyId: EMPRESA }),
      }),
    );
    // «Taladro» ya no viene en la lista: se va.
    expect(prisma.activityToolRequirement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
    });
  });

  it('lista vacía deja la OT sin checklist', async () => {
    const { service, prisma } = build({ requisitos: [{ id: 1, descripcion: 'Escalera', checks: [] }] });
    await service.definirRequisitos(ACTIVIDAD, [], EMPRESA);
    expect(prisma.activityToolRequirement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
    });
  });
});

describe('palomear', () => {
  it('guarda el palomeo de quien está asignado', async () => {
    const { service, prisma } = build({ requisitos: [requisito()] });
    await service.palomear({
      activityId: ACTIVIDAD,
      requirementId: 1,
      userId: 3,
      ok: true,
      nota: ' trae la de 6 m ',
      companyId: EMPRESA,
    });

    expect(prisma.activityToolCheck.create).toHaveBeenCalledWith({
      data: {
        requirementId: 1,
        userId: 3,
        ok: true,
        nota: 'trae la de 6 m',
        fotoUrl: null,
        companyId: EMPRESA,
      },
    });
  });

  it('quien no está asignado no palomea', async () => {
    const { service } = build({ asignado: null });
    await expect(
      service.palomear({ activityId: ACTIVIDAD, requirementId: 1, userId: 3, ok: true, companyId: EMPRESA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un supervisor con gestión sí puede, aunque no esté asignado', async () => {
    const { service, prisma } = build({ asignado: null, requisitos: [requisito()] });
    await service.palomear({
      activityId: ACTIVIDAD,
      requirementId: 1,
      userId: 4,
      ok: true,
      companyId: EMPRESA,
      puedeGestionar: true,
    });
    expect(prisma.activityToolCheck.create).toHaveBeenCalled();
  });

  it('un renglón de otra OT no se palomea', async () => {
    const { service, prisma } = build();
    prisma.activityToolRequirement.findFirst.mockResolvedValue(null);
    await expect(
      service.palomear({ activityId: ACTIVIDAD, requirementId: 77, userId: 3, ok: true, companyId: EMPRESA }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza una foto en base64: eso no se subió', async () => {
    const { service } = build({ requisitos: [requisito()] });
    await expect(
      service.palomear({
        activityId: ACTIVIDAD,
        requirementId: 1,
        userId: 3,
        ok: true,
        fotoUrl: 'data:image/png;base64,AAAA',
        companyId: EMPRESA,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('asertarChecklistCompleto', () => {
  it('sin renglones deja iniciar', async () => {
    const { service } = build({ requisitos: [] });
    await expect(service.asertarChecklistCompleto(ACTIVIDAD, EMPRESA)).resolves.toMatchObject({
      total: 0,
      completo: true,
    });
  });

  it('con todo palomeado deja iniciar', async () => {
    const { service } = build({ requisitos: [requisito({ checks: [check(true)] })] });
    await expect(service.asertarChecklistCompleto(ACTIVIDAD, EMPRESA)).resolves.toMatchObject({
      completo: true,
    });
  });

  it('con algo sin palomear no deja, y dice qué falta', async () => {
    const { service } = build({
      requisitos: [requisito({ id: 1, checks: [check(true)] }), requisito({ id: 2, descripcion: 'Arnés' })],
    });
    await expect(service.asertarChecklistCompleto(ACTIVIDAD, EMPRESA)).rejects.toThrow(
      /Falta palomear el checklist de herramientas antes de iniciar: Arnés/,
    );
  });

  it('con algo marcado como dañado tampoco deja', async () => {
    const { service } = build({ requisitos: [requisito({ checks: [check(false)] })] });
    await expect(service.asertarChecklistCompleto(ACTIVIDAD, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sin empresa en la sesión la saca de la actividad', async () => {
    const { service, prisma } = build({ requisitos: [requisito()] });
    prisma.activity.findFirst.mockResolvedValue({ companyId: EMPRESA });
    await expect(service.asertarChecklistCompleto(ACTIVIDAD, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.activityToolRequirement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: EMPRESA }) }),
    );
  });
});
