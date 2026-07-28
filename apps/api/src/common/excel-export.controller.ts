import { Controller, Get, Param, Res, BadRequestException, Query, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExcelExportService } from './excel-export.service.js';
import { RBAC, RbacGuard } from './rbac.guard.js';
import { PERMISSIONS } from './permissions.js';
import { CurrentCompanyId } from './tenant/current-company.decorator.js';
import { companyWhere, requireCompanyId } from './tenant/tenant-scope.js';
import { TENANT_SCOPED_MODELS } from './tenant/tenant-models.js';

const ALLOWED_MODELS = ['viatic', 'vehicle', 'activity', 'evidence', 'user'];

/** Param name → Prisma client key + logical model name for tenant checks. */
const MODEL_MAP: Record<string, { prismaKey: keyof PrismaService; tenantModel: string }> = {
  viatic: { prismaKey: 'viatico', tenantModel: 'Viatico' },
  vehicle: { prismaKey: 'vehicleControl', tenantModel: 'VehicleControl' },
  activity: { prismaKey: 'activity', tenantModel: 'Activity' },
  evidence: { prismaKey: 'evidence', tenantModel: 'Evidence' },
  user: { prismaKey: 'user', tenantModel: 'User' },
};

@Controller('export')
@UseGuards(RbacGuard)
export class ExcelExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelExport: ExcelExportService,
  ) {}

  @Get(':model')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACTIVITIES_EXPORT,
      PERMISSIONS.EVIDENCES_EXPORT,
      PERMISSIONS.VIATICS_EXPORT,
      PERMISSIONS.VEHICLES_EXPORT,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  async exportExcel(
    @Param('model') model: string,
    @Res() res: Response,
    @CurrentCompanyId() companyId: number | null,
    @Query('fields') fields?: string,
  ) {
    if (!ALLOWED_MODELS.includes(model)) throw new BadRequestException('Modelo no permitido');
    const mapped = MODEL_MAP[model];
    if (!mapped) throw new BadRequestException('Modelo no permitido');

    const tenantId = requireCompanyId(companyId);
    // User has no companyId column — require UserCompany membership.
    let where: Record<string, unknown>;
    if (mapped.tenantModel === 'User') {
      where = { companyMemberships: { some: { companyId: tenantId } } };
    } else if (TENANT_SCOPED_MODELS.has(mapped.tenantModel)) {
      where = companyWhere(tenantId);
    } else {
      throw new BadRequestException('Modelo no permitido');
    }

    let data = await (this.prisma as any)[mapped.prismaKey].findMany({ where });
    if (fields) {
      const fieldList = fields.split(',').map(f => f.trim());
      data = data.map((row: any) =>
        Object.fromEntries(Object.entries(row).filter(([k]) => fieldList.includes(k))),
      );
    }
    const buffer = await this.excelExport.exportToExcel(data, model);
    res.setHeader('Content-Disposition', `attachment; filename=${model}s.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  }
}
