import type { Response } from 'express';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpensesService } from './expenses.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { getUploadSubdir } from '../common/upload-paths.js';

@Controller('expenses')
@UseGuards(UrlAccessGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('analytics')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  analytics(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const departmentId = user.isSuperAdmin || user.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE)
      ? undefined
      : user.departmentId;
    return this.expensesService.analytics({ from, to }, departmentId);
  }

  @Get('report.pdf')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  async reportPdf(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    const departmentId = user.isSuperAdmin || user.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE)
      ? undefined
      : user.departmentId;
    const buffer = await this.expensesService.reportPdf(
      { from, to },
      user?.nombre ?? null,
      departmentId,
    );
    res!.header('Content-Type', 'application/pdf');
    res!.header(
      'Content-Disposition',
      `attachment; filename="gastos-${from || 'inicio'}-${to || 'hoy'}.pdf"`,
    );
    return res!.send(buffer);
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'expenses') }))
  create(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Body() body: CreateExpenseDto & Record<string, unknown>,
    @UploadedFile() file?: any,
  ) {
    const elevated =
      user.isSuperAdmin ||
      user.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE) ||
      user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);
    const usuarioId =
      elevated && body.usuarioId != null ? Number(body.usuarioId) : Number(user.id);

    const ticketEvidenciaUrl = file
      ? `/uploads/expenses/${file.filename}`
      : body.ticketEvidenciaUrl
        ? String(body.ticketEvidenciaUrl)
        : null;

    if (body.concepto && body.monto !== undefined) {
      return this.expensesService.createAdministrative({
        usuarioId,
        createdById: user.id,
        companyId,
        concepto: String(body.concepto),
        monto: Number(body.monto),
        categoria: body.categoria ? String(body.categoria) : undefined,
        esRecurrente: Boolean(body.esRecurrente === true || body.esRecurrente === 'true'),
        fecha: body.fecha ? String(body.fecha) : undefined,
        ticketEvidenciaUrl,
        actividadId: body.actividadId ? Number(body.actividadId) : undefined,
      });
    }
    if (!elevated && body.usuarioId != null && Number(body.usuarioId) !== Number(user.id)) {
      throw new ForbiddenException('Solo puedes crear tus propios gastos');
    }
    return this.expensesService.create({
      ...body,
      usuarioId,
      ticketEvidenciaUrl: ticketEvidenciaUrl || undefined,
      estatusPago: 'Pendiente',
    } as CreateExpenseDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (
      user.isSuperAdmin ||
      user.permissions?.includes(PERMISSIONS.CONTABILIDAD_MANAGE) ||
      user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      return this.expensesService.findAll(query, companyId);
    }
    return this.expensesService.findByDepartment(user.departmentId, query, companyId);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  findOne(
    @CurrentUser() _user: any,
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.expensesService.findOne(+id, companyId);
  }

  @Patch(':id/approve')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action?: 'approve' | 'reject'; note?: string },
  ) {
    const action = body.action === 'reject' ? 'reject' : 'approve';
    return this.expensesService.approveOrReject(+id, action, body.note, user?.id);
  }

  @Patch(':id/pagado')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  markPagado(@Param('id') id: string, @CurrentUser() user: any) {
    return this.expensesService.markPagado(+id, user?.id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @UseInterceptors(FileInterceptor('ticketEvidencia', { dest: getUploadSubdir(__dirname, 'expenses') }))
  update(
    @CurrentUser() _user: any,
    @Param('id') id: string,
    @Body() body: UpdateExpenseDto & Record<string, unknown>,
    @UploadedFile() file?: any,
  ) {
    const ticketEvidenciaUrl = file
      ? `/uploads/expenses/${file.filename}`
      : body.ticketEvidenciaUrl
        ? String(body.ticketEvidenciaUrl)
        : undefined;

    if (
      body.concepto !== undefined ||
      body.monto !== undefined ||
      body.categoria !== undefined ||
      ticketEvidenciaUrl !== undefined
    ) {
      return this.expensesService.updateAdministrative(+id, {
        concepto: body.concepto ? String(body.concepto) : undefined,
        monto: body.monto !== undefined ? Number(body.monto) : undefined,
        categoria: body.categoria ? String(body.categoria) : undefined,
        esRecurrente:
          body.esRecurrente !== undefined
            ? Boolean(body.esRecurrente === true || body.esRecurrente === 'true')
            : undefined,
        fecha: body.fecha ? String(body.fecha) : undefined,
        ticketEvidenciaUrl,
      });
    }
    const { estatusPago: _e, usuarioId: _u, ...safe } = body as UpdateExpenseDto & Record<string, unknown>;
    return this.expensesService.update(+id, safe as UpdateExpenseDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expensesService.remove(+id, user?.id);
  }
}
