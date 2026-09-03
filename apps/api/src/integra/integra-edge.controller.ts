import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { IntegraEdgeService } from './integra-edge.service';
import { integraCanSettings } from './integra.controller';
import { edgeInstallScript } from './integra-edge.install';

class EnrollDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MaxLength(64) publicKey!: string;
  @IsOptional() @IsString() @MaxLength(120) hostname?: string;
  @IsOptional() @IsString() @MaxLength(40) agentVersion?: string;
}

class HeartbeatDto {
  @IsOptional() @IsString() @MaxLength(40) agentVersion?: string;
  @IsOptional() @IsString() @MaxLength(40) lastSyncAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) error?: string;
  @IsOptional() @IsInt() cameras?: number;
}

class IssueTokenDto {
  @IsOptional() @IsInt() @Min(1) @Max(720) ttlHours?: number;
}

/**
 * Superficie que consume la **caja on-site**, no una persona (ADR-0021).
 *
 * Va sin `RbacGuard` a propósito: quien llama es un equipo que todavía no tiene
 * sesión de nadie. La autenticación es su propio token — de alta el primer día,
 * permanente a partir de ahí — y ninguno de estos endpoints devuelve datos de
 * otro sitio que el del token presentado.
 */
@ApiTags('Integra · caja on-site')
@Controller('integra/edge')
export class IntegraEdgeController {
  constructor(
    private readonly edge: IntegraEdgeService,
    private readonly config: ConfigService,
  ) {}

  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alta de la caja con token de un solo uso' })
  enroll(@Body() dto: EnrollDto) {
    return this.edge.enroll(dto);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Latido del agente; devuelve los intervalos vigentes' })
  heartbeat(@Headers('x-edge-token') token: string, @Body() dto: HeartbeatDto) {
    return this.edge.heartbeat(token, dto);
  }

  @Get('peers')
  @ApiOperation({ summary: 'Peers WireGuard para el reconciliador del anfitrión' })
  peers(@Headers('x-reconcile-token') token: string) {
    return this.edge.peersForReconciler(token);
  }

  /**
   * Instalador de la caja. Se sirve en claro y no lleva secretos: el token va
   * como argumento cuando el instalador lo ejecuta una persona.
   */
  @Get('install.sh')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  installScript() {
    return edgeInstallScript(this.config.get<string>('INTEGRA_EDGE_API_URL') || '');
  }
}

/**
 * Superficie de administración: la usa una persona desde la consola, con su
 * sesión y sus permisos.
 */
@ApiTags('Integra · caja on-site')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('integra')
export class IntegraEdgeAdminController {
  constructor(private readonly edge: IntegraEdgeService) {}

  @Get('edge-agents')
  @ApiOperation({ summary: 'Estado de las cajas de la empresa' })
  list(@CurrentCompanyId() companyId: number | null) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    return this.edge.list(companyId);
  }

  @Post('sites/:siteId/edge/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Emite el token de alta de la caja (se muestra una sola vez)' })
  issue(
    @CurrentCompanyId() companyId: number | null,
    @Param('siteId', ParseIntPipe) siteId: number,
    @Body() dto: IssueTokenDto,
    @CurrentUser() user: any,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para administrar sitios');
    }
    return this.edge.issueEnrollToken(
      companyId,
      siteId,
      { id: user?.id, email: user?.email },
      dto.ttlHours,
    );
  }

  @Delete('sites/:siteId/edge')
  @ApiOperation({ summary: 'Revoca la caja de un sitio' })
  revoke(
    @CurrentCompanyId() companyId: number | null,
    @Param('siteId', ParseIntPipe) siteId: number,
    @CurrentUser() user: any,
  ) {
    if (!companyId) throw new BadRequestException('companyId requerido');
    if (!integraCanSettings(user)) {
      throw new BadRequestException('Sin permiso para administrar sitios');
    }
    return this.edge.revoke(companyId, siteId, { id: user?.id, email: user?.email });
  }
}
