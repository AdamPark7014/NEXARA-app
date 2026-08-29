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

@ApiTags('Oficinas NEXARA · ACS')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private accessControlService: AccessControlService) {}

  /** Puertas de sedes NEXARA (Artemis). */
  @Get('doors')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar puertas de oficinas NEXARA' })
  async getDoors(): Promise<DoorDto[]> {
    return this.accessControlService.getAllDoors();
  }

  @Get('doors/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado de una puerta de oficina' })
  async getDoorStatus(@Param('id') doorId: string): Promise<any> {
    return this.accessControlService.getDoorStatus(doorId);
  }

  @Post('doors/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apertura remota de puerta de oficina' })
  async unlockDoor(
    @Param('id') doorId: string,
    @Body() dto: UnlockDoorDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.accessControlService.unlockDoor({
      ...dto,
      doorId,
    });
  }

  @Get('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eventos de acceso de oficinas (últimas 24 h)' })
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

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'No implementado — privilege/group Artemis (oficinas)' })
  async createAccessRule(@Body() dto: CreateAccessRuleDto): Promise<any> {
    return this.accessControlService.createAccessRule(dto);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'No implementado — privilege/group Artemis (oficinas)' })
  async deleteAccessRule(@Param('id') ruleId: string): Promise<never> {
    return this.accessControlService.deleteAccessRule(ruleId);
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Salud Artemis de oficinas NEXARA' })
  async healthCheck(): Promise<{ status: string; connected: boolean; config: any }> {
    const config = this.accessControlService.getHikvisionConfig();
    const connected = await this.accessControlService.checkConnection();
    return {
      status: connected ? 'connected' : 'disconnected',
      connected,
      config: {
        baseUrl: config.baseUrl,
        configured: config.configured === true,
      },
    };
  }
}
