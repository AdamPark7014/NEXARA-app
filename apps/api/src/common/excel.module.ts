import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ExcelExportService } from './excel-export.service.js';
import { ExcelImportService } from './excel-import.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ExcelExportService, ExcelImportService],
  exports: [ExcelExportService, ExcelImportService],
})
export class ExcelModule {}
