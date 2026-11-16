import { IncidenciasPersonalService } from './incidencias-personal.service.js';

describe('IncidenciasPersonalService', () => {
  function crear() {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, email: 'tere@nexara.com.mx', roleKey: 'rh', isActive: true }),
        findFirst: jest.fn().mockResolvedValue({ id: 50 }),
        findMany: jest.fn().mockResolvedValue([{ id: 50, nombre: 'Ana Lopez', employeeNumber: 'NEX-001' }]),
      },
      incidenciaPersonal: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
      nominaSemana: {
        findUnique: jest.fn().mockResolvedValue({ id: 3, estado: 'BORRADOR' }),
        upsert: jest.fn().mockResolvedValue({ id: 3, estado: 'BORRADOR', fin: new Date('2026-11-15') }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      nominaDescuento: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    return { servicio: new IncidenciasPersonalService(prisma), prisma };
  }

  it('aplicar-semana no duplica descuentos ya ligados', async () => {
    const { servicio, prisma } = crear();
    prisma.incidenciaPersonal.findMany.mockResolvedValue([
      { id: 1, userId: 50, concepto: 'Falta', monto: 500, fecha: new Date('2026-11-10'), nominaDescuentoId: 99, estado: 'REGISTRADA' },
      { id: 2, userId: 50, concepto: 'Préstamo', monto: 200, fecha: new Date('2026-11-11'), nominaDescuentoId: null, estado: 'REGISTRADA' },
    ]);
    prisma.nominaDescuento.create.mockResolvedValue({ id: 100 });
    prisma.incidenciaPersonal.update.mockResolvedValue({});
    const out = await servicio.aplicarSemana({ id: 10 }, 7, '2026-11-10');
    expect(out.aplicadas).toBe(1);
    expect(prisma.nominaDescuento.create).toHaveBeenCalledTimes(1);
  });

  it('importar devuelve fila no reconocida sin crearla', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Incidencias');
    ws.addRow(['ID', 'Nombre', 'Fecha', 'Concepto', 'Tipo', 'Monto']);
    ws.addRow(['NEX-999', 'Desconocido', '2026-11-10', 'Falta', 'FALTA_INJUSTIFICADA', 100]);
    ws.addRow(['NEX-001', 'Ana Lopez', '2026-11-11', 'Retardo', 'RETARDO', 50]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { servicio, prisma } = crear();
    prisma.incidenciaPersonal.create.mockResolvedValue({ id: 1 });
    const out = await servicio.importar({ id: 10 }, 7, buffer);
    expect(out.noReconocidas.length).toBeGreaterThanOrEqual(1);
    expect(out.noReconocidas.some((r: any) => String(r.id || '').includes('999') || String(r.nombre || '').includes('Desconocido'))).toBe(true);
    expect(out.creadas).toBe(1);
  });

  it('no aplica una semana cerrada', async () => {
    const { servicio, prisma } = crear();
    prisma.nominaSemana.updateMany.mockResolvedValue({ count: 0 });
    await expect(servicio.aplicarSemana({ id: 10 }, 7, '2026-11-10')).rejects.toThrow(/cerrada/);
    expect(prisma.nominaDescuento.create).not.toHaveBeenCalled();
  });
  it('una incidencia reclamada por otra petición no produce otro descuento', async () => {
    const { servicio, prisma } = crear();
    prisma.incidenciaPersonal.findMany.mockResolvedValue([{ id: 2, userId: 50, monto: 200 }]);
    prisma.incidenciaPersonal.updateMany.mockResolvedValue({ count: 0 });
    expect((await servicio.aplicarSemana({ id: 10 }, 7, '2026-11-10')).aplicadas).toBe(0);
    expect(prisma.nominaDescuento.create).not.toHaveBeenCalled();
  });
  it('respeta el filtro de persona dentro del equipo del jefe', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue({ id: 10, roleKey: 'ing_soporte', isActive: true });
    await servicio.listar({ id: 10 }, 7, { userId: 999 });
    expect(prisma.incidenciaPersonal.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 7, userId: { in: [] } });
  });
  it('importa fechas seriales, acentos y espacios sin perder el tipo de préstamo', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(' Incidéncias ');
    ws.addRow([' Nombre ', ' Fecha ', ' Descripción ', ' TIPO ', ' Monto ']);
    ws.addRow([' Ana   López ', 46337, 'Préstamo semanal', ' préstamo ', 100]);
    const { servicio, prisma } = crear();
    expect((await servicio.importar({ id: 10 }, 7, Buffer.from(await wb.xlsx.writeBuffer()))).creadas).toBe(1);
    expect(prisma.incidenciaPersonal.create.mock.calls[0][0].data).toMatchObject({ companyId: 7, userId: 50, tipo: 'PRESTAMO', monto: 100 });
  });
});
