import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

@Controller('overtime-approvals')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class OvertimeApprovalsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('estado') estado?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (estado) where.estado = estado;
    if (from || to) {
      where.fecha = {};
      if (from) where.fecha.gte = new Date(from);
      if (to) where.fecha.lte = new Date(to);
    }
    return (this.prisma as any).overtimeApproval.findMany({
      where,
      include: { user: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE] })
  async decide(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { estado?: string; nota?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const estado = String(body?.estado || '').toUpperCase();
    if (estado !== 'APROBADO' && estado !== 'RECHAZADO') {
      throw new BadRequestException('estado debe ser APROBADO o RECHAZADO');
    }
    const row = await (this.prisma as any).overtimeApproval.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    if (!row) throw new BadRequestException('Registro no encontrado');
    return (this.prisma as any).overtimeApproval.update({
      where: { id },
      data: {
        estado,
        nota: body?.nota?.trim() || null,
        aprobadoPorId: user.id,
      },
    });
  }

  /** Upsert candidato de extra (desde reglas KPI / captura RH). */
  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE] })
  upsert(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { userId?: number; fecha?: string; minutos?: number; nota?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const userId = Number(body?.userId);
    const minutos = Number(body?.minutos);
    const fecha = body?.fecha ? new Date(body.fecha) : null;
    if (!userId || !fecha || Number.isNaN(fecha.getTime()) || !Number.isFinite(minutos) || minutos <= 0) {
      throw new BadRequestException('userId, fecha y minutos son obligatorios');
    }
    return (this.prisma as any).overtimeApproval.upsert({
      where: { userId_fecha: { userId, fecha } },
      create: {
        userId,
        fecha,
        minutos: Math.round(minutos),
        companyId: tenantId,
        estado: 'PENDIENTE',
        nota: body?.nota?.trim() || null,
      },
      update: {
        minutos: Math.round(minutos),
        estado: 'PENDIENTE',
        aprobadoPorId: null,
        nota: body?.nota?.trim() || null,
      },
    });
  }
}
