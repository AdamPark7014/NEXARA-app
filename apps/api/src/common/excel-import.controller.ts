import {
  Controller, Post, UploadedFile, UseInterceptors, BadRequestException, Param
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportService } from './excel-import.service.js';

@Controller('import')
export class ExcelImportController {
  constructor(private readonly excelImportService: ExcelImportService) {}

  @Post(':model')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @Param('model') model: string,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.excelImportService.importExcel(model, file.buffer);
  }
}
