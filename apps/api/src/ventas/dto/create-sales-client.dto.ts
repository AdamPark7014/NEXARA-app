import { IsArray, IsIn, IsInt, IsOptional, IsString, ArrayMinSize } from 'class-validator';

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

  /** Sectores Core. Si viene, fiscal es obligatorio. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SECTORS, { each: true })
  sectors?: Array<(typeof SECTORS)[number]>;
}
