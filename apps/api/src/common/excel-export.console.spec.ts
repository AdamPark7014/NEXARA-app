import { Test, TestingModule } from '@nestjs/testing';
import { ExcelExportController } from '../common/excel-export.controller';
import { ExcelExportService } from '../common/excel-export.service';
import { PrismaService } from '../prisma/prisma.service.js';
import { Response } from 'express';

describe('ExcelExportController (console models)', () => {
  let controller: ExcelExportController;
  let prisma: PrismaService;
  let excelExport: ExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelExportController],
      providers: [
        ExcelExportService,
        {
          provide: PrismaService,
          useValue: {
            viatic: { findMany: jest.fn().mockResolvedValue([{ foo: 'bar' }]) },
            vehicle: { findMany: jest.fn().mockResolvedValue([{ foo: 'car' }]) },
            activity: { findMany: jest.fn().mockResolvedValue([{ foo: 'act' }]) },
            evidence: { findMany: jest.fn().mockResolvedValue([{ foo: 'ev' }]) },
          },
        },
      ],
    }).compile();

    controller = module.get<ExcelExportController>(ExcelExportController);
    prisma = module.get<PrismaService>(PrismaService);
    excelExport = module.get<ExcelExportService>(ExcelExportService);
  });

  it.each([
    ['viatic'],
    ['vehicle'],
    ['activity'],
    ['evidence'],
  ])('should export Excel for %s', async (model) => {
    const res: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    await controller.exportExcel(model, res);
    expect(res.send).toHaveBeenCalled();
  });
});
