import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service.js';
import { mapMirrorPersonToDto } from '../hikvision-isapi/isapi-acs.js';

const GRANTED_MINORS = [1, 75, 76];

/** Fin ACS «indefinido» típico del firmware Hikvision. */
const INDEFINITE_END_YEAR = 2035;

export const SPACE_TEMPLATE_CATALOG = [
  {
    key: 'INDEFINITE',
    label: 'Acceso indefinido',
    description: 'Vigencia larga (estilo ACS 2020→2037). Personal fijo.',
  },
  {
    key: 'TIMED_DAY',
    label: 'Solo hoy',
    description: 'Válido el día en curso hasta medianoche.',
  },
  {
    key: 'TIMED_WEEK',
    label: '7 días',
    description: 'Ventana temporal de una semana desde el alta.',
  },
  {
    key: 'TIMED_30D',
    label: '30 días',
    description: 'Visitas o contratistas de un mes.',
  },
  {
    key: 'BOOKING_ONLY',
    label: 'Solo con reserva',
    description: 'Sin acceso permanente: usa ventanas de uso planificadas.',
  },
  {
    key: 'CUSTOM',
    label: 'Personalizado',
    description: 'Franja o duración definida en la política del espacio.',
  },
] as const;

export type SpaceTemplateKey = (typeof SPACE_TEMPLATE_CATALOG)[number]['key'];

export type AccessKind = 'indefinite' | 'timed' | 'expired' | 'off' | 'unknown';

function doorIp(doorIndexCode: string): string | null {
  const ip = doorIndexCode.split('|')[0]?.trim();
  return ip || null;
}

function doorNoOf(doorIndexCode: string): number | null {
  const n = Number(doorIndexCode.split('|')[1]);
  return Number.isFinite(n) ? n : null;
}

function extractDoorNos(plan: unknown, doorRight?: string | null): number[] {
  const nos = new Set<number>();
  if (Array.isArray(plan)) {
    for (const row of plan) {
      if (row && typeof row === 'object') {
        const n = (row as { doorNo?: unknown }).doorNo;
        if (typeof n === 'number' && Number.isFinite(n)) nos.add(n);
      }
    }
  }
  if (doorRight != null && String(doorRight).trim()) {
    for (const part of String(doorRight).split(/[,;\s]+/)) {
      const n = Number(part);
      if (Number.isFinite(n)) nos.add(n);
    }
  }
  if (nos.size === 0) nos.add(1);
  return [...nos];
}

function classifyValid(opts: {
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
}): { kind: AccessKind; label: string } {
  if (opts.validEnable === false) return { kind: 'off', label: 'Deshabilitada' };
  if (!opts.validTo) return { kind: 'unknown', label: 'Sin vigencia' };
  const end = Date.parse(opts.validTo);
  if (!Number.isFinite(end)) return { kind: 'unknown', label: opts.validTo };
  if (end < Date.now()) return { kind: 'expired', label: 'Vencida' };
  const endYear = new Date(end).getUTCFullYear();
  const yearsLeft = (end - Date.now()) / (365.25 * 86_400_000);
  if (endYear >= INDEFINITE_END_YEAR || yearsLeft >= 5) {
    return { kind: 'indefinite', label: 'Indefinido' };
  }
  return { kind: 'timed', label: 'Temporal' };
}

