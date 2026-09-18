import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

export class SendCotizacionDto {
  @IsEmail()
  email!: string;

  /** Con copia (el correo de quien la pidió en la empresa del cliente, el jefe de área…). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsString()
  message?: string;
}
