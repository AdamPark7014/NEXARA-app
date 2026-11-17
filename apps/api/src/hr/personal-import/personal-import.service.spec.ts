import { PersonalImportService } from './personal-import.service.js';

function crear() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 10, email: 'tere@nexara.com.mx', roleKey: 'rh', isActive: true, nombre: 'Tere',
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 50,
          nombre: 'Ana Lopez',
          email: 'ana@nexara.com.mx',
          employeeNumber: 'NEX-001',
          puesto: 'Ayudante',
          isActive: true,
          estadoRRHH: 'Activo',
          fechaIngreso: null,
          perfil: { telefono: null, rfc: null, curp: null, nss: null, direccion: null, sueldoSemanal: null },
          empleadoPerfil: null,
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({ id: 50 }),
      update: jest.fn(),
    },
    userProfile: { upsert: jest.fn() },
    empleadoPerfil: { upsert: jest.fn() },
    empleadoEvento: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn) => fn(prisma));
  return { servicio: new PersonalImportService(prisma), prisma };
}

async function xlsxBuffer(rows: string[][]) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Base_Personal');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('PersonalImportService', () => {
  it('previsualizar no escribe en la base', async () => {
    const { servicio, prisma } = crear();
    const buffer = await xlsxBuffer([
      ['ID', 'Nombre', 'Puesto', 'Correo', 'Estatus'],
      ['NEX-001', 'Ana Lopez', 'Técnico', 'ana@nexara.com.mx', 'Activo'],
      ['NEX-099', 'Nuevo', 'Campo', 'nuevo@nexara.com.mx', 'Activo'],
    ]);
    const out = await servicio.previsualizar({ id: 10 }, 7, buffer);
    expect(out.seActualiza.length).toBe(1);
    expect(out.seActualiza[0].cambios.some((c) => c.campo === 'puesto')).toBe(true);
    expect(out.noEstaEnPlataforma.length).toBe(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it('confirmar escribe solo los campos elegidos', async () => {
    const { servicio, prisma } = crear();
    const out = await servicio.confirmar({ id: 10 }, 7, {
      actualizar: [{ userId: 50, campos: ['employeeNumber'], employeeNumber: 'NEX-050', telefono: 'ignorado' }],
    });
    expect(out.actualizados[0].aplicados).toEqual(['employeeNumber']);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 50, companyMemberships: { some: { companyId: 7 } } },
      data: { employeeNumber: 'NEX-050' },
    });
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['puesto', 'sueldoSemanal'])('no permite eludir aprobación importando %s', async (campo) => {
    const { servicio, prisma } = crear();
    await expect(servicio.confirmar({ id: 10 }, 7, { actualizar: [{ userId: 50, campos: [campo], [campo]: '100' }] })).rejects.toThrow('aprobación');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza fechas inexistentes antes de escribir', async () => {
    const { servicio, prisma } = crear();
    await expect(servicio.confirmar({ id: 10 }, 7, { actualizar: [{ userId: 50, campos: ['fechaIngreso'], fechaIngreso: '2026-02-30' }] })).rejects.toThrow('fecha válida');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('no confirma personas de otra empresa', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(servicio.confirmar({ id: 10 }, 7, { actualizar: [{ userId: 50, campos: ['area'], area: 'Campo' }] })).rejects.toThrow('empresa');
    expect(prisma.empleadoPerfil.upsert).not.toHaveBeenCalled();
  });

  it('un jefe no recibe datos personales de la vista previa', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue({ id: 10, roleKey: 'coord_operaciones', email: 'jefe@example.invalid', isActive: true });
    await expect(servicio.previsualizar({ id: 10 }, 7, Buffer.from('excel'))).rejects.toThrow('Solo RH');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
