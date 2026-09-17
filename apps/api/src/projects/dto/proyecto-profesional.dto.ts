/**
 * DTOs del proyecto profesional: cronograma, alcance, requerimientos, equipo y documentos.
 *
 * Los `Create*` anidados existen para que el asistente de alta mande **un solo POST**:
 * un proyecto que nace sin etapas ni requerimientos es justo el proyecto pobre que
 * había antes, y obligar a seis llamadas seguidas garantiza que alguien las salte.
 */
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ProjectDocumentKind,
  ProjectMemberRole,
  ProjectMilestoneStatus,
  ProjectRequirementStatus,
  ProjectScopeItemKind,
  ServiceProjectType,
} from '@prisma/client';
import { PROYECTO_ESTADOS } from '../proyecto-estado.js';

export class ProjectMilestoneInputDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsDateString()
  plannedDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualDate?: string | null;

  @IsOptional()
  @IsInt()
  responsableId?: number | null;

  @IsOptional()
  @IsEnum(ProjectMilestoneStatus)
  status?: ProjectMilestoneStatus;
}

export class UpdateProjectMilestoneDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsDateString()
  plannedDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualDate?: string | null;

  @IsOptional()
  @IsInt()
  responsableId?: number | null;

  @IsOptional()
  @IsEnum(ProjectMilestoneStatus)
  status?: ProjectMilestoneStatus;
}

export class ProjectScopeItemInputDto {
  @IsOptional()
  @IsEnum(ProjectScopeItemKind)
  kind?: ProjectScopeItemKind;

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  titulo!: string;

  @IsOptional()
  @IsString()
  detalle?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origenClave?: string;
}

export class UpdateProjectScopeItemDto {
  @IsOptional()
  @IsEnum(ProjectScopeItemKind)
  kind?: ProjectScopeItemKind;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  titulo?: string;

  @IsOptional()
  @IsString()
  detalle?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

export class ProjectRequirementInputDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  titulo!: string;

  @IsOptional()
  @IsString()
  detalle?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsInt()
  responsableId?: number | null;

  @IsOptional()
  @IsEnum(ProjectRequirementStatus)
  status?: ProjectRequirementStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class UpdateProjectRequirementDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  titulo?: string;

  @IsOptional()
  @IsString()
  detalle?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsInt()
  responsableId?: number | null;

  @IsOptional()
  @IsEnum(ProjectRequirementStatus)
  status?: ProjectRequirementStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class ProjectMemberInputDto {
  @IsInt()
  userId!: number;

  @IsOptional()
  @IsEnum(ProjectMemberRole)
  role?: ProjectMemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string;
}

export class UpdateProjectMemberDto {
  @IsOptional()
  @IsEnum(ProjectMemberRole)
  role?: ProjectMemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notas?: string | null;
}

export class ProjectDocumentMetaDto {
  @IsOptional()
  @IsEnum(ProjectDocumentKind)
  kind?: ProjectDocumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  nombre?: string;
}

/** Alta completa: identidad + plan + alcance + equipo, en una sola llamada. */
export class CrearProyectoProfesionalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(220)
  title!: string;

  @IsInt()
  clientId!: number;

  @IsOptional()
  @IsInt()
  vendorId?: number;

  @IsOptional()
  @IsInt()
  responsableId?: number;

  @IsOptional()
  @IsEnum(ServiceProjectType)
  projectType?: ServiceProjectType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  scopeSummary?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  siteCount?: number;

  // --- Fechas ---
  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  actualStartDate?: string;

  // --- Dinero (ligero) ---
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsInt()
  cotizacionId?: number;

  /**
   * Volcar el alcance de la cotización ligada como entregables del proyecto.
   * Es lo que hace que cotizar y ejecutar hablen el mismo idioma.
   */
  @IsOptional()
  @IsBoolean()
  importarAlcanceDeCotizacion?: boolean;

  @IsOptional()
  @IsInt()
  salesProjectId?: number;

  @IsOptional()
  @IsString()
  status?: (typeof PROYECTO_ESTADOS)[number];

  // --- Colecciones ---
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMilestoneInputDto)
  milestones?: ProjectMilestoneInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectScopeItemInputDto)
  scopeItems?: ProjectScopeItemInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectRequirementInputDto)
  requirements?: ProjectRequirementInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberInputDto)
  members?: ProjectMemberInputDto[];
}

/** Edición de la cabecera. Las colecciones tienen sus propios endpoints. */
export class ActualizarProyectoProfesionalDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  objective?: string | null;

  @IsOptional()
  @IsString()
  scopeSummary?: string | null;

  @IsOptional()
  @IsEnum(ServiceProjectType)
  projectType?: ServiceProjectType;

  @IsOptional()
  @IsInt()
  @Min(0)
  siteCount?: number | null;

  @IsOptional()
  @IsInt()
  responsableId?: number | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsInt()
  cotizacionId?: number | null;
}

export class CambiarEstadoProyectoDto {
  @IsString()
  status!: (typeof PROYECTO_ESTADOS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;
}
