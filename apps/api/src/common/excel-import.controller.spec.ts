import { Test, TestingModule } from '@nestjs/testing';
import { ExcelImportController } from './excel-import.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ExcelImportController', () => {
  let controller: ExcelImportController;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelImportController],
      providers: [
        { provide: PrismaService, useValue: { viatic: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } } },
      ],
    }).compile();

    controller = module.get<ExcelImportController>(ExcelImportController);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should throw if no file uploaded', async () => {
    await expect(controller.importExcel('viatic', null)).rejects.toThrow();
  });

  // Puedes agregar más tests para casos de éxito y error con mocks de archivos
});
