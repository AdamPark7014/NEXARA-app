import { Test, TestingModule } from '@nestjs/testing';
import { ExcelImportController } from './excel-import.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ExcelImportController', () => {
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

  it('should throw if no file uploaded', async () => {
    await expect(controller.importExcel('viatic', null)).rejects.toThrow();
  });

  // Puedes agregar más tests para casos de éxito y error con mocks de archivos
});
