import type { Response } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { EmployeePaymentsService } from './employee-payments.service.js';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto.js';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';

@Controller('employee-payments')
export class EmployeePaymentsController {
  constructor(private readonly service: EmployeePaymentsService) {}

  private validateFiles(files?: any[]) {
    if (!files?.length) return;
    const invalid = files.find((file) => {
      const name = (file.originalname || '').toLowerCase();
      const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
      const isImage = (file.mimetype || '').startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name);
      return !isPdf && !isImage;
    });
    if (invalid) throw new BadRequestException('Solo se permiten imagenes o PDF');
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('analytics')
  analytics(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) throw new BadRequestException('Empleado invalido');
    return this.service.analytics(user, { from, to, userId: parsedUserId });
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get('report.pdf')
  async reportPdf(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Res() res?: Response,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) throw new BadRequestException('Empleado invalido');
    const buffer = await this.service.reportPdf(
      user,
      { from, to, userId: parsedUserId },
      user?.nombre ?? null,
    );
    res!.header('Content-Type', 'application/pdf');
    res!.header(
      'Content-Disposition',
      `attachment; filename="pagos-${from || 'inicio'}-${to || 'hoy'}.pdf"`,
    );
    return res!.send(buffer);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) {
      throw new BadRequestException('Empleado invalido');
    }
    return this.service.findAll(user, { from, to, userId: parsedUserId, status }, query);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'employee-payments') }))
  create(
    @CurrentUser() user: any,
    @Body() body: CreateEmployeePaymentDto & { concepto?: string; status?: string },
    @UploadedFiles() files: any[],
  ) {
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.create(user, body, evidenceUrls);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id/pagado')
  markPagado(@Param('id') id: string) {
    return this.service.markPagado(+id);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'employee-payments') }))
  update(
    @Param('id') id: string,
    @Body() body: UpdateEmployeePaymentDto,
    @UploadedFiles() files: any[],
  ) {
    this.validateFiles(files);
    const evidenceUrls = (files || []).map((file) => `/uploads/employee-payments/${file.filename}`);
    return this.service.update(+id, body, evidenceUrls.length ? evidenceUrls : undefined);
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
