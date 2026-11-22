import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AccountingService } from '../../accounting/accounting.service';
import { bucketDeAging, diasVencido, indiceDeHoy } from '../../accounting/workspace-ar-ap.service';
import { AccountingWorkspaceLedgerService } from '../../accounting/workspace-ledger.service';
import { AccountingWorkspaceReportsService } from '../../accounting/workspace-reports.service';
import { AttendanceController } from '../../attendance/attendance.controller';
import { MyActivitiesService } from '../../me/my-activities.service';

/**
 * «Hoy» y «este mes» en contabilidad y asistencia son los de la empresa (hora de México).
 *
 * El servidor corre en UTC. `now.getMonth()`, `now.getDate()` y `new Date().toLocaleDateString()`
 * leen su reloj: de las 18:00 de México en adelante ya es mañana, y la tarde del último día del mes
 * ya es el mes siguiente. A esa hora la cartera envejecía un día (lo que vence hoy salía «vencido»),
 * el tablero del mes quedaba en ceros y la asistencia «de hoy» abría el día de mañana, vacío.
 */

const dia = (clave: string) => new Date(`${clave}T00:00:00.000Z`);
// 20 de septiembre, 19:30 en México: el servidor ya está en el 21.
const TARDE = new Date('2026-09-21T01:30:00.000Z');
// 30 de noviembre, 19:30 en México: el servidor ya está en diciembre.
const FIN_DE_MES = new Date('2026-12-01T01:30:00.000Z');

function cumple(filtro: Record<string, Date> | undefined, valor: Date): boolean {
  if (!filtro) return true;
  const t = valor.getTime();
  if (filtro.lt && !(t < filtro.lt.getTime())) return false;
  if (filtro.lte && !(t <= filtro.lte.getTime())) return false;
  if (filtro.gt && !(t > filtro.gt.getTime())) return false;
  if (filtro.gte && !(t >= filtro.gte.getTime())) return false;
  return true;
}

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
  const filtros = (modelo: string, campo: string) =>
    llamadas.filter((l) => l.modelo === modelo && l.args?.where?.[campo]).map((l) => l.args.where[campo] as Record<string, Date>);
  return { prisma, llamadas, filtros };
}

