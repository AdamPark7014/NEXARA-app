import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InterpretarInstruccionDto {
  @IsNotEmpty({ message: 'Escribe qué necesitas.' })
  @IsString()
  @MaxLength(2000, { message: 'La instrucción no puede pasar de 2000 caracteres.' })
  texto!: string;
}
