import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InterpretarCotizacionDto {
  /** La frase o la lista pegada. */
  @IsString()
  @MinLength(2)
  @MaxLength(6000)
  texto!: string;

  /** La cotización en edición: sus propias partidas no cuentan como «usadas antes». */
  @IsOptional()
  @IsInt()
  excluir?: number;
}
