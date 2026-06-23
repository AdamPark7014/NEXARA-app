import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional } from 'class-validator';

export class CreateGpsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'usuarioId debe ser un número' })
  usuarioId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'actividadId debe ser un número' })
  actividadId?: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'latitud debe ser un número' })
  latitud!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'longitud debe ser un número' })
  longitud!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'velocidadKmh debe ser un número' })
  velocidadKmh?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'estaActivo debe ser booleano' })
  estaActivo?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'ultimaActualizacion debe ser una fecha válida' })
  ultimaActualizacion?: Date;
}
