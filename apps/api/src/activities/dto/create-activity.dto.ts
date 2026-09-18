import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsEnum,
  Matches,
} from 'class-validator';
import { ActivityType, ActivityWorkType, TicketType } from '@prisma/client';

export class CreateActivityDto {
  @IsOptional()
  @IsString()
  anNumber?: string;

  @IsNotEmpty()
  @IsString()
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  indicaciones?: string;

  @IsOptional()
  @IsString()
  estatus?: string;

  @IsOptional()
  @IsString()
  prioridad?: string;

  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @IsOptional()
  @IsEnum(TicketType)
  ticketType?: TicketType;

  @IsOptional()
  @IsString()
  ticketTypeCustom?: string;

  @IsOptional()
  @IsEnum(ActivityWorkType)
  workType?: ActivityWorkType;

  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branchNumber?: string;

  @IsOptional()
  @IsString()
  branchCity?: string;

  @IsOptional()
  @IsString()
  branchState?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsInt()
  tiempoEstimadoMin?: number;

  @IsOptional()
  @IsInt()
  tiempoMaximoMin?: number;

  @IsNotEmpty()
  @IsInt()
  creadoPorId!: number;

  @IsNotEmpty()
  @IsInt()
  responsableId!: number;

  @IsOptional()
  @IsInt()
  eficienciaScore?: number;

  @IsOptional()
  @IsString()
  comentariosFeedback?: string;

  @IsOptional()
  @IsDateString()
  fechaAsignacion?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaMaxima?: string;

  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string;

  @IsOptional()
  @IsDateString()
  fechaFinalizacion?: string;

  /**
   * Periodo de ejecución, `AAAA-MM-DD` (ambos días incluidos). Con periodo, la fecha máxima
   * y la entrega esperada son el fin de `periodoFin`; `null` en los dos lo quita al editar.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'periodoInicio debe ser AAAA-MM-DD' })
  periodoInicio?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'periodoFin debe ser AAAA-MM-DD' })
  periodoFin?: string | null;

  /** Etapa del cronograma del proyecto que ejecuta esta actividad. */
  @IsOptional()
  @IsInt()
  projectMilestoneId?: number | null;

  /** Tipo Core: tarea|proyecto|obra|servicio|comercial */
  @IsOptional()
  @IsString()
  coreKind?: string;

  /** Encargo: ejecucion (la hace el responsable) | despacho (la reparte a su equipo) */
  @IsOptional()
  @IsString()
  assignmentCharge?: string;

  /** Fotos de evidencia exigidas (2–8). */
  @IsOptional()
  @IsInt()
  evidencePhotoRequired?: number;
}
