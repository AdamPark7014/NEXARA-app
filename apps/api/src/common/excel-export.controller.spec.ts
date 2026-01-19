import { Test, TestingModule } from '@nestjs/testing';
import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ExcelExportController', () => {
  let controller: ExcelExportController;
  let prisma: PrismaService;
  let excelExport: ExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelExportController],
      providers: [
        ExcelExportService,
        { provide: PrismaService, useValue: { viatic: { findMany: jest.fn().mockResolvedValue([{ foo: 'bar' }]) } } },
      ],
    }).compile();

    controller = module.get<ExcelExportController>(ExcelExportController);
    prisma = module.get<PrismaService>(PrismaService);
    excelExport = module.get<ExcelExportService>(ExcelExportService);
  });

  it('should export Excel for viatic', async () => {
    const res: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    await controller.exportExcel('viatic', res);
    expect(res.send).toHaveBeenCalled();
  });
});
