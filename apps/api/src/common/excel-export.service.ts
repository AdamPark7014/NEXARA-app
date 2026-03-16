import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

@Injectable()
export class ExcelExportService {
  private static readonly HEADER_FILL = 'FF0F766E';
  private static readonly TITLE_FILL = 'FF0B1320';
  private static readonly META_FILL = 'FFEFF6FF';

  private normalizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
    }
    if (typeof value === 'object') {
      const decimalLike = value as { toNumber?: () => number; toString?: () => string };
      if (typeof decimalLike.toNumber === 'function') {
        const n = decimalLike.toNumber();
        if (Number.isFinite(n)) return n;
      }
      if (typeof decimalLike.toString === 'function') {
        const s = decimalLike.toString();
        if (s && s !== '[object Object]') return s;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return value;
  }

  private isDateLike(value: unknown, key: string): boolean {
    if (value instanceof Date) return true;
    if (typeof value !== 'string') return false;
    const k = key.toLowerCase();
    if (!k.includes('fecha') && !k.includes('date') && !k.includes('created') && !k.includes('updated')) return false;
    return !Number.isNaN(Date.parse(value));
  }

  private isCurrencyLike(key: string): boolean {
    const k = key.toLowerCase();
    return k.includes('monto') || k.includes('total') || k.includes('cost') || k.includes('precio') || k.includes('amount');
  }

  private prettifyHeader(key: string): string {
    const text = key
      .replace(/_/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private autoFitColumns(worksheet: ExcelJS.Worksheet, min = 12, max = 42): void {
    worksheet.columns.forEach((column) => {
      if (!column) return;
      const eachCell = column.eachCell?.bind(column);
      if (!eachCell) return;
      let maxLength = min;
      eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        const text =
          v === null || v === undefined
            ? ''
            : typeof v === 'object' && 'text' in (v as any)
              ? String((v as any).text)
              : String(v);
        maxLength = Math.max(maxLength, Math.min(max, text.length + 2));
      });
      column.width = maxLength;
    });
  }

  async exportToExcel(data: any[], sheetName = 'Sheet1'): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NEXARA';
    workbook.lastModifiedBy = 'NEXARA';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet(sheetName);

    const keys = data.length > 0 ? Array.from(new Set(data.flatMap((item) => Object.keys(item ?? {})))) : [];

    if (keys.length > 0) {
      worksheet.columns = keys.map((key) => ({ header: this.prettifyHeader(key), key }));

      const titleRow = worksheet.getRow(1);
      titleRow.getCell(1).value = `${sheetName.toUpperCase()} - REPORTE`;
      titleRow.height = 26;
      titleRow.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleRow.alignment = { vertical: 'middle', horizontal: 'left' };
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelExportService.TITLE_FILL } };
      if (keys.length > 1) {
        worksheet.mergeCells(1, 1, 1, keys.length);
      }

      const metaRow = worksheet.getRow(2);
      metaRow.getCell(1).value = `Generado: ${new Date().toLocaleString('es-MX')}`;
      metaRow.height = 20;
      metaRow.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
      metaRow.alignment = { vertical: 'middle', horizontal: 'left' };
      metaRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelExportService.META_FILL } };
      if (keys.length > 1) {
        worksheet.mergeCells(2, 1, 2, keys.length);
      }

      // Spacer row for cleaner presentation.
      worksheet.getRow(3).height = 8;

      const headerRowIndex = 4;
      const dataStartRow = 5;

      const headerRow = worksheet.getRow(headerRowIndex);
      keys.forEach((key, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = this.prettifyHeader(key);
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelExportService.HEADER_FILL } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      headerRow.height = 24;

      data.forEach((item, idx) => {
        const rowValues = keys.map((key) => this.normalizeValue(item?.[key]));
        const row = worksheet.getRow(dataStartRow + idx);
        rowValues.forEach((value, valueIndex) => {
          row.getCell(valueIndex + 1).value = value as ExcelJS.CellValue;
        });

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = keys[colNumber - 1];
          const value = rowValues[colNumber - 1];

          cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }

          if (this.isDateLike(value, key)) {
            const dateVal = value instanceof Date ? value : new Date(String(value));
            if (!Number.isNaN(dateVal.getTime())) {
              cell.value = dateVal;
              cell.numFmt = 'dd/mm/yyyy hh:mm';
            }
          } else if (this.isCurrencyLike(key) && typeof value === 'number') {
            cell.numFmt = '"$"#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (typeof value === 'number') {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });
      });

      worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: keys.length },
      };
      worksheet.views = [{ state: 'frozen', ySplit: dataStartRow - 1 }];
      worksheet.properties.defaultRowHeight = 20;

      this.autoFitColumns(worksheet);
    } else {
      worksheet.getCell('A1').value = 'Sin datos para exportar';
      worksheet.getCell('A1').font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF475569' } };
      worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      worksheet.getColumn(1).width = 28;
    }

    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
}
