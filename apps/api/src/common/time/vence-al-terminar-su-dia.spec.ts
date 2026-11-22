import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AccountingService } from '../../accounting/accounting.service';
import { AlertsService } from '../../alerts/alerts.service';
import { ClientPortalController } from '../../client-portal/client-portal.controller';
import { ProcurementService } from '../../procurement/procurement.service';
import { CronService } from '../cron/cron.service';

/**
 * Un vencimiento, una entrega estimada o una visita programada son días de calendario (`@db.Date`):
 * viven a medianoche UTC, que en México son las 18:00 de la víspera.
 *
 * Comparados con `new Date()`, la factura que vence mañana ya salía «vencida» desde las seis de la
 * tarde de hoy, el correo de «factura vencida» llegaba el mismo día del vencimiento («0 días»), la
 * orden de compra que llega hoy contaba como entrega atrasada y la visita de hoy desaparecía de las
 * próximas visitas del cliente. Un día vence cuando termina, no cuando empieza.
 */

const dia = (clave: string) => new Date(`${clave}T00:00:00.000Z`);
const AYER = dia('2026-11-20');
const HOY = dia('2026-11-21');
const MANANA = dia('2026-11-22');

// 21 de noviembre en México: 08:00 (cuando corren las tareas de la mañana) y 19:30 (el servidor ya está en el 22).
const MANANA_8AM = new Date('2026-11-21T14:00:00.000Z');
const TARDE = new Date('2026-11-22T01:30:00.000Z');

/** Evalúa el filtro de fecha de Prisma (`lt`, `lte`, `gt`, `gte`) como lo haría la base. */
function cumple(filtro: Record<string, Date> | undefined, valor: Date): boolean {
  if (!filtro) return true;
  const t = valor.getTime();
  if (filtro.lt && !(t < filtro.lt.getTime())) return false;
  if (filtro.lte && !(t <= filtro.lte.getTime())) return false;
  if (filtro.gt && !(t > filtro.gt.getTime())) return false;
  if (filtro.gte && !(t >= filtro.gte.getTime())) return false;
  return true;
}

const silencio = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

