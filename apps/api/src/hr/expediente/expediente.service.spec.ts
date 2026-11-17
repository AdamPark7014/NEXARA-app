import { ExpedienteService } from './expediente.service.js';

function crear() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    userProfile: { upsert: jest.fn() },
    userDocument: { create: jest.fn() },
    incidenciaPersonal: { findMany: jest.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    empleadoEvento: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    empleadoPerfil: { upsert: jest.fn() },
    solicitudAprobacionRh: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
  };
  const aprobaciones = {
    idsDireccion: jest.fn().mockResolvedValue([1]),
    crear: jest.fn().mockResolvedValue({ id: 9, estado: 'PENDIENTE' }),
    decidir: jest.fn().mockResolvedValue({ id: 9, estado: 'APROBADA' }),
  };
  return { servicio: new ExpedienteService(prisma, aprobaciones as any), prisma, aprobaciones };
}

const rh = { id: 10, email: 'tere@nexara.com.mx', roleKey: 'rh', isActive: true, nombre: 'Tere' };
const jefe = { id: 8, email: 'jefe@nexara.com.mx', roleKey: 'coord_operaciones', isActive: true, nombre: 'Jefe' };

describe('ExpedienteService permisos', () => {
  it('RH ve datos sensibles', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue(rh);
    prisma.user.findFirst.mockResolvedValue({
      id: 50,
      nombre: 'Ana',
      email: 'ana@nexara.com.mx',
      employeeNumber: 'NEX-001',
      puesto: 'Técnico',
      tipoContrato: 'Planta',
      estadoRRHH: 'Activo',
      isActive: true,
      fechaIngreso: null,
      fechaCreacion: new Date(),
      managerId: 8,
      department: { id: 1, nombre: 'Ops' },
      role: { id: 2, nombre: 'Campo' },
      manager: { id: 8, nombre: 'Jefe', email: 'jefe@nexara.com.mx', employeeNumber: null },
      perfil: { rfc: 'XAXX010101000', curp: null, nss: null, sueldoSemanal: 1000, telefono: null, fechaNacimiento: null },
      empleadoPerfil: { area: 'Campo', contratoVenceAt: null },
      documentos: [],
    });
    const out = await servicio.obtener({ id: 10 }, 50, 7);
    expect(out.permisosVista.sensibles).toBe(true);
    expect(out.sensibles?.rfc).toBe('XAXX010101000');
  });

  it('un jefe no ve datos sensibles de su gente', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue(jefe);
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 50 })
      .mockResolvedValueOnce({
        id: 50,
        nombre: 'Ana',
        email: 'ana@nexara.com.mx',
        employeeNumber: 'NEX-001',
        puesto: 'Técnico',
        tipoContrato: 'Planta',
        estadoRRHH: 'Activo',
        isActive: true,
        fechaIngreso: null,
        fechaCreacion: new Date(),
        managerId: 8,
        department: null,
        role: null,
        manager: null,
        perfil: { telefono: '555', fechaNacimiento: null },
        empleadoPerfil: null,
        documentos: [],
      });
    const out = await servicio.obtener({ id: 8 }, 50, 7);
    expect(out.permisosVista.sensibles).toBe(false);
    expect(out.sensibles).toBeNull();
    expect(out.laborales.puesto).toBe('Técnico');
  });
});
