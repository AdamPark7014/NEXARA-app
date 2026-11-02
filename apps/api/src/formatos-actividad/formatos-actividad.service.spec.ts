import { ForbiddenException } from '@nestjs/common';
import { JORNADA_OFICINA } from '../activities/tiempo-entrega.js';
import { FormatosActividadService, type AplicarFormato } from './formatos-actividad.service.js';
import { formatosIniciales } from './receta-formato.js';

const DAVID = { id: 2, roleKey: 'coord_operaciones', email: 'd@x', departmentId: 1, nombre: 'David', permissions: [] } as any;
const TECNICO = { id: 9, roleKey: 'ing_campo', email: 't@x', departmentId: 1, permissions: [] } as any;

const receta = formatosIniciales()[0].receta;
const formato = { id: 7, companyId: 1, nombre: 'Instalación CCTV', version: 3, receta, archivadoAt: null };

function armar(opts: { previa?: { actividades: number[] } | null; falla?: string; hayFormatos?: number; clienteOk?: boolean } = {}) {
  let n = 100;
  const prisma: any = {
    formatoActividad: {
      count: jest.fn(async () => opts.hayFormatos ?? 1),
      create: jest.fn(async ({ data }: any) => ({ id: 1, ...data })),
      findMany: jest.fn(async () => [formato]),
      findFirst: jest.fn(async () => formato),
      update: jest.fn(async ({ data }: any) => ({ ...formato, ...data })),
    },
    formatoAplicacion: {
      findUnique: jest.fn(async () => opts.previa ?? null),
      create: jest.fn(async ({ data }: any) => ({ id: 50, ...data })),
      update: jest.fn(async () => ({})),
    },
    serviceClient: { findFirst: jest.fn(async () => (opts.clienteOk === false ? null : { id: 3 })) },
    operationalProject: { findFirst: jest.fn(async () => ({ clientId: 33 })) },
    user: { count: jest.fn(async ({ where }: any) => where.id.in.length) },
    activity: {
      findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: number) => ({ id, anNumber: `AN-${id}`, titulo: 't' }))),
      findFirst: jest.fn(async () => null),
    },
  };
  const activities = {
    create: jest.fn(async (dto: any) => {
      if (opts.falla && dto.titulo === opts.falla) throw new Error('Falló esa');
      n += 1;
      return { id: n };
    }),
  };
  const team = { addMember: jest.fn(async () => ({})) };
  const campos = { definirCampos: jest.fn(async () => ({})) };
  const herramientas = { definirRequisitos: jest.fn(async () => ({})) };
  const tiempos = { jornada: jest.fn(async () => JORNADA_OFICINA) };
  const notifications = { createNotification: jest.fn(async () => ({})) };
  const users = {
    listAssignmentRoster: jest.fn(async () => [
      { id: 2, email: 'd@x', managerId: null, departmentId: 1, roleKey: 'coord_operaciones' },
      { id: 10, email: 'a@x', managerId: 2, departmentId: 1, roleKey: 'ing_campo' },
      { id: 11, email: 'b@x', managerId: 2, departmentId: 1, roleKey: 'ing_campo' },
    ]),
    findOne: jest.fn(async (id: number) => ({ id, email: `${id}@x`, managerId: 2, departmentId: 1, roleKey: 'ing_campo' })),
  };
  const service = new FormatosActividadService(
    prisma,
    activities as never,
    team as never,
    campos as never,
    herramientas as never,
    tiempos as never,
    notifications as never,
    users as never,
  );
  return { service, prisma, activities, team, campos, herramientas, notifications, users };
}

const aplicar = (extra: Partial<AplicarFormato> = {}): AplicarFormato => ({
  clave: 'abc',
  responsableId: 10,
  equipoIds: [11],
  fecha: '2026-11-10',
  hora: '10:00',
  clientId: 3,
  sucursal: 'Angelópolis',
  renglones: receta.renglones.map((r) => ({ ...r, minutos: r.minutosBase + r.minutosPorUnidad * 4 })),
  ...extra,
});

