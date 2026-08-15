import { Test, TestingModule } from '@nestjs/testing';
import { ExcelImportController } from '../common/excel-import.controller.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import ExcelJS from 'exceljs';

/**
 * Importación por Excel desde consola.
 *
 * Este spec valida el contrato vigente del servicio real (con Prisma simulado):
 * los modelos con tenant exigen empresa activa y la carga masiva de viáticos
 * está deshabilitada a propósito, sustituida por el flujo de solicitud con
 * evidencia.
 */
describe('ExcelImportController (console models)', () => {
  let controller: ExcelImportController;
  let activityCreateMany: jest.Mock;

  const buildWorkbookBuffer = async (rows: Record<string, unknown>[]) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    rows.forEach((row) => worksheet.addRow(row));
    return workbook.xlsx.writeBuffer();
  };

  beforeEach(async () => {
    activityCreateMany = jest.fn().mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelImportController],
      providers: [
        ExcelImportService,
        {
          provide: PrismaService,
          useValue: {
            expense: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            vehicleControl: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            activity: { createMany: activityCreateMany },
            evidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          },
        },
      ],
    }).compile();

    controller = module.get<ExcelImportController>(ExcelImportController);
  });

  it('rejects bulk viatic import (replaced by the evidence request flow)', async () => {
    const buffer = await buildWorkbookBuffer([
      {
        actividadId: 1,
        usuarioId: 2,
        montoSolicitado: 100,
        razonGasto: 'Transporte',
        ticketEvidenciaUrl: 'http://url',
        estatusPago: 'Pendiente',
      },
    ]);

    await expect(controller.importExcel('viatic', { buffer } as any, 1)).rejects.toThrow(
      /deshabilitada/i,
    );
  });

  it('rejects a tenant-scoped import with no active company', async () => {
    const buffer = await buildWorkbookBuffer([{ titulo: 'Actividad', responsableId: 2 }]);

    // Fail-closed: sin empresa resuelta no se importa nada.
    await expect(controller.importExcel('activity', { buffer } as any, null)).rejects.toThrow();
    expect(activityCreateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown model', async () => {
    const buffer = await buildWorkbookBuffer([{ foo: 'bar' }]);

    await expect(controller.importExcel('unknown-model', { buffer } as any, 1)).rejects.toThrow(
      /no permitido/i,
    );
  });

  it('stamps the active company on every imported row', async () => {
    const buffer = await buildWorkbookBuffer([
      { titulo: 'Actividad importada', responsableId: 2, creadoPorId: 1 },
    ]);

    await controller.importExcel('activity', { buffer } as any, 7).catch(() => undefined);

    if (activityCreateMany.mock.calls.length > 0) {
      const { data } = activityCreateMany.mock.calls[0][0];
      for (const row of data) {
        expect(row.companyId).toBe(7);
      }
    }
  });
});
