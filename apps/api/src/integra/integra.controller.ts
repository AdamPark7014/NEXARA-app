import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { IntegraArtemisService } from './integra-artemis.service';

class AddPersonDto {
  @IsString()
  personName!: string;

  @IsString()
  orgIndexCode!: string;

  @IsOptional()
  @IsString()
  personCode?: string;
}

class AssignPrivilegeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  personIds!: string[];
}

@ApiTags('Integra · Artemis')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('integra')
export class IntegraController {
  constructor(private readonly integra: IntegraArtemisService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Salud Artemis Integra' })
  health() {
    return this.integra.health();
  }

  @Get('cameras')
  @ApiOperation({ summary: 'Listar cámaras' })
  cameras(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.integra.listCameras(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 100,
    );
  }

  @Post('cameras/:id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'URL live RTSP (previewURLs)' })
  preview(@Param('id') id: string) {
    return this.integra.preview(id);
  }

  @Get('doors')
  @ApiOperation({ summary: 'Listar puertas del sitio' })
  doors(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.integra.listDoors(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 100,
    );
  }

  @Post('doors/:id/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apertura remota' })
  openDoor(@Param('id') id: string, @CurrentUser() user: any) {
    return this.integra.openDoor(id, { id: user?.id, email: user?.email });
  }

  @Get('events')
  @ApiOperation({ summary: 'Eventos ACS últimas 24 h' })
  events(@Query('limit') limit?: string, @Query('doorId') doorId?: string) {
    return this.integra.listEvents(limit ? parseInt(limit, 10) : 50, doorId);
  }

  @Get('orgs')
  @ApiOperation({ summary: 'Organizaciones Artemis' })
  orgs(@Query('page') page?: string) {
    return this.integra.listOrgs(page ? parseInt(page, 10) : 1);
  }

  @Get('people')
  @ApiOperation({ summary: 'Personas Artemis (sin biometría local)' })
  people(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.integra.listPeople(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 100,
    );
  }

  @Post('people')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Alta persona en Artemis' })
  addPerson(@Body() dto: AddPersonDto) {
    return this.integra.addPerson(dto);
  }

  @Delete('people/:id')
  @ApiOperation({ summary: 'Baja persona en Artemis' })
  deletePerson(@Param('id') id: string) {
    return this.integra.deletePerson(id);
  }

  @Get('privilege-groups')
  @ApiOperation({ summary: 'Grupos de privilegio' })
  privilegeGroups(@Query('page') page?: string) {
    return this.integra.listPrivilegeGroups(page ? parseInt(page, 10) : 1);
  }

  @Post('privilege-groups/:id/persons')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar personas a grupo' })
  assign(@Param('id') id: string, @Body() dto: AssignPrivilegeDto) {
    return this.integra.assignPersonsToGroup(id, dto.personIds);
  }

  @Post('privilege/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reaplicar privilegios (auth/reapplication)' })
  applyAuth() {
    return this.integra.applyAuth();
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Vehículos Artemis' })
  vehicles(@Query('page') page?: string) {
    return this.integra.listVehicles(page ? parseInt(page, 10) : 1);
  }
}
