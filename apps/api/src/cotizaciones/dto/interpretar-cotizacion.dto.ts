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

  /** La moneda de la cotización: lo cotizado en otra no se ofrece, y con CT solo se compara en pesos. */
  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;
}
