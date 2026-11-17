import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExpedienteService } from './expediente.service.js';

const empleado = {
  id: 50, nombre: 'Persona ficticia', email: 'persona@empresa.invalid', employeeNumber: 'NEX-050',
  puesto: 'Técnico', tipoContrato: 'Planta', estadoRRHH: 'Activo', isActive: true,
  managerId: 8, fechaIngreso: null, fechaCreacion: new Date('2026-01-01'),
  department: null, role: null, manager: null, empleadoPerfil: null,
  perfil: { telefono: null, fechaNacimiento: null },
  documentos: [{ id: 1, tipo: 'INE', archivoUrl: '/uploads/ficticio.pdf' }],
};

function escenario(actorId: number, roleKey: string, targetCompany = 7) {
  const actor = { id: actorId, roleKey, email: 'actor@empresa.invalid', isActive: true, nombre: 'Actor ficticio' };
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === actorId && where.companyMemberships?.some?.companyId === 7 ? actor : null),
      findFirst: jest.fn(async ({ where, select }: any) => {
        if (where.id !== empleado.id || where.companyMemberships?.some?.companyId !== targetCompany) return null;
        if (where.managerId !== undefined && where.managerId !== empleado.managerId) return null;
        return select.nombre ? empleado : { id: empleado.id };
      }),
    },
    userDocument: { create: jest.fn() },
    incidenciaPersonal: { findMany: jest.fn().mockResolvedValue([{ id: 4, tipo: 'OTRO', monto: 4321, concepto: 'Prueba' }]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    empleadoEvento: { findMany: jest.fn().mockResolvedValue([
      { id: 1, tipo: 'AJUSTE_SUELDO', detalle: { sueldoNuevo: 4321 } },
      { id: 2, tipo: 'OTRO', detalle: { sueldoAnterior: 1234 } },
    ]), create: jest.fn() },
    solicitudAprobacionRh: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, servicio: new ExpedienteService(prisma, {} as any) };
}

