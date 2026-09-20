import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountingService } from './accounting.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

/**
 * NEXARA · Motor de reportes del hub Contadora (`/erp/contabilidad/reportes`).
 *
 * Aquí **no** se calcula contabilidad nueva: los motores viven en
 * `AccountingService` (`getIncomeStatement`, `getTrialBalance`, `getBalanceSheet`,
 * `getBudgetVsActual`). Este servicio hace tres cosas:
 *
 *  1. Publicar un **catálogo de reportes como dato** — id, filtros que acepta y
 *     opciones reales de esos filtros. El frontend no vuelve a traer una lista
 *     escrita a mano.
 *  2. Ejecutar cada reporte con una forma de salida común (columnas + filas +
 *     totales) para que una sola tabla del panel sirva para todos.
 *  3. Dar el detalle (drill-down) de una línea: las transacciones que la forman.
 *
 * Aislamiento por empresa: **toda** consulta pasa por `requireCompanyId` +
 * `companyWhere`. Hubo un incidente de datos cruzados entre usuarios; sin
 * empresa activa, `companyWhere` devuelve deny-all, nunca `{}`.
 */

export type TipoColumna = 'texto' | 'moneda' | 'numero' | 'porcentaje' | 'fecha';

export type ColumnaReporte = {
  clave: string;
  etiqueta: string;
  tipo: TipoColumna;
  alineacion?: 'left' | 'right';
};

export type FiltroReporte = {
  clave: string;
  etiqueta: string;
  tipo: 'fecha' | 'seleccion';
  requerido: boolean;
  opciones?: Array<{ valor: string; etiqueta: string }>;
};

export type DefinicionReporte = {
  id: string;
  nombre: string;
  descripcion: string;
  filtros: FiltroReporte[];
  exportable: boolean;
  /** Admite comparación contra el periodo inmediato anterior. */
  comparable: boolean;
  /** Columna de dinero sobre la que se compara (null ⇒ no comparable). */
  columnaComparable: string | null;
  /** Cada fila puede abrirse para ver las transacciones que la forman. */
  drilldown: boolean;
  /**
   * `false` ⇒ el reporte **no se publica**. Se deja registrado con su motivo en
   * vez de borrarlo, para que se vea que falta el dato, no el reporte.
   */
  disponible: boolean;
  motivoNoDisponible?: string;
};

export type FilaReporte = Record<string, string | number | null> & { clave: string };

export type ResultadoReporte = {
  id: string;
  nombre: string;
  descripcion: string;
  periodo: { from: string | null; to: string | null; asOf: string | null };
  columnas: ColumnaReporte[];
  filas: FilaReporte[];
  /** Totales por clave de columna; se pintan en el pie de la tabla. */
  totales: Record<string, number> | null;
  resumen: Array<{ etiqueta: string; valor: number; tipo: TipoColumna }>;
  drilldown: boolean;
  /** Presente solo si se pidió comparar y el reporte lo soporta. */
  comparativo: {
    periodo: { from: string; to: string };
    columnaComparada: string;
  } | null;
  nota: string | null;
};

export type DetalleReporte = {
  reporteId: string;
  clave: string;
  etiqueta: string;
  columnas: ColumnaReporte[];
  filas: FilaReporte[];
  total: number;
};

type Filtros = {
  from?: string;
  to?: string;
  asOf?: string;
  costCenterId?: number;
  projectId?: number;
  categoria?: string;
  periodId?: number;
  comparar?: boolean;
};

const COL_ANTERIOR = '_anterior';
const COL_VARIACION = '_variacion';

const FILTRO_DESDE: FiltroReporte = { clave: 'from', etiqueta: 'Desde', tipo: 'fecha', requerido: false };
const FILTRO_HASTA: FiltroReporte = { clave: 'to', etiqueta: 'Hasta', tipo: 'fecha', requerido: false };
const FILTRO_CORTE: FiltroReporte = { clave: 'asOf', etiqueta: 'Al corte', tipo: 'fecha', requerido: false };

/**
 * Registro de reportes. `disponible: false` deja constancia de lo que se pidió
 * pero la base no puede sostener; el catálogo los filtra.
 */
const REGISTRO: DefinicionReporte[] = [
  {
    id: 'estado-resultados',
    nombre: 'Estado de resultados',
    descripcion: 'Ingresos menos gastos del periodo, cuenta por cuenta, sobre pólizas contabilizadas.',
    filtros: [FILTRO_DESDE, FILTRO_HASTA],
    exportable: true,
    comparable: true,
    columnaComparable: 'importe',
    drilldown: true,
    disponible: true,
  },
  {
    id: 'balanza-comprobacion',
    nombre: 'Balanza de comprobación',
    descripcion: 'Cargos y abonos acumulados por cuenta. Opcionalmente acotada a un periodo fiscal.',
    filtros: [{ clave: 'periodId', etiqueta: 'Periodo fiscal', tipo: 'seleccion', requerido: false }],
    exportable: true,
    comparable: false,
    columnaComparable: null,
    drilldown: true,
    disponible: true,
  },
  {
    id: 'balance-general',
    nombre: 'Balance general',
    descripcion: 'Activo, pasivo y capital a una fecha de corte, con la comprobación del cuadre.',
    filtros: [FILTRO_CORTE],
    exportable: true,
    comparable: false,
    columnaComparable: null,
    drilldown: true,
    disponible: true,
  },
  {
    id: 'flujo-efectivo',
    nombre: 'Flujo de efectivo',
    descripcion: 'Entradas y salidas de dinero del periodo, mes a mes: cobros, pagos a proveedores, gastos y nómina.',
    filtros: [FILTRO_DESDE, FILTRO_HASTA],
    exportable: true,
    // Sin comparación contra el periodo anterior: la fila es un mes concreto y
    // los meses del periodo previo nunca casan con los de este. La evolución ya
    // se lee dentro de la propia tabla.
    comparable: false,
    columnaComparable: null,
    drilldown: true,
    disponible: true,
  },
  {
    id: 'gastos-categoria',
    nombre: 'Gastos por categoría',
    descripcion: 'Cuánto se gastó en cada categoría dentro del periodo, sin contar los rechazados.',
    filtros: [
      FILTRO_DESDE,
      FILTRO_HASTA,
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'seleccion', requerido: false },
    ],
    exportable: true,
    comparable: true,
    columnaComparable: 'importe',
    drilldown: true,
    disponible: true,
  },
  {
    id: 'gastos-proyecto',
    nombre: 'Gastos por proyecto',
    descripcion: 'Gastos del periodo agrupados por el proyecto de la actividad que los originó.',
    filtros: [
      FILTRO_DESDE,
      FILTRO_HASTA,
      { clave: 'projectId', etiqueta: 'Proyecto', tipo: 'seleccion', requerido: false },
    ],
    exportable: true,
    comparable: true,
    columnaComparable: 'importe',
    drilldown: true,
    disponible: true,
  },
  {
    id: 'aging-cxc',
    nombre: 'Antigüedad de saldos por cobrar',
    descripcion: 'Lo que deben los clientes repartido por días de atraso, a la fecha de corte.',
    filtros: [FILTRO_CORTE],
    exportable: true,
    comparable: false,
    columnaComparable: null,
    drilldown: true,
    disponible: true,
  },
  {
    id: 'aging-cxp',
    nombre: 'Antigüedad de saldos por pagar',
    descripcion: 'Lo que se debe a proveedores repartido por días de atraso, a la fecha de corte.',
    filtros: [FILTRO_CORTE],
    exportable: true,
    comparable: false,
    columnaComparable: null,
    drilldown: true,
    disponible: true,
  },
  // ── No publicados: falta el dato, no el reporte ────────────────────
  {
    id: 'flujo-efectivo-proyectado',
    nombre: 'Flujo de efectivo proyectado',
    descripcion: 'Entradas y salidas esperadas de las próximas semanas.',
    filtros: [FILTRO_DESDE, FILTRO_HASTA],
    exportable: false,
    comparable: false,
    columnaComparable: null,
    drilldown: false,
    disponible: false,
    motivoNoDisponible:
      'No hay compromisos de pago con fecha programada en la base: solo existen facturas ya emitidas. Proyectar sería inventar.',
  },
  {
    id: 'presupuesto-por-proyecto',
    nombre: 'Presupuesto por proyecto',
    descripcion: 'Presupuesto contra real por proyecto operativo.',
    filtros: [FILTRO_DESDE, FILTRO_HASTA],
    exportable: false,
    comparable: false,
    columnaComparable: null,
    drilldown: false,
    disponible: false,
    motivoNoDisponible:
      'Budget solo se liga a centro de costo (no tiene projectId). El comparativo por proyecto exigiría una migración de esquema.',
  },
];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const isoDay = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

