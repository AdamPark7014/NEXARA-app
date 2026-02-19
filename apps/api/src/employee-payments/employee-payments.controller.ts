import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
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

@Controller('employee-payments')
export class EmployeePaymentsController {
  constructor(private readonly service: EmployeePaymentsService) {}

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_VIEW] })
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const parsedUserId = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsedUserId)) {
      throw new BadRequestException('Empleado invalido');
    }
    return this.service.findAll(user, { from, to, userId: parsedUserId });
  }

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONTABILIDAD_MANAGE] })
  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, { dest: 'apps/api/uploads/employee-payments' }))
  create(
    @CurrentUser() user: any,
    @Body() body: CreateEmployeePaymentDto,
    @UploadedFiles() files: any[],
  ) {
    if (files?.length) {
      const invalid = files.find((file) => {
        const name = (file.originalname || '').toLowerCase();
        const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
        const isImage = (file.mimetype || '').startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name);
        return !isPdf && !isImage;
      });
      if (invalid) {
        throw new BadRequestException('Solo se permiten imagenes o PDF');
      }
    }

    const evidenceUrls = (files || []).map(
      (file) => `/uploads/employee-payments/${file.filename}`,
    );

    return this.service.create(user, body, evidenceUrls);
  }
}
