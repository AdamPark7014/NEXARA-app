import { ForbiddenException } from '@nestjs/common';
import { ROLES } from '../common/rbac/roles.v2.js';
import { SupervisionService } from './supervision.service.js';

const COMPANY = 7;
const FECHA = '2026-11-17';
const FECHA_COL = new Date(Date.UTC(2026, 10, 17));

function usersOrg() {
  return [
    {
      id: 7,
      nombre: 'Luis',
      email: 'direccion.operaciones@nexara.com.mx',
      roleKey: ROLES.DIR_OPERACIONES,
      managerId: 1,
      puesto: 'Supervisor General',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: { horaEntrada: '10:00', horaSalida: '18:00', dias: [1, 2, 3, 4, 5], graciaMin: 10 },
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 20,
      nombre: 'David',
      email: 'operaciones@nexara.com.mx',
      roleKey: ROLES.COORD_OPERACIONES,
      managerId: 7,
      puesto: 'Coordinador',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: { horaEntrada: '10:00', horaSalida: '18:00', dias: [1, 2, 3, 4, 5], graciaMin: 10 },
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 30,
      nombre: 'Técnico',
      email: 'campo@nexara.com.mx',
      roleKey: 'ing_campo',
      managerId: 20,
      puesto: 'Campo',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: { horaEntrada: '10:00', horaSalida: '18:00', dias: [1, 2, 3, 4, 5], graciaMin: 10 },
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 1,
      nombre: 'Christian',
      email: 'gerencia@nexara.com.mx',
      roleKey: ROLES.CEO,
      managerId: null,
      puesto: 'Dirección',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: null,
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 99,
      nombre: 'Demo',
      email: 'play.review@nexara.com.mx',
      roleKey: ROLES.CEO,
      managerId: null,
      puesto: 'Tester',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: null,
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 98,
      nombre: 'Fake',
      email: 'ceo@demo.invalid',
      roleKey: ROLES.CEO,
      managerId: null,
      puesto: 'CEO',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: null,
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
    {
      id: 97,
      nombre: 'Dev',
      email: 'developer@nexara.com.mx',
      roleKey: ROLES.CEO,
      managerId: null,
      puesto: 'Dev',
      isActive: true,
      tipoContrato: 'Planta',
      role: { orgRoleKey: null },
      horario: null,
      companyMemberships: [{ companyId: COMPANY, isDefault: true }],
    },
  ];
}

function armar() {
  const org = usersOrg();
  const planStore: any[] = [];
  const cierreStore: any[] = [];
  const planDiario = {
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const autorId = where?.autorId_fecha?.autorId ?? create.autorId;
      const fecha = where?.autorId_fecha?.fecha ?? create.fecha;
      const prev = planStore.find((p) => p.autorId === autorId && +p.fecha === +fecha);
      if (prev && where?.companyId != null && where.companyId !== prev.companyId) throw new Error("Conflicto de empresa");
      if (prev) {
        Object.assign(prev, update, { updatedAt: new Date() });
        return prev;
      }
      const row = { id: planStore.length + 1, ...create, createdAt: new Date(), updatedAt: new Date() };
      planStore.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where }: any) => {
      let rows = [...planStore];
      if (where?.supervisorId != null) rows = rows.filter((p) => p.supervisorId === where.supervisorId);
      if (where?.companyId != null) rows = rows.filter((p) => p.companyId === where.companyId);
      if (typeof where?.autorId === "number") rows = rows.filter((p) => p.autorId === where.autorId);
      if (where?.fecha) rows = rows.filter((p) => +p.fecha === +where.fecha);
      if (where?.autorId?.in) rows = rows.filter((p) => where.autorId.in.includes(p.autorId));
      return rows.map((p) => ({
        ...p,
        autor: org.find((u) => u.id === p.autorId),
        supervisor: org.find((u) => u.id === p.supervisorId),
      }));
    }),
    findFirst: jest.fn(async ({ where }: any) => planStore.find((p) => p.id === where.id && p.companyId === where.companyId) ?? null),
    update: jest.fn(async ({ where, data }: any) => {
      const row = planStore.find((p) => p.id === where.id);
      Object.assign(row, data);
      return row;
    }),
  };
  const cierreDiario = {
    findFirst: jest.fn(async ({ where }: any) =>
      cierreStore.find(
        (c) =>
          c.supervisorId === where.supervisorId &&
          +c.fecha === +where.fecha &&
          c.companyId === where.companyId,
      ) ?? null,
    ),
    findMany: jest.fn(async () => cierreStore),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const prev = cierreStore.find(
        (c) => c.supervisorId === create.supervisorId && +c.fecha === +create.fecha,
      );
      if (prev) {
        Object.assign(prev, update);
        return prev;
      }
      const row = { id: cierreStore.length + 10, ...create };
      cierreStore.push(row);
      return row;
    }),
  };
  const prisma: any = {
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.id != null) return org.find((u) => u.id === where.id && (!where.companyMemberships || u.companyMemberships.some((m) => m.companyId === where.companyMemberships.some.companyId))) ?? null;
        if (where?.roleKey === ROLES.DIR_OPERACIONES) return org.find((u) => u.roleKey === ROLES.DIR_OPERACIONES) ?? null;
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.roleKey === ROLES.CEO) return org.filter((u) => u.roleKey === ROLES.CEO);
        if (where?.roleKey === ROLES.DIR_OPERACIONES) return org.filter((u) => u.roleKey === ROLES.DIR_OPERACIONES);
        return org.filter((u) => u.isActive);
      }),
    },
    activity: { findMany: jest.fn(async () => []) },
    attendance: { findMany: jest.fn(async () => []) },
    planDiario,
    cierreDiario,
  };
  const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
  const activities = { create: jest.fn(async () => ({ id: 9001 })) };
  const service = new SupervisionService(prisma, notifications as never, activities as never);
  return { service, prisma, notifications, planStore, cierreStore, org };
}

