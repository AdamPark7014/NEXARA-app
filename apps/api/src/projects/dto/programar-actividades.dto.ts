/**
 * «Programar actividades del proyecto»: una actividad por etapa (o por etapa × sitio),
 * cada una con su periodo y su gente, en una sola llamada.
 */
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EtapaAProgramarDto {
  @IsInt()
  @Min(1)
  hitoId!: number;

  /** Primer día del periodo, `AAAA-MM-DD`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'inicio debe ser AAAA-MM-DD' })
  inicio!: string;

  /** Último día del periodo, `AAAA-MM-DD` (incluido). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fin debe ser AAAA-MM-DD' })
  fin!: string;

  /** Quien la lleva (queda como responsable y LEAD del equipo). */
  @IsInt()
  @Min(1)
  responsableId!: number;

  /** Gente que la ejecuta con el responsable. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  apoyoIds?: number[];

  /** Título propio; si no, «Proyecto — Etapa». */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  indicaciones?: string;
}

export class ProgramarActividadesDto {
  /** Una actividad por sitio en cada etapa (usa `siteCount` del proyecto). */
  @IsOptional()
  @IsBoolean()
  porSitio?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => EtapaAProgramarDto)
  etapas!: EtapaAProgramarDto[];
}
