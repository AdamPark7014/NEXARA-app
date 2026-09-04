import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import {
  acsIdentityKeys,
  erpIdentityKeys,
  normalizeIdentityKey,
} from '../attendance/attendance-hybrid.match';

/**
 * Una persona = una identidad ERP↔ACS.
 *
 * Clave canónica: `User.employeeNumber` (y `UserCompany.employeeNumber` del
 * tenant) === `IntegraPerson.personId` (ACS `employeeNo` / `employeeNoString`).
 * No hay FK extra ni sync biométrico: el empuje ACS ya trae personId en vivo.
 */

export type LinkedErpUser = {
  id: number;
  nombre: string;
  email: string;
  employeeNumber: string | null;
  companyEmployeeNumber: string | null;
  role: { id: number; nombre: string; roleKey: string | null } | null;
  department: { id: number; nombre: string } | null;
};

export type IdentityLinkStatus = 'linked' | 'erp_only' | 'acs_only' | 'unlinked';

@Injectable()
export class IdentityLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mapa clave normalizada → usuario ERP (primera coincidencia gana). */
  async resolveMap(
    companyId: number,
    personKeys: Iterable<string | null | undefined>,
  ): Promise<Map<string, LinkedErpUser>> {
    const wanted = new Set<string>();
    for (const raw of personKeys) {
      const k = normalizeIdentityKey(raw);
      if (k) wanted.add(k);
    }
    if (!wanted.size) return new Map();

    const users = await this.loadCompanyUsers(companyId);
    const byKey = new Map<string, LinkedErpUser>();

    for (const u of users) {
      const keys = erpIdentityKeys({
        employeeNumber: u.employeeNumber,
        companyEmployeeNumber: u.companyEmployeeNumber,
      });
      for (const k of keys) {
        if (!wanted.has(k)) continue;
        if (!byKey.has(k)) byKey.set(k, u);
      }
    }
    return byKey;
  }

  async resolvePerson(
    companyId: number | null,
    personId: string,
    personCode?: string | null,
  ): Promise<LinkedErpUser | null> {
    const tenantId = requireCompanyId(companyId);
    const keys = acsIdentityKeys({ personId, personCode });
    if (!keys.length) return null;
    const map = await this.resolveMap(tenantId, keys);
    for (const k of keys) {
      const hit = map.get(k);
      if (hit) return hit;
    }
    return null;
  }

  /** Enriquece filas de personas ACS con el usuario ERP vinculado. */
  async attachErpUsers<T extends { id?: string; personId?: string; code?: string | null }>(
    companyId: number | null,
    items: T[],
  ): Promise<Array<T & { erpUser: LinkedErpUser | null }>> {
    if (!companyId || !items.length) {
      return items.map((it) => ({ ...it, erpUser: null }));
    }
    const keys: string[] = [];
    for (const it of items) {
      keys.push(String(it.id || it.personId || ''), String(it.code || ''));
    }
    const map = await this.resolveMap(companyId, keys);
    return items.map((it) => {
      const id = String(it.id || it.personId || '');
      const code = it.code != null ? String(it.code) : null;
      const hit =
        map.get(normalizeIdentityKey(id) || '') ||
        (code ? map.get(normalizeIdentityKey(code) || '') : undefined) ||
        null;
      return { ...it, erpUser: hit };
    });
  }

  async listCandidates(companyId: number | null, q?: string) {
    const tenantId = requireCompanyId(companyId);
    const users = await this.loadCompanyUsers(tenantId);
    const needle = String(q || '')
      .trim()
      .toLowerCase();
    const filtered = needle
      ? users.filter(
          (u) =>
            u.nombre.toLowerCase().includes(needle) ||
            u.email.toLowerCase().includes(needle) ||
            (u.employeeNumber || '').toLowerCase().includes(needle) ||
            (u.companyEmployeeNumber || '').toLowerCase().includes(needle) ||
            (u.role?.nombre || '').toLowerCase().includes(needle),
        )
      : users;
    return {
      total: filtered.length,
      items: filtered.slice(0, 80).map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        employeeNumber: u.employeeNumber,
        companyEmployeeNumber: u.companyEmployeeNumber,
        role: u.role,
        department: u.department,
      })),
    };
  }

  /**
   * Vincula: escribe el employeeNo ACS en User + UserCompany del tenant.
   * No toca terminales (el push en vivo ya usa ese personId).
   */
  async linkPersonToUser(
    companyId: number | null,
    personId: string,
    userId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const pid = String(personId || '').trim();
    if (!pid) throw new BadRequestException('personId requerido');
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestException('userId inválido');
    }

    const person = await this.prisma.integraPerson.findFirst({
      where: { companyId: tenantId, personId: pid },
      select: { personId: true, personName: true, personCode: true },
    });
    if (!person) {
      throw new NotFoundException(
        `Persona ACS ${pid} no está en el espejo — sincroniza el sitio primero`,
      );
    }

    const membership = await this.prisma.userCompany.findUnique({
      where: { userId_companyId: { userId, companyId: tenantId } },
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
            email: true,
            employeeNumber: true,
            role: { select: { id: true, nombre: true, roleKey: true } },
            department: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!membership?.user) {
      throw new NotFoundException('Usuario no pertenece a esta empresa');
    }

    const conflict = await this.findUserHoldingCode(tenantId, pid, userId);
    if (conflict) {
      throw new ConflictException(
        `El código ACS ${pid} ya está en ${conflict.nombre} (#${conflict.id}). Desvincula primero.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { employeeNumber: pid },
      }),
      this.prisma.userCompany.update({
        where: { userId_companyId: { userId, companyId: tenantId } },
        data: { employeeNumber: pid },
      }),
    ]);

    const linked = await this.resolvePerson(tenantId, pid, person.personCode);
    return {
      ok: true,
      personId: pid,
      personName: person.personName,
      erpUser: linked,
      note: 'Misma identidad: User.employeeNumber = ACS employeeNo. Asistencia híbrida y actividades resuelven a este usuario.',
    };
  }

  async unlinkPerson(companyId: number | null, personId: string) {
    const tenantId = requireCompanyId(companyId);
    const pid = String(personId || '').trim();
    if (!pid) throw new BadRequestException('personId requerido');

    const linked = await this.resolvePerson(tenantId, pid);
    if (!linked) {
      return {
        ok: true,
        personId: pid,
        erpUser: null,
        note: 'No había usuario ERP vinculado a este código ACS.',
      };
    }

    const key = normalizeIdentityKey(pid);
    const ops = [];
    if (normalizeIdentityKey(linked.employeeNumber) === key) {
      ops.push(
        this.prisma.user.update({
          where: { id: linked.id },
          data: { employeeNumber: null },
        }),
      );
    }
    if (normalizeIdentityKey(linked.companyEmployeeNumber) === key) {
      ops.push(
        this.prisma.userCompany.update({
          where: { userId_companyId: { userId: linked.id, companyId: tenantId } },
          data: { employeeNumber: null },
        }),
      );
    }
    if (ops.length) await this.prisma.$transaction(ops);

    return {
      ok: true,
      personId: pid,
      erpUser: null,
      previousUserId: linked.id,
      note: 'Desvinculado. El terminal ACS no se modifica; solo se quitó el código en ERP.',
    };
  }

  async getMyIdentity(userId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const membership = await this.prisma.userCompany.findUnique({
      where: { userId_companyId: { userId, companyId: tenantId } },
      select: { employeeNumber: true },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        email: true,
        employeeNumber: true,
        role: { select: { id: true, nombre: true, roleKey: true } },
        department: { select: { id: true, nombre: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const keys = erpIdentityKeys({
      employeeNumber: user.employeeNumber,
      companyEmployeeNumber: membership?.employeeNumber,
    });

    let acsPerson: {
      personId: string;
      personName: string;
      personCode: string | null;
      siteId: number;
    } | null = null;

    if (keys.length) {
      const people = await this.prisma.integraPerson.findMany({
        where: { companyId: tenantId },
        select: {
          personId: true,
          personName: true,
          personCode: true,
          siteId: true,
        },
        take: 500,
      });
      for (const p of people) {
        const acsKeys = acsIdentityKeys({
          personId: p.personId,
          personCode: p.personCode,
        });
        if (acsKeys.some((k) => keys.includes(k))) {
          acsPerson = {
            personId: p.personId,
            personName: p.personName,
            personCode: p.personCode,
            siteId: p.siteId,
          };
          break;
        }
      }
    }

    const status: IdentityLinkStatus = !keys.length
      ? 'unlinked'
      : acsPerson
        ? 'linked'
        : 'erp_only';

    return {
      canonicalKey: 'User.employeeNumber ↔ ACS employeeNo (personId)',
      status,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        employeeNumber: user.employeeNumber,
        companyEmployeeNumber: membership?.employeeNumber ?? null,
        role: user.role,
        department: user.department,
      },
      acsPerson,
      howToLink:
        'El código de empleado ERP debe ser el mismo employeeNo del terminal ACS. En Integra → Personas puedes vincular o desvincular sin sync manual.',
    };
  }

  private async findUserHoldingCode(
    companyId: number,
    personId: string,
    exceptUserId: number,
  ) {
    const key = normalizeIdentityKey(personId);
    if (!key) return null;
    const users = await this.loadCompanyUsers(companyId);
    return (
      users.find((u) => {
        if (u.id === exceptUserId) return false;
        return erpIdentityKeys({
          employeeNumber: u.employeeNumber,
          companyEmployeeNumber: u.companyEmployeeNumber,
        }).includes(key);
      }) ?? null
    );
  }

  private async loadCompanyUsers(companyId: number): Promise<LinkedErpUser[]> {
    const rows = await this.prisma.userCompany.findMany({
      where: { companyId },
      select: {
        employeeNumber: true,
        user: {
          select: {
            id: true,
            nombre: true,
            email: true,
            employeeNumber: true,
            isActive: true,
            role: { select: { id: true, nombre: true, roleKey: true } },
            department: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    return rows
      .filter((r) => r.user?.isActive !== false)
      .map((r) => ({
        id: r.user.id,
        nombre: r.user.nombre,
        email: r.user.email,
        employeeNumber: r.user.employeeNumber,
        companyEmployeeNumber: r.employeeNumber,
        role: r.user.role,
        department: r.user.department,
      }));
  }
}
