import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsEnum,
  Matches,
  Max,
  MaxLength,
} from 'class-validator';
import { ActivityType, ActivityWorkType, TicketType } from '@prisma/client';
import { MENSAJE_TOPE_12H, TOPE_SESION_MIN } from '../sessions/sesiones-trabajo.js';

/** Los topes de largo son los de cada columna (`@db.VarChar` en schema.prisma). */
export class CreateActivityDto {
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'El folio no puede pasar de 20 caracteres' })
  anNumber?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200, { message: '«¿Qué hay que hacer?» no puede pasar de 200 caracteres; el detalle va en indicaciones' })
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  indicaciones?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El estatus no puede pasar de 50 caracteres' })
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
  @MaxLength(120, { message: 'El tipo de tarea no puede pasar de 120 caracteres' })
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
  @MaxLength(160, { message: 'El nombre de la sucursal no puede pasar de 160 caracteres' })
  branchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'El número de sucursal no puede pasar de 60 caracteres' })
  branchNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'La ciudad no puede pasar de 120 caracteres' })
  branchCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El estado no puede pasar de 120 caracteres' })
  branchState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220, { message: 'La dirección no puede pasar de 220 caracteres' })
  branchAddress?: string;

  // «¿Cuánto tiempo toma?»: ninguna actividad dura más de 12 horas (regla del dueño).
  @IsOptional()
  @IsInt()
  @Max(TOPE_SESION_MIN, { message: MENSAJE_TOPE_12H })
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
  @MaxLength(20, { message: 'El tipo de actividad no puede pasar de 20 caracteres' })
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
