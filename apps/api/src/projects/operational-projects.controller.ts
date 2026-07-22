import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { OperationalProjectsService } from './operational-projects.service.js';
import { CreateOperationalProjectDto, UpdateOperationalProjectDto, ProjectStatusChangeDto, AssignProjectEngineerDto, CreateProjectActivityDto } from './dto/create-operational-project.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('operational-projects')
@UseGuards(RbacGuard)
export class OperationalProjectsController {
  constructor(private readonly operationalProjectsService: OperationalProjectsService) {}

  private parseOptionalNumber(value?: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Validation failed (numeric string is expected)');
    }
    return parsed;
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  create(@Body() createDto: CreateOperationalProjectDto, @CurrentUser() user: any) {
    return this.operationalProjectsService.create(createDto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  findAll(
    @CurrentCompanyId() companyId: number | null,
    @Query('vendorId') vendorId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ) {
    return this.operationalProjectsService.findAll(
      this.parseOptionalNumber(vendorId),
      this.parseOptionalNumber(clientId),
      status,
      companyId,
    );
  }

  @Post('link-orphans-crm')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  linkOrphans(@CurrentUser() user: any) {
    return this.operationalProjectsService.linkOrphansToCrm(user.id);
  }

  @Post(':id/link-crm')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  linkCrm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.operationalProjectsService.ensureCommercialMirror(id, user.id);
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.operationalProjectsService.findById(id);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateOperationalProjectDto) {
    return this.operationalProjectsService.update(id, updateDto);
  }

  @Patch(':id/status')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  changeStatus(@Param('id', ParseIntPipe) id: number, @Body() statusDto: ProjectStatusChangeDto) {
    return this.operationalProjectsService.changeStatus(id, statusDto);
  }

  @Post(':id/engineers')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  assignEngineer(
    @Param('id', ParseIntPipe) projectId: number,
    @Body() assignDto: AssignProjectEngineerDto,
  ) {
    return this.operationalProjectsService.assignEngineer(projectId, assignDto);
  }

  @Delete(':projectId/engineers/:engineerId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  removeEngineer(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('engineerId', ParseIntPipe) engineerId: number,
  ) {
    return this.operationalProjectsService.removeEngineer(projectId, engineerId);
  }

  @Get(':id/activities')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  getActivities(@Param('id', ParseIntPipe) projectId: number) {
    return this.operationalProjectsService.getProjectActivities(projectId);
  }

  @Post(':id/activities')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  createActivity(
    @Param('id', ParseIntPipe) projectId: number,
    @Body() dto: CreateProjectActivityDto,
    @CurrentUser() user: any,
  ) {
    return this.operationalProjectsService.createProjectActivity(projectId, dto, user.id);
  }

  @Post(':id/activities/from-sites')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  createSiteActivities(
    @Param('id', ParseIntPipe) projectId: number,
    @Body() body: { responsableId?: number },
    @CurrentUser() user: any,
  ) {
    return this.operationalProjectsService.createSiteActivities(projectId, user.id, body.responsableId);
  }

  @Get(':id/engineers-activity-count')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  getEngineersActivityCount(@Param('id', ParseIntPipe) projectId: number) {
    return this.operationalProjectsService.getProjectEngineersActivityCount(projectId);
  }

  @Get(':id/duration')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  getProjectDuration(@Param('id', ParseIntPipe) projectId: number) {
    return this.operationalProjectsService.getProjectDuration(projectId);
  }
}
