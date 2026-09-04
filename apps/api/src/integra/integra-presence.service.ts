import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityLinkService } from '../identity/identity-link.service';
import { IntegraPushService } from './integra-push.service';

const CLOSED_ACTIVITY = /finaliz|completad|cancelad|aprobad|approved/i;
const OPEN_LEAD = ['NEW', 'QUALIFIED', 'NURTURING'] as const;
const OPEN_OPP = [
  'DISCOVERY',
  'QUALIFICATION',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSING',
] as const;

/**
 * Presencia operativa cruzada: ocupación ACS + ficha (puertas hoy,
 * actividades abiertas, CRM). No toca el ingest de push — solo lee.
 */
@Injectable()
export class IntegraPresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: IntegraPushService,
    private readonly identity: IdentityLinkService,
  ) {}

  /** Lista «en sitio» enriquecida con vínculo ERP si existe. */
  async occupancyEnriched(
    companyId: number,
    opts: { siteId?: number | null; tz?: string } = {},
  ) {
    const base = await this.push.occupancy(companyId, opts);
    const items = await this.identity.attachErpUsers(
      companyId,
      base.items.map((it) => ({
        ...it,
        personId: it.personId,
        code: null as string | null,
      })),
    );
    return { ...base, items };
  }

  /**
   * Ficha al hacer clic en alguien «en sitio»:
   * puertas del día + OTs abiertas + CRM (si hay usuario ERP vinculado).
   */
  async personDetail(
    companyId: number,
    personId: string,
    opts: { siteId?: number | null; tz?: string } = {},
  ) {
    const pid = String(personId || '').trim();
    if (!pid) throw new NotFoundException('personId requerido');

    const tz = opts.tz || 'America/Mexico_City';
    const now = new Date();
    const from = startOfLocalDayApprox(now, tz);

    const [occ, doorsRaw, erpUser, person] = await Promise.all([
      this.push.occupancy(companyId, { siteId: opts.siteId, tz }),
      this.push.listEvents(companyId, {
        siteId: opts.siteId,
        personId: pid,
        take: 80,
        scope: 'acs',
        from,
        to: now,
      }),
      this.identity.resolvePerson(companyId, pid),
      this.prisma.integraPerson.findFirst({
        where: { companyId, personId: pid },
        select: {
          personId: true,
          personName: true,
          personCode: true,
          gender: true,
          userType: true,
        },
      }),
    ]);

    const onSite = occ.items.find((i) => i.personId === pid) || null;
    if (!onSite && !person && !doorsRaw.items?.length) {
      throw new NotFoundException(`Sin presencia ni eventos ACS para ${pid}`);
    }

    const doorsToday = (doorsRaw.items || []).map((e: {
      id: number;
      occurredAt: string | Date;
      deviceName: string | null;
      doorNo: number | null;
      verifyMode: string | null;
      photoPath: string | null;
      minor: number | null;
      label: string | null;
    }) => ({
      id: e.id,
      at: typeof e.occurredAt === 'string' ? e.occurredAt : e.occurredAt.toISOString(),
      door: e.deviceName || (e.doorNo != null ? `Puerta ${e.doorNo}` : 'Acceso'),
      doorNo: e.doorNo,
      verifyMode: e.verifyMode,
      photoPath: e.photoPath,
      outcome: e.minor != null ? String(e.minor) : null,
      label: e.label,
    }));

    let openActivities: Array<{
      id: number;
      anNumber: string;
      titulo: string;
      estatus: string;
      fechaEntregaEsperada: string | null;
      clientName: string | null;
    }> = [];
    let crm: {
      leads: Array<{ id: number; name: string | null; company: string | null; status: string }>;
      opportunities: Array<{
        id: number;
        title: string;
        stage: string;
        value: number;
        clientName: string | null;
      }>;
    } | null = null;

    if (erpUser) {
      const activities = await this.prisma.activity.findMany({
        where: {
          companyId,
          responsableId: erpUser.id,
          deletedAt: null,
        },
        orderBy: [{ fechaEntregaEsperada: 'asc' }, { id: 'desc' }],
        take: 40,
        select: {
          id: true,
          anNumber: true,
          titulo: true,
          estatus: true,
          fechaEntregaEsperada: true,
          client: { select: { name: true } },
        },
      });
      openActivities = activities
        .filter((a) => !CLOSED_ACTIVITY.test(a.estatus || ''))
        .slice(0, 12)
        .map((a) => ({
          id: a.id,
          anNumber: a.anNumber,
          titulo: a.titulo,
          estatus: a.estatus,
          fechaEntregaEsperada: a.fechaEntregaEsperada?.toISOString() ?? null,
          clientName: a.client?.name ?? null,
        }));

      const [leads, opportunities] = await Promise.all([
        this.prisma.salesLead.findMany({
          where: {
            companyId,
            ownerId: erpUser.id,
            status: { in: [...OPEN_LEAD] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: { id: true, name: true, company: true, status: true },
        }),
        this.prisma.salesOpportunity.findMany({
          where: {
            companyId,
            ownerId: erpUser.id,
            stage: { in: [...OPEN_OPP] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            title: true,
            stage: true,
            value: true,
            client: { select: { name: true } },
          },
        }),
      ]);

      crm = {
        leads: leads.map((l) => ({
          id: l.id,
          name: l.name,
          company: l.company,
          status: l.status,
        })),
        opportunities: opportunities.map((o) => ({
          id: o.id,
          title: o.title,
          stage: o.stage,
          value: Number(o.value),
          clientName: o.client?.name ?? null,
        })),
      };
      if (!crm.leads.length && !crm.opportunities.length) crm = null;
    }

    return {
      personId: pid,
      personName: onSite?.personName || person?.personName || null,
      personCode: person?.personCode ?? null,
      onSite: Boolean(onSite),
      lastAt: onSite?.lastAt ?? doorsToday[0]?.at ?? null,
      lastDoor: onSite?.lastDoor ?? doorsToday[0]?.door ?? null,
      lastPhoto: onSite?.lastPhoto ?? doorsToday[0]?.photoPath ?? null,
      verifyMode: onSite?.verifyMode ?? null,
      erpUser: erpUser
        ? {
            id: erpUser.id,
            nombre: erpUser.nombre,
            email: erpUser.email,
            employeeNumber: erpUser.employeeNumber,
            role: erpUser.role?.nombre ?? null,
            department: erpUser.department?.nombre ?? null,
          }
        : null,
      doorsToday,
      openActivities,
      crm,
      note: 'Presencia por accesos ACS. Actividades y CRM solo si hay vínculo employeeNumber ↔ personId.',
    };
  }
}

/** Medianoche local aproximada (misma heurística que occupancy: ventana ~18–30 h). */
function startOfLocalDayApprox(now: Date, _tz: string): Date {
  return new Date(now.getTime() - 18 * 3600_000);
}
