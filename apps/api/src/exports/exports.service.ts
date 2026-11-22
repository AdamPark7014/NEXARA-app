import { whereCotizacionesVisibles, type Actor } from '../common/visibilidad/visibilidad.js';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateRange } from '../common/time/workday.js';

export type ExportEntity =
  | 'clients'
  | 'leads'
  | 'opportunities'
  | 'tenders'
  | 'invoices'
  | 'activities'
  | 'projects'
  | 'users'
  | 'kb-articles'
  | 'crm-activities'
  | 'cotizaciones';

/** Campo de fecha por entidad (Activity no tiene createdAt). */
const DATE_FIELD: Partial<Record<ExportEntity, string>> = {
  clients: 'createdAt',
  leads: 'createdAt',
  opportunities: 'createdAt',
  tenders: 'createdAt',
  invoices: 'issueDate',
  activities: 'fechaAsignacion',
  projects: 'startDate',
  users: 'fechaCreacion',
  'kb-articles': 'createdAt',
  'crm-activities': 'createdAt',
  cotizaciones: 'issueDate',
};

/**
 * Columnas que guardan un día y no un instante (medianoche UTC): la fecha de la factura y de la
 * cotización, el inicio del proyecto. Se comparan por día calendario; las demás llevan hora y se
 * filtran por el día de la empresa.
 */
const CAMPOS_DE_SOLO_DIA = new Set(['issueDate', 'startDate']);

const ES_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Rango para una columna de solo día. No depende de la zona del servidor. */
function rangoDeDiasCalendario(desde?: string, hasta?: string): { gte?: Date; lte?: Date } | undefined {
  const rango: { gte?: Date; lte?: Date } = {};
  const inicio = desde?.trim() ? new Date(desde.trim()) : null;
  const hastaLimpio = hasta?.trim();
  const fin = hastaLimpio
    ? new Date(ES_SOLO_DIA.test(hastaLimpio) ? `${hastaLimpio}T23:59:59.999Z` : hastaLimpio)
    : null;
  if (inicio && !Number.isNaN(inicio.getTime())) rango.gte = inicio;
  if (fin && !Number.isNaN(fin.getTime())) rango.lte = fin;
  return rango.gte || rango.lte ? rango : undefined;
}

/**
 * Filtro «del día X al día Y» de una exportación.
 *
 * El servidor corre en UTC: armar el rango con su reloj cerraba el día a las 18:00 de México y lo
 * capturado esa tarde salía en el archivo del día siguiente.
 */
