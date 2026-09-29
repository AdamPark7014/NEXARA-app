import { IsArray, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { CotizacionItemDto } from './cotizacion-item.dto.js';
import { SEGMENTOS } from '../terminos-segmento.js';

export class UpdateCotizacionDto {
  /** El folio no se reescribe desde el cliente: se conserva el que emitió el servidor. */
  @IsOptional()
  @IsString()
  quoteNumber?: string;

  @IsOptional()
  @IsIn([...SEGMENTOS])
  segmento?: string;

  @IsOptional()
  @IsString()
  objetivo?: string;

  @IsOptional()
  @IsArray()
  alcanceBloques?: unknown[];

  @IsOptional()
  @IsArray()
  planos?: unknown[];

  /** Personalización del PDF (`cotizaciones/personalizacion.ts`); se normaliza al guardar. */
  @IsOptional()
  @IsObject()
  opciones?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientCompany?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsOptional()
  @IsString()
  clientAddress?: string;

  @IsOptional()
  @IsString()
  atencion?: string;

  @IsOptional()
  @IsString()
  trabajo?: string;

  @IsOptional()
  @IsInt()
  salesClientId?: number;

  @IsOptional()
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  deliveryTime?: string;

  @IsOptional()
  @IsString()
  preparedBy?: string;

  @IsOptional()
  @IsString()
  preparedRole?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent?: number;

  /** Markup sobre el costo de toda la cotización. La partida lo hereda si no trae el suyo. Null lo quita. */
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(1000)
  marginPercent?: number | null;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  items?: CotizacionItemDto[];
}
