import { IsArray, IsDateString, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { CotizacionItemDto } from './cotizacion-item.dto.js';
import { SEGMENTOS } from '../terminos-segmento.js';

export class CreateCotizacionDto {
  /**
   * Folio. En Core **no se manda**: lo fija el servidor con la nomenclatura de quien cotiza y su
   * contador. Sigue siendo aceptado para no romper a quien ya lo enviaba (CRM legacy, importaciones).
   */
  @IsOptional()
  @IsString()
  quoteNumber?: string;

  /** Segmento del contrato: decide plantillas y términos. Obligatorio al crear desde Core. */
  @IsOptional()
  @IsIn([...SEGMENTOS])
  segmento?: string;

  /** 01 Objetivo del proyecto. */
  @IsOptional()
  @IsString()
  objetivo?: string;

  /** 02 Alcance: bloques reutilizables con sus parámetros. */
  @IsOptional()
  @IsArray()
  alcanceBloques?: unknown[];

  /** 03 Planos: anexos de la propuesta. */
  @IsOptional()
  @IsArray()
  planos?: unknown[];

  /** Personalización del PDF (`cotizaciones/personalizacion.ts`); se normaliza al guardar. */
  @IsOptional()
  @IsObject()
  opciones?: Record<string, unknown>;

  /** Actividad comercial que origina la cotización (queda ligada en los dos sentidos). */
  @IsOptional()
  @IsInt()
  activityId?: number;

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

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsArray()
  items!: CotizacionItemDto[];
}
