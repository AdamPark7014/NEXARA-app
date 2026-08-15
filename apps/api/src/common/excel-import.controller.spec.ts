import { Test, TestingModule } from '@nestjs/testing';
import { ExcelImportController } from './excel-import.controller.js';
import { ExcelImportService } from './excel-import.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ExcelImportController', () => {
  let controller: ExcelImportController;
  let service: ExcelImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExcelImportController],
      providers: [
        // El controlador delega en ExcelImportService; se inyecta el servicio
        // real con un PrismaService simulado para no perder la ruta de código.
        ExcelImportService,
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
    service = module.get<ExcelImportService>(ExcelImportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw if no file uploaded', async () => {
    await expect(controller.importExcel('activity', null, 1)).rejects.toThrow();
  });

  it('forwards the active company to the import service', async () => {
    const spy = jest
      .spyOn(service, 'importExcel')
      .mockResolvedValue({ message: 'ok', importados: 0, errores: [], filaEncabezados: 1 } as any);

    const buffer = Buffer.from('x');
    await controller.importExcel('activity', { buffer } as any, 7);

    // El tenant nunca debe quedar a criterio del fichero subido.
    expect(spy).toHaveBeenCalledWith('activity', buffer, 7);
  });
});
