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

  /**
   * El teléfono detectó ubicación simulada en este punto (Android `Location.isMock` /
   * `isFromMockProvider`, iOS `CLLocation.sourceInformation?.isSimulatedBySoftware`).
   *
   * A diferencia de la checada, aquí **no** se rechaza: el recorrido de la jornada no
   * decide nómina, y tirar el punto solo dejaría un hueco que nadie sabría leer. Se
   * guarda marcado, que es lo que permite ver después que media jornada de alguien venía
   * de una app de GPS falso. null = app vieja que todavía no lo manda.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'mockLocation debe ser booleano' })
  mockLocation?: boolean;
}
