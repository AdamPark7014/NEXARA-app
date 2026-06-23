import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CotizacionItemDto {
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  partNumber?: string;

  @IsOptional()
  @IsString()
  batchReference?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  discount!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  tax!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  ieps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  retention?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyMonths?: number;

  @IsOptional()
  @IsString()
  deliveryTime?: string;

  @IsOptional()
  @IsString()
  countryOrigin?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
