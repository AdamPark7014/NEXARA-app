import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type ExportEntity = 'clients' | 'leads' | 'opportunities' | 'tenders' | 'invoices' | 'activities' | 'projects' | 'users' | 'kb-articles' | 'crm-activities';

function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: any) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.join(',');
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(',')).join('\n');
  return `${head}\n${body}`;
}

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportEntity(entity: ExportEntity, filters?: { from?: string; to?: string }): Promise<{ csv: string; filename: string; rowCount: number }> {
    const where: any = {};
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    let rows: any[] = [];

    switch (entity) {
      case 'clients':
        rows = (await this.prisma.salesClient.findMany({
          where,
          select: { id: true, name: true, legalName: true, taxId: true, industry: true, billingEmail: true, billingPhone: true, status: true, createdAt: true },
        })).map((c) => ({ ...c, createdAt: c.createdAt?.toISOString() }));
        break;
      case 'leads':
        rows = (await this.prisma.salesLead.findMany({
          where,
          select: { id: true, name: true, company: true, email: true, phone: true, status: true, score: true, source: true, createdAt: true },
        })).map((l) => ({ ...l, createdAt: l.createdAt?.toISOString() }));
        break;
      case 'opportunities':
        rows = (await this.prisma.salesOpportunity.findMany({
          where,
          select: { id: true, title: true, stage: true, value: true, probability: true, expectedCloseDate: true, closedAt: true, ownerId: true, createdAt: true },
        })).map((o) => ({
          ...o,
          value: Number(o.value || 0),
          expectedCloseDate: o.expectedCloseDate?.toISOString(),
          closedAt: o.closedAt?.toISOString(),
          createdAt: o.createdAt?.toISOString(),
        }));
        break;
      case 'tenders':
        rows = (await (this.prisma as any).tender.findMany({
          where,
          select: { id: true, tenderNumber: true, title: true, tenderType: true, status: true, conveningEntity: true, budgetCeiling: true, submissionDeadline: true, createdAt: true },
        })).map((t: any) => ({
          ...t,
          budgetCeiling: Number(t.budgetCeiling || 0),
          submissionDeadline: t.submissionDeadline?.toISOString(),
          createdAt: t.createdAt?.toISOString(),
        }));
        break;
      case 'invoices':
        rows = (await this.prisma.invoice.findMany({
          where,
          select: { id: true, invoiceNumber: true, type: true, status: true, issueDate: true, dueDate: true, subtotal: true, taxAmount: true, totalAmount: true, paidAmount: true, currency: true, cfdiUuid: true, isCancelled: true },
        })).map((i) => ({
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
        rows = (await this.prisma.activity.findMany({
          where,
          select: { id: true, anNumber: true, titulo: true, estatus: true, prioridad: true, ticketType: true, branchName: true, fechaAsignacion: true, fechaInicio: true, fechaFinalizacion: true, fechaEntregaEsperada: true },
        })).map((a) => ({
          ...a,
          fechaAsignacion: a.fechaAsignacion?.toISOString(),
          fechaInicio: a.fechaInicio?.toISOString(),
          fechaFinalizacion: a.fechaFinalizacion?.toISOString(),
          fechaEntregaEsperada: a.fechaEntregaEsperada?.toISOString(),
        }));
        break;
      case 'projects':
        rows = (await this.prisma.operationalProject.findMany({
          where,
          select: { id: true, title: true, projectType: true, status: true, startDate: true, endDate: true, actualEndDate: true, vendorId: true, clientId: true },
        })).map((p) => ({
          ...p,
          startDate: p.startDate?.toISOString(),
          endDate: p.endDate?.toISOString(),
          actualEndDate: p.actualEndDate?.toISOString(),
        }));
        break;
      case 'users':
        rows = (await this.prisma.user.findMany({
          select: { id: true, nombre: true, email: true, employeeNumber: true, roleId: true, departmentId: true, fechaCreacion: true },
        })).map((u) => ({ ...u, fechaCreacion: u.fechaCreacion?.toISOString() }));
        break;
      case 'kb-articles':
        rows = (await (this.prisma as any).kbArticle.findMany({
          select: { id: true, slug: true, title: true, visibility: true, status: true, viewCount: true, helpfulCount: true, publishedAt: true, createdAt: true },
        })).map((a: any) => ({
          ...a,
          publishedAt: a.publishedAt?.toISOString(),
          createdAt: a.createdAt?.toISOString(),
        }));
        break;
      case 'crm-activities':
        rows = (await (this.prisma as any).crmActivity.findMany({
          where,
          select: { id: true, activityType: true, status: true, subject: true, dueDate: true, completedAt: true, ownerId: true, leadId: true, opportunityId: true, tenderId: true, createdAt: true },
        })).map((a: any) => ({
          ...a,
          dueDate: a.dueDate?.toISOString(),
          completedAt: a.completedAt?.toISOString(),
          createdAt: a.createdAt?.toISOString(),
        }));
        break;
      default:
        throw new BadRequestException(`Entidad ${entity} no soportada`);
    }

    return {
      csv: toCsv(rows),
      filename: `${entity}-${stamp}.csv`,
      rowCount: rows.length,
    };
  }
}