describe('hoy y este mes son los de la empresa', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  const a = (instante: Date) => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(instante);
  const contabilidad = (prisma: unknown) => {
    const svc = Object.create(AccountingService.prototype) as any;
    svc.prisma = prisma;
    return svc;
  };

  describe('cartera (cuentas por cobrar y por pagar)', () => {
    it('a las 7:30 de la tarde, lo que vence hoy sigue venciendo hoy', () => {
      expect(diasVencido(dia('2026-09-20'), TARDE)).toBe(0);
      expect(bucketDeAging(dia('2026-09-20'), TARDE)).toBe('hoy');
      expect(diasVencido(dia('2026-09-19'), TARDE)).toBe(1);
      expect(bucketDeAging(dia('2026-09-21'), TARDE)).toBe('proximos7');
    });

    it('el día es el mismo de la primera a la última hora de México', () => {
      const madrugada = new Date('2026-09-20T00:01:00-06:00');
      const casiMedianoche = new Date('2026-09-20T23:59:00-06:00');
      expect(indiceDeHoy(madrugada)).toBe(indiceDeHoy(casiMedianoche));
      expect(diasVencido(dia('2026-09-15'), madrugada)).toBe(5);
      expect(diasVencido(dia('2026-09-15'), casiMedianoche)).toBe(5);
    });
  });

  describe('la tarde del último día del mes sigue siendo ese mes', () => {
    it('tablero de facturas: cuenta las de noviembre, no las de diciembre', async () => {
      a(FIN_DE_MES);
      const { prisma, filtros } = prismaQueAnota();
      await contabilidad(prisma).getInvoiceDashboard(7);
      const delMes = filtros('invoice', 'issueDate');
      expect(delMes).toHaveLength(1);
      expect(cumple(delMes[0], dia('2026-11-01'))).toBe(true);
      expect(cumple(delMes[0], dia('2026-11-30'))).toBe(true);
      expect(cumple(delMes[0], dia('2026-10-31'))).toBe(false);
      expect(cumple(delMes[0], dia('2026-12-01'))).toBe(false);
    });

    it('tablero financiero: mes, año y mes anterior salen del calendario de la empresa', async () => {
      a(FIN_DE_MES);
      const { prisma, filtros } = prismaQueAnota();
      await contabilidad(prisma).getFinancialDashboard(7).catch(() => undefined);
      const rangos = filtros('invoice', 'issueDate').map((f) => `${f.gte?.toISOString() ?? ''}..${f.lte?.toISOString() ?? ''}`);
      expect([...new Set(rangos)].sort()).toEqual([
        '2026-01-01T00:00:00.000Z..',
        '2026-10-01T00:00:00.000Z..2026-10-31T00:00:00.000Z',
        '2026-11-01T00:00:00.000Z..',
      ]);
    });

    it('resumen de la cuenta bancaria: los movimientos de noviembre son «del mes»', async () => {
      a(FIN_DE_MES);
      const { prisma, filtros } = prismaQueAnota({ 'bankAccount.findFirst': { id: 1, companyId: 7, name: 'Cuenta Demo' } });
      await contabilidad(prisma).getBankAccountSummary(1, 7).catch(() => undefined);
      const delMes = filtros('bankTransaction', 'transactionDate');
      expect(delMes.length).toBeGreaterThan(0);
      for (const f of delMes) {
        expect(cumple(f, dia('2026-11-03'))).toBe(true);
        expect(cumple(f, dia('2026-10-31'))).toBe(false);
      }
    });

    it('mesa contable: el periodo por omisión es noviembre, y lo que vence hoy no está vencido', async () => {
      a(FIN_DE_MES);
      const porCobrar = [
        { totalAmount: 100, paidAmount: 0, dueDate: dia('2026-11-30') }, // vence hoy
        { totalAmount: 40, paidAmount: 0, dueDate: dia('2026-11-29') }, // venció ayer
        { totalAmount: 7, paidAmount: 0, dueDate: dia('2026-12-01') }, // vence mañana
      ];
      const { prisma } = prismaQueAnota();
      const svc = contabilidad(
        new Proxy(prisma as any, {
          get: (objetivo, modelo: string) =>
            modelo === 'invoice'
              ? {
                  count: () => Promise.resolve(0),
                  findMany: ({ where }: any) => Promise.resolve(where.type === 'ACCOUNTS_RECEIVABLE' ? porCobrar : []),
                }
              : objetivo[modelo],
        }),
      );
      svc.getFinancialDashboard = jest.fn().mockResolvedValue({
        profitAndLoss: { month: { revenue: 0, expenses: 0 } },
        cash: { totalBalance: 0 },
        accountsReceivable: { pending: 147 },
        accountsPayable: { pending: 0 },
      });
      const mesa = await svc.getWorkspaceDashboard(7);
      expect(mesa.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(mesa.agingReceivable).toMatchObject({ overdue: 40, dueToday: 100, next7: 7 });
    });

    it('reportes: sin fechas, el periodo va del día 1 de noviembre al 30', () => {
      a(FIN_DE_MES);
      const svc = Object.create(AccountingWorkspaceReportsService.prototype) as any;
      expect(svc.rangoPeriodo()).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(svc.rangoPeriodo('2026-10-05', '2026-10-20')).toEqual({ from: '2026-10-05', to: '2026-10-20' });
    });

    it('libro de movimientos: sin fechas, el periodo es noviembre completo', () => {
      a(FIN_DE_MES);
      const svc = Object.create(AccountingWorkspaceLedgerService.prototype) as any;
      const filtros = svc.normalize({});
      expect([filtros.from, filtros.to]).toEqual(['2026-11-01', '2026-11-30']);
    });
  });

  describe('asistencia', () => {
    it('a las 7:30 de la tarde, el día por omisión es hoy y no mañana', async () => {
      a(TARDE);
      const ctrl = Object.create(AttendanceController.prototype) as any;
      ctrl.hybridService = { getHybridDay: jest.fn().mockResolvedValue({}) };
      await ctrl.hybrid({ user: { id: 1, permissions: [] } }, 7);
      expect(ctrl.hybridService.getHybridDay.mock.calls[0][1]).toBe('2026-09-20');
      await ctrl.hybrid({ user: { id: 1, permissions: [] } }, 7, '2026-09-01');
      expect(ctrl.hybridService.getHybridDay.mock.calls[1][1]).toBe('2026-09-01');
    });
  });

  describe('mis actividades', () => {
    const terminada = (id: number, fechaFinalizacion: Date) => ({
      rol: 'LEAD',
      asignadoAt: new Date('2026-09-18T15:00:00.000Z'),
      indicaciones: null,
      ordenEjecucion: null,
      ordenJustificacion: null,
      ordenActualizadoAt: null,
      aceptadaAt: null,
      rechazadaAt: null,
      motivoRechazo: null,
      inicioRealAt: null,
      finRealAt: null,
      horasPlan: null,
      saltoPrioridad: false,
      asignadoPor: { id: 8, nombre: 'Persona Demo' },
      activity: {
        id,
        anNumber: `AN-${id}`,
        titulo: 'Actividad Demo',
        descripcion: null,
        estatus: 'Finalizada',
        prioridad: 'MEDIA',
        coreKind: 'tarea',
        ticketTypeCustom: null,
        assignmentCharge: 'ejecucion',
        fechaInicio: null,
        fechaMaxima: null,
        fechaAsignacion: new Date('2026-09-18T15:00:00.000Z'),
        fechaFinalizacion,
        periodoInicio: null,
        periodoFin: null,
        tiempoEstimadoMin: null,
        tiempoMaximoMin: null,
        creadoPorId: 8,
        creador: { id: 8, nombre: 'Persona Demo' },
        project: null,
        client: null,
        activityEvidences: [],
        scheduleChanges: [],
        assignees: [],
      },
    });
    const AYER_8PM = new Date('2026-09-20T02:00:00.000Z'); // 19 de septiembre, 20:00 en México
    const HOY_10AM = new Date('2026-09-20T16:00:00.000Z'); // 20 de septiembre, 10:00 en México

    it.each([
      ['a las 11 de la mañana', new Date('2026-09-20T17:00:00.000Z')],
      ['a las 7:30 de la tarde', TARDE],
    ])('%s «terminadas hoy» trae la de hoy a las 10 y no la de anoche', async (_cuando, instante) => {
      a(instante);
      const prisma = {
        activityAssignee: { findMany: jest.fn().mockResolvedValue([terminada(1, AYER_8PM), terminada(2, HOY_10AM)]) },
        activity: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const svc = new MyActivitiesService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
      const res = await svc.list({ id: 7, email: 'demo@example.com' } as any, 1);
      expect(res.doneToday.map((x) => x.id)).toEqual([2]);
    });
  });

  it('contabilidad y asistencia no toman el día ni el mes del reloj del servidor', () => {
    const raiz = join(__dirname, '..', '..');
    const CARPETAS = ['accounting', 'attendance'];
    const PATRON = /\b(now|hoy|ahora)\.get(FullYear|Month|Date)\(\)|new Date\(\)\.get(FullYear|Month|Date)\(\)|new Date\(\)\.toLocaleDateString\('(sv-SE|en-CA)'\)/;
    const hallazgos: string[] = [];
    const recorre = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorre(ruta);
        else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) {
          readFileSync(ruta, 'utf8')
            .split('\n')
            .forEach((linea, i) => {
              if (PATRON.test(linea)) hallazgos.push(`${relative(raiz, ruta)}:${i + 1}`);
            });
        }
      }
    };
    for (const carpeta of CARPETAS) recorre(join(raiz, carpeta));
    expect(hallazgos).toEqual([]);
  });

  it('nadie saca «hoy» con toLocaleDateString sin decir la zona', () => {
    const raiz = join(__dirname, '..', '..');
    const PATRON = /\.toLocaleDateString\('(sv-SE|en-CA)'\)/;
    const hallazgos: string[] = [];
    const recorre = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorre(ruta);
        else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) {
          readFileSync(ruta, 'utf8')
            .split('\n')
            .forEach((linea, i) => {
              if (PATRON.test(linea)) hallazgos.push(`${relative(raiz, ruta)}:${i + 1}`);
            });
        }
      }
    };
    recorre(raiz);
    expect(hallazgos).toEqual([]);
  });
});
