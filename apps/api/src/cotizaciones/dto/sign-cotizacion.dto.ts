import { IsEmail, IsString } from 'class-validator';

export class SignCotizacionDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;
}
