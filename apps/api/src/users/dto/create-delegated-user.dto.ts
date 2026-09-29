import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ALL_ROLES } from '../../common/rbac/roles.v2.js';

const textoOpcional = ({ value }: { value: unknown }) => {
  const s = String(value ?? '').trim();
  return s ? s : undefined;
};

/** Alta de un usuario por quien tiene el permiso delegado (o por dirección). */
export class CreateDelegatedUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(180)
  nombre!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /** La escribe (o genera en pantalla) quien da de alta; se guarda solo como hash. */
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  /**
   * Tipo de usuario (`ing_soporte`, `ing_campo`…). El API valida que esta persona pueda darlo de alta.
   * En el formulario básico, si solo hay un tipo, se puede omitir: queda ese.
   */
  @IsOptional()
  @Transform(textoOpcional)
  @IsIn(ALL_ROLES)
  roleKey?: string;

  /** Contacto. Obligatorio en el formulario básico; en el completo puede ir vacío. */
  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(30)
  telefono?: string;

  /** Si se omite, el de quien da de alta. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeNumber?: string;

  /** Solo lo respeta dirección. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;
}

/**
 * Editar después a alguien del equipo: nombre, teléfono y foto los cambia cualquiera con el
 * permiso; rol, departamento, jefe y número de empleado, solo dirección (el servicio lo exige).
 */
export class UpdateDelegatedUserDto {
  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  nombre?: string;

  @IsOptional()
  @Transform(textoOpcional)
  @IsIn(ALL_ROLES)
  roleKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;

  @IsOptional()
  @Transform(textoOpcional)
  @IsString()
  @MaxLength(40)
  employeeNumber?: string;
}