describe('quién puede', () => {
  it('quien no asigna a otros no entra al catálogo', async () => {
    const { service } = armar();
    await expect(service.listar(TECNICO, 1)).rejects.toThrow(ForbiddenException);
    await expect(service.aplicar(7, aplicar(), TECNICO, 1)).rejects.toThrow(ForbiddenException);
  });
  it('sin empresa, nada', async () => {
    const { service } = armar();
    await expect(service.listar(DAVID, null)).rejects.toThrow(ForbiddenException);
  });
});

describe('catálogo', () => {
  it('la primera vez deja tres para empezar', async () => {
    const { service, prisma } = armar({ hayFormatos: 0 });
    await service.listar(DAVID, 1);
    expect(prisma.formatoActividad.create).toHaveBeenCalledTimes(3);
  });
  it('si ya hay, aunque sea archivado, no siembra', async () => {
    const { service, prisma } = armar({ hayFormatos: 1 });
    await service.listar(DAVID, 1);
    expect(prisma.formatoActividad.create).not.toHaveBeenCalled();
  });
  it('editar sube la versión', async () => {
    const { service, prisma } = armar();
    await service.editar(7, { nombre: 'Otro', receta }, DAVID, 1);
    expect(prisma.formatoActividad.update.mock.calls[0][0].data).toMatchObject({ nombre: 'Otro', version: { increment: 1 } });
  });
  it('archivar no borra', async () => {
    const { service, prisma } = armar();
    await service.archivar(7, DAVID, 1);
    expect(prisma.formatoActividad.update.mock.calls[0][0].data.archivadoAt).toBeInstanceOf(Date);
  });
});

