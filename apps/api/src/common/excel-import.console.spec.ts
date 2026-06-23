import { Test, TestingModule } from '@nestjs/testing';
import { ExcelImportController } from '../common/excel-import.controller';
import { PrismaService } from '../prisma/prisma.service.js';
import ExcelJS from 'exceljs';

describe('ExcelImportController (console models)', () => {
  let controller: ExcelImportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelImportController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            expense: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            vehicleControl: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            activity: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            evidence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          },
        },
      ],
    }).compile();
    controller = module.get<ExcelImportController>(ExcelImportController);
  });

  it('should import Excel for viatic', async () => {
    const data = [{
      actividadId: 1,
      usuarioId: 2,
      montoSolicitado: 100,
      razonGasto: 'Transporte',
      ticketEvidenciaUrl: 'http://url',
      estatusPago: 'Pendiente',
    }];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
    data.forEach(item => worksheet.addRow(item));
    const buffer = await workbook.xlsx.writeBuffer();
    const file = { buffer };
    const result = await controller.importExcel('viatic', file);
    expect(result.importados).toBeGreaterThanOrEqual(0);
  });

});
