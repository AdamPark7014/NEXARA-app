import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isFinishedStatus } from '../activities/activity-status.js';
import { appUrls } from '../common/app-urls.js';

export type CalendarEvent = {
  id: string;
  source: 'CRM' | 'MAINTENANCE' | 'ACTIVITY' | 'TENDER' | 'PROJECT';
  type: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  ownerId?: number | null;
  ownerName?: string | null;
  color: string;
  url?: string;
  metadata?: Record<string, any>;
};

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve eventos en un rango de fechas, agregados de varias fuentes. */
  async getEvents(filters: { from: Date; to: Date; ownerId?: number }) {
    const { from, to, ownerId } = filters;

    const [crmActivities, maintenanceVisits, opActivities, tenderDeadlines, projects] = await Promise.all([
      // CRM activities (calls/meetings/tasks)
      (this.prisma as any).crmActivity.findMany({
        where: {
          dueDate: { gte: from, lte: to },
          ...(ownerId ? { ownerId } : {}),
        },
        include: {
          owner: { select: { id: true, nombre: true } },
          lead: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
          tender: { select: { id: true, tenderNumber: true } },
        },
      }).catch(() => []),

      // Visitas de mantenimiento
      (this.prisma as any).maintenanceContractVisit.findMany({
        where: {
          scheduledDate: { gte: from, lte: to },
          status: { in: ['SCHEDULED', 'GENERATED'] },
        },
        include: {
          contract: { select: { id: true, contractNumber: true, title: true, client: { select: { name: true } } } },
          assignedTo: { select: { id: true, nombre: true } },
        },
      }).catch(() => []),

      // Operational activities (OT con fechaAsignacion)
      this.prisma.activity.findMany({
        where: {
          fechaEntregaEsperada: { gte: from, lte: to },
          ...(ownerId ? { responsableId: ownerId } : {}),
        },
        select: {
          id: true,
          anNumber: true,
          titulo: true,
          estatus: true,
          fechaEntregaEsperada: true,
          fechaAsignacion: true,
          responsable: { select: { id: true, nombre: true } },
          branchName: true,
        },
      }).catch(() => []),

      // Tender deadlines
      (this.prisma as any).tender.findMany({
        where: {
          submissionDeadline: { gte: from, lte: to },
          deletedAt: null,
        },
        select: {
          id: true,
          tenderNumber: true,
          title: true,
          submissionDeadline: true,
          status: true,
          owner: { select: { id: true, nombre: true } },
        },
      }).catch(() => []),

      // Project deadlines
      this.prisma.operationalProject.findMany({
        where: {
          endDate: { gte: from, lte: to },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          status: true,
          endDate: true,
          startDate: true,
          vendor: { select: { id: true, nombre: true } },
        },
      }).catch(() => []),
    ]);

    const events: CalendarEvent[] = [];

    crmActivities.forEach((a: any) => {
      events.push({
        id: `crm-${a.id}`,
        source: 'CRM',
        type: a.activityType,
        title: `${a.activityType}: ${a.subject}`,
        description: a.description,
        start: a.dueDate.toISOString(),
        ownerId: a.ownerId,
        ownerName: a.owner?.nombre || null,
        color: a.status === 'COMPLETED' ? '#16a34a' : a.dueDate < new Date() ? '#dc2626' : '#8b5cf6',
        url: a.opportunityId ? `/crm/opportunities/${a.opportunityId}` : a.leadId ? `/crm/leads?highlight=${a.leadId}` : a.tenderId ? `/crm/tenders?highlight=${a.tenderId}` : undefined,
        metadata: { lead: a.lead, opportunity: a.opportunity, tender: a.tender, status: a.status },
      });
    });

    maintenanceVisits.forEach((v: any) => {
      events.push({
        id: `maint-${v.id}`,
        source: 'MAINTENANCE',
        type: 'VISIT',
        title: `Visita: ${v.contract.contractNumber}`,
        description: `${v.contract.title} — ${v.contract.client?.name || ''}`,
        start: v.scheduledDate.toISOString(),
        ownerId: v.assignedToId,
        ownerName: v.assignedTo?.nombre || null,
        color: '#0ea5e9',
        url: `/ops/maintenance/contracts?highlight=${v.contract.id}`,
        metadata: { contract: v.contract, status: v.status, visitId: v.id },
      });
    });

    opActivities.forEach((act: any) => {
      events.push({
        id: `ot-${act.id}`,
        source: 'ACTIVITY',
        type: 'OT',
        title: `OT ${act.anNumber}: ${act.titulo}`,
        description: act.branchName || undefined,
        start: act.fechaEntregaEsperada?.toISOString() || act.fechaAsignacion?.toISOString() || '',
        ownerId: act.responsable?.id,
        ownerName: act.responsable?.nombre || null,
        color: isFinishedStatus(act.estatus) ? '#16a34a' : act.estatus === 'En Proceso' ? '#3b82f6' : '#f59e0b',
        url: appUrls.opsActivity(act.id),
        metadata: { status: act.estatus, branch: act.branchName },
      });
    });

    tenderDeadlines.forEach((t: any) => {
      events.push({
        id: `tender-${t.id}`,
        source: 'TENDER',
        type: 'SUBMISSION_DEADLINE',
        title: `📋 Cierre: ${t.tenderNumber}`,
        description: t.title,
        start: t.submissionDeadline.toISOString(),
        ownerId: t.owner?.id,
        ownerName: t.owner?.nombre || null,
        color: '#dc2626',
        url: appUrls.crmTender(t.id),
        metadata: { status: t.status },
      });
    });

    projects.forEach((p: any) => {
      if (p.endDate) {
        events.push({
          id: `proj-${p.id}-end`,
          source: 'PROJECT',
          type: 'PROJECT_END',
          title: `🏁 Fin proyecto: ${p.title}`,
          start: p.endDate.toISOString(),
          ownerId: p.vendor?.id,
          ownerName: p.vendor?.nombre || null,
          color: '#16a34a',
          url: appUrls.opsProject(p.id),
          metadata: { status: p.status },
        });
      }
    });

    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
}
