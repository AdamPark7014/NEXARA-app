import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

@Injectable()
export class ExcelExportService {
  async exportToExcel(data: any[], sheetName = 'Sheet1'): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    if (data.length > 0) {
      worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
      data.forEach(item => worksheet.addRow(item));
    }
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
}