@Injectable()
export class AccountingWorkspaceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  // ── Catálogo ───────────────────────────────────────────────────────

  /** Reportes publicables, con las opciones reales de cada filtro de selección. */
  async getCatalogo(companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const publicables = REGISTRO.filter((r) => r.disponible);

    const necesita = (clave: string) =>
      publicables.some((r) => r.filtros.some((f) => f.clave === clave));

    const [periodos, categorias, proyectos] = await Promise.all([
      necesita('periodId')
        ? this.prisma.fiscalPeriod.findMany({
            where: { ...companyWhere(tenantId) },
            orderBy: { startDate: 'desc' },
            take: 36,
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      necesita('categoria')
        ? this.prisma.expense.findMany({
            where: { deletedAt: null, ...companyWhere(tenantId) },
            distinct: ['categoria'],
            select: { categoria: true },
            take: 60,
          })
        : Promise.resolve([]),
      necesita('projectId')
        ? this.prisma.operationalProject.findMany({
            where: { deletedAt: null, ...companyWhere(tenantId) },
            orderBy: { startDate: 'desc' },
            take: 200,
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const opcionesPorClave: Record<string, Array<{ valor: string; etiqueta: string }>> = {
      periodId: periodos.map((p) => ({ valor: String(p.id), etiqueta: p.name })),
      categoria: categorias
        .map((c) => c.categoria)
        .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((c) => ({ valor: c, etiqueta: c })),
      projectId: proyectos.map((p) => ({ valor: String(p.id), etiqueta: p.title })),
    };

    return {
      reportes: publicables.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        exportable: r.exportable,
        comparable: r.comparable,
        drilldown: r.drilldown,
        filtros: r.filtros.map((f) =>
          f.tipo === 'seleccion' ? { ...f, opciones: opcionesPorClave[f.clave] ?? [] } : { ...f },
        ),
      })),
    };
  }

  /** Solo para pruebas y para el propio guardarraíl del catálogo. */
  static definicion(id: string): DefinicionReporte | undefined {
    return REGISTRO.find((r) => r.id === id);
  }

  static idsPublicados(): string[] {
    return REGISTRO.filter((r) => r.disponible).map((r) => r.id);
  }

  // ── Ejecución ──────────────────────────────────────────────────────

  async ejecutar(id: string, filtros: Filtros, companyId: number | null): Promise<ResultadoReporte> {
    const tenantId = requireCompanyId(companyId);
    const def = REGISTRO.find((r) => r.id === id);
    if (!def || !def.disponible) {
      throw new NotFoundException(`El reporte "${id}" no existe o no está disponible`);
    }

    const { from, to } = this.rangoPeriodo(filtros.from, filtros.to);
    const asOf = this.fechaCorte(filtros.asOf);
    const base = await this.correrUno(def, { ...filtros, from, to, asOf: isoDay(asOf) }, tenantId);

    const resultado: ResultadoReporte = {
      id: def.id,
      nombre: def.nombre,
      descripcion: def.descripcion,
      periodo: {
        from: def.filtros.some((f) => f.clave === 'from') ? from : null,
        to: def.filtros.some((f) => f.clave === 'to') ? to : null,
        asOf: def.filtros.some((f) => f.clave === 'asOf') ? isoDay(asOf) : null,
      },
      columnas: base.columnas,
      filas: base.filas,
      totales: base.totales,
      resumen: base.resumen,
      drilldown: def.drilldown,
      comparativo: null,
      nota: base.nota ?? null,
    };

    if (filtros.comparar && def.comparable && def.columnaComparable) {
      const anterior = this.rangoAnterior(from, to);
      const previo = await this.correrUno(
        def,
        { ...filtros, from: anterior.from, to: anterior.to, asOf: isoDay(asOf) },
        tenantId,
      );
      const col = def.columnaComparable;
      const previoPorClave = new Map<string, number>(
        previo.filas.map((f) => [f.clave, num(f[col])]),
      );
      resultado.filas = base.filas.map((f) => {
        const ant = previoPorClave.get(f.clave) ?? 0;
        previoPorClave.delete(f.clave);
        return { ...f, [COL_ANTERIOR]: round2(ant), [COL_VARIACION]: round2(num(f[col]) - ant) };
      });
      // Filas que existían antes y desaparecieron: se muestran en cero, no se ocultan.
      for (const [clave, valor] of previoPorClave) {
        const fuente = previo.filas.find((f) => f.clave === clave);
        if (!fuente) continue;
        const vacia: FilaReporte = { ...fuente };
        for (const c of base.columnas) {
          if (c.tipo === 'moneda' || c.tipo === 'numero' || c.tipo === 'porcentaje') vacia[c.clave] = 0;
        }
        resultado.filas.push({ ...vacia, [COL_ANTERIOR]: round2(valor), [COL_VARIACION]: round2(-valor) });
      }
      resultado.columnas = [
        ...base.columnas,
        { clave: COL_ANTERIOR, etiqueta: 'Periodo anterior', tipo: 'moneda', alineacion: 'right' },
        { clave: COL_VARIACION, etiqueta: 'Variación', tipo: 'moneda', alineacion: 'right' },
      ];
      if (resultado.totales) {
        const totalAnt = num(previo.totales?.[col]);
        resultado.totales = {
          ...resultado.totales,
          [COL_ANTERIOR]: round2(totalAnt),
          [COL_VARIACION]: round2(num(resultado.totales[col]) - totalAnt),
        };
      }
      resultado.comparativo = { periodo: anterior, columnaComparada: col };
    }

    return resultado;
  }

  private correrUno(
    def: DefinicionReporte,
    f: Filtros & { from: string; to: string; asOf: string },
    tenantId: number,
  ): Promise<{
    columnas: ColumnaReporte[];
    filas: FilaReporte[];
    totales: Record<string, number> | null;
    resumen: Array<{ etiqueta: string; valor: number; tipo: TipoColumna }>;
    nota?: string | null;
  }> {
    switch (def.id) {
      case 'estado-resultados':
        return this.repEstadoResultados(f, tenantId);
      case 'balanza-comprobacion':
        return this.repBalanza(f, tenantId);
      case 'balance-general':
        return this.repBalanceGeneral(f, tenantId);
      case 'flujo-efectivo':
        return this.repFlujoEfectivo(f, tenantId);
      case 'gastos-categoria':
        return this.repGastosCategoria(f, tenantId);
      case 'gastos-proyecto':
        return this.repGastosProyecto(f, tenantId);
      case 'aging-cxc':
        return this.repAging('ACCOUNTS_RECEIVABLE', f, tenantId);
      case 'aging-cxp':
        return this.repAging('ACCOUNTS_PAYABLE', f, tenantId);
      default:
        // Guardarraíl: si algo entra al catálogo sin ejecutor, se nota aquí y no
        // en producción con una tabla vacía.
        throw new NotFoundException(`El reporte "${def.id}" no tiene ejecutor`);
    }
  }

  // ── Reportes ───────────────────────────────────────────────────────

  /** Reutiliza `AccountingService.getIncomeStatement`. Gastos en negativo para que la columna sume la utilidad. */
  private async repEstadoResultados(f: { from: string; to: string }, tenantId: number) {
    const er = await this.accounting.getIncomeStatement(f.from, f.to, tenantId);
    const filas: FilaReporte[] = [
      ...er.revenue.map((r) => ({
        clave: `cuenta:${r.code}`,
        grupo: 'Ingresos',
        codigo: r.code,
        nombre: r.name,
        importe: round2(r.amount),
      })),
      ...er.expenses.map((r) => ({
        clave: `cuenta:${r.code}`,
        grupo: 'Gastos',
        codigo: r.code,
        nombre: r.name,
        importe: round2(-Math.abs(r.amount)),
      })),
    ];
    return {
      columnas: [
        { clave: 'grupo', etiqueta: 'Grupo', tipo: 'texto' as TipoColumna },
        { clave: 'codigo', etiqueta: 'Cuenta', tipo: 'texto' as TipoColumna },
        { clave: 'nombre', etiqueta: 'Concepto', tipo: 'texto' as TipoColumna },
        { clave: 'importe', etiqueta: 'Importe', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: { importe: round2(er.netIncome) },
      resumen: [
        { etiqueta: 'Ingresos', valor: round2(er.totalRevenue), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Gastos', valor: round2(er.totalExpenses), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Utilidad', valor: round2(er.netIncome), tipo: 'moneda' as TipoColumna },
      ],
      nota: 'Los gastos se muestran en negativo: la columna suma la utilidad del periodo.',
    };
  }

  /** Reutiliza `AccountingService.getTrialBalance`. */
  private async repBalanza(f: { periodId?: number }, tenantId: number) {
    const filas0 = await this.accounting.getTrialBalance(f.periodId, tenantId);
    const filas: FilaReporte[] = filas0.map((r) => ({
      clave: `cuenta:${r.code}`,
      codigo: r.code,
      nombre: r.name,
      tipo: r.type,
      debe: round2(r.debit),
      haber: round2(r.credit),
      saldo: round2(r.debit - r.credit),
    }));
    const totalDebe = round2(filas.reduce((s, r) => s + num(r.debe), 0));
    const totalHaber = round2(filas.reduce((s, r) => s + num(r.haber), 0));
    return {
      columnas: [
        { clave: 'codigo', etiqueta: 'Cuenta', tipo: 'texto' as TipoColumna },
        { clave: 'nombre', etiqueta: 'Concepto', tipo: 'texto' as TipoColumna },
        { clave: 'tipo', etiqueta: 'Naturaleza', tipo: 'texto' as TipoColumna },
        { clave: 'debe', etiqueta: 'Debe', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'haber', etiqueta: 'Haber', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: { debe: totalDebe, haber: totalHaber, saldo: round2(totalDebe - totalHaber) },
      resumen: [
        { etiqueta: 'Debe', valor: totalDebe, tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Haber', valor: totalHaber, tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Diferencia', valor: round2(totalDebe - totalHaber), tipo: 'moneda' as TipoColumna },
      ],
      nota:
        Math.abs(totalDebe - totalHaber) < 0.01
          ? null
          : 'La balanza no cuadra: revisa las pólizas contabilizadas del periodo.',
    };
  }

  /** Reutiliza `AccountingService.getBalanceSheet`. */
  private async repBalanceGeneral(f: { asOf: string }, tenantId: number) {
    const bg = await this.accounting.getBalanceSheet(f.asOf, tenantId);
    const fila = (grupo: string) => (r: { code: string; name: string; balance: number }) => ({
      clave: `cuenta:${r.code}`,
      grupo,
      codigo: r.code,
      nombre: r.name,
      saldo: round2(r.balance),
    });
    const filas: FilaReporte[] = [
      ...bg.assets.map(fila('Activo')),
      ...bg.liabilities.map(fila('Pasivo')),
      ...bg.equity.map(fila('Capital')),
    ];
    return {
      columnas: [
        { clave: 'grupo', etiqueta: 'Grupo', tipo: 'texto' as TipoColumna },
        { clave: 'codigo', etiqueta: 'Cuenta', tipo: 'texto' as TipoColumna },
        { clave: 'nombre', etiqueta: 'Concepto', tipo: 'texto' as TipoColumna },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: null,
      resumen: [
        { etiqueta: 'Activo', valor: round2(bg.totalAssets), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Pasivo', valor: round2(bg.totalLiabilities), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Capital', valor: round2(bg.totalEquity), tipo: 'moneda' as TipoColumna },
      ],
      nota: bg.balanceCheck ? null : 'Activo ≠ Pasivo + Capital. El balance no cuadra a esa fecha de corte.',
    };
  }

  /**
   * Dinero que entró y salió de verdad en el periodo, mes a mes.
   * Entradas: cobros de facturas por cobrar. Salidas: pagos a proveedores,
   * gastos marcados como pagados y pagos a empleados.
   */
  private async repFlujoEfectivo(f: { from: string; to: string }, tenantId: number) {
    const { desde, hasta } = this.limites(f.from, f.to);
    // `paymentDate` es `@db.Date`: su rango va en UTC o se pierde el día 1.
    const pagoRango = this.limitesUtc(f.from, f.to);
    const [pagosFactura, gastos, nomina] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          paymentDate: { gte: pagoRango.desde, lte: pagoRango.hasta },
          ...companyWhere(tenantId),
        },
        select: { amount: true, paymentDate: true, invoice: { select: { type: true } } },
      }),
      this.prisma.expense.findMany({
        where: {
          deletedAt: null,
          estatusPago: 'Pagado',
          ...this.rangoGasto(desde, hasta),
          ...companyWhere(tenantId),
        },
        select: { montoSolicitado: true, fechaGasto: true, fechaSolicitud: true },
      }),
      this.prisma.employeePayment.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ['Anulado', 'ANULADO', 'anulado', 'Borrador', 'DRAFT', 'borrador', 'draft'] },
          paidAt: { gte: desde, lte: hasta },
          ...companyWhere(tenantId),
        },
        select: { amount: true, paidAt: true },
      }),
    ]);

    type Cubo = { cobros: number; proveedores: number; gastos: number; nomina: number };
    const meses = this.mesesDelRango(desde, hasta);
    const cubos = new Map<string, Cubo>(
      meses.map((m) => [m.clave, { cobros: 0, proveedores: 0, gastos: 0, nomina: 0 }]),
    );
    const cubo = (d: Date | null | undefined): Cubo | null => {
      if (!d) return null;
      return cubos.get(this.claveMes(d)) ?? null;
    };

    for (const p of pagosFactura) {
      const c = cubo(p.paymentDate);
      if (!c) continue;
      if (p.invoice?.type === 'ACCOUNTS_RECEIVABLE') c.cobros += num(p.amount);
      else c.proveedores += num(p.amount);
    }
    for (const g of gastos) {
      const c = cubo(g.fechaGasto ?? g.fechaSolicitud);
      if (c) c.gastos += num(g.montoSolicitado);
    }
    for (const n of nomina) {
      const c = cubo(n.paidAt);
      if (c) c.nomina += num(n.amount);
    }

    const filas: FilaReporte[] = meses.map((m) => {
      const c = cubos.get(m.clave)!;
      const entradas = c.cobros;
      const salidas = c.proveedores + c.gastos + c.nomina;
      return {
        clave: `mes:${m.clave}`,
        periodo: m.etiqueta,
        entradas: round2(entradas),
        salidas: round2(salidas),
        neto: round2(entradas - salidas),
      };
    });

    const suma = (k: 'cobros' | 'proveedores' | 'gastos' | 'nomina') =>
      round2(Array.from(cubos.values()).reduce((s, c) => s + c[k], 0));
    const totalEntradas = round2(filas.reduce((s, r) => s + num(r.entradas), 0));
    const totalSalidas = round2(filas.reduce((s, r) => s + num(r.salidas), 0));

    return {
      columnas: [
        { clave: 'periodo', etiqueta: 'Mes', tipo: 'texto' as TipoColumna },
        { clave: 'entradas', etiqueta: 'Entradas', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'salidas', etiqueta: 'Salidas', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'neto', etiqueta: 'Neto', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: {
        entradas: totalEntradas,
        salidas: totalSalidas,
        neto: round2(totalEntradas - totalSalidas),
      },
      resumen: [
        { etiqueta: 'Cobros a clientes', valor: suma('cobros'), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Pagos a proveedores', valor: suma('proveedores'), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Gastos pagados', valor: suma('gastos'), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Nómina pagada', valor: suma('nomina'), tipo: 'moneda' as TipoColumna },
      ],
      nota: 'Solo dinero cobrado y pagado. No incluye facturas emitidas que siguen pendientes.',
    };
  }

  private async repGastosCategoria(f: { from: string; to: string; categoria?: string }, tenantId: number) {
    const { desde, hasta } = this.limites(f.from, f.to);
    const rows = await this.prisma.expense.groupBy({
      by: ['categoria'],
      where: {
        deletedAt: null,
        estatusPago: { not: 'Rechazado' },
        ...(f.categoria ? { categoria: f.categoria } : {}),
        ...this.rangoGasto(desde, hasta),
        ...companyWhere(tenantId),
      },
      _sum: { montoSolicitado: true },
      _count: { _all: true },
    });

    const filas: FilaReporte[] = rows
      .map((r) => ({
        clave: `categoria:${r.categoria ?? ''}`,
        categoria: r.categoria || 'Sin categoría',
        numero: r._count._all,
        importe: round2(num(r._sum.montoSolicitado)),
      }))
      .sort((a, b) => num(b.importe) - num(a.importe));

    const total = round2(filas.reduce((s, r) => s + num(r.importe), 0));
    return {
      columnas: [
        { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto' as TipoColumna },
        { clave: 'numero', etiqueta: 'Gastos', tipo: 'numero' as TipoColumna, alineacion: 'right' as const },
        { clave: 'importe', etiqueta: 'Importe', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: {
        numero: filas.reduce((s, r) => s + num(r.numero), 0),
        importe: total,
      },
      resumen: [{ etiqueta: 'Total gastado', valor: total, tipo: 'moneda' as TipoColumna }],
      nota: 'No incluye gastos rechazados.',
    };
  }

  private async repGastosProyecto(f: { from: string; to: string; projectId?: number }, tenantId: number) {
    const { desde, hasta } = this.limites(f.from, f.to);
    const rows = await this.prisma.expense.findMany({
      where: {
        deletedAt: null,
        estatusPago: { not: 'Rechazado' },
        ...(f.projectId ? { actividad: { projectId: f.projectId } } : {}),
        ...this.rangoGasto(desde, hasta),
        ...companyWhere(tenantId),
      },
      select: {
        montoSolicitado: true,
        actividad: { select: { projectId: true, project: { select: { title: true } } } },
      },
    });

    const acc = new Map<string, { clave: string; proyecto: string; numero: number; importe: number }>();
    for (const r of rows) {
      const pid = r.actividad?.projectId ?? null;
      const clave = pid != null ? `proyecto:${pid}` : 'proyecto:sin';
      const actual =
        acc.get(clave) ??
        {
          clave,
          proyecto: pid != null ? r.actividad?.project?.title || `Proyecto #${pid}` : 'Sin proyecto',
          numero: 0,
          importe: 0,
        };
      actual.numero += 1;
      actual.importe += num(r.montoSolicitado);
      acc.set(clave, actual);
    }

    const filas: FilaReporte[] = Array.from(acc.values())
      .map((r) => ({ ...r, importe: round2(r.importe) }))
      .sort((a, b) => b.importe - a.importe);
    const total = round2(filas.reduce((s, r) => s + num(r.importe), 0));

    return {
      columnas: [
        { clave: 'proyecto', etiqueta: 'Proyecto', tipo: 'texto' as TipoColumna },
        { clave: 'numero', etiqueta: 'Gastos', tipo: 'numero' as TipoColumna, alineacion: 'right' as const },
        { clave: 'importe', etiqueta: 'Importe', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: { numero: filas.reduce((s, r) => s + num(r.numero), 0), importe: total },
      resumen: [{ etiqueta: 'Total gastado', valor: total, tipo: 'moneda' as TipoColumna }],
      nota: 'El proyecto sale de la actividad que originó el gasto. «Sin proyecto» son gastos de actividades sueltas o administrativas.',
    };
  }

  /** Antigüedad de saldos. `tipo` decide si se agrupa por cliente o por proveedor. */
  private async repAging(
    tipo: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE',
    f: { asOf: string },
    tenantId: number,
  ) {
    const corte = this.fechaCorte(f.asOf);
    const facturas = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        type: tipo,
        isCancelled: false,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        ...companyWhere(tenantId),
      },
      select: {
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        clientId: true,
        supplierId: true,
        client: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });

    type Cubo = { clave: string; contraparte: string; porVencer: number; d30: number; d60: number; d90: number; d90mas: number; total: number };
    const acc = new Map<string, Cubo>();
    const dia = 86_400_000;

    for (const inv of facturas) {
      const saldo = num(inv.totalAmount) - num(inv.paidAmount);
      if (saldo <= 0.005) continue;
      const esCxc = tipo === 'ACCOUNTS_RECEIVABLE';
      const id = esCxc ? inv.clientId : inv.supplierId;
      const nombre = esCxc ? inv.client?.name : inv.supplier?.name;
      const clave = id != null ? `contraparte:${id}` : 'contraparte:sin';
      const c =
        acc.get(clave) ??
        {
          clave,
          contraparte: nombre || (esCxc ? 'Cliente sin registrar' : 'Proveedor sin registrar'),
          porVencer: 0,
          d30: 0,
          d60: 0,
          d90: 0,
          d90mas: 0,
          total: 0,
        };
      const atraso = Math.floor((corte.getTime() - new Date(inv.dueDate).getTime()) / dia);
      if (atraso <= 0) c.porVencer += saldo;
      else if (atraso <= 30) c.d30 += saldo;
      else if (atraso <= 60) c.d60 += saldo;
      else if (atraso <= 90) c.d90 += saldo;
      else c.d90mas += saldo;
      c.total += saldo;
      acc.set(clave, c);
    }

    const filas: FilaReporte[] = Array.from(acc.values())
      .map((c) => ({
        clave: c.clave,
        contraparte: c.contraparte,
        porVencer: round2(c.porVencer),
        d30: round2(c.d30),
        d60: round2(c.d60),
        d90: round2(c.d90),
        d90mas: round2(c.d90mas),
        total: round2(c.total),
      }))
      .sort((a, b) => num(b.total) - num(a.total));

    const sumar = (k: string) => round2(filas.reduce((s, r) => s + num(r[k]), 0));
    const vencido = round2(sumar('d30') + sumar('d60') + sumar('d90') + sumar('d90mas'));

    return {
      columnas: [
        {
          clave: 'contraparte',
          etiqueta: tipo === 'ACCOUNTS_RECEIVABLE' ? 'Cliente' : 'Proveedor',
          tipo: 'texto' as TipoColumna,
        },
        { clave: 'porVencer', etiqueta: 'Por vencer', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'd30', etiqueta: '1-30 días', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'd60', etiqueta: '31-60 días', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'd90', etiqueta: '61-90 días', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'd90mas', etiqueta: 'Más de 90', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
        { clave: 'total', etiqueta: 'Saldo', tipo: 'moneda' as TipoColumna, alineacion: 'right' as const },
      ],
      filas,
      totales: {
        porVencer: sumar('porVencer'),
        d30: sumar('d30'),
        d60: sumar('d60'),
        d90: sumar('d90'),
        d90mas: sumar('d90mas'),
        total: sumar('total'),
      },
      resumen: [
        { etiqueta: 'Saldo total', valor: sumar('total'), tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Vencido', valor: vencido, tipo: 'moneda' as TipoColumna },
        { etiqueta: 'Por vencer', valor: sumar('porVencer'), tipo: 'moneda' as TipoColumna },
      ],
      nota: null,
    };
  }

  // ── Drill-down ─────────────────────────────────────────────────────

  /** Transacciones que forman una línea del reporte. */
  async detalle(
    id: string,
    clave: string,
    filtros: Filtros,
    companyId: number | null,
  ): Promise<DetalleReporte> {
    const tenantId = requireCompanyId(companyId);
    const def = REGISTRO.find((r) => r.id === id);
    if (!def || !def.disponible) throw new NotFoundException(`El reporte "${id}" no existe o no está disponible`);
    if (!def.drilldown) throw new BadRequestException(`El reporte "${id}" no tiene detalle por línea`);
    if (!clave || !clave.includes(':')) throw new BadRequestException('Falta la línea a detallar');

    const [tipoClave, valor] = [clave.slice(0, clave.indexOf(':')), clave.slice(clave.indexOf(':') + 1)];
    const { from, to } = this.rangoPeriodo(filtros.from, filtros.to);

    switch (tipoClave) {
      case 'cuenta':
        return this.detalleCuenta(def, valor, { from, to, asOf: filtros.asOf, periodId: filtros.periodId }, tenantId);
      case 'mes':
        return this.detalleMes(def, valor, tenantId);
      case 'categoria':
        // `valor` vacío es la línea «Sin categoría» y debe filtrar por NULL, no
        // dejar pasar todos los gastos. Por eso se conserva la cadena vacía.
        return this.detalleGastos(def, clave, { categoria: valor, projectId: null }, from, to, tenantId);
      case 'proyecto':
        return this.detalleGastos(
          def,
          clave,
          { categoria: null, projectId: valor === 'sin' ? 'sin' : Number(valor) },
          from,
          to,
          tenantId,
        );
      case 'contraparte':
        return this.detalleAging(def, valor, filtros.asOf, tenantId);
      default:
        throw new BadRequestException(`No hay detalle para la línea "${clave}"`);
    }
  }

  private async detalleCuenta(
    def: DefinicionReporte,
    codigo: string,
    f: { from: string; to: string; asOf?: string; periodId?: number },
    tenantId: number,
  ): Promise<DetalleReporte> {
    const cuenta = await this.prisma.account.findFirst({
      where: { code: codigo, ...companyWhere(tenantId) },
      select: { id: true, code: true, name: true },
    });
    if (!cuenta) throw new NotFoundException('Cuenta no encontrada');

    const whereEntry: Record<string, unknown> = { status: 'POSTED', ...companyWhere(tenantId) };
    if (def.id === 'estado-resultados') {
      // `JournalEntry.date` es `@db.Date`.
      const { desde, hasta } = this.limitesUtc(f.from, f.to);
      whereEntry['date'] = { gte: desde, lte: hasta };
    } else if (def.id === 'balance-general' && f.asOf) {
      whereEntry['date'] = { lte: this.fechaCorte(f.asOf) };
    } else if (def.id === 'balanza-comprobacion' && f.periodId) {
      whereEntry['fiscalPeriodId'] = f.periodId;
    }

    const lineas = await this.prisma.journalEntryLine.findMany({
      where: { debitAccountId: cuenta.id, journalEntry: whereEntry },
      include: { journalEntry: { select: { entryNumber: true, date: true, description: true } } },
      orderBy: { id: 'desc' },
      take: 500,
    });

    const filas: FilaReporte[] = lineas.map((l) => ({
      clave: `linea:${l.id}`,
      fecha: isoDay(new Date(l.journalEntry.date)),
      poliza: l.journalEntry.entryNumber,
      concepto: l.description || l.journalEntry.description || '—',
      debe: round2(num(l.debit)),
      haber: round2(num(l.credit)),
      importe: round2(num(l.debit) - num(l.credit)),
    }));

    return {
      reporteId: def.id,
      clave: `cuenta:${codigo}`,
      etiqueta: `${cuenta.code} · ${cuenta.name}`,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { clave: 'poliza', etiqueta: 'Póliza', tipo: 'texto' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'debe', etiqueta: 'Debe', tipo: 'moneda', alineacion: 'right' },
        { clave: 'haber', etiqueta: 'Haber', tipo: 'moneda', alineacion: 'right' },
      ],
      filas,
      total: round2(filas.reduce((s, r) => s + num(r.importe), 0)),
    };
  }

  private async detalleMes(def: DefinicionReporte, claveMes: string, tenantId: number): Promise<DetalleReporte> {
    const [anio, mes] = claveMes.split('-').map((n) => Number(n));
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new BadRequestException('Mes inválido');
    }
    const desde = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
    const hasta = new Date(anio, mes, 0, 23, 59, 59, 999);
    // `paymentDate` es `@db.Date` → el mes se acota en UTC; `fechaGasto` y
    // `paidAt` llevan hora real → esos siguen en hora local.
    const desdeUtc = new Date(Date.UTC(anio, mes - 1, 1));
    const hastaUtc = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));

    const [pagos, gastos, nomina] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paymentDate: { gte: desdeUtc, lte: hastaUtc }, ...companyWhere(tenantId) },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          reference: true,
          invoice: { select: { invoiceNumber: true, type: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 300,
      }),
      this.prisma.expense.findMany({
        where: {
          deletedAt: null,
          estatusPago: 'Pagado',
          ...this.rangoGasto(desde, hasta),
          ...companyWhere(tenantId),
        },
        select: { id: true, montoSolicitado: true, concepto: true, razonGasto: true, fechaGasto: true, fechaSolicitud: true },
        take: 300,
      }),
      this.prisma.employeePayment.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ['Anulado', 'ANULADO', 'anulado', 'Borrador', 'DRAFT', 'borrador', 'draft'] },
          paidAt: { gte: desde, lte: hasta },
          ...companyWhere(tenantId),
        },
        select: { id: true, amount: true, concepto: true, paidAt: true },
        take: 300,
      }),
    ]);

    const filas: FilaReporte[] = [
      ...pagos.map((p) => {
        const entrada = p.invoice?.type === 'ACCOUNTS_RECEIVABLE';
        return {
          clave: `pago:${p.id}`,
          fecha: isoDay(new Date(p.paymentDate)),
          movimiento: entrada ? 'Cobro de cliente' : 'Pago a proveedor',
          concepto: p.invoice?.invoiceNumber || p.reference || '—',
          entradas: entrada ? round2(num(p.amount)) : 0,
          salidas: entrada ? 0 : round2(num(p.amount)),
        };
      }),
      ...gastos.map((g) => ({
        clave: `gasto:${g.id}`,
        fecha: isoDay(new Date(g.fechaGasto ?? g.fechaSolicitud)),
        movimiento: 'Gasto pagado',
        concepto: g.concepto || g.razonGasto || '—',
        entradas: 0,
        salidas: round2(num(g.montoSolicitado)),
      })),
      ...nomina.map((n) => ({
        clave: `nomina:${n.id}`,
        fecha: n.paidAt ? isoDay(new Date(n.paidAt)) : '—',
        movimiento: 'Nómina',
        concepto: n.concepto || 'Pago a empleado',
        entradas: 0,
        salidas: round2(num(n.amount)),
      })),
    ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const entradas = round2(filas.reduce((s, r) => s + num(r.entradas), 0));
    const salidas = round2(filas.reduce((s, r) => s + num(r.salidas), 0));

    return {
      reporteId: def.id,
      clave: `mes:${claveMes}`,
      etiqueta: `${MESES[mes - 1]} ${anio}`,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { clave: 'movimiento', etiqueta: 'Movimiento', tipo: 'texto' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'entradas', etiqueta: 'Entradas', tipo: 'moneda', alineacion: 'right' },
        { clave: 'salidas', etiqueta: 'Salidas', tipo: 'moneda', alineacion: 'right' },
      ],
      filas,
      total: round2(entradas - salidas),
    };
  }

  private async detalleGastos(
    def: DefinicionReporte,
    clave: string,
    sel: { categoria: string | null; projectId: number | 'sin' | null },
    from: string,
    to: string,
    tenantId: number,
  ): Promise<DetalleReporte> {
    const { desde, hasta } = this.limites(from, to);
    const where: Record<string, unknown> = {
      deletedAt: null,
      estatusPago: { not: 'Rechazado' },
      ...this.rangoGasto(desde, hasta),
      ...companyWhere(tenantId),
    };
    if (sel.categoria !== null) where['categoria'] = sel.categoria === '' ? null : sel.categoria;
    if (sel.projectId === 'sin') where['actividad'] = { projectId: null };
    else if (typeof sel.projectId === 'number') {
      if (!Number.isInteger(sel.projectId) || sel.projectId <= 0) throw new BadRequestException('Proyecto inválido');
      where['actividad'] = { projectId: sel.projectId };
    }

    const rows = await this.prisma.expense.findMany({
      where,
      select: {
        id: true,
        montoSolicitado: true,
        concepto: true,
        razonGasto: true,
        categoria: true,
        estatusPago: true,
        fechaGasto: true,
        fechaSolicitud: true,
        actividad: { select: { anNumber: true, titulo: true } },
      },
      orderBy: { id: 'desc' },
      take: 500,
    });

    const filas: FilaReporte[] = rows.map((r) => ({
      clave: `gasto:${r.id}`,
      fecha: isoDay(new Date(r.fechaGasto ?? r.fechaSolicitud)),
      concepto: r.concepto || r.razonGasto || '—',
      categoria: r.categoria || 'Sin categoría',
      actividad: r.actividad ? `${r.actividad.anNumber} · ${r.actividad.titulo}` : '—',
      estatus: r.estatusPago,
      importe: round2(num(r.montoSolicitado)),
    }));

    return {
      reporteId: def.id,
      clave,
      etiqueta:
        sel.categoria !== null
          ? sel.categoria || 'Sin categoría'
          : sel.projectId === 'sin'
            ? 'Sin proyecto'
            : `Proyecto #${sel.projectId}`,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto' },
        { clave: 'actividad', etiqueta: 'Actividad', tipo: 'texto' },
        { clave: 'estatus', etiqueta: 'Estatus', tipo: 'texto' },
        { clave: 'importe', etiqueta: 'Importe', tipo: 'moneda', alineacion: 'right' },
      ],
      filas,
      total: round2(filas.reduce((s, r) => s + num(r.importe), 0)),
    };
  }

  private async detalleAging(
    def: DefinicionReporte,
    valor: string,
    asOf: string | undefined,
    tenantId: number,
  ): Promise<DetalleReporte> {
    const esCxc = def.id === 'aging-cxc';
    const corte = this.fechaCorte(asOf);
    const idContraparte = valor === 'sin' ? null : Number(valor);
    if (idContraparte !== null && (!Number.isInteger(idContraparte) || idContraparte <= 0)) {
      throw new BadRequestException('Contraparte inválida');
    }

    const facturas = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        type: esCxc ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE',
        isCancelled: false,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        ...(esCxc ? { clientId: idContraparte } : { supplierId: idContraparte }),
        ...companyWhere(tenantId),
      },
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        client: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const dia = 86_400_000;
    const filas: FilaReporte[] = facturas
      .map((inv) => {
        const saldo = num(inv.totalAmount) - num(inv.paidAmount);
        const atraso = Math.floor((corte.getTime() - new Date(inv.dueDate).getTime()) / dia);
        return {
          clave: `factura:${inv.id}`,
          folio: inv.invoiceNumber,
          emision: isoDay(new Date(inv.issueDate)),
          vencimiento: isoDay(new Date(inv.dueDate)),
          atraso: atraso > 0 ? atraso : 0,
          saldo: round2(saldo),
        };
      })
      .filter((r) => num(r.saldo) > 0.005);

    const nombre = esCxc ? facturas[0]?.client?.name : facturas[0]?.supplier?.name;

    return {
      reporteId: def.id,
      clave: `contraparte:${valor}`,
      etiqueta: nombre || (esCxc ? 'Cliente sin registrar' : 'Proveedor sin registrar'),
      columnas: [
        { clave: 'folio', etiqueta: 'Factura', tipo: 'texto' },
        { clave: 'emision', etiqueta: 'Emisión', tipo: 'fecha' },
        { clave: 'vencimiento', etiqueta: 'Vence', tipo: 'fecha' },
        { clave: 'atraso', etiqueta: 'Días de atraso', tipo: 'numero', alineacion: 'right' },
        { clave: 'saldo', etiqueta: 'Saldo', tipo: 'moneda', alineacion: 'right' },
      ],
      filas,
      total: round2(filas.reduce((s, r) => s + num(r.saldo), 0)),
    };
  }

  // ── Presupuesto vs real ────────────────────────────────────────────

  /**
   * Comparativo presupuesto / real / variación por línea, reutilizando
   * `AccountingService.getBudgetVsActual` (una llamada por centro de costo y
   * ejercicio con presupuesto dentro del rango).
   *
   * Convención de variación: **positiva = por debajo del presupuesto** (sobra),
   * negativa = pasado de presupuesto. Es la misma que ya usa el motor.
   */
  async comparativoPresupuestos(
    filtros: { from?: string; to?: string; costCenterId?: number },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const { from, to } = this.rangoPeriodo(filtros.from, filtros.to);
    const { desde, hasta } = this.limites(from, to);
    const anioDesde = desde.getFullYear();
    const anioHasta = hasta.getFullYear();

    const combinaciones = await this.prisma.budget.findMany({
      where: {
        year: { gte: anioDesde, lte: anioHasta },
        ...(filtros.costCenterId ? { costCenterId: filtros.costCenterId } : {}),
        ...companyWhere(tenantId),
      },
      distinct: ['costCenterId', 'year'],
      select: { costCenterId: true, year: true },
      orderBy: [{ year: 'asc' }, { costCenterId: 'asc' }],
    });

    const centros = await this.prisma.costCenter.findMany({
      where: { ...companyWhere(tenantId) },
      select: { id: true, code: true, name: true },
    });
    const nombreCentro = new Map(centros.map((c) => [c.id, `${c.code} · ${c.name}`]));

    const lineas: Array<{
      clave: string;
      costCenterId: number;
      centro: string;
      presupuesto: string;
      year: number;
      month: number | null;
      periodo: string;
      planeado: number;
      real: number;
      variacion: number;
      /** null cuando no hay presupuesto contra el que medir: «0 %» mentía. */
      variacionPct: number | null;
    }> = [];

    for (const combo of combinaciones) {
      const filas = await this.accounting.getBudgetVsActual(combo.costCenterId, combo.year, tenantId);
      for (const b of filas) {
        if (!this.dentroDelRango(b.year, b.month, desde, hasta)) continue;
        lineas.push({
          clave: `presupuesto:${b.id}`,
          costCenterId: b.costCenterId,
          centro: nombreCentro.get(b.costCenterId) ?? `Centro #${b.costCenterId}`,
          presupuesto: b.name,
          year: b.year,
          month: b.month ?? null,
          periodo: b.month ? `${MESES[b.month - 1]} ${b.year}` : `Anual ${b.year}`,
          planeado: round2(num(b.plannedAmount)),
          real: round2(num(b.actualAmount)),
          variacion: round2(num(b.variance)),
          // Gastar 50 000 contra un presupuesto de 0 no es «0 % de variación»:
          // en la tabla se leía como «clavado al presupuesto». Sin base, null,
          // igual que `computeMargin` hace con el margen sin ingresos. La web
          // (`<Variacion porcentaje>`) ya oculta el porcentaje cuando es null.
          variacionPct: num(b.plannedAmount) > 0 ? round2(num(b.variancePercent)) : null,
        });
      }
    }

    lineas.sort(
      (a, b) =>
        a.centro.localeCompare(b.centro, 'es') || a.year - b.year || (a.month ?? 0) - (b.month ?? 0),
    );

    const planeado = round2(lineas.reduce((s, l) => s + l.planeado, 0));
    const real = round2(lineas.reduce((s, l) => s + l.real, 0));
    const variacion = round2(planeado - real);

    // Vista por centro de costo: el «por proyecto» que la base sí puede sostener.
    const porCentroMap = new Map<number, { costCenterId: number; centro: string; planeado: number; real: number }>();
    for (const l of lineas) {
      const actual =
        porCentroMap.get(l.costCenterId) ??
        { costCenterId: l.costCenterId, centro: l.centro, planeado: 0, real: 0 };
      actual.planeado += l.planeado;
      actual.real += l.real;
      porCentroMap.set(l.costCenterId, actual);
    }
    const porCentro = Array.from(porCentroMap.values())
      .map((c) => ({
        ...c,
        planeado: round2(c.planeado),
        real: round2(c.real),
        variacion: round2(c.planeado - c.real),
        variacionPct: c.planeado > 0 ? round2(((c.planeado - c.real) / c.planeado) * 100) : null,
      }))
      .sort((a, b) => a.centro.localeCompare(b.centro, 'es'));

    return {
      periodo: { from, to },
      centros: centros.map((c) => ({ id: c.id, etiqueta: `${c.code} · ${c.name}` })),
      lineas,
      porCentro,
      totales: {
        planeado,
        real,
        variacion,
        variacionPct: planeado > 0 ? round2((variacion / planeado) * 100) : null,
      },
      nota:
        'Variación positiva = por debajo del presupuesto. El «real» lo mantiene el motor contable al contabilizar pólizas con centro de costo.',
    };
  }

  /** Pólizas que formaron el «real» de una línea de presupuesto. */
  async detallePresupuesto(
    filtros: { costCenterId: number; year: number; month?: number | null },
    companyId: number | null,
  ): Promise<DetalleReporte> {
    const tenantId = requireCompanyId(companyId);
    if (!Number.isInteger(filtros.costCenterId) || filtros.costCenterId <= 0) {
      throw new BadRequestException('El parámetro "costCenterId" debe ser un entero positivo');
    }
    if (!Number.isInteger(filtros.year) || filtros.year < 2000 || filtros.year > 2100) {
      throw new BadRequestException('El parámetro "year" es inválido');
    }

    const centro = await this.prisma.costCenter.findFirst({
      where: { id: filtros.costCenterId, ...companyWhere(tenantId) },
      select: { id: true, code: true, name: true },
    });
    if (!centro) throw new NotFoundException('Centro de costo no encontrado');

    const mes = filtros.month ?? null;
    // `JournalEntry.date` es `@db.Date` (medianoche UTC): el rango va en UTC o
    // el mes se corre un día por cada lado.
    const desde = mes
      ? new Date(Date.UTC(filtros.year, mes - 1, 1))
      : new Date(Date.UTC(filtros.year, 0, 1));
    const hasta = mes
      ? new Date(Date.UTC(filtros.year, mes, 0, 23, 59, 59, 999))
      : new Date(Date.UTC(filtros.year, 11, 31, 23, 59, 59, 999));

    const lineas = await this.prisma.journalEntryLine.findMany({
      where: {
        costCenterId: centro.id,
        journalEntry: { status: 'POSTED', date: { gte: desde, lte: hasta }, ...companyWhere(tenantId) },
      },
      include: {
        debitAccount: { select: { code: true, name: true } },
        journalEntry: { select: { entryNumber: true, date: true, description: true } },
      },
      orderBy: { id: 'desc' },
      take: 500,
    });

    const filas: FilaReporte[] = lineas.map((l) => ({
      clave: `linea:${l.id}`,
      fecha: isoDay(new Date(l.journalEntry.date)),
      poliza: l.journalEntry.entryNumber,
      cuenta: `${l.debitAccount.code} · ${l.debitAccount.name}`,
      concepto: l.description || l.journalEntry.description || '—',
      importe: round2(num(l.debit) - num(l.credit)),
    }));

    return {
      reporteId: 'presupuestos-comparativo',
      clave: `presupuesto:${centro.id}:${filtros.year}:${mes ?? 'anual'}`,
      etiqueta: `${centro.code} · ${centro.name} — ${mes ? `${MESES[mes - 1]} ${filtros.year}` : `Anual ${filtros.year}`}`,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { clave: 'poliza', etiqueta: 'Póliza', tipo: 'texto' },
        { clave: 'cuenta', etiqueta: 'Cuenta', tipo: 'texto' },
        { clave: 'concepto', etiqueta: 'Concepto', tipo: 'texto' },
        { clave: 'importe', etiqueta: 'Importe', tipo: 'moneda', alineacion: 'right' },
      ],
      filas,
      total: round2(filas.reduce((s, r) => s + num(r.importe), 0)),
    };
  }

  // ── Exportación ────────────────────────────────────────────────────

  /** CSV del resultado ya calculado, con los mismos filtros que se ven en pantalla. */
  aCsv(resultado: {
    columnas: ColumnaReporte[];
    filas: FilaReporte[];
    // `variacionPct` es null cuando no hay presupuesto base: `csvCampo` lo
    // escribe como celda vacía, que es justo lo que debe leerse.
    totales: Record<string, number | null> | null;
  }): string {
    const cab = resultado.columnas.map((c) => c.etiqueta);
    const lineas = [cab.map(csvCampo).join(',')];
    for (const fila of resultado.filas) {
      lineas.push(resultado.columnas.map((c) => csvCampo(fila[c.clave])).join(','));
    }
    if (resultado.totales) {
      const fila = resultado.columnas.map((c, i) => {
        if (i === 0) return csvCampo('TOTAL');
        const v = resultado.totales?.[c.clave];
        return csvCampo(v === undefined ? '' : v);
      });
      lineas.push(fila.join(','));
    }
    return lineas.join('\r\n');
  }

  csvComparativoPresupuestos(
    data: Awaited<ReturnType<AccountingWorkspaceReportsService['comparativoPresupuestos']>>,
  ): string {
    const columnas: ColumnaReporte[] = [
      { clave: 'centro', etiqueta: 'Centro de costo', tipo: 'texto' },
      { clave: 'presupuesto', etiqueta: 'Presupuesto', tipo: 'texto' },
      { clave: 'periodo', etiqueta: 'Periodo', tipo: 'texto' },
      { clave: 'planeado', etiqueta: 'Presupuesto', tipo: 'moneda' },
      { clave: 'real', etiqueta: 'Real', tipo: 'moneda' },
      { clave: 'variacion', etiqueta: 'Variación', tipo: 'moneda' },
      { clave: 'variacionPct', etiqueta: 'Variación %', tipo: 'porcentaje' },
    ];
    return this.aCsv({
      columnas,
      filas: data.lineas as unknown as FilaReporte[],
      totales: {
        planeado: data.totales.planeado,
        real: data.totales.real,
        variacion: data.totales.variacion,
        variacionPct: data.totales.variacionPct,
      },
    });
  }

  // ── Utilidades de periodo ──────────────────────────────────────────

  /** Rango por defecto: del día 1 del mes en curso a hoy. */
  private rangoPeriodo(from?: string, to?: string): { from: string; to: string } {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const desde = this.parseDia(from) ?? inicioMes;
    const hasta = this.parseDia(to) ?? hoy;
    if (desde.getTime() > hasta.getTime()) {
      throw new BadRequestException('El inicio del periodo no puede ser posterior al final');
    }
    return { from: isoDay(desde), to: isoDay(hasta) };
  }

  private rangoAnterior(from: string, to: string): { from: string; to: string } {
    const desde = this.parseDia(from)!;
    const hasta = this.parseDia(to)!;
    const dia = 86_400_000;
    const largo = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / dia) + 1);
    const prevHasta = new Date(desde.getTime() - dia);
    const prevDesde = new Date(prevHasta.getTime() - (largo - 1) * dia);
    return { from: isoDay(prevDesde), to: isoDay(prevHasta) };
  }

  /**
   * Fin del día de corte, en UTC.
   *
   * `dueDate` y `JournalEntry.date` son columnas `@db.Date`: Prisma las
   * devuelve a medianoche **UTC**. Con un corte en hora local (UTC−6 son las
   * 05:59:59Z del día siguiente) una factura que vencía justo el día del corte
   * salía con 1 día de atraso y saltaba del tramo «por vencer» al de «1 a 30
   * días», y el balance general arrastraba las pólizas del día siguiente.
   */
  private fechaCorte(asOf?: string): Date {
    const d = this.parseDia(asOf) ?? new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
  }

  /**
   * Límites del rango para columnas `@db.Date` (paymentDate, issueDate,
   * `JournalEntry.date`), que viven a medianoche UTC. `limites()` sigue siendo
   * el correcto para columnas con hora real, como `fechaGasto` o `paidAt`.
   */
  private limitesUtc(from: string, to: string): { desde: Date; hasta: Date } {
    const d = this.parseDia(from)!;
    const h = this.parseDia(to)!;
    return {
      desde: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
      hasta: new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59, 999)),
    };
  }

  private parseDia(raw?: string): Date | null {
    if (!raw || !String(raw).trim()) return null;
    const txt = String(raw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
      throw new BadRequestException(`Fecha inválida: "${raw}". Usa el formato AAAA-MM-DD.`);
    }
    const [y, m, d] = txt.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    if (Number.isNaN(fecha.getTime()) || fecha.getMonth() !== m - 1) {
      throw new BadRequestException(`Fecha inválida: "${raw}"`);
    }
    return fecha;
  }

  private limites(from: string, to: string): { desde: Date; hasta: Date } {
    const desde = this.parseDia(from)!;
    const hasta = this.parseDia(to)!;
    return {
      desde: new Date(desde.getFullYear(), desde.getMonth(), desde.getDate(), 0, 0, 0, 0),
      hasta: new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59, 999),
    };
  }

  /** El gasto fecha por `fechaGasto`; si viene vacía, por la de solicitud. */
  private rangoGasto(desde: Date, hasta: Date): Record<string, unknown> {
    return {
      OR: [
        { fechaGasto: { gte: desde, lte: hasta } },
        { fechaGasto: null, fechaSolicitud: { gte: desde, lte: hasta } },
      ],
    };
  }

  private claveMes(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private mesesDelRango(desde: Date, hasta: Date): Array<{ clave: string; etiqueta: string }> {
    const salida: Array<{ clave: string; etiqueta: string }> = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
    const limite = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    // Tope de seguridad: 120 meses. Un rango absurdo no debe tumbar la respuesta.
    let guardia = 0;
    while (cursor.getTime() <= limite.getTime() && guardia < 120) {
      salida.push({
        clave: this.claveMes(cursor),
        etiqueta: `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
      guardia += 1;
    }
    return salida;
  }

  /** Un presupuesto mensual entra si su mes cae dentro; uno anual, si su ejercicio toca el rango. */
  private dentroDelRango(year: number, month: number | null | undefined, desde: Date, hasta: Date): boolean {
    if (month == null) return year >= desde.getFullYear() && year <= hasta.getFullYear();
    const inicio = new Date(year, month - 1, 1);
    const fin = new Date(year, month, 0, 23, 59, 59, 999);
    return fin.getTime() >= desde.getTime() && inicio.getTime() <= hasta.getTime();
  }
}

/** Campo CSV: comillas dobles escapadas y separadores neutralizados. */
function csvCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const txt = typeof valor === 'number' ? String(valor) : String(valor);
  // Prefijo defensivo: Excel interpreta =, +, -, @ iniciales como fórmula.
  const seguro = /^[=+@]/.test(txt) ? `'${txt}` : txt;
  return `"${seguro.replace(/"/g, '""')}"`;
}
