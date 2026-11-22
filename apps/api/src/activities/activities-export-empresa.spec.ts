import ExcelJS from 'exceljs';
import { ExcelExportService } from '../common/excel-export.service';
import { PERMISSIONS } from '../common/permissions';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

/**
 * `GET activities/export/xlsx`: el Excel de actividades de la página Exportaciones.
 *
 * Consultaba sin la empresa, así que el filtro caía en «sin empresa no hay filas»
 * (`companyId: -1`) y el archivo bajaba siempre sin renglones, para cualquier perfil.
 */
describe('Excel de actividades', () => {
  const EMPRESA = 7;
  const FILAS = [
    {
      id: 1,
      anNumber: 'AN-0001',
      titulo: 'Mantenimiento de cámaras',
      estatus: 'FINALIZADA',
      responsable: { nombre: 'Persona Demo' },
      client: { name: 'Cliente Demo' },
      fechaAsignacion: new Date('2026-11-20T15:00:00Z'),
    },
    {
      id: 2,
      anNumber: 'AN-0002',
      titulo: 'Revisión de control de acceso',
      estatus: 'EN_PROCESO',
      responsable: { nombre: 'Persona Demo' },
      client: { name: 'Cliente Demo' },
      fechaAsignacion: new Date('2026-11-21T15:00:00Z'),
    },
  ];

  function armar() {
    // La base simulada se porta como la real: con el candado `companyId: -1` no devuelve nada.
    const findMany = jest.fn(async (args: any) => (args.where?.companyId === EMPRESA ? FILAS : []));
    const servicio = Object.create(ActivitiesService.prototype) as any;
    servicio.prisma = { activity: { findMany } };
    const usuarios = { findUsersForConsoleActivityScope: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]) };
    const ctrl = new ActivitiesController(servicio, usuarios as any, new ExcelExportService(), {} as any, {} as any);
    const res: any = { header: jest.fn(), attachment: jest.fn(), send: jest.fn((b: Buffer) => b) };
    return { ctrl, findMany, res };
  }

  async function renglones(buffer: Buffer) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    const textos: string[] = [];
    libro.worksheets[0].eachRow((fila) => textos.push(String(fila.getCell(1).value ?? '')));
    return textos;
  }

  it('dirección descarga las actividades de su empresa', async () => {
    const { ctrl, findMany, res } = armar();

    const buffer = await ctrl.export({ id: 1, isSuperAdmin: true, nombre: 'Persona Demo' }, EMPRESA, 'xlsx', res);

    expect(findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null, companyId: EMPRESA });
    const textos = await renglones(buffer as Buffer);
    expect(textos).toEqual(expect.arrayContaining(['AN-0001', 'AN-0002']));
    expect(textos).not.toContain('Sin registros para los filtros aplicados');
    expect(res.attachment).toHaveBeenCalledWith('actividades.xlsx');
  });

  it('un encargado descarga las de su equipo, dentro de su empresa', async () => {
    const { ctrl, findMany, res } = armar();
    const encargado = { id: 9, roleKey: 'ing_soporte', permissions: [PERMISSIONS.ACTIVITIES_EXPORT] };

    const buffer = await ctrl.export(encargado, EMPRESA, 'xlsx', res);

    expect(findMany.mock.calls[0][0].where).toMatchObject({ responsableId: { in: [3, 4] }, companyId: EMPRESA });
    expect(await renglones(buffer as Buffer)).toEqual(expect.arrayContaining(['AN-0001', 'AN-0002']));
  });

  it('quien no tiene equipo descarga solo las suyas, dentro de su empresa', async () => {
    const { ctrl, findMany, res } = armar();

    await ctrl.export({ id: 21, permissions: [PERMISSIONS.ACTIVITIES_EXPORT] }, EMPRESA, 'xlsx', res);

    expect(findMany.mock.calls[0][0].where).toMatchObject({ responsableId: 21, companyId: EMPRESA });
  });

  it('sin empresa el candado sigue: el archivo sale sin renglones', async () => {
    const { ctrl, findMany, res } = armar();

    const buffer = await ctrl.export({ id: 1, isSuperAdmin: true }, null, 'xlsx', res);

    expect(findMany.mock.calls[0][0].where).toMatchObject({ companyId: -1 });
    expect(await renglones(buffer as Buffer)).toContain('Sin registros para los filtros aplicados');
  });
});
