import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountingService } from './accounting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

/**
 * Cierre de periodo contable — lista de verificación + cierre con bloqueo.
 *
 * `AccountingService` ya sabe cerrar y reabrir un periodo, pero cerraba a
 * ciegas: un clic y el periodo quedaba cerrado con facturas sin XML, banco sin
 * conciliar y pólizas en borrador dentro. Aquí se calcula, contra la base, qué
 * falta antes de cerrar, y el cierre se rechaza mientras haya pendientes
 * bloqueantes salvo que quien cierra escriba una justificación, que queda en la
 * bitácora de auditoría junto al estado anterior del periodo.
 *
 * Aislamiento por empresa: `requireCompanyId` + `companyWhere` en TODA consulta.
 * `JournalEntryLine` no tiene `companyId` propio, así que se filtra por la
 * relación con su póliza, que sí lo tiene.
 */

export type EstadoItem = 'ok' | 'advertencia' | 'bloqueante';

export interface ItemVerificacion {
  /** Identificador estable para la UI (no traducir). */
  id: string;
  etiqueta: string;
  /** Qué significa y por qué importa, en español llano. */
  descripcion: string;
  estado: EstadoItem;
  conteo: number;
  /** A dónde ir a resolverlo. `null` si no hay pantalla. */
  href: string | null;
}

export interface ListaVerificacionCierre {
  periodo: {
    id: number;
    nombre: string;
    inicio: string;
    fin: string;
    cerrado: boolean;
    cerradoEl: string | null;
    cerradoPorId: number | null;
  };
  items: ItemVerificacion[];
  bloqueantes: number;
  advertencias: number;
  /** `true` solo si el periodo sigue abierto y no queda ningún bloqueante. */
  puedeCerrar: boolean;
  /** `true` cuando hay bloqueantes: cerrar exigirá justificación escrita. */
  requiereJustificacion: boolean;
  /**
   * Qué protege de verdad el cierre hoy. Se manda al front para no prometer en
   * la UI un candado que el backend no tiene (ver KNOWN_ISSUES del reporte).
   */
  proteccion: {
    bloqueado: string[];
    noBloqueado: string[];
  };
  generadoEl: string;
}

/** Longitud mínima de la justificación para forzar un cierre con bloqueantes. */
const MIN_JUSTIFICACION = 20;

/** Estados de pre-nómina que cuentan como "sin cerrar". */
const PRENOMINA_BORRADOR = ['Borrador', 'DRAFT', 'borrador', 'draft'];

