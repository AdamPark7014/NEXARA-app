import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsIn(['ventas'])
  panel?: 'ventas';

  /** Código TOTP de 6 dígitos cuando MFA está activo */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;

  /** "Recordarme": sesión larga (JWT_REMEMBER_EXPIRES_IN, 30d por defecto). */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
