import { Controller, Get, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserPreferencesService } from './user-preferences.service';
import { UpsertPreferenceDto } from './dto/upsert-preference.dto';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser } from '../common/current-user.decorator';

@ApiTags('system')
@ApiBearerAuth('JWT')
@Controller('user-preferences')
export class UserPreferencesController {
  constructor(private readonly prefsService: UserPreferencesService) {}

  @Get()
  @UseGuards(RbacGuard)
  @ApiOperation({ summary: 'Obtener todas mis preferencias' })
  findAll(@CurrentUser() user: any) {
    return this.prefsService.findAll(user.id);
  }

  @Get(':key')
  @UseGuards(RbacGuard)
  @ApiOperation({ summary: 'Obtener una preferencia por clave' })
  findOne(@CurrentUser() user: any, @Param('key') key: string) {
    return this.prefsService.getValue(user.id, key);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @ApiOperation({ summary: 'Crear o actualizar una preferencia' })
  upsert(@CurrentUser() user: any, @Body() dto: UpsertPreferenceDto) {
    return this.prefsService.upsert(user.id, dto.key, dto.value);
  }

  @Put('batch')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @ApiOperation({ summary: 'Crear o actualizar múltiples preferencias' })
  upsertMany(@CurrentUser() user: any, @Body() dtos: UpsertPreferenceDto[]) {
    return this.prefsService.upsertMany(user.id, dtos);
  }

  @Delete(':key')
  @UseGuards(RbacGuard)
  @ApiOperation({ summary: 'Eliminar una preferencia' })
  remove(@CurrentUser() user: any, @Param('key') key: string) {
    return this.prefsService.remove(user.id, key);
  }
}
