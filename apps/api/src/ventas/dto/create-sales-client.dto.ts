import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ArrayMinSize } from 'class-validator';

const SECTORS = ['PROYECTO', 'CORPORATIVO', 'COMERCIAL'] as const;

export class CreateSalesClientDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  fiscalAddress?: string;

  @IsOptional()
  @IsString()
  fiscalZipCode?: string;

  @IsOptional()
  @IsString()
  fiscalRegime?: string;

  @IsOptional()
  @IsString()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  billingPhone?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @IsInt()
  serviceClientId?: number;

  /**
   * Tipo único del cliente. Si no viene, se usa el sector del body o el del área
   * de quien lo crea (si tiene varios, COMERCIAL). Los datos fiscales no son obligatorios:
   * basta el nombre; RFC, razón social y el resto se completan después.
   */
  @IsOptional()
  @IsIn(SECTORS)
  tipo?: (typeof SECTORS)[number];

  /**
   * Alta rápida de un operativo al crear una actividad de servicio.
   * Solo nombre y contacto, y solo tipo CORPORATIVO.
   */
  @IsOptional()
  @IsBoolean()
  altaRapida?: boolean;

  /** Sector legado. Si viene más de uno, queda un solo tipo (COMERCIAL si está en la lista). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SECTORS, { each: true })
  sectors?: Array<(typeof SECTORS)[number]>;
}