@Injectable()
export class IntegraSpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
  ) {}

  private async resolveSiteId(companyId: number, siteId?: number | null) {
    if (siteId) {
      const site = await this.prisma.integraSite.findFirst({
        where: { id: siteId, companyId },
        select: { id: true, name: true },
      });
      if (!site) throw new NotFoundException('Sitio no encontrado');
      return site;
    }
    const resolved = await this.sites.resolveClient({ companyId, siteId: null });
    if (!resolved.siteId) throw new BadRequestException('Sin sitio Integra activo');
    const site = await this.prisma.integraSite.findFirst({
      where: { id: resolved.siteId, companyId },
      select: { id: true, name: true },
    });
    if (!site) throw new NotFoundException('Sitio no encontrado');
    return site;
  }

  templates() {
    return { items: SPACE_TEMPLATE_CATALOG };
  }

  /**
   * Panel Espacios: todas las puertas/zonas con plantilla, conteos de vigencia
   * (indefinido vs temporal), última entrada y próximas ventanas de uso.
   */
  async overview(companyId: number, siteId?: number | null) {
    const site = await this.resolveSiteId(companyId, siteId);
    const [doors, people, policies, bookings, recentEvents] = await Promise.all([
      this.prisma.integraDoor.findMany({
        where: { siteId: site.id },
        orderBy: { name: 'asc' },
      }),
      this.prisma.integraPerson.findMany({
        where: { companyId, siteId: site.id },
        orderBy: { personName: 'asc' },
      }),
      this.prisma.integraSpacePolicy.findMany({
        where: { siteId: site.id },
      }),
      this.prisma.integraRoomBooking.findMany({
        where: {
          siteId: site.id,
          status: { in: ['PLANNED', 'DONE'] },
          endsAt: { gte: new Date(Date.now() - 12 * 3600_000) },
        },
        orderBy: { startsAt: 'asc' },
        take: 200,
      }),
      this.prisma.integraPushEvent.findMany({
        where: {
          siteId: site.id,
          major: 5,
          occurredAt: { gte: new Date(Date.now() - 36 * 3600_000) },
        },
        orderBy: { occurredAt: 'desc' },
        take: 400,
        select: {
          id: true,
          occurredAt: true,
          personId: true,
          personName: true,
          deviceIp: true,
          deviceName: true,
          doorNo: true,
          minor: true,
          verifyMode: true,
          photoPath: true,
          label: true,
        },
      }),
    ]);

    const policyByDoor = new Map(policies.map((p) => [p.doorIndexCode, p]));

    type PersonRow = {
      personId: string;
      personName: string;
      kind: AccessKind;
      kindLabel: string;
      validFrom?: string;
      validTo?: string;
      validEnable?: boolean;
      sourceIp?: string;
      doorCodes: string[];
    };

    const peopleRows: PersonRow[] = people.map((p) => {
      const dto = mapMirrorPersonToDto(p);
      const cls = classifyValid({
        validEnable: dto.validEnable,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
      });
      const ip = dto.sourceIp;
      const nos = extractDoorNos(dto.rightPlan, dto.doorRight);
      const doorCodes =
        ip != null ? nos.map((n) => `${ip}|${n}`) : ([] as string[]);
      return {
        personId: dto.id,
        personName: dto.name,
        kind: cls.kind,
        kindLabel: cls.label,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        validEnable: dto.validEnable,
        sourceIp: ip,
        doorCodes,
      };
    });

    const peopleByDoor = new Map<string, PersonRow[]>();
    for (const row of peopleRows) {
      for (const code of row.doorCodes) {
        const list = peopleByDoor.get(code) || [];
        list.push(row);
        peopleByDoor.set(code, list);
      }
    }

    const lastByDoor = new Map<string, (typeof recentEvents)[number]>();
    for (const ev of recentEvents) {
      const candidates: string[] = [];
      if (ev.deviceIp != null && ev.doorNo != null) {
        candidates.push(`${ev.deviceIp}|${ev.doorNo}`);
      }
      for (const d of doors) {
        const ip = doorIp(d.doorIndexCode);
        if (ip && ev.deviceIp === ip) candidates.push(d.doorIndexCode);
        if (
          ev.deviceName &&
          d.name &&
          ev.deviceName.toLowerCase() === d.name.toLowerCase()
        ) {
          candidates.push(d.doorIndexCode);
        }
      }
      for (const code of new Set(candidates)) {
        if (!lastByDoor.has(code)) lastByDoor.set(code, ev);
      }
    }

    const now = Date.now();
    const spaces = doors.map((d) => {
      const assigned = peopleByDoor.get(d.doorIndexCode) || [];
      const counts = {
        indefinite: assigned.filter((p) => p.kind === 'indefinite').length,
        timed: assigned.filter((p) => p.kind === 'timed').length,
        expired: assigned.filter((p) => p.kind === 'expired').length,
        off: assigned.filter((p) => p.kind === 'off').length,
        unknown: assigned.filter((p) => p.kind === 'unknown').length,
        total: assigned.length,
      };
      const policy = policyByDoor.get(d.doorIndexCode);
      const templateKey = (policy?.templateKey || 'INDEFINITE') as SpaceTemplateKey;
      const templateMeta =
        SPACE_TEMPLATE_CATALOG.find((t) => t.key === templateKey) ||
        SPACE_TEMPLATE_CATALOG[0];
      const doorBookings = bookings
        .filter((b) => b.doorIndexCode === d.doorIndexCode && b.status !== 'CANCELLED')
        .map((b) => {
          const start = b.startsAt.getTime();
          const end = b.endsAt.getTime();
          let phase: 'now' | 'upcoming' | 'past' = 'upcoming';
          if (end < now) phase = 'past';
          else if (start <= now && now <= end) phase = 'now';
          return {
            id: b.id,
            title: b.title,
            hostName: b.hostName,
            hostPersonId: b.hostPersonId,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
            status: b.status,
            notes: b.notes,
            phase,
          };
        });
      const last = lastByDoor.get(d.doorIndexCode);
      return {
        id: d.doorIndexCode,
        name: d.name,
        regionName: d.regionName,
        online: d.online,
        doorState: d.doorState,
        policy: {
          templateKey,
          label: policy?.label || templateMeta.label,
          description: templateMeta.description,
          config: policy?.config ?? null,
        },
        accessCounts: counts,
        nextWindow: doorBookings.find((b) => b.phase === 'now' || b.phase === 'upcoming') || null,
        windowsOpen: doorBookings.filter((b) => b.phase === 'now' || b.phase === 'upcoming').length,
        lastAccess: last
          ? {
              id: last.id,
              occurredAt: last.occurredAt.toISOString(),
              personId: last.personId,
              personName: last.personName,
              verifyMode: last.verifyMode,
              photoPath: last.photoPath,
              granted: GRANTED_MINORS.includes(last.minor ?? -1),
              label: last.label,
            }
          : null,
      };
    });

    const siteCounts = peopleRows.reduce(
      (acc, p) => {
        acc[p.kind] += 1;
        acc.total += 1;
        return acc;
      },
      { indefinite: 0, timed: 0, expired: 0, off: 0, unknown: 0, total: 0 },
    );

    return {
      siteId: site.id,
      siteName: site.name,
      generatedAt: new Date().toISOString(),
      templates: SPACE_TEMPLATE_CATALOG,
      siteAccess: siteCounts,
      spaces,
      note:
        'Vigencia leída del espejo ACS (Valid). Indefinido ≈ fin ≥ 2035. Las plantillas guían política; no reescriben el terminal solas.',
    };
  }

  async detail(companyId: number, doorIndexCode: string, siteId?: number | null) {
    const site = await this.resolveSiteId(companyId, siteId);
    const door = await this.prisma.integraDoor.findFirst({
      where: { siteId: site.id, doorIndexCode },
    });
    if (!door) throw new NotFoundException('Puerta / espacio no encontrado');

    const overview = await this.overview(companyId, site.id);
    const space = overview.spaces.find((s) => s.id === doorIndexCode);
    if (!space) throw new NotFoundException('Espacio no encontrado');

    const people = await this.prisma.integraPerson.findMany({
      where: { companyId, siteId: site.id },
    });
    const assigned = people
      .map((p) => {
        const dto = mapMirrorPersonToDto(p);
        const ip = dto.sourceIp;
        const nos = extractDoorNos(dto.rightPlan, dto.doorRight);
        const codes = ip != null ? nos.map((n) => `${ip}|${n}`) : [];
        if (!codes.includes(doorIndexCode)) return null;
        const cls = classifyValid({
          validEnable: dto.validEnable,
          validFrom: dto.validFrom,
          validTo: dto.validTo,
        });
        return {
          personId: dto.id,
          personName: dto.name,
          kind: cls.kind,
          kindLabel: cls.label,
          validFrom: dto.validFrom,
          validTo: dto.validTo,
          validEnable: dto.validEnable,
          hasFace: dto.hasFace,
          sourceIp: ip,
        };
      })
      .filter(Boolean);

    const windows = await this.prisma.integraRoomBooking.findMany({
      where: {
        siteId: site.id,
        doorIndexCode,
        status: { not: 'CANCELLED' },
        endsAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
      orderBy: { startsAt: 'asc' },
      take: 80,
    });

    const ip = doorIp(doorIndexCode);
    const dNo = doorNoOf(doorIndexCode);
    const recent = await this.prisma.integraPushEvent.findMany({
      where: {
        siteId: site.id,
        major: 5,
        occurredAt: { gte: new Date(Date.now() - 48 * 3600_000) },
        OR: [
          ...(ip
            ? [
                { deviceIp: ip, ...(dNo != null ? { doorNo: dNo } : {}) },
                { deviceIp: ip },
              ]
            : []),
          { deviceName: door.name },
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 40,
      select: {
        id: true,
        occurredAt: true,
        personId: true,
        personName: true,
        deviceIp: true,
        deviceName: true,
        doorNo: true,
        minor: true,
        verifyMode: true,
        photoPath: true,
        label: true,
      },
    });

    const now = Date.now();
    return {
      ...space,
      siteId: site.id,
      siteName: site.name,
      people: assigned,
      windows: windows.map((b) => {
        const start = b.startsAt.getTime();
        const end = b.endsAt.getTime();
        let phase: 'now' | 'upcoming' | 'past' = 'upcoming';
        if (end < now) phase = 'past';
        else if (start <= now && now <= end) phase = 'now';
        return {
          id: b.id,
          title: b.title,
          hostName: b.hostName,
          hostPersonId: b.hostPersonId,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          status: b.status,
          notes: b.notes,
          phase,
        };
      }),
      recentAccess: recent.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        personId: r.personId,
        personName: r.personName,
        verifyMode: r.verifyMode,
        photoPath: r.photoPath,
        granted: GRANTED_MINORS.includes(r.minor ?? -1),
        label: r.label,
      })),
    };
  }

  async upsertPolicy(
    companyId: number,
    doorIndexCode: string,
    input: {
      templateKey: string;
      label?: string | null;
      config?: Record<string, unknown> | null;
      siteId?: number | null;
    },
  ) {
    const site = await this.resolveSiteId(companyId, input.siteId);
    const door = await this.prisma.integraDoor.findFirst({
      where: { siteId: site.id, doorIndexCode },
      select: { id: true },
    });
    if (!door) throw new NotFoundException('Puerta / espacio no encontrado');

    const key = String(input.templateKey || '').toUpperCase();
    if (!SPACE_TEMPLATE_CATALOG.some((t) => t.key === key)) {
      throw new BadRequestException(
        `Plantilla no válida. Usa: ${SPACE_TEMPLATE_CATALOG.map((t) => t.key).join(', ')}`,
      );
    }

    const row = await this.prisma.integraSpacePolicy.upsert({
      where: {
        siteId_doorIndexCode: { siteId: site.id, doorIndexCode },
      },
      create: {
        companyId,
        siteId: site.id,
        doorIndexCode,
        templateKey: key,
        label: input.label?.trim() || null,
        config: input.config ?? undefined,
      },
      update: {
        templateKey: key,
        label: input.label !== undefined ? input.label?.trim() || null : undefined,
        config: input.config === undefined ? undefined : input.config,
      },
    });
    return row;
  }

  async listBookings(
    companyId: number,
    opts: { siteId?: number | null; doorIndexCode?: string | null } = {},
  ) {
    const site = await this.resolveSiteId(companyId, opts.siteId);
    const rows = await this.prisma.integraRoomBooking.findMany({
      where: {
        siteId: site.id,
        ...(opts.doorIndexCode ? { doorIndexCode: opts.doorIndexCode } : {}),
        status: { not: 'CANCELLED' },
        endsAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
    return {
      items: rows.map((b) => ({
        id: b.id,
        doorIndexCode: b.doorIndexCode,
        title: b.title,
        hostName: b.hostName,
        hostPersonId: b.hostPersonId,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
        notes: b.notes,
      })),
    };
  }

  async createBooking(
    companyId: number,
    input: {
      doorIndexCode: string;
      title: string;
      hostName?: string | null;
      hostPersonId?: string | null;
      startsAt: string;
      endsAt: string;
      notes?: string | null;
      siteId?: number | null;
      createdById?: number | null;
    },
  ) {
    const site = await this.resolveSiteId(companyId, input.siteId);
    const door = await this.prisma.integraDoor.findFirst({
      where: { siteId: site.id, doorIndexCode: input.doorIndexCode },
      select: { id: true },
    });
    if (!door) throw new NotFoundException('Puerta / espacio no encontrado');

    const title = String(input.title || '').trim();
    if (!title) throw new BadRequestException('Título obligatorio');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Fechas no válidas');
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('La hora de fin debe ser posterior al inicio');
    }

    let hostName = input.hostName?.trim() || null;
    if (input.hostPersonId && !hostName) {
      const person = await this.prisma.integraPerson.findFirst({
        where: { siteId: site.id, personId: input.hostPersonId },
        select: { personName: true },
      });
      hostName = person?.personName || input.hostPersonId;
    }

    const row = await this.prisma.integraRoomBooking.create({
      data: {
        companyId,
        siteId: site.id,
        doorIndexCode: input.doorIndexCode,
        title,
        hostName,
        hostPersonId: input.hostPersonId?.trim() || null,
        startsAt,
        endsAt,
        notes: input.notes?.trim() || null,
        status: 'PLANNED',
        createdById: input.createdById ?? null,
      },
    });
    return {
      id: row.id,
      doorIndexCode: row.doorIndexCode,
      title: row.title,
      hostName: row.hostName,
      hostPersonId: row.hostPersonId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      notes: row.notes,
    };
  }

  async cancelBooking(companyId: number, id: number) {
    const row = await this.prisma.integraRoomBooking.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Reserva no encontrada');
    const updated = await this.prisma.integraRoomBooking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return { id: updated.id, status: updated.status };
  }
}
