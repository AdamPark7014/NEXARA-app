import { Controller, Get, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service.js';
import { UpsertSettingDto } from './dto/upsert-setting.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@ApiTags('system')
@ApiBearerAuth('JWT')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Obtener todas las configuraciones del sistema' })
  findAll(@CurrentCompanyId() companyId: number | null) {
    return this.settingsService.findAll(companyId);
  }

  @Get(':category')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Obtener configuraciones por categoría' })
  findByCategory(
    @Param('category') category: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.settingsService.findByCategory(category, companyId);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Crear o actualizar una configuración' })
  upsert(@Body() dto: UpsertSettingDto, @CurrentCompanyId() companyId: number | null) {
    return this.settingsService.upsert(dto.key, dto.value, dto.category, dto.label, companyId);
  }

  @Put('batch')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Crear o actualizar múltiples configuraciones' })
  upsertMany(@Body() dtos: UpsertSettingDto[], @CurrentCompanyId() companyId: number | null) {
    return this.settingsService.upsertMany(dtos, companyId);
  }

  @Delete(':key')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Eliminar una configuración' })
  remove(@Param('key') key: string, @CurrentCompanyId() companyId: number | null) {
    return this.settingsService.remove(key, companyId);
  }
}
