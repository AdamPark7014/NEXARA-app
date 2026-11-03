import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class SignCotizacionDto {
  /** La ruta es pública: con puros espacios sería una firma sin nombre. */
  @IsString()
  @Matches(/\S/, { message: 'Escribe tu nombre completo.' })
  @MaxLength(180)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;
}