describe('un día de calendario vence cuando termina', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  const a = (instante: Date) => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(instante);

  describe('facturas', () => {
    const facturas = [
      { id: 1, invoiceNumber: 'F-AYER', dueDate: AYER },
      { id: 2, invoiceNumber: 'F-HOY', dueDate: HOY },
      { id: 3, invoiceNumber: 'F-MANANA', dueDate: MANANA },
    ];
    const vencidasSegun = (where: any) => facturas.filter((f) => cumple(where.dueDate, f.dueDate)).map((f) => f.invoiceNumber);

    it.each([
      ['a las 8 de la mañana', MANANA_8AM],
      ['a las 7:30 de la tarde', TARDE],
    ])('%s solo está vencida la de ayer; la de hoy y la de mañana no', async (_cuando, instante) => {
      a(instante);
      const svc = Object.create(AccountingService.prototype) as any;
      svc.prisma = { invoice: { findMany: jest.fn().mockResolvedValue([]) } };
      await svc.getOverdueInvoices(7);
      expect(vencidasSegun(svc.prisma.invoice.findMany.mock.calls[0][0].where)).toEqual(['F-AYER']);
    });

    it('el correo de la mañana no avisa de la que vence hoy, y cuenta los días por calendario', async () => {
      a(MANANA_8AM);
      const svc = Object.create(CronService.prototype) as any;
      svc.logger = silencio;
      svc.email = { sendInvoiceOverdue: jest.fn().mockResolvedValue(undefined) };
      svc.prisma = {
        invoice: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) =>
            facturas
              .filter((f) => cumple(where.dueDate, f.dueDate))
              .map((f) => ({ ...f, totalAmount: 100, receptorName: 'Cliente Demo', client: null, createdBy: { email: 'demo@example.com' } })),
          ),
        },
      };
      await svc.handleOverdueInvoices();
      expect(svc.email.sendInvoiceOverdue).toHaveBeenCalledTimes(1);
      expect(svc.email.sendInvoiceOverdue).toHaveBeenCalledWith('demo@example.com', 'F-AYER', 'Cliente Demo', 100, 1);
    });
  });

  describe('órdenes de compra', () => {
    const ordenes = [
      { poNumber: 'OC-AYER', expectedDate: AYER },
      { poNumber: 'OC-HOY', expectedDate: HOY },
      { poNumber: 'OC-MANANA', expectedDate: MANANA },
    ];

    it.each([
      ['a las 8 de la mañana', MANANA_8AM],
      ['a las 7:30 de la tarde', TARDE],
    ])('%s la que llega hoy no cuenta como entrega atrasada', async (_cuando, instante) => {
      a(instante);
      const svc = Object.create(ProcurementService.prototype) as any;
      svc.prisma = {
        purchaseRequisition: { count: jest.fn().mockResolvedValue(0) },
        purchaseOrder: {
          count: jest.fn().mockImplementation(async ({ where }: any) =>
            where.expectedDate ? ordenes.filter((o) => cumple(where.expectedDate, o.expectedDate)).length : ordenes.length,
          ),
          aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
        },
        supplierEvaluation: { groupBy: jest.fn().mockResolvedValue([]) },
      };
      const tablero = await svc.getProcurementDashboard(7);
      expect(tablero.overdueDeliveries).toBe(1);
    });

    it('el recordatorio de la mañana incluye la que llega hoy y las de los tres días siguientes', async () => {
      a(MANANA_8AM);
      const svc = Object.create(CronService.prototype) as any;
      svc.logger = silencio;
      svc.email = { sendPurchaseOrderReminder: jest.fn().mockResolvedValue(undefined) };
      const todas = [...ordenes, { poNumber: 'OC-EN-3', expectedDate: dia('2026-11-24') }, { poNumber: 'OC-EN-4', expectedDate: dia('2026-11-25') }];
      svc.prisma = {
        purchaseOrder: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) =>
            todas
              .filter((o) => cumple(where.expectedDate, o.expectedDate))
              .map((o) => ({ ...o, supplier: { name: 'Proveedor Demo' }, createdBy: { email: 'demo@example.com' } })),
          ),
        },
      };
      await svc.handlePOReminders();
      expect(svc.email.sendPurchaseOrderReminder.mock.calls.map((c: any[]) => c[1])).toEqual(['OC-HOY', 'OC-MANANA', 'OC-EN-3']);
    });
  });

  describe('visitas de mantenimiento', () => {
    const visitas = [
      { id: 1, scheduledDate: AYER },
      { id: 2, scheduledDate: HOY },
      { id: 3, scheduledDate: MANANA },
    ];

    it.each([
      ['a las 8 de la mañana', MANANA_8AM],
      ['a las 7:30 de la tarde', TARDE],
    ])('%s el cliente sigue viendo la visita de hoy entre las próximas', async (_cuando, instante) => {
      a(instante);
      const vacio = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) });
      const ctrl = Object.create(ClientPortalController.prototype) as any;
      ctrl.prisma = {
        operationalProject: vacio(),
        maintenanceContract: vacio(),
        maintenanceContractVisit: {
          findMany: jest.fn().mockImplementation(async ({ where }: any) => visitas.filter((v) => cumple(where.scheduledDate, v.scheduledDate))),
        },
        activity: vacio(),
        serviceClientBranch: vacio(),
        clientActivityFeedback: vacio(),
      };
      const resumen = await ctrl.servicesSummary({ clientId: 3 });
      expect(resumen.upcomingVisits.map((v: any) => v.id)).toEqual([2, 3]);
      expect(resumen.summary.upcomingVisits).toBe(2);
    });

    it.each([
      ['a las 8 de la mañana', MANANA_8AM],
      ['a las 7:30 de la tarde', TARDE],
    ])('%s la visita de hoy y la de mañana no se avisan como «SLA vencido»; la de ayer sí', async (_cuando, instante) => {
      a(instante);
      const svc = Object.create(AlertsService.prototype) as any;
      svc.logger = silencio;
      svc.getUserIdsByOrgRoles = jest.fn().mockResolvedValue([1]);
      svc.fanout = jest.fn().mockResolvedValue(undefined);
      svc.prisma = {
        maintenanceContractVisit: {
          findMany: jest.fn().mockResolvedValue(
            visitas.map((v) => ({ ...v, activityId: null, contract: { id: 1, contractNumber: 'MC-1', title: 'Póliza Demo', ownerId: null }, assignedTo: null })),
          ),
        },
      };
      await svc.checkMaintenanceSlaAlerts();
      const avisos = svc.fanout.mock.calls.map((c: any[]) => [c[1].relatedEntityId, c[1].priority]);
      expect(avisos).toEqual([
        [1, 'high'],
        [2, 'normal'],
        [3, 'normal'],
      ]);
    });
  });

  it('ningún módulo compara un día de calendario con el instante de ahora', () => {
    const raiz = join(__dirname, '..', '..');
    // `CrmActivity.dueDate` sí es un instante con hora.
    const CON_HORA = ['crm-activities/', 'activity-feed/'];
    const PATRON = /\b(dueDate|expectedDate|requiredDate|scheduledDate|scheduledFor|validUntil|nextVisitDate)\s*:\s*\{[^}]*\b(lt|lte|gt|gte)\s*:\s*(new Date\(\)|now|ahora)\s*[,}]/;
    const hallazgos: string[] = [];
    const recorre = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorre(ruta);
        else if (nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts')) {
          const rel = relative(raiz, ruta);
          if (CON_HORA.some((c) => rel.startsWith(c))) continue;
          readFileSync(ruta, 'utf8')
            .split('\n')
            .forEach((linea, i) => {
              if (PATRON.test(linea)) hallazgos.push(`${rel}:${i + 1}`);
            });
        }
      }
    };
    recorre(raiz);
    expect(hallazgos).toEqual([]);
  });
});