describe('aplicar', () => {
  it('crea todo el paquete, con cliente y sucursal, sin un aviso por renglón', async () => {
    const { service, activities, team, campos, notifications } = armar();
    const r = await service.aplicar(7, aplicar(), DAVID, 1);
    expect(activities.create).toHaveBeenCalledTimes(5);
    for (const c of activities.create.mock.calls) {
      expect(c[0]).toMatchObject({ clientId: 3, branchName: 'Angelópolis', responsableId: 10, creadoPorId: 2, assignmentCharge: 'ejecucion' });
      expect(c[2]).toEqual({ sinAviso: true });
    }
    expect(team.addMember).toHaveBeenCalledTimes(5);
    expect(campos.definirCampos).toHaveBeenCalledTimes(4);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'ACTIVITY_ASSIGNED', title: 'Te asignaron 5 actividades de «Instalación CCTV»' }),
    );
    expect(r.actividades).toHaveLength(5);
    expect(r.fallidas).toEqual([]);
  });

  it('lleva su estándar para no gastar una lectura de IA por renglón', async () => {
    const { service, activities } = armar();
    await service.aplicar(7, aplicar(), DAVID, 1);
    const dto = activities.create.mock.calls[2][0] as any;
    expect(dto).toMatchObject({ titulo: 'Montaje de cámaras', tiempoEstimadoMin: 210, tiempoEstandarMin: 210, ticketTypeCustom: 'Instalación', coreKind: 'tarea' });
    expect(dto.estandarDesglose[0].concepto).toContain('Instalación CCTV');
    // Tres horas y media a partir de las 14:00: la comida y la salida la pasan al día siguiente.
    expect(dto.periodoInicio).toBe('2026-11-10');
    expect(dto.periodoFin).toBe('2026-11-11');
    expect(dto.fechaInicio).toBe('2026-11-10T20:00:00.000Z');
    const primera = activities.create.mock.calls[0][0] as any;
    expect(primera.fechaEntregaEsperada).toBe('2026-11-10T17:00:00.000Z');
    expect(primera.periodoFin).toBeUndefined();
  });

  it('lo editado en pantalla manda sobre la receta', async () => {
    const { service, activities } = armar();
    await service.aplicar(7, aplicar({ renglones: [{ titulo: 'Solo esta', minutos: 90 }] }), DAVID, 1);
    expect(activities.create).toHaveBeenCalledTimes(1);
    expect(activities.create.mock.calls[0][0]).toMatchObject({ titulo: 'Solo esta', tiempoEstimadoMin: 90 });
  });

  it('una tarea sin tipo y un comercial llevan lo mismo que el formulario', async () => {
    const { service, activities } = armar();
    await service.aplicar(
      7,
      aplicar({
        renglones: [
          { titulo: 'Sin tipo', minutos: 30 },
          { titulo: 'Visita', coreKind: 'comercial', minutos: 30 },
          { titulo: 'Soporte', coreKind: 'servicio', minutos: 30 },
        ],
      }),
      DAVID,
      1,
    );
    const [tarea, comercial, servicio] = activities.create.mock.calls.map((c) => c[0] as any);
    expect(tarea).toMatchObject({ ticketType: 'OTRO', ticketTypeCustom: 'Otra tarea', activityType: 'INTERNAL' });
    expect(comercial).toMatchObject({ ticketType: 'OTRO', ticketTypeCustom: 'COMERCIAL' });
    expect(servicio).toMatchObject({ ticketType: 'CORRECTIVO' });
    expect(servicio.ticketTypeCustom).toBeUndefined();
  });

  it('con proyecto, el cliente es el del proyecto', async () => {
    const { service, activities } = armar();
    await service.aplicar(7, aplicar({ clientId: null, projectId: 4 }), DAVID, 1);
    expect(activities.create.mock.calls[0][0]).toMatchObject({ projectId: 4, clientId: 33, activityType: 'CLIENT' });
  });

  it('dos toques no crean dos paquetes', async () => {
    const { service, activities } = armar({ previa: { actividades: [101, 102] } });
    const r = await service.aplicar(7, aplicar(), DAVID, 1);
    expect(activities.create).not.toHaveBeenCalled();
    expect(r.actividades.map((a: any) => a.id)).toEqual([101, 102]);
  });

  it('si dos peticiones chocan, la segunda no crea nada', async () => {
    const { service, prisma, activities } = armar();
    prisma.formatoAplicacion.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    prisma.formatoAplicacion.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ actividades: [] });
    await service.aplicar(7, aplicar(), DAVID, 1);
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('si una falla, las demás quedan y dice cuál', async () => {
    const { service } = armar({ falla: 'Montaje de cámaras' });
    const r = await service.aplicar(7, aplicar(), DAVID, 1);
    expect(r.actividades).toHaveLength(4);
    expect(r.fallidas).toEqual([{ titulo: 'Montaje de cámaras', motivo: 'Falló esa' }]);
  });

  it('todo se revisa antes de crear la primera', async () => {
    const { service, activities } = armar();
    await expect(service.aplicar(7, aplicar({ clientId: null, renglones: [{ titulo: 'x', coreKind: 'servicio', minutos: 10 }] }), DAVID, 1)).rejects.toThrow('Elige el cliente');
    await expect(service.aplicar(7, aplicar({ fecha: 'mañana' }), DAVID, 1)).rejects.toThrow('Elige el día');
    await expect(service.aplicar(7, aplicar({ renglones: [] }), DAVID, 1)).rejects.toThrow('al menos una actividad');
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('un cliente de otra empresa no pasa', async () => {
    const { service, activities } = armar({ clienteOk: false });
    await expect(service.aplicar(7, aplicar(), DAVID, 1)).rejects.toThrow('no es de esta empresa');
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('no deja asignar a quien no puede: la misma regla del alta', async () => {
    const { service, users, activities } = armar();
    users.findOne.mockResolvedValueOnce({ id: 77, email: 'x@x', managerId: 999, departmentId: 8, roleKey: 'ing_campo' });
    await expect(
      service.aplicar(7, aplicar({ responsableId: 77, equipoIds: [] }), { ...DAVID, roleKey: 'enc_soporte' }, 1),
    ).rejects.toThrow(ForbiddenException);
    expect(activities.create).not.toHaveBeenCalled();
  });
});