export function buildDateWhere(entity: ExportEntity, filters?: { from?: string; to?: string }) {
  const field = DATE_FIELD[entity];
  if (!field || (!filters?.from && !filters?.to)) return {};
  const range = CAMPOS_DE_SOLO_DIA.has(field)
    ? rangoDeDiasCalendario(filters.from, filters.to)
    : workDateRange(filters.from, filters.to);
  return range ? { [field]: range } : {};
}

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportEntity(
    entity: ExportEntity,
    filters?: { from?: string; to?: string },
    companyId?: number | null,
    actor?: Actor,
  ): Promise<{ rows: any[]; filename: string; rowCount: number }> {
    const tenantId = requireCompanyId(companyId);
    const dateWhere = buildDateWhere(entity, filters);
    // User is not companyId-stamped — scope via UserCompany membership.
    const where: any =
      entity === 'users'
        ? { ...dateWhere, companyMemberships: { some: { companyId: tenantId } } }
        : { ...dateWhere, ...companyWhere(tenantId) };
    const stamp = new Date().toISOString().slice(0, 10);
    let rows: any[] = [];

    switch (entity) {
      case 'clients':
        rows = (
          await this.prisma.salesClient.findMany({
            where,
            select: {
              id: true,
              name: true,
              legalName: true,
              taxId: true,
              industry: true,
              billingEmail: true,
              billingPhone: true,
              status: true,
              createdAt: true,
            },
          })
        ).map((c) => ({ ...c, createdAt: c.createdAt?.toISOString() }));
        break;
      case 'leads':
        rows = (
          await this.prisma.salesLead.findMany({
            where,
            select: {
              id: true,
              name: true,
              company: true,
              email: true,
              phone: true,
              status: true,
              score: true,
              source: true,
              createdAt: true,
            },
          })
        ).map((l) => ({ ...l, createdAt: l.createdAt?.toISOString() }));
        break;
      case 'opportunities':
        rows = (
          await this.prisma.salesOpportunity.findMany({
            where,
            select: {
              id: true,
              title: true,
              stage: true,
              value: true,
              probability: true,
              expectedCloseDate: true,
              closedAt: true,
              ownerId: true,
              createdAt: true,
            },
          })
        ).map((o) => ({
          ...o,
          value: Number(o.value || 0),
          expectedCloseDate: o.expectedCloseDate?.toISOString(),
          closedAt: o.closedAt?.toISOString(),
          createdAt: o.createdAt?.toISOString(),
        }));
        break;
      case 'tenders':
        rows = (
          await (this.prisma as any).tender.findMany({
            where,
            select: {
              id: true,
              tenderNumber: true,
              title: true,
              tenderType: true,
              status: true,
              conveningEntity: true,
              budgetCeiling: true,
              submissionDeadline: true,
              createdAt: true,
            },
          })
        ).map((t: any) => ({
          ...t,
          budgetCeiling: Number(t.budgetCeiling || 0),
          submissionDeadline: t.submissionDeadline?.toISOString(),
          createdAt: t.createdAt?.toISOString(),
        }));
        break;
      case 'invoices':
        rows = (
          await this.prisma.invoice.findMany({
            where,
            select: {
              id: true,
              invoiceNumber: true,
              type: true,
              status: true,
              issueDate: true,
              dueDate: true,
              subtotal: true,
              taxAmount: true,
              totalAmount: true,
              paidAmount: true,
              currency: true,
              cfdiUuid: true,
              isCancelled: true,
            },
          })
        ).map((i) => ({
          ...i,
          subtotal: Number(i.subtotal || 0),
          taxAmount: Number(i.taxAmount || 0),
          totalAmount: Number(i.totalAmount || 0),
          paidAmount: Number(i.paidAmount || 0),
          issueDate: i.issueDate?.toISOString(),
          dueDate: i.dueDate?.toISOString(),
        }));
        break;
      case 'activities':
        rows = (
          await this.prisma.activity.findMany({
            where,
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              prioridad: true,
              ticketType: true,
              branchName: true,
              fechaAsignacion: true,
              fechaInicio: true,
              fechaFinalizacion: true,
              fechaEntregaEsperada: true,
            },
          })
        ).map((a) => ({
          ...a,
          fechaAsignacion: a.fechaAsignacion?.toISOString(),
          fechaInicio: a.fechaInicio?.toISOString(),
          fechaFinalizacion: a.fechaFinalizacion?.toISOString(),
          fechaEntregaEsperada: a.fechaEntregaEsperada?.toISOString(),
        }));
        break;
      case 'projects':
        rows = (
          await this.prisma.operationalProject.findMany({
            where,
            select: {
              id: true,
              title: true,
              projectType: true,
              status: true,
              startDate: true,
              endDate: true,
              actualEndDate: true,
              vendorId: true,
              clientId: true,
            },
          })
        ).map((p) => ({
          ...p,
          startDate: p.startDate?.toISOString(),
          endDate: p.endDate?.toISOString(),
          actualEndDate: p.actualEndDate?.toISOString(),
        }));
        break;
      case 'users':
        rows = (
          await this.prisma.user.findMany({
            where,
            select: {
              id: true,
              nombre: true,
              email: true,
              employeeNumber: true,
              roleId: true,
              departmentId: true,
              fechaCreacion: true,
            },
          })
        ).map((u) => ({ ...u, fechaCreacion: u.fechaCreacion?.toISOString() }));
        break;
      case 'kb-articles':
        rows = (
          await (this.prisma as any).kbArticle.findMany({
            where,
            select: {
              id: true,
              slug: true,
              title: true,
              visibility: true,
              status: true,
              viewCount: true,
              helpfulCount: true,
              publishedAt: true,
              createdAt: true,
            },
          })
        ).map((a: any) => ({
          ...a,
          publishedAt: a.publishedAt?.toISOString(),
          createdAt: a.createdAt?.toISOString(),
        }));
        break;
      case 'crm-activities':
        rows = (
          await (this.prisma as any).crmActivity.findMany({
            where,
            select: {
              id: true,
              activityType: true,
              status: true,
              subject: true,
              dueDate: true,
              completedAt: true,
              ownerId: true,
              leadId: true,
              opportunityId: true,
              tenderId: true,
              createdAt: true,
            },
          })
        ).map((a: any) => ({
          ...a,
          dueDate: a.dueDate?.toISOString(),
          completedAt: a.completedAt?.toISOString(),
          createdAt: a.createdAt?.toISOString(),
        }));
        break;
      case 'cotizaciones':
        rows = (
          await this.prisma.cotizacion.findMany({
            // Quién ve qué: el Excel solo trae las cotizaciones que quien exporta puede ver.
            where: { ...where, deletedAt: null, ...(actor ? { AND: [whereCotizacionesVisibles(actor)] } : {}) },
            select: {
              quoteNumber: true,
              folioEnviado: true,
              revision: true,
              projectName: true,
              clientName: true,
              clientCompany: true,
              status: true,
              segmento: true,
              currency: true,
              issueDate: true,
              validUntil: true,
              subtotal: true,
              discountTotal: true,
              taxTotal: true,
              total: true,
              preparedBy: true,
              sentAt: true,
              signedByName: true,
              signedAt: true,
            },
            orderBy: { issueDate: 'desc' },
          })
        ).map((c) => ({
          ...c,
          // El folio enviado lleva la cadena de quién intervino; es el que la gente cita.
          folio: c.folioEnviado || c.quoteNumber,
          subtotal: Number(c.subtotal || 0),
          discountTotal: Number(c.discountTotal || 0),
          taxTotal: Number(c.taxTotal || 0),
          total: Number(c.total || 0),
          issueDate: c.issueDate?.toISOString(),
          validUntil: c.validUntil?.toISOString(),
          sentAt: c.sentAt?.toISOString(),
          signedAt: c.signedAt?.toISOString(),
        }));
        break;
      default:
        throw new BadRequestException(`Entidad ${entity} no soportada`);
    }

    return {
      rows,
      filename: `${entity}-${stamp}.xlsx`,
      rowCount: rows.length,
    };
  }
}