@Injectable()
export class PeriodCloseService {
  private readonly logger = new Logger(PeriodCloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  // ── Lista de verificación ─────────────────────────────────────────

  async getChecklist(periodId: number, companyId?: number | null): Promise<ListaVerificacionCierre> {
    const tenantId = requireCompanyId(companyId);
    const periodo = await this.loadPeriod(periodId, tenantId);
    const { inicio, fin } = this.rangoDelPeriodo(periodo.startDate, periodo.endDate);

    const [
      facturasSinXml,
      facturasSinCobrar,
      bancoSinConciliar,
      polizasBorrador,
      prenominaAbierta,
      renglonesSinCentro,
      polizasSinPeriodo,
    ] = await Promise.all([
      // Facturas emitidas (ya fuera de borrador) sin XML CFDI timbrado.
      this.prisma.invoice.count({
        where: {
          ...companyWhere(tenantId),
          deletedAt: null,
          type: 'ACCOUNTS_RECEIVABLE',
          isCancelled: false,
          issueDate: { gte: inicio, lte: fin },
          status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
          OR: [{ cfdiXml: null }, { cfdiXml: '' }, { cfdiUuid: null }],
        },
      }),
      // Facturas del periodo sin un solo peso cobrado.
      this.prisma.invoice.count({
        where: {
          ...companyWhere(tenantId),
          deletedAt: null,
          isCancelled: false,
          issueDate: { gte: inicio, lte: fin },
          status: { in: ['SENT', 'OVERDUE'] },
          paidAmount: { equals: 0 },
        },
      }),
      // Movimientos de banco del periodo sin conciliar o con conciliación pendiente.
      this.prisma.bankTransaction.count({
        where: {
          ...companyWhere(tenantId),
          transactionDate: { gte: inicio, lte: fin },
          OR: [{ reconciliation: { is: null } }, { reconciliation: { status: 'PENDING' } }],
        },
      }),
      // Pólizas en borrador: no están en los saldos, así que el periodo no cuadra.
      this.prisma.journalEntry.count({
        where: {
          ...companyWhere(tenantId),
          status: 'DRAFT',
          OR: [{ fiscalPeriodId: periodId }, { date: { gte: inicio, lte: fin } }],
        },
      }),
      // Pre-nómina que se traslapa con el periodo y sigue en borrador.
      this.prisma.employeePayment.count({
        where: {
          ...companyWhere(tenantId),
          deletedAt: null,
          status: { in: PRENOMINA_BORRADOR },
          periodFrom: { lte: fin },
          periodTo: { gte: inicio },
        },
      }),
      // Renglones sin centro de costo: el gasto no se puede repartir.
      this.prisma.journalEntryLine.count({
        where: {
          costCenterId: null,
          journalEntry: {
            ...companyWhere(tenantId),
            OR: [{ fiscalPeriodId: periodId }, { date: { gte: inicio, lte: fin } }],
          },
        },
      }),
      // Pólizas con fecha del periodo que nunca quedaron amarradas a él.
      this.prisma.journalEntry.count({
        where: {
          ...companyWhere(tenantId),
          fiscalPeriodId: null,
          date: { gte: inicio, lte: fin },
        },
      }),
    ]);

    const items: ItemVerificacion[] = [
      this.item({
        id: 'facturas-sin-xml',
        etiqueta: 'Facturas emitidas sin XML CFDI',
        descripcion:
          'Facturas de cobro ya emitidas que no tienen el XML timbrado del SAT. Sin XML no hay comprobante fiscal del ingreso.',
        conteo: facturasSinXml,
        severidad: 'bloqueante',
        href: '/erp/contabilidad/facturas',
      }),
      this.item({
        id: 'facturas-sin-pago',
        etiqueta: 'Facturas del periodo sin pago registrado',
        descripcion:
          'Facturas emitidas o vencidas en las que no se ha registrado ningún cobro. No impiden cerrar, pero conviene revisarlas antes.',
        conteo: facturasSinCobrar,
        severidad: 'advertencia',
        href: '/erp/contabilidad/cuentas-por-cobrar',
      }),
      this.item({
        id: 'banco-sin-conciliar',
        etiqueta: 'Movimientos bancarios sin conciliar',
        descripcion:
          'Movimientos del estado de cuenta dentro del periodo que siguen sin conciliar o con la conciliación en pendiente.',
        conteo: bancoSinConciliar,
        severidad: 'bloqueante',
        href: '/erp/contabilidad/conciliacion',
      }),
      this.item({
        id: 'polizas-borrador',
        etiqueta: 'Pólizas en borrador sin contabilizar',
        descripcion:
          'Pólizas capturadas pero no contabilizadas. Mientras estén en borrador no mueven saldos y el periodo no cuadra.',
        conteo: polizasBorrador,
        severidad: 'bloqueante',
        href: '/erp/accounting',
      }),
      this.item({
        id: 'prenomina-sin-cerrar',
        etiqueta: 'Pre-nómina del periodo sin cerrar',
        descripcion:
          'Pagos a personal que se traslapan con el periodo y siguen en borrador. Su póliza de egreso todavía no existe.',
        conteo: prenominaAbierta,
        severidad: 'bloqueante',
        href: '/erp/contabilidad/pre-nomina',
      }),
      this.item({
        id: 'renglones-sin-centro-costo',
        etiqueta: 'Renglones sin centro de costo',
        descripcion:
          'Renglones de póliza del periodo sin centro de costo. El gasto entra a los libros pero no se puede repartir por área.',
        conteo: renglonesSinCentro,
        severidad: 'advertencia',
        href: '/erp/accounting',
      }),
      this.item({
        id: 'polizas-sin-periodo',
        etiqueta: 'Pólizas con fecha del periodo sin periodo asignado',
        descripcion:
          'Pólizas fechadas dentro del rango que nunca quedaron amarradas a este periodo fiscal. Al cerrar, el candado por fecha sí las alcanza, pero no aparecen en sus reportes.',
        conteo: polizasSinPeriodo,
        severidad: 'advertencia',
        href: '/erp/accounting',
      }),
    ];

    const bloqueantes = items.filter((i) => i.estado === 'bloqueante').length;
    const advertencias = items.filter((i) => i.estado === 'advertencia').length;

    return {
      periodo: {
        id: periodo.id,
        nombre: periodo.name,
        inicio: this.soloFecha(periodo.startDate),
        fin: this.soloFecha(periodo.endDate),
        cerrado: periodo.isClosed,
        cerradoEl: periodo.closedAt ? periodo.closedAt.toISOString() : null,
        cerradoPorId: periodo.closedById ?? null,
      },
      items,
      bloqueantes,
      advertencias,
      puedeCerrar: !periodo.isClosed && bloqueantes === 0,
      requiereJustificacion: bloqueantes > 0,
      proteccion: {
        bloqueado: [
          'Capturar pólizas nuevas con fecha dentro del periodo',
          'Contabilizar pólizas que sigan en borrador dentro del periodo',
          'Cancelar una póliza ya contabilizada del periodo',
          'Marcar como pagado un gasto, viático o pago a personal con fecha del periodo',
        ],
        noBloqueado: [
          'Registrar el pago de una factura con fecha dentro del periodo',
          'Conciliar movimientos bancarios del periodo',
          'Cancelar ante el SAT una factura timbrada del periodo',
          'Importar movimientos bancarios con fecha del periodo',
          'Emitir o editar en borrador una factura con fecha del periodo',
        ],
      },
      generadoEl: new Date().toISOString(),
    };
  }

  // ── Cierre ────────────────────────────────────────────────────────

  async closePeriod(
    periodId: number,
    userId: number,
    dto: { justificacion?: string },
    companyId?: number | null,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const periodo = await this.loadPeriod(periodId, tenantId);
    if (periodo.isClosed) {
      throw new BadRequestException(`El periodo "${periodo.name}" ya está cerrado`);
    }

    const checklist = await this.getChecklist(periodId, tenantId);
    const pendientes = checklist.items.filter((i) => i.estado === 'bloqueante');
    const justificacion = (dto?.justificacion ?? '').trim();
    const forzado = pendientes.length > 0;

    if (forzado && !justificacion) {
      throw new BadRequestException(
        `No se puede cerrar: ${pendientes.length} punto(s) bloqueante(s) sin resolver ` +
          `(${pendientes.map((p) => `${p.etiqueta}: ${p.conteo}`).join('; ')}). ` +
          'Resuélvelos o escribe una justificación para cerrar de todos modos.',
      );
    }
    if (forzado && justificacion.length < MIN_JUSTIFICACION) {
      throw new BadRequestException(
        `La justificación debe explicar por qué se cierra con pendientes (mínimo ${MIN_JUSTIFICACION} caracteres).`,
      );
    }

    // El cierre en sí sigue siendo el del servicio de contabilidad: una sola
    // ruta escribe `isClosed`, y esta capa solo decide si se permite llegar ahí.
    const cerrado = await this.accounting.closeFiscalPeriod(periodId, userId, tenantId);

    await this.audit
      .log(
        {
          entityType: 'FiscalPeriod',
          entityId: periodId,
          action: forzado ? 'PERIOD_CLOSE_FORCED' : 'PERIOD_CLOSE',
          companyId: tenantId,
          source: 'api',
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          previousData: {
            nombre: periodo.name,
            isClosed: false,
            closedAt: null,
            closedById: null,
          },
          changes: {
            nombre: periodo.name,
            isClosed: true,
            closedAt: cerrado.closedAt ? cerrado.closedAt.toISOString() : null,
            closedById: userId,
            forzado,
            justificacion: justificacion || null,
            bloqueantes: pendientes.map((p) => ({ id: p.id, etiqueta: p.etiqueta, conteo: p.conteo })),
            verificacion: checklist.items.map((i) => ({
              id: i.id,
              estado: i.estado,
              conteo: i.conteo,
            })),
          },
        },
        userId,
      )
      .catch((err) => {
        // Un fallo de bitácora no puede revertir un cierre que ya ocurrió, pero
        // tampoco puede desaparecer: un cierre sin rastro es justo lo que esta
        // pantalla existe para evitar.
        this.logger.error(
          `Periodo ${periodId} cerrado SIN registro de auditoría — anótalo a mano. ` +
            `empresa=${tenantId} usuario=${userId} forzado=${forzado}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      });

    return {
      periodo: {
        id: cerrado.id,
        nombre: cerrado.name,
        cerrado: cerrado.isClosed,
        cerradoEl: cerrado.closedAt ? cerrado.closedAt.toISOString() : null,
        cerradoPorId: cerrado.closedById ?? null,
      },
      forzado,
      justificacion: justificacion || null,
      bloqueantesAlCerrar: pendientes.map((p) => ({ id: p.id, etiqueta: p.etiqueta, conteo: p.conteo })),
      proteccion: checklist.proteccion,
    };
  }

  // ── Internos ──────────────────────────────────────────────────────

  private async loadPeriod(periodId: number, tenantId: number) {
    const periodo = await this.prisma.fiscalPeriod.findFirst({
      where: { id: periodId, ...companyWhere(tenantId) },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isClosed: true,
        closedAt: true,
        closedById: true,
        companyId: true,
      },
    });
    assertCompanyAccess(periodo, tenantId, 'Periodo fiscal');
    return periodo;
  }

  private item(input: {
    id: string;
    etiqueta: string;
    descripcion: string;
    conteo: number;
    severidad: Exclude<EstadoItem, 'ok'>;
    href: string | null;
  }): ItemVerificacion {
    const conteo = Number(input.conteo) || 0;
    return {
      id: input.id,
      etiqueta: input.etiqueta,
      descripcion: input.descripcion,
      estado: conteo > 0 ? input.severidad : 'ok',
      conteo,
      href: input.href,
    };
  }

  /**
   * `startDate`/`endDate` son columnas `@db.Date`: Prisma las devuelve como
   * medianoche UTC. Se reconstruye el rango en UTC para que el día final entre
   * completo sin que la zona horaria del servidor recorte movimientos.
   */
  private rangoDelPeriodo(startDate: Date, endDate: Date) {
    const inicio = new Date(`${this.soloFecha(startDate)}T00:00:00.000Z`);
    const fin = new Date(`${this.soloFecha(endDate)}T23:59:59.999Z`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('El periodo fiscal tiene fechas inválidas');
    }
    return { inicio, fin };
  }

  private soloFecha(value: Date): string {
    return new Date(value).toISOString().slice(0, 10);
  }
}
