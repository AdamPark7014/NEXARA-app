import {
  Controller, Post, UploadedFile, UseInterceptors, BadRequestException, Param, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportService } from './excel-import.service.js';
import { RBAC, RbacGuard } from './rbac.guard.js';
import { PERMISSIONS } from './permissions.js';
import { CurrentCompanyId } from './tenant/current-company.decorator.js';

@Controller('import')
@UseGuards(RbacGuard)
export class ExcelImportController {
  constructor(private readonly excelImportService: ExcelImportService) {}

  @Post(':model')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACTIVITIES_IMPORT,
      PERMISSIONS.EVIDENCES_IMPORT,
      PERMISSIONS.VIATICS_IMPORT,
      PERMISSIONS.VEHICLES_IMPORT,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @Param('model') model: string,
    @UploadedFile() file: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.excelImportService.importExcel(model, file.buffer, companyId);
  }
}