describe('Expediente: aislamiento de empresa y salidas sensibles', () => {
  afterEach(() => jest.useRealTimers());

  it('oculta el perfil extendido de otra empresa aunque la persona pertenezca a ambas', async () => {
    const { servicio, prisma } = escenario(50, 'operativo');
    prisma.user.findFirst.mockResolvedValue({ ...empleado,
      empleadoPerfil: { companyId: 9, area: 'Área reservada', contratoVenceAt: new Date('2027-01-01') },
    });
    const resultado = await servicio.obtener({ id: 50 }, 50, 7);
    expect(resultado.laborales.area).toBeNull();
    expect(resultado.laborales.contratoVenceAt).toBeNull();
  });

  it('RH no modifica el perfil extendido existente de otra empresa', async () => {
    const { servicio, prisma } = escenario(10, 'rh');
    prisma.user.findFirst.mockResolvedValue({ id: 50, empleadoPerfil: { companyId: 9 } });
    prisma.empleadoPerfil = { upsert: jest.fn() };
    await expect(servicio.actualizarAreaContrato({ id: 10 }, 7, 50, { area: 'Campo' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.empleadoPerfil.upsert).not.toHaveBeenCalled();
  });

  it('un error de bitácora revierte la carga del documento', async () => {
    const { servicio, prisma } = escenario(50, 'operativo');
    const persistidos: unknown[] = [];
    const tx = {
      userDocument: { create: jest.fn().mockResolvedValue({ id: 91 }) },
      empleadoEvento: { create: jest.fn().mockRejectedValue(new Error('bitácora no disponible')) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => {
      const result = await fn(tx);
      persistidos.push(result);
      return result;
    });
    await expect(servicio.subirDocumento({ id: 50 }, 7, {
      userId: 50, tipo: 'INE', archivoUrl: '/uploads/ficticio.pdf',
    })).rejects.toThrow('bitácora no disponible');
    expect(persistidos).toEqual([]);
    expect(prisma.userDocument.create).not.toHaveBeenCalled();
    expect(prisma.empleadoEvento.create).not.toHaveBeenCalled();
    expect(tx.empleadoEvento.create).toHaveBeenCalledWith({ data: {
      companyId: 7, userId: 50, tipo: 'DOCUMENTO', detalle: { tipo: 'INE', documentoId: 91 }, actorId: 50,
    } });
  });

  it('rechaza fechas imposibles antes de escribir un documento', async () => {
    const { servicio, prisma } = escenario(50, 'operativo');
    prisma.$transaction = jest.fn();
    await expect(servicio.subirDocumento({ id: 50 }, 7, {
      userId: 50, tipo: 'INE', archivoUrl: '/uploads/ficticio.pdf', expiresAt: '2026-02-30',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('las alertas corresponden al día mexicano y omiten demos, vencidos y altas del mismo año', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T02:00:00Z'));
    const { servicio, prisma } = escenario(10, 'rh');
    const perfil = { area: 'Pruebas', companyId: 7, contratoVenceAt: new Date('2026-11-15') };
    prisma.user.findMany = jest.fn().mockResolvedValue([
      { ...empleado, email: 'persona@empresa.mx', perfil: { fechaNacimiento: new Date('2000-11-16') },
        fechaIngreso: new Date('2026-11-16'), empleadoPerfil: perfil, documentos: [] },
      { ...empleado, id: 99, email: 'demo@empresa.invalid', employeeNumber: null, managerId: null, documentos: [] },
      { ...empleado, id: 100, email: 'otra@empresa.mx', perfil: null, fechaIngreso: null, documentos: [],
        empleadoPerfil: { companyId: 9, contratoVenceAt: new Date('2026-11-20') } },
    ]);
    const resultado = await servicio.alertas({ id: 10 }, 7);
    expect(resultado.fecha).toBe('2026-11-16');
    expect(resultado.cumpleaños).toHaveLength(1);
    expect(resultado.aniversarios).toEqual([]);
    expect(resultado.sinNex).toEqual([]);
    expect(resultado.sinJefe).toEqual([]);
    expect(resultado.contratosPorVencer).toEqual([]);
    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.where.companyMemberships).toEqual({ some: { companyId: 7 } });
    expect(query.select.documentos.where.expiresAt).toEqual({
      gte: new Date('2026-11-16T00:00:00Z'), lte: new Date('2026-12-16T23:59:59.999Z'),
    });
  });
  it('RH no puede adjuntar documentos a una persona de otra empresa', async () => {
    const { servicio, prisma } = escenario(10, 'rh', 9);
    await expect(servicio.subirDocumento({ id: 10 }, 7, {
      userId: 50, tipo: 'INE', archivoUrl: '/uploads/ficticio.pdf',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.userDocument.create).not.toHaveBeenCalled();
    expect(prisma.empleadoEvento.create).not.toHaveBeenCalled();
  });

  it('deniega una sesión sin pertenencia a la empresa seleccionada', async () => {
    const { servicio, prisma } = escenario(10, 'rh');
    await expect(servicio.obtener({ id: 10 }, 50, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('el jefe recibe datos laborales sin documentos, importes ni detalles del sueldo', async () => {
    const { servicio, prisma } = escenario(8, 'coord_operaciones');
    const resultado = await servicio.obtener({ id: 8 }, 50, 7);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.sensibles).toBeNull();
    expect(resultado.incidencias[0]).not.toHaveProperty('monto');
    expect(resultado.timeline).toEqual([{ id: 2, tipo: 'OTRO', detalle: null }]);
    expect(resultado.solicitudesPendientes).toEqual([]);
    expect(prisma.solicitudAprobacionRh.findMany).not.toHaveBeenCalled();
    const detalleQuery = prisma.user.findFirst.mock.calls.find(([q]: any) => q.select.nombre)[0];
    expect(detalleQuery.select.perfil.select).not.toHaveProperty('sueldoSemanal');
    for (const modelo of ['incidenciaPersonal', 'leaveRequest', 'empleadoEvento']) {
      expect(prisma[modelo].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 7, userId: 50 } }));
    }
  });

  it('deniega un empleado que no es dueño ni jefe del expediente', async () => {
    const { servicio, prisma } = escenario(12, 'operativo');
    await expect(servicio.obtener({ id: 12 }, 50, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.incidenciaPersonal.findMany).not.toHaveBeenCalled();
  });

  it('la persona consulta sus documentos, con datos sensibles ocultos', async () => {
    const { servicio } = escenario(50, 'operativo');
    const resultado = await servicio.obtener({ id: 50 }, 50, 7);
    expect(resultado.documentos).toEqual(empleado.documentos);
    expect(resultado.sensibles).toBeNull();
    expect(resultado.permisosVista).toEqual(expect.objectContaining({ esPropio: true, puedeSubirDocs: true, puedeEditar: false }));
    expect(JSON.stringify(resultado.timeline)).not.toContain('4321');
  });
});
