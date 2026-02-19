import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateSalesOpportunityQuoteDto {
  @IsOptional()
  @IsInt()
  cotizacionId?: number;

  @IsOptional()
  @IsString()
  versionLabel?: string;

  @IsOptional()
  @IsString()
  pdfUrl?: string;
}
