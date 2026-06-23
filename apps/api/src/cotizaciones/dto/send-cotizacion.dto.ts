import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendCotizacionDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  message?: string;
}
