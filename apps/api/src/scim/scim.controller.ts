import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../company/billing.service.js';

@Injectable()
export class ScimBearerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.SCIM_ENABLED !== 'true') {
      throw new UnauthorizedException('SCIM deshabilitado (SCIM_ENABLED=true)');
    }
    const req = context.switchToHttp().getRequest();
    const auth = String(req.headers?.authorization || '');
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('SCIM token inválido');

    // 1) Per-tenant: CompanyApiKey with scope "scim"
    const keyHash = createHash('sha256').update(token).digest('hex');
    const apiKey = await this.prisma.companyApiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, companyId: true, scopes: true },
    });
    if (apiKey && apiKey.scopes.includes('scim')) {
      await this.prisma.companyApiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });
      req.scimCompanyId = apiKey.companyId;
      req.companyId = apiKey.companyId;
      return true;
    }

    // 2) Fallback legacy: SCIM_BEARER_TOKEN → empresa primaria
    //    (X-Company-Id may override primary in companyIdFrom)
    const expected = process.env.SCIM_BEARER_TOKEN?.trim();
    if (expected && token === expected) {
      const primary = await this.prisma.companyProfile.findFirst({
        where: { isPrimary: true, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (!primary) throw new UnauthorizedException('No hay empresa primaria para SCIM');
      req.scimLegacyAuth = true;
      req.scimCompanyId = primary.id;
      req.companyId = primary.id;
      return true;
    }

    throw new UnauthorizedException('SCIM token inválido');
  }
}

function toScimUser(u: {
  id: number;
  nombre: string;
  email: string;
  isActive: boolean;
  createdAt?: Date;
  fechaCreacion?: Date;
}) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: String(u.id),
    userName: u.email,
    name: { formatted: u.nombre, givenName: u.nombre.split(' ')[0] || u.nombre },
    displayName: u.nombre,
    emails: [{ value: u.email, primary: true, type: 'work' }],
    active: u.isActive !== false,
    meta: {
      resourceType: 'User',
      created: (u.fechaCreacion || u.createdAt || new Date()).toISOString?.() || new Date().toISOString(),
    },
  };
}

