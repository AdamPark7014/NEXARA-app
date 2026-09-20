import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Alta de proveedor.
 *
 * Hasta ahora el cuerpo llegaba como `any`: el proveedor nacía con el nombre
 * que alguien tecleara en una orden de compra y nada más. Sin RFC no hay DIOT
 * ni Contabilidad Electrónica, así que el dato fiscal deja de ser un añadido
 * suelto y entra en el contrato del alta.
 *
 * El endpoint hace `upsert` por nombre dentro de la empresa, así que el mismo
 * contrato sirve para crear y para completar la ficha de uno que ya existe.
 */
export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  /**
   * RFC — 12 posiciones para persona moral, 13 para física. Se valida la forma,
   * no la existencia: quien confirma contra el SAT es el PAC al timbrar.
   */
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Za-zÑñ&]{3,4}\d{6}[A-Za-z0-9]{3}$/, {
    message: 'El RFC no tiene un formato válido (12 o 13 caracteres).',
  })
  rfc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiUrl?: string;
}
