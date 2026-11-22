import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AccountingService } from '../../accounting/accounting.service';
import { FOLIO_SERIES } from '../folio/folio-series';
import { CostosLigaService } from '../../costos/costos-liga.service';
import { CrmActivitiesService } from '../../crm-activities/crm-activities.service';
import { HrService } from '../../hr/hr.service';
import { daysOverdue, isOverdue } from '../../meetings/meeting-rhythm';
import { cfdiDate } from '../../pac/cfdi-xml.builder';
import { ProcurementService } from '../../procurement/procurement.service';
import * as pdfDeOrden from '../../procurement/purchase-order-pdf';
import { dueDateFromTerms, pickPriceBreak } from '../../procurement/wholesale-pricing';
import { SlaTrackerService } from '../../sla-tracker/sla-tracker.service';
import { estadoProgramacion, proximaInspeccion } from '../../tool-requests/kit-inspecciones';
import { ToolRequestsService } from '../../tool-requests/tool-requests.service';
import { UsersService } from '../../users/users.service';
import { VentasService } from '../../ventas/ventas.service';
import { WarehouseService } from '../../warehouse/warehouse.service';
import { ultimosDiasLaborales } from './workday';

/**
 * El día, la semana, el mes, el año y la hora de un instante son los de la empresa (hora de México).
 *
 * El servidor corre en UTC. `d.getDate()`, `d.getHours()` y `d.toISOString().slice(0, 10)` leen su
 * reloj: lo que pasa de las 18:00 en adelante caía en el día siguiente. A esa hora el mes de ventas
 * empezaba «hoy a esta hora», los pendientes de hoy del CRM eran los de mañana, el acuerdo que vence
 * hoy ya salía vencido, la gráfica de salidas de almacén ponía la de la tarde en mañana y la orden
 * de compra autorizada a las 7 de la noche se imprimía con fecha del día siguiente.
 */

const dia = (clave: string) => new Date(`${clave}T00:00:00.000Z`);
// Sábado 21 de noviembre, 19:30 en México: el servidor ya está en el domingo 22.
const TARDE = new Date('2026-11-22T01:30:00.000Z');
// Ese mismo sábado a las 10:00 de la mañana.
const MANANA = new Date('2026-11-21T16:00:00.000Z');
// 30 de noviembre, 19:30 en México: el servidor ya está en diciembre.
const FIN_DE_MES = new Date('2026-12-01T01:30:00.000Z');
// 31 de diciembre, 19:30 en México: el servidor ya está en 2027.
const FIN_DE_ANIO = new Date('2027-01-01T01:30:00.000Z');

/** Prisma de mentira: responde vacío a todo y anota cada consulta. */
function prismaQueAnota(respuestas: Record<string, unknown> = {}) {
  const llamadas: Array<{ modelo: string; op: string; args: any }> = [];
  const vacio: Record<string, unknown> = {
    count: 0,
    findMany: [],
    groupBy: [],
    aggregate: { _sum: {}, _avg: {}, _count: 0 },
    findFirst: null,
    findUnique: null,
  };
  const prisma = new Proxy(
    {},
    {
      get: (_p, modelo: string) =>
        new Proxy(
          {},
          {
            get: (_m, op: string) => (args: any) => {
              llamadas.push({ modelo, op, args });
              const clave = `${modelo}.${op}`;
              return Promise.resolve(clave in respuestas ? respuestas[clave] : vacio[op]);
            },
          },
        ),
    },
  );
  const de = (modelo: string, op = 'findMany') => llamadas.filter((l) => l.modelo === modelo && l.op === op);
  return { prisma, llamadas, de };
}

