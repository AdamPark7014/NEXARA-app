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
            viatico: { findMany: jest.fn().mockResolvedValue([{ foo: 'bar' }]) },
            vehicleControl: { findMany: jest.fn().mockResolvedValue([{ foo: 'car' }]) },
            activity: { findMany: jest.fn().mockResolvedValue([{ foo: 'act' }]) },
            evidence: { findMany: jest.fn().mockResolvedValue([{ foo: 'ev' }]) },
            user: { findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'A' }]) },
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
    await controller.exportExcel(model, res, 1);
    expect(res.send).toHaveBeenCalled();
  });

  it('should scope User export by company membership', async () => {
    const res: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    await controller.exportExcel('user', res, 42);
    expect((prisma as any).user.findMany).toHaveBeenCalledWith({
      where: { companyMemberships: { some: { companyId: 42 } } },
    });
    expect(res.send).toHaveBeenCalled();
  });
});