@Controller('scim/v2')
@UseGuards(ScimBearerGuard)
export class ScimController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Active company for SCIM:
   * 1) CompanyApiKey → locked to key's companyId (`req.scimCompanyId`)
   * 2) Legacy SCIM_BEARER_TOKEN → `X-Company-Id` header if set, else primary
   * 3) Fallback: TenantInterceptor `req.companyId` / CurrentCompanyId
   */
  private companyIdFrom(req: any): number {
    if (req?.scimLegacyAuth) {
      const raw = req?.headers?.['x-company-id'] ?? req?.headers?.['X-Company-Id'];
      const fromHeader = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
      if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
    }

    const fromScim = Number(req?.scimCompanyId);
    if (Number.isFinite(fromScim) && fromScim > 0) return fromScim;

    const fromReq = Number(req?.companyId);
    if (Number.isFinite(fromReq) && fromReq > 0) return fromReq;

    const raw = req?.headers?.['x-company-id'] ?? req?.headers?.['X-Company-Id'];
    const fromHeader = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
    if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;

    throw new UnauthorizedException('SCIM company no resuelta (token tenant o X-Company-Id)');
  }

  private companyMemberWhere(companyId: number) {
    return { companyMemberships: { some: { companyId } } };
  }

  /** Assign roleId only to users who already belong to the active company. */
  private async assignRoleToCompanyMembers(
    companyId: number,
    roleId: number,
    memberIds: number[],
  ): Promise<{ ok: true } | { error: Record<string, unknown> }> {
    const unique = [...new Set(memberIds.filter((n) => Number.isFinite(n) && n > 0))];
    if (!unique.length) return { ok: true };

    const inCompany = await this.prisma.user.findMany({
      where: { id: { in: unique }, ...this.companyMemberWhere(companyId) },
      select: { id: true },
    });
    if (inCompany.length !== unique.length) {
      return {
        error: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '403',
          detail: 'One or more users are not members of the active company',
        },
      };
    }

    await this.prisma.user.updateMany({
      where: { id: { in: unique } },
      data: { roleId },
    });
    return { ok: true };
  }

  private async upsertUserCompany(userId: number, companyId: number) {
    await this.prisma.userCompany.upsert({
      where: { userId_companyId: { userId, companyId } },
      update: {},
      create: { userId, companyId, isDefault: true },
    });
  }

  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description:
            'Bearer token: CompanyApiKey scope=scim (preferido) o SCIM_BEARER_TOKEN → primary; opcional X-Company-Id',
          specUri: 'http://www.rfc-editor.org/info/rfc6750',
          primary: true,
        },
      ],
      // Groups mapped to Role (RBAC)
      meta: { resourceTypes: ['User', 'Group'] },
    };
  }

  @Get('Users')
  async listUsers(
    @Req() req: any,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex = '1',
    @Query('count') count = '50',
  ) {
    const companyId = this.companyIdFrom(req);
    const take = Math.min(200, Math.max(1, Number(count) || 50));
    const skip = Math.max(0, (Number(startIndex) || 1) - 1);
    let where: any = {
      ...this.companyMemberWhere(companyId),
    };
    // filter: userName eq "email@x.com"
    const m = filter?.match(/userName\s+eq\s+"([^"]+)"/i);
    if (m) where = { ...where, email: { equals: m[1], mode: 'insensitive' } };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true, email: true, isActive: true, fechaCreacion: true },
      }),
    ]);

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex: skip + 1,
      itemsPerPage: users.length,
      Resources: users.map(toScimUser),
    };
  }

  @Get('Users/:id')
  async getUser(@Req() req: any, @Param('id') id: string) {
    const companyId = this.companyIdFrom(req);
    const user = await this.prisma.user.findFirst({
      where: {
        id: Number(id),
        ...this.companyMemberWhere(companyId),
      },
      select: { id: true, nombre: true, email: true, isActive: true, fechaCreacion: true },
    });
    if (!user) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      };
    }
    return toScimUser(user);
  }

  @Post('Users')
  async createUser(@Req() req: any, @Body() body: any) {
    const companyId = this.companyIdFrom(req);
    const email = String(body?.userName || body?.emails?.[0]?.value || '')
      .trim()
      .toLowerCase();
    const nombre = String(body?.displayName || body?.name?.formatted || email).trim();
    if (!email) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '400',
        detail: 'userName/email required',
      };
    }

    try {
      await this.billing.assertSeatAvailable(companyId);
    } catch (err: any) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '409',
        detail: err?.message || 'Seat limit reached',
      };
    }

    const role = await this.prisma.role.findFirst({ orderBy: { id: 'asc' } });
    const dept = await this.prisma.department.findFirst({
      where: { companyId },
      orderBy: { id: 'asc' },
    });
    if (!role || !dept) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '500',
        detail: 'NEXARA missing default role/department',
      };
    }

    const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        nombre,
        passwordHash,
        roleId: role.id,
        departmentId: dept.id,
        isActive: body?.active !== false,
        passwordChangedAt: new Date(),
      },
      select: { id: true, nombre: true, email: true, isActive: true, fechaCreacion: true },
    });

    await this.upsertUserCompany(created.id, companyId);

    return toScimUser(created);
  }

  @Put('Users/:id')
  @Patch('Users/:id')
  async updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('content-type') ct?: string,
  ) {
    const companyId = this.companyIdFrom(req);
    const userId = Number(id);
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      };
    }

    let nombre = existing.nombre;
    let email = existing.email;
    let isActive = existing.isActive;

    if (String(ct || '').includes('scim+json') && Array.isArray(body?.Operations)) {
      for (const op of body.Operations) {
        const path = String(op.path || '').toLowerCase();
        if (path === 'active' || op.path === undefined) {
          if (typeof op.value?.active === 'boolean') isActive = op.value.active;
          if (typeof op.value === 'boolean') isActive = op.value;
        }
        if (path === 'displayname' || path === 'name.formatted') {
          nombre = String(op.value);
        }
        if (path === 'username' || path === 'emails') {
          email = String(op.value?.value || op.value || email).toLowerCase();
        }
      }
    } else {
      if (body?.displayName || body?.name?.formatted) {
        nombre = String(body.displayName || body.name.formatted);
      }
      if (body?.userName || body?.emails?.[0]?.value) {
        email = String(body.userName || body.emails[0].value).toLowerCase();
      }
      if (typeof body?.active === 'boolean') isActive = body.active;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { nombre, email, isActive },
      select: { id: true, nombre: true, email: true, isActive: true, fechaCreacion: true },
    });

    await this.upsertUserCompany(userId, companyId);

    return toScimUser(updated);
  }

  @Delete('Users/:id')
  async deleteUser(@Req() req: any, @Param('id') id: string) {
    const companyId = this.companyIdFrom(req);
    const userId = Number(id);
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, ...this.companyMemberWhere(companyId) },
      select: { id: true },
    });
    if (!existing) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    return {};
  }

  private toScimGroup(role: { id: number; nombre: string }, members: Array<{ value: string; display: string }>) {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: String(role.id),
      displayName: role.nombre,
      members,
      meta: { resourceType: 'Group' },
    };
  }

  @Get('Groups')
  async listGroups(
    @Req() req: any,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex = '1',
    @Query('count') count = '50',
  ) {
    const companyId = this.companyIdFrom(req);
    const take = Math.min(200, Math.max(1, Number(count) || 50));
    const skip = Math.max(0, (Number(startIndex) || 1) - 1);
    // Role catalog stays global; only members are company-scoped.
    let where: any = {};
    const m = filter?.match(/displayName\s+eq\s+"([^"]+)"/i);
    if (m) where = { nombre: { equals: m[1], mode: 'insensitive' } };

    const [total, roles] = await Promise.all([
      this.prisma.role.count({ where }),
      this.prisma.role.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
    ]);

    const resources = await Promise.all(
      roles.map(async (role) => {
        const users = await this.prisma.user.findMany({
          where: {
            roleId: role.id,
            isActive: true,
            ...this.companyMemberWhere(companyId),
          },
          select: { id: true, nombre: true },
          take: 200,
        });
        return this.toScimGroup(
          role,
          users.map((u) => ({ value: String(u.id), display: u.nombre })),
        );
      }),
    );

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex: skip + 1,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  @Get('Groups/:id')
  async getGroup(@Req() req: any, @Param('id') id: string) {
    const companyId = this.companyIdFrom(req);
    const role = await this.prisma.role.findUnique({ where: { id: Number(id) } });
    if (!role) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'Group not found',
      };
    }
    const users = await this.prisma.user.findMany({
      where: {
        roleId: role.id,
        isActive: true,
        ...this.companyMemberWhere(companyId),
      },
      select: { id: true, nombre: true },
      take: 500,
    });
    return this.toScimGroup(
      role,
      users.map((u) => ({ value: String(u.id), display: u.nombre })),
    );
  }

  @Post('Groups')
  async createGroup(@Req() req: any, @Body() body: any) {
    const companyId = this.companyIdFrom(req);
    const displayName = String(body?.displayName || '').trim();
    if (!displayName) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '400',
        detail: 'displayName required',
      };
    }
    const existing = await this.prisma.role.findFirst({
      where: { nombre: { equals: displayName, mode: 'insensitive' } },
    });
    if (existing) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '409',
        detail: 'Group already exists',
      };
    }
    const role = await this.prisma.role.create({
      data: { nombre: displayName },
    });
    const memberIds = Array.isArray(body?.members)
      ? body.members.map((m: any) => Number(m.value || m)).filter((n: number) => Number.isFinite(n))
      : [];
    if (memberIds.length) {
      const assigned = await this.assignRoleToCompanyMembers(companyId, role.id, memberIds);
      if ('error' in assigned) return assigned.error;
    }
    const users = await this.prisma.user.findMany({
      where: { roleId: role.id, ...this.companyMemberWhere(companyId) },
      select: { id: true, nombre: true },
    });
    return this.toScimGroup(
      role,
      users.map((u) => ({ value: String(u.id), display: u.nombre })),
    );
  }

  @Put('Groups/:id')
  @Patch('Groups/:id')
  async updateGroup(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const companyId = this.companyIdFrom(req);
    const roleId = Number(id);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'Group not found',
      };
    }

    let displayName = role.nombre;
    if (body?.displayName) displayName = String(body.displayName).trim();
    if (Array.isArray(body?.Operations)) {
      for (const op of body.Operations) {
        const path = String(op.path || '').toLowerCase();
        if (path === 'displayname') displayName = String(op.value);
        if (path === 'members' && Array.isArray(op.value)) {
          const memberIds = op.value
            .map((m: any) => Number(m.value || m))
            .filter((n: number) => Number.isFinite(n));
          const opName = String(op.op || '').toLowerCase();
          if (opName === 'replace' || !op.op || opName === 'add') {
            const assigned = await this.assignRoleToCompanyMembers(companyId, roleId, memberIds);
            if ('error' in assigned) return assigned.error;
          }
        }
      }
    } else if (Array.isArray(body?.members)) {
      const memberIds = body.members
        .map((m: any) => Number(m.value || m))
        .filter((n: number) => Number.isFinite(n));
      const assigned = await this.assignRoleToCompanyMembers(companyId, roleId, memberIds);
      if ('error' in assigned) return assigned.error;
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: { nombre: displayName },
    });
    const users = await this.prisma.user.findMany({
      where: {
        roleId,
        isActive: true,
        ...this.companyMemberWhere(companyId),
      },
      select: { id: true, nombre: true },
    });
    return this.toScimGroup(
      updated,
      users.map((u) => ({ value: String(u.id), display: u.nombre })),
    );
  }

  @Delete('Groups/:id')
  async deleteGroup(@Param('id') id: string) {
    // Soft: roles are RBAC backbone — refuse hard delete; return 204-style empty
    const role = await this.prisma.role.findUnique({ where: { id: Number(id) } });
    if (!role) {
      return {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'Group not found',
      };
    }
    return {};
  }
}
