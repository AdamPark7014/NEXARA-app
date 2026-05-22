import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RbacGuard } from '../common/rbac.guard';
import { AccessControlService } from './services/access-control.service';
import { DoorDto, UnlockDoorDto } from './dto/door.dto';
import { AccessEventFilterDto } from './dto/access-event.dto';
import { CreateAccessRuleDto } from './dto/access-rule.dto';

@ApiTags('Access Control - HikCentral')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private accessControlService: AccessControlService) {}

  /**
   * Obtener todas las puertas
   */
  @Get('doors')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener todas las puertas/dispositivos de HikCentral' })
  async getDoors(): Promise<DoorDto[]> {
    return this.accessControlService.getAllDoors();
  }

  /**
   * Obtener estado de una puerta específica
   */
  @Get('doors/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener estado de una puerta específica' })
  async getDoorStatus(@Param('id') doorId: string): Promise<any> {
    return this.accessControlService.getDoorStatus(doorId);
  }

  /**
   * Desbloquear puerta remotamente
   */
  @Post('doors/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desbloquear puerta remotamente' })
  async unlockDoor(
    @Param('id') doorId: string,
    @Body() dto: UnlockDoorDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.accessControlService.unlockDoor({
      ...dto,
      doorId,
    });
  }

  /**
   * Obtener eventos de acceso
   */
  @Get('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener eventos de acceso registrados' })
  async getAccessEvents(
    @Query('doorId') doorId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('eventType') eventType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<any[]> {
    const filter: AccessEventFilterDto = {
      doorId,
      employeeId,
      eventType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    };

    return this.accessControlService.getAccessEvents(filter);
  }

  /**
   * Crear regla de acceso para empleado
   */
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear regla de acceso para un empleado' })
  async createAccessRule(@Body() dto: CreateAccessRuleDto): Promise<any> {
    return this.accessControlService.createAccessRule(dto);
  }

  /**
   * Eliminar regla de acceso
   */
  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar regla de acceso' })
  async deleteAccessRule(@Param('id') ruleId: string): Promise<{ success: boolean; message: string }> {
    return this.accessControlService.deleteAccessRule(ruleId);
  }

  /**
   * Health check - Verificar conexión con HikCentral
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar estado de conexión con HikCentral' })
  async healthCheck(): Promise<{ status: string; connected: boolean; config: any }> {
    const config = this.accessControlService.getHikvisionConfig();
    const connected = await this.accessControlService.checkConnection();
    return {
      status: connected ? 'connected' : 'disconnected',
      connected,
      config: {
        baseUrl: config.baseUrl,
        port: config.port,
      },
    };
  }
}