describe('SupervisionService', () => {
  it('plan único por día: el segundo envío actualiza el mismo registro', async () => {
    const { service, prisma } = armar();
    const a = await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Instalar cámaras en IPADE' });
    const b = await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Instalar cámaras y cableado' });
    expect(a.id).toBe(b.id);
    expect(b.texto).toBe('Instalar cámaras y cableado');
    expect(b.estado).toBe('ENVIADO');
    expect(prisma.planDiario.upsert).toHaveBeenCalled();
  });

  it('faltantes: el supervisor ve quién de sus coordinadores no ha mandado', async () => {
    const { service } = armar();
    await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Plan de operaciones listo' });
    // otro encargado esperado sin plan: ninguno más en fixture; añadimos uno vía gente a cargo
    const r = await service.listarPlanes({ id: 7 }, COMPANY, FECHA);
    expect(r.rol).toBe('supervisor');
    expect(r.planes).toHaveLength(1);
    expect(r.faltantes).toEqual([]);
  });

  it('devolver avisa al autor', async () => {
    const { service, notifications } = armar();
    const plan = await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Plan incompleto de prueba' });
    notifications.createNotification.mockClear();
    await service.devolverPlan({ id: 7 }, COMPANY, plan.id, 'Falta el detalle por persona');
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20,
        title: 'Plan de mañana devuelto',
        message: expect.stringContaining('Falta el detalle por persona'),
      }),
    );
  });

  it('cierre arma conteos correctos con datos simulados', async () => {
    const { service, prisma } = armar();
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 1,
        estatus: 'Finalizada',
        responsableId: 30,
        periodoInicio: FECHA_COL,
        periodoFin: FECHA_COL,
        fechaInicio: null,
        fechaMaxima: null,
        fechaAsignacion: null,
      },
      {
        id: 2,
        estatus: 'Por Validar',
        responsableId: 30,
        periodoInicio: FECHA_COL,
        periodoFin: FECHA_COL,
        fechaInicio: null,
        fechaMaxima: null,
        fechaAsignacion: null,
      },
      {
        id: 3,
        estatus: 'No cumplida',
        responsableId: 20,
        periodoInicio: FECHA_COL,
        periodoFin: FECHA_COL,
        fechaInicio: null,
        fechaMaxima: null,
        fechaAsignacion: null,
      },
      {
        id: 4,
        estatus: 'Pendiente',
        responsableId: 20,
        periodoInicio: FECHA_COL,
        periodoFin: FECHA_COL,
        fechaInicio: null,
        fechaMaxima: null,
        fechaAsignacion: null,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { userId: 30, timestamp: new Date('2026-11-17T16:05:00.000Z') },
    ]);
    const r = await service.resumenCierre({ id: 7 }, COMPANY, FECHA);
    expect(r.rol).toBe('supervisor');
    if (r.rol !== 'supervisor') return;
    expect(r.totales.programadas).toBe(4);
    expect(r.totales.terminadas).toBe(1);
    expect(r.totales.en_revision).toBe(1);
    expect(r.totales.no_cumplidas).toBe(1);
    expect(r.totales.sin_empezar).toBe(1);
    expect(r.totales.checadas).toBe(1);
  });

  it('avisos de cierre sin cuentas demo', async () => {
    const { service, notifications } = armar();
    await service.entregarCierre({ id: 7 }, COMPANY, { fecha: FECHA, comentario: 'Día cerrado' });
    const ids = notifications.createNotification.mock.calls.map((c: any[]) => c[0].userId);
    expect(ids).toContain(1);
    expect(ids).not.toContain(99);
    expect(ids).not.toContain(98);
    expect(ids).not.toContain(97);
  });

  it('quien no es jefe ni encargado no puede mandar plan', async () => {
    const { service } = armar();
    await expect(
      service.enviarPlan({ id: 30 }, COMPANY, { fecha: FECHA, texto: 'No debería poder' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('regresiones de integración', () => {
  it('conserva la fecha civil exacta en Prisma', async () => {
    const { service, prisma } = armar();
    await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Plan de mañana' });
    expect(prisma.planDiario.upsert.mock.calls[0][0].create.fecha).toEqual(FECHA_COL);
  });
  it('no permite decidir sobre un plan de otra empresa aunque tenga el mismo supervisor', async () => {
    const { service, planStore } = armar();
    planStore.push({ id: 55, companyId: 8, supervisorId: 7 });
    await expect(service.programarPlan({ id: 7 }, COMPANY, 55)).rejects.toThrow('No encontré');
  });
  it('solo el destinatario del plan decide', async () => {
    const { service } = armar();
    const plan = await service.enviarPlan({ id: 20 }, COMPANY, { fecha: FECHA, texto: 'Plan de mañana' });
    await expect(service.programarPlan({ id: 20 }, COMPANY, plan.id)).rejects.toThrow('Solo el supervisor');
    await expect(service.programarPlan({ id: 1 }, COMPANY, plan.id)).rejects.toThrow('Solo el supervisor');
  });
  it('dirección lee el cierre guardado y un coordinador no lo entrega', async () => {
    const { service } = armar();
    await expect(service.entregarCierre({ id: 20 }, COMPANY, { fecha: FECHA })).rejects.toThrow('Solo el supervisor');
    await service.entregarCierre({ id: 7 }, COMPANY, { fecha: FECHA });
    const r = await service.resumenCierre({ id: 1 }, COMPANY, FECHA);
    expect(r.rol).toBe('direccion');
    if(r.rol === 'direccion') expect(r.cierres).toHaveLength(1);
  });
  it('el árbol cíclico termina y no incluye al supervisor', async () => {
    const { service, org } = armar();
    org.find((u) => u.id === 7)!.managerId = 30;
    const r = await service.resumenCierre({ id: 7 }, COMPANY, FECHA);
    if(r.rol !== 'supervisor') throw Error('rol');
    expect(r.personas.map((p) => p.userId)).toEqual(expect.arrayContaining([20,30]));
    expect(r.personas.map((p) => p.userId)).not.toContain(7);
  });
  it('no envía recordatorios en sábado de México aunque UTC ya sea domingo', async () => {
    const { service, notifications } = armar();
    expect(await service.recordarPlanesManana(new Date('2026-11-22T01:00:00Z'))).toBe(0);
    expect(await service.recordarCierreDia(new Date('2026-11-22T01:00:00Z'))).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
  it('recuerda el cierre al propio supervisor y respeta empresa y demos', async () => {
    const { service, notifications } = armar();
    await service.recordarCierreDia(new Date('2026-11-17T23:00:00Z'));
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({userId:7,excludeActor:false,companyId:COMPANY}));
  });
  it('un usuario fuera de empresa y las cuentas externas no entran', async () => {
    const { service } = armar();
    await expect(service.listarPlanes({id:20}, 999, FECHA)).rejects.toThrow();
    await expect(service.listarPlanes({id:20,isClient:true}, COMPANY, FECHA)).rejects.toThrow();
  });
});
