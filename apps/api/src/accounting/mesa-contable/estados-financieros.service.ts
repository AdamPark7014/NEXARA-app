import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { diaMexico } from './por-facturar.js';
import { PagosGastosService } from './pagos-gastos.service.js';
import {
  armarBalance,
  armarEstadoResultados,
  etiquetaCorte,
  mesCorto,
  rangosPeriodo,
  resultadoDe,
  type SaldoCuenta,
} from './estados-financieros.js';

const dia = (ymd: string, fin = false) => new Date(`${ymd}T${fin ? '23:59:59.999' : '00:00:00.000'}Z`);

@Injectable()
export class EstadosFinancierosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagosGastos: PagosGastosService,
  ) {}

  /** Saldos por cuenta de las pólizas contabilizadas en el rango (`from` null = desde siempre). */
  async saldos(tenantId: number, from: string | null, to: string): Promise<SaldoCuenta[]> {
    const [grupos, cuentas] = await Promise.all([
      this.prisma.journalEntryLine.groupBy({
        by: ['debitAccountId'],
        where: {
          journalEntry: {
            companyId: tenantId,
            status: 'POSTED',
            date: { ...(from ? { gte: dia(from) } : {}), lte: dia(to, true) },
          },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.account.findMany({
        where: { companyId: tenantId },
        select: { id: true, code: true, name: true, type: true, satAgrupador: true },
      }),
    ]);
    const porId = new Map(cuentas.map((c) => [c.id, c]));
    return grupos
      .map((g): SaldoCuenta | null => {
        const c = porId.get(g.debitAccountId);
        if (!c) return null;
        return {
          cuentaId: c.id,
          codigo: c.code,
          nombre: c.name,
          tipo: c.type,
          agrupador: c.satAgrupador?.trim() || null,
          debe: Number(g._sum.debit ?? 0),
          haber: Number(g._sum.credit ?? 0),
        };
      })
      .filter((x): x is SaldoCuenta => x != null);
  }

  private async mesAbierto(tenantId: number, from: string, to: string): Promise<boolean> {
    const cerrado = await this.prisma.fiscalPeriod.findFirst({
      where: { companyId: tenantId, isClosed: true, startDate: { lte: dia(from) }, endDate: { gte: dia(to) } },
      select: { id: true },
    });
    return !cerrado;
  }

  async resultados(companyId: number | null | undefined, periodo?: string, fecha?: string) {
    const tenantId = requireCompanyId(companyId);
    const hoy = diaMexico(new Date());
    const { actual, anterior } = rangosPeriodo(periodo, fecha, hoy);
    const [sAct, sAnt] = await Promise.all([this.saldos(tenantId, actual.from, actual.to), this.saldos(tenantId, anterior.from, anterior.to)]);
    const er = armarEstadoResultados(sAct, sAnt);

    // Margen neto de los últimos cuatro meses hasta el del periodo.
    const ultimoMes = actual.to.slice(0, 7);
    const meses: string[] = [];
    for (let i = 3; i >= 0; i -= 1) {
      const [y, m] = ultimoMes.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    const margenes = await Promise.all(
      meses.map(async (mes) => {
        const r = rangosPeriodo('mes', mes, hoy).actual;
        const e = armarEstadoResultados(await this.saldos(tenantId, r.from, r.to), []);
        return {
          mes: mesCorto(r.from),
          pct: e.ingresos.actual > 0 ? Math.round((e.utilidadNeta.actual / e.ingresos.actual) * 1000) / 10 : null,
          actual: mes === ultimoMes,
        };
      }),
    );

    const pg = await this.pagosGastos.listar(tenantId, { mes: ultimoMes });
    const lineas = await this.prisma.journalEntryLine.aggregate({
      where: { journalEntry: { companyId: tenantId, status: 'POSTED', date: { gte: dia(actual.from), lte: dia(actual.to, true) } } },
      _sum: { debit: true, credit: true },
    });

    const margen = (v: number) => (er.ingresos.actual > 0 ? Math.round((v / er.ingresos.actual) * 1000) / 10 : null);
    const varPct = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);
    return {
      periodo: actual,
      comparado: anterior,
      mesAbierto: await this.mesAbierto(tenantId, actual.from, actual.to),
      cifras: {
        ingresos: er.ingresos.actual,
        ingresosVar: varPct(er.ingresos.actual, er.ingresos.anterior),
        utilidadBruta: er.utilidadBruta.actual,
        margenBruto: margen(er.utilidadBruta.actual),
        utilidadOperacion: er.utilidadOperacion.actual,
        margenOperacion: margen(er.utilidadOperacion.actual),
        utilidadOperacionVar: varPct(er.utilidadOperacion.actual, er.utilidadOperacion.anterior),
        utilidadNeta: er.utilidadNeta.actual,
        margenNeto: margen(er.utilidadNeta.actual),
      },
      secciones: er.secciones,
      utilidadNeta: er.utilidadNeta,
      margenes,
      cierre: {
        sinPoliza: pg.resumen.sinPoliza.conteo,
        sinAgrupador: sAct.filter((x) => !x.agrupador && (x.debe || x.haber)).length,
        porConciliar: pg.resumen.porConciliar.conteo,
        polizasCuadradas: Math.abs(Number(lineas._sum.debit ?? 0) - Number(lineas._sum.credit ?? 0)) < 0.01,
      },
    };
  }

  async balance(companyId: number | null | undefined, fecha?: string) {
    const tenantId = requireCompanyId(companyId);
    const hoy = diaMexico(new Date());
    const corte = rangosPeriodo('mes', fecha, hoy).actual;
    const anio = corte.to.slice(0, 4);
    const inicioEjercicio = `${anio}-01-01`;
    const antesDelEjercicio = `${Number(anio) - 1}-12-31`;

    const [acumulado, delEjercicio, anteriores, delMes] = await Promise.all([
      this.saldos(tenantId, null, corte.to),
      this.saldos(tenantId, inicioEjercicio, corte.to),
      this.saldos(tenantId, null, antesDelEjercicio),
      this.saldos(tenantId, corte.from, corte.to),
    ]);
    const ventasMes = armarEstadoResultados(delMes, []).ingresos.actual;
    const dias = Number(corte.to.slice(8, 10));
    const b = armarBalance(
      acumulado.filter((s) => s.tipo === 'ASSET' || s.tipo === 'LIABILITY' || s.tipo === 'EQUITY'),
      resultadoDe(delEjercicio),
      resultadoDe(anteriores),
      ventasMes,
      dias,
    );
    return {
      fecha: corte.to,
      etiqueta: etiquetaCorte(corte.to),
      mesAbierto: await this.mesAbierto(tenantId, corte.from, corte.to),
      ...b,
    };
  }

  /** Libro con tres hojas: estado de resultados, balance general y balanza, con fórmulas en los totales. */
  async excel(companyId: number | null | undefined, periodo?: string, fecha?: string): Promise<{ buffer: Buffer; nombre: string }> {
    const tenantId = requireCompanyId(companyId);
    const er = await this.resultados(tenantId, periodo, fecha);
    const bg = await this.balance(tenantId, er.periodo.to.slice(0, 7));
    const balanza = await this.saldos(tenantId, er.periodo.from, er.periodo.to);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'NEXARA Core · Mesa contable';
    libro.created = new Date();
    const moneda = '#,##0.00;[Red]-#,##0.00';
    const verde = 'FF168570';
    const encabezado = (ws: ExcelJS.Worksheet, titulo: string, sub: string, columnas: string[]) => {
      ws.addRow([titulo]).font = { bold: true, size: 14 };
      ws.addRow([sub]).font = { color: { argb: 'FF5B6272' } };
      ws.addRow([]);
      const h = ws.addRow(columnas);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: verde } }));
    };

    // ── Estado de resultados ──
    const ws1 = libro.addWorksheet('Estado de resultados');
    ws1.columns = [{ width: 44 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 12 }];
    encabezado(ws1, 'Estado de resultados', `${er.periodo.etiqueta} · comparado con ${er.comparado.etiqueta}`, [
      'Cuenta',
      'Agrupador SAT',
      er.periodo.etiqueta,
      er.comparado.etiqueta,
      'Variación',
    ]);
    const totalesFila: Record<string, number> = {};
    for (const sec of er.secciones) {
      const t = ws1.addRow([sec.titulo]);
      t.font = { bold: true };
      t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
      const primera = ws1.rowCount + 1;
      for (const f of sec.filas) ws1.addRow([`${f.codigo} ${f.nombre}`, f.agrupador ?? 'Sin agrupador', f.actual, f.anterior, null]);
      const ultima = ws1.rowCount;
      const suma = (col: string) => (ultima >= primera ? { formula: `SUM(${col}${primera}:${col}${ultima})` } : 0);
      const filaSuma = ws1.addRow([`Suma de ${sec.titulo.toLowerCase()}`, null, suma('C'), suma('D'), null]);
      filaSuma.font = { italic: true };
      totalesFila[sec.clave] = filaSuma.number;
      if (sec.total) {
        // Total de ingresos = suma; utilidad bruta = ingresos − costos; de operación = bruta − gastos.
        const ref = (col: string) =>
          sec.clave === 'ingresos'
            ? `${col}${totalesFila.ingresos}`
            : sec.clave === 'costos'
              ? `${col}${totalesFila.ingresos}-${col}${totalesFila.costos}`
              : `${col}${totalesFila.ingresos}-${col}${totalesFila.costos}-${col}${totalesFila.gastos}`;
        const tot = ws1.addRow([sec.total.nombre, null, { formula: ref('C') }, { formula: ref('D') }, null]);
        tot.font = { bold: true };
        totalesFila[`total-${sec.clave}`] = tot.number;
      }
    }
    const uo = totalesFila['total-gastos'];
    const fin = totalesFila.financieros;
    const neta = ws1.addRow(['Utilidad neta', null, { formula: `C${uo}+C${fin}` }, { formula: `D${uo}+D${fin}` }, null]);
    neta.font = { bold: true, size: 12 };
    ws1.eachRow((row, n) => {
      if (n <= 4) return;
      row.getCell(3).numFmt = moneda;
      row.getCell(4).numFmt = moneda;
      if (row.getCell(3).value != null && row.getCell(1).value) {
        row.getCell(5).value = { formula: `IF(D${n}=0,"",(C${n}-D${n})/ABS(D${n}))` };
        row.getCell(5).numFmt = '0.0%';
      }
    });

    // ── Balance general ──
    const ws2 = libro.addWorksheet('Balance general');
    ws2.columns = [{ width: 48 }, { width: 14 }, { width: 18 }];
    encabezado(ws2, 'Balance general', bg.etiqueta, ['Cuenta', 'Agrupador SAT', 'Saldo']);
    const lado = (titulo: string, l: typeof bg.activo) => {
      ws2.addRow([titulo]).font = { bold: true, size: 12 };
      const subtotales: number[] = [];
      for (const sec of l.secciones) {
        ws2.addRow([sec.titulo]).font = { bold: true };
        const primera = ws2.rowCount + 1;
        for (const f of sec.filas) ws2.addRow([f.nombre, f.agrupador ?? '', f.saldo]);
        const r = ws2.addRow([`Total ${sec.titulo.toLowerCase()}`, null, { formula: `SUM(C${primera}:C${ws2.rowCount})` }]);
        r.font = { italic: true };
        subtotales.push(r.number);
      }
      const t = ws2.addRow([`Total ${titulo.toLowerCase()}`, null, subtotales.length ? { formula: subtotales.map((n) => `C${n}`).join('+') } : 0]);
      t.font = { bold: true };
      ws2.addRow([]);
      return t.number;
    };
    const fa = lado('Activo', bg.activo);
    const fp = lado('Pasivo', bg.pasivo);
    const fc = lado('Capital', bg.capital);
    const cheque = ws2.addRow(['Activo − (pasivo + capital)', null, { formula: `C${fa}-(C${fp}+C${fc})` }]);
    cheque.font = { bold: true };
    ws2.eachRow((row, n) => {
      if (n > 4) row.getCell(3).numFmt = moneda;
    });

    // ── Balanza ──
    const ws3 = libro.addWorksheet('Balanza');
    ws3.columns = [{ width: 12 }, { width: 40 }, { width: 14 }, { width: 18 }, { width: 18 }];
    encabezado(ws3, 'Balanza de comprobación', er.periodo.etiqueta, ['Cuenta', 'Nombre', 'Agrupador SAT', 'Cargos', 'Abonos']);
    const primeraB = ws3.rowCount + 1;
    for (const x of [...balanza].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
      ws3.addRow([x.codigo, x.nombre, x.agrupador ?? 'Sin agrupador', x.debe, x.haber]);
    }
    const ultimaB = ws3.rowCount;
    const tb = ws3.addRow([
      null,
      'Sumas iguales',
      null,
      ultimaB >= primeraB ? { formula: `SUM(D${primeraB}:D${ultimaB})` } : 0,
      ultimaB >= primeraB ? { formula: `SUM(E${primeraB}:E${ultimaB})` } : 0,
    ]);
    tb.font = { bold: true };
    ws3.eachRow((row, n) => {
      if (n > 4) {
        row.getCell(4).numFmt = moneda;
        row.getCell(5).numFmt = moneda;
      }
    });

    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const nombre = `estados-financieros-${er.periodo.from.slice(0, 7)}.xlsx`;
    return { buffer, nombre };
  }
}
