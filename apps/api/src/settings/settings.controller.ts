import { Controller, Get, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { RBAC, RbacGuard } from '../common/rbac.guard';
import { PERMISSIONS } from '../common/permissions';

@ApiTags('system')
@ApiBearerAuth('JWT')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Obtener todas las configuraciones del sistema' })
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(':category')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Obtener configuraciones por categoría' })
  findByCategory(@Param('category') category: string) {
    return this.settingsService.findByCategory(category);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Crear o actualizar una configuración' })
  upsert(@Body() dto: UpsertSettingDto) {
    return this.settingsService.upsert(dto.key, dto.value, dto.category, dto.label);
  }

  @Put('batch')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Crear o actualizar múltiples configuraciones' })
  upsertMany(@Body() dtos: UpsertSettingDto[]) {
    return this.settingsService.upsertMany(dtos);
  }

  @Delete(':key')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @ApiOperation({ summary: 'Eliminar una configuración' })
  remove(@Param('key') key: string) {
    return this.settingsService.remove(key);
  }
}