/** Busca una llave dentro de una respuesta, esté en el nivel que esté. */
function buscar(obj: unknown, llave: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (llave in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[llave];
  for (const valor of Object.values(obj as Record<string, unknown>)) {
    const hallado = buscar(valor, llave);
    if (hallado !== undefined) return hallado;
  }
  return undefined;
}

describe('el día de un instante es el de la empresa', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const a = (instante: Date) => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(instante);

  describe('los últimos días de una gráfica', () => {
    it('terminan en el día de la empresa, no en el del servidor', () => {
      expect(ultimosDiasLaborales(TARDE, 3)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21']);
      expect(ultimosDiasLaborales(MANANA, 2)).toEqual(['2026-11-20', '2026-11-21']);
    });
  });

  describe('ventas: métricas por periodo', () => {
    const ventas = () => {
      const f = prismaQueAnota();
      const svc = Object.create(VentasService.prototype) as any;
      svc.prisma = f.prisma;
      svc.isSalesTeamManager = () => true;
      svc.isSuperAdminUser = () => true;
      svc.isConsoleAdminUser = () => false;
      return { svc, ...f };
    };
    const desde = (f: ReturnType<typeof ventas>, modelo: string) => f.de(modelo)[0].args.where.createdAt.gte as Date;

    it('el mes empieza el día 1 a las 00:00 de México, no «hoy a esta hora» del servidor', async () => {
      a(TARDE);
      const f = ventas();
      await f.svc.getMetricsByPeriod('month', { id: 1 });
      expect(desde(f, 'salesProject').toISOString()).toBe('2026-11-01T06:00:00.000Z');
      expect(desde(f, 'salesOpportunity').toISOString()).toBe('2026-11-01T06:00:00.000Z');
      expect(desde(f, 'salesClient').toISOString()).toBe('2026-11-01T06:00:00.000Z');
    });

    it('la semana empieza el domingo de la empresa', async () => {
      a(TARDE);
      const f = ventas();
      await f.svc.getMetricsByPeriod('week', { id: 1 });
      expect(desde(f, 'salesProject').toISOString()).toBe('2026-11-15T06:00:00.000Z');
    });

    it('la tarde del 31 de diciembre sigue siendo este año', async () => {
      a(FIN_DE_ANIO);
      const f = ventas();
      await f.svc.getMetricsByPeriod('year', { id: 1 });
      expect(desde(f, 'salesProject').toISOString()).toBe('2026-01-01T06:00:00.000Z');
    });

    it('el tablero de vendedores usa el mismo inicio de periodo', async () => {
      a(FIN_DE_MES);
      const f = ventas();
      await f.svc.getVendorStatsByPeriod('month', { id: 1 }, 7);
      const usuarios = f.de('user')[0].args;
      expect(usuarios.include.salesOpportunitiesOwned.where.createdAt.gte.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    });
  });

  describe('CRM: mi agenda', () => {
    it('«pendientes de hoy» son los del día de la empresa', async () => {
      a(TARDE);
      const f = prismaQueAnota();
      const svc = Object.create(CrmActivitiesService.prototype) as any;
      svc.prisma = f.prisma;

      await svc.getMyAgenda(1, 7);

      const hoy = f.de('crmActivity')[0].args.where.dueDate;
      expect(hoy.gte.toISOString()).toBe('2026-11-21T06:00:00.000Z');
      expect(hoy.lt.toISOString()).toBe('2026-11-22T06:00:00.000Z');
    });
  });

  describe('reuniones: acuerdos', () => {
    it('el acuerdo que vence hoy no está vencido a las 7:30 de la tarde', () => {
      const acuerdo = { estado: 'PENDIENTE', fechaCompromiso: dia('2026-11-21') };
      expect(isOverdue(acuerdo, TARDE)).toBe(false);
      expect(daysOverdue(acuerdo, TARDE)).toBe(0);
    });

    it('el de ayer lleva un día de atraso, por la mañana y por la tarde', () => {
      const acuerdo = { estado: 'EN_PROCESO', fechaCompromiso: dia('2026-11-20') };
      expect(daysOverdue(acuerdo, MANANA)).toBe(1);
      expect(daysOverdue(acuerdo, TARDE)).toBe(1);
    });
  });

  describe('compras', () => {
    it('el precio por volumen vigente hasta hoy sigue sirviendo por la tarde', () => {
      const escalon = { id: 1, cantidadMinima: 1, unitPrice: 10, vigenteHasta: dia('2026-11-21') } as any;
      expect(pickPriceBreak([escalon], 5, TARDE)).toBe(escalon);
    });

    it('el que empieza mañana todavía no aplica', () => {
      const escalon = { id: 1, cantidadMinima: 1, unitPrice: 10, vigenteDesde: dia('2026-11-22') } as any;
      expect(pickPriceBreak([escalon], 5, TARDE)).toBeNull();
    });

    it('el vencimiento por días de crédito se cuenta en días de calendario', () => {
      expect(dueDateFromTerms({ creditoDias: 30 } as any, dia('2026-11-21')).toISOString()).toBe('2026-12-21T00:00:00.000Z');
      expect(dueDateFromTerms(null, dia('2026-11-21')).toISOString()).toBe('2026-11-21T00:00:00.000Z');
    });

    it('la orden autorizada a las 7:30 de la tarde se imprime con la fecha de ese día', async () => {
      const generar = jest.spyOn(pdfDeOrden, 'generatePurchaseOrderPdf').mockResolvedValue(Buffer.from('pdf'));
      const svc = Object.create(ProcurementService.prototype) as any;
      svc.getPurchaseOrder = jest.fn().mockResolvedValue({
        poNumber: 'PO-000001',
        status: 'APPROVED',
        orderDate: dia('2026-11-21'),
        expectedDate: null,
        currency: 'MXN',
        subtotal: 100,
        taxAmount: 16,
        totalAmount: 116,
        company: { legalName: 'Empresa Demo' },
        supplier: { name: 'Proveedor Demo' },
        approvedAt: TARDE,
        items: [],
      });

      await svc.getPurchaseOrderPdfBuffer(1, 7);

      expect(generar.mock.calls[0][0]).toMatchObject({ orderDate: '2026-11-21', approvedAt: '2026-11-21' });
    });

    it('la licitación de la tarde del 31 de diciembre lleva el folio de este año', () => {
      const prefijo = FOLIO_SERIES.TENDER.prefijo as (at: Date) => string;
      expect(prefijo(FIN_DE_ANIO)).toBe('LIC-2026-');
    });
  });

  describe('kits de herramienta: revisión periódica', () => {
    it('la próxima revisión se cuenta desde el día de la empresa', () => {
      expect(proximaInspeccion(TARDE, 30)!.toISOString()).toBe('2026-12-21T00:00:00.000Z');
      expect(proximaInspeccion(MANANA, 30)!.toISOString()).toBe('2026-12-21T00:00:00.000Z');
    });

    it('la revisión de mañana no está vencida esta tarde', () => {
      expect(estadoProgramacion(dia('2026-11-22'), TARDE)).toEqual({
        vencida: false,
        diasDeAtraso: 0,
        diasParaLaProxima: 1,
        porVencer: true,
      });
    });

    it('la de hoy toca hoy todo el día; la de ayer lleva un día', () => {
      expect(estadoProgramacion(dia('2026-11-21'), MANANA)).toMatchObject({ vencida: true, diasDeAtraso: 0 });
      expect(estadoProgramacion(dia('2026-11-21'), TARDE)).toMatchObject({ vencida: true, diasDeAtraso: 0 });
      expect(estadoProgramacion(dia('2026-11-20'), TARDE)).toMatchObject({ vencida: true, diasDeAtraso: 1 });
    });

    it('la lista de kits por revisar corta en el día de la empresa', async () => {
      a(TARDE);
      const f = prismaQueAnota();
      const svc = Object.create(ToolRequestsService.prototype) as any;
      svc.prisma = f.prisma;

      await svc.kitsPorInspeccionar(7);
      await svc.kitsPorInspeccionar(7, { incluirPorVencer: true });

      const cortes = f.de('toolKitAssignment').map((l) => l.args.where.proximaInspeccion.lte.toISOString());
      expect(cortes).toEqual(['2026-11-21T00:00:00.000Z', '2026-11-28T00:00:00.000Z']);
    });
  });

  describe('tableros con gráfica por día', () => {
    it('almacén: la salida de las 7:30 de la tarde cuenta en hoy, y la gráfica termina en hoy', async () => {
      a(TARDE);
      const f = prismaQueAnota({
        'stockMovement.findMany': [
          { id: 1, type: 'DISPATCH', productId: 1, quantity: 3, totalCost: 30, unitCost: 10, createdAt: TARDE },
        ],
      });
      const svc = Object.create(WarehouseService.prototype) as any;
      svc.prisma = f.prisma;

      const salidas = buscar(await svc.getInventoryInsights(7), 'outflow14d') as Array<{ date: string; qty: number }>;

      expect(salidas).toHaveLength(14);
      expect(salidas[salidas.length - 1]).toEqual({ date: '2026-11-21', qty: 3 });
    });

    it('accesos: el inicio de sesión de las 7:30 de la tarde cuenta en hoy y a las 19 horas', async () => {
      a(TARDE);
      const f = prismaQueAnota({
        'auditLog.findMany': [{ action: 'LOGIN_SUCCESS', createdAt: TARDE, userId: 1 }],
      });
      const svc = Object.create(UsersService.prototype) as any;
      svc.prisma = f.prisma;
      svc.superAdminEmails = [];

      const res = await svc.getIamInsights({ isSuperAdmin: true, permissions: [] }, 7);

      const exitosos = buscar(res, 'loginsSuccess14d') as Array<{ date: string; count: number }>;
      expect(exitosos[exitosos.length - 1]).toEqual({ date: '2026-11-21', count: 1 });
      const horas = buscar(res, 'peakHours') as Array<{ hour: number; count: number }>;
      expect(horas.filter((h) => h.count > 0)).toEqual([{ hour: 19, count: 1 }]);
    });

    it('servicio (SLA): lo abierto y cerrado esta tarde cuenta en hoy', async () => {
      a(TARDE);
      const f = prismaQueAnota({
        'activity.findMany': [
          { id: 1, anNumber: 'AN-1', titulo: 'Demo', prioridad: 'MEDIA', fechaAsignacion: TARDE, fechaFinalizacion: TARDE, responsable: null },
        ],
      });
      const svc = Object.create(SlaTrackerService.prototype) as any;
      svc.prisma = f.prisma;
      svc.getStats = jest.fn().mockResolvedValue({ resolutionSla: { avgHours: 0, compliancePct: 100, onTime: 0, late: 0 } });

      const res = await svc.getInsights({});

      const abiertos = buscar(res, 'opened14d') as Array<{ date: string; count: number }>;
      const cerrados = buscar(res, 'closed14d') as Array<{ date: string; count: number }>;
      expect(abiertos[abiertos.length - 1]).toEqual({ date: '2026-11-21', count: 1 });
      expect(cerrados[cerrados.length - 1]).toEqual({ date: '2026-11-21', count: 1 });
    });

    it('finanzas: lo que vence hoy es corriente, y la última semana termina hoy con el cobro de hoy', async () => {
      a(TARDE);
      const f = prismaQueAnota({
        'invoice.findMany': [
          { id: 1, type: 'ACCOUNTS_RECEIVABLE', totalAmount: 500, paidAmount: 0, dueDate: dia('2026-11-21') },
          { id: 2, type: 'ACCOUNTS_RECEIVABLE', totalAmount: 200, paidAmount: 0, dueDate: dia('2026-11-20') },
        ],
        'payment.findMany': [{ amount: 100, paymentDate: dia('2026-11-21'), invoice: { type: 'ACCOUNTS_RECEIVABLE' } }],
      });
      const svc = Object.create(AccountingService.prototype) as any;
      svc.prisma = f.prisma;
      svc.getFinancialDashboard = jest.fn().mockResolvedValue({
        accountsReceivable: { pending: 0 },
        accountsPayable: { pending: 0 },
        profitAndLoss: { month: { revenue: 0, expenses: 0, profit: 0 } },
        cash: { totalBalance: 0 },
        workingCapital: 0,
        overdueInvoices: 0,
      });

      const res = await svc.getFinanceInsights(7);

      expect(res.aging.ar).toMatchObject({ current: 500, d1_30: 200 });
      const semanas = res.cashflow90d.weekly as Array<{ weekEnding: string; inflow: number }>;
      expect(semanas[semanas.length - 1]).toMatchObject({ weekEnding: '2026-11-21', inflow: 100 });
      expect(semanas).toHaveLength(13);
    });
  });

  describe('recursos humanos', () => {
    it('el saldo de vacaciones de la tarde del 31 de diciembre es el de este año', async () => {
      a(FIN_DE_ANIO);
      const f = prismaQueAnota();
      const svc = Object.create(HrService.prototype) as any;
      svc.prisma = f.prisma;

      const saldo = await svc.getLeaveBalance(1, 7);

      expect(saldo.year).toBe(2026);
    });

    it('«permisos aprobados este mes» cuenta desde el día 1 del mes de la empresa', async () => {
      a(FIN_DE_MES);
      const f = prismaQueAnota();
      const svc = Object.create(HrService.prototype) as any;
      svc.prisma = f.prisma;

      await svc.getPeopleInsights(7).catch(() => null);

      const delMes = f.de('leaveRequest', 'count').find((l) => l.args.where.status === 'APPROVED');
      expect(delMes!.args.where.startDate.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });
  });

  describe('costos: horas por ligar', () => {
    it('dos jornadas del mismo día (mañana y noche) son un día trabajado, no dos', async () => {
      const sesion = (id: number, inicio: string, fin: string) => ({
        id,
        activityId: 5,
        userId: 1,
        startedAt: new Date(inicio),
        endedAt: new Date(fin),
        endReason: 'MANUAL',
      });
      const f = prismaQueAnota({
        'activityWorkSession.findMany': [
          sesion(1, '2026-11-21T16:00:00.000Z', '2026-11-21T18:00:00.000Z'),
          sesion(2, '2026-11-22T01:00:00.000Z', '2026-11-22T02:00:00.000Z'),
        ],
        'activity.findMany': [{ id: 5, anNumber: 'AN-5', titulo: 'Demo', coreKind: null, projectId: null, clientId: null, cotizacionId: null, client: null }],
      });
      const svc = new CostosLigaService(f.prisma as any, { disponible: () => false } as any);

      const res = await svc.porLigar(7, 'semana', TARDE);

      expect(res.filas[0]).toMatchObject({ activityId: 5, dias: 1, personas: 1 });
    });
  });

  describe('factura electrónica', () => {
    it('la fecha del comprobante es la hora de México, no la del servidor', () => {
      expect(cfdiDate(TARDE)).toBe('2026-11-21T19:30:00');
    });
  });
});

describe('candado: estos módulos no leen el día ni la hora del reloj del servidor', () => {
  const RAIZ = join(__dirname, '..', '..');
  const CARPETAS = [
    'ventas',
    'crm-activities',
    'meetings',
    'hr',
    'tool-requests',
    'users',
    'sla-tracker',
    'warehouse',
    'procurement',
    'pac',
    'common/folio',
    'costos',
  ];
  const DEL_RELOJ = /\.(getFullYear|getMonth|getDate|getDay|getHours|setHours|setDate|setMonth)\(/;
  const DIA_UTC = /dayKey = \(d: Date\) => d\.toISOString\(\)/;

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts') ? [ruta] : [];
    });
  }
  const sinComentarios = (texto: string) =>
    texto
      .split('\n')
      .filter((renglon) => !/^\s*(\/\/|\*|\/\*)/.test(renglon))
      .join('\n');

  it('ni `getDate()`, `getHours()` y compañía, ni `setHours()`', () => {
    const culpables = CARPETAS.flatMap((carpeta) => archivos(join(RAIZ, carpeta)))
      .filter((ruta) => DEL_RELOJ.test(sinComentarios(readFileSync(ruta, 'utf8'))))
      .map((ruta) => relative(RAIZ, ruta).replace(/\\/g, '/'));
    expect(culpables).toEqual([]);
  });

  it('ninguna gráfica agrupa por el día del servidor', () => {
    const culpables = archivos(RAIZ)
      .filter((ruta) => DIA_UTC.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => relative(RAIZ, ruta).replace(/\\/g, '/'));
    expect(culpables).toEqual([]);
  });
});
