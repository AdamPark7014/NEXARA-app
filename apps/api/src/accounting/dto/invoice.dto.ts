import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  satProductKey?: string;

  @IsOptional()
  @IsString()
  satUnitKey?: string;

  @IsOptional()
  @IsString()
  unitName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ivaRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  iepsRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  isrRetRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ivaRetRate?: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsIn(['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE'])
  type!: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cfdiUsage?: string;

  @IsOptional()
  @IsString()
  satPaymentForm?: string;

  @IsOptional()
  @IsString()
  satPaymentMethod?: string;

  @IsOptional()
  @IsString()
  emisorRfc?: string;

  @IsOptional()
  @IsString()
  emisorName?: string;

  @IsOptional()
  @IsString()
  emisorRegime?: string;

  @IsOptional()
  @IsString()
  receptorRfc?: string;

  @IsOptional()
  @IsString()
  receptorName?: string;

  @IsOptional()
  @IsString()
  receptorRegime?: string;

  @IsOptional()
  @IsString()
  receptorZipCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  cfdiSerie?: string;

  @IsOptional()
  @IsString()
  cfdiRelationType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cfdiRelatedUuids?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}

export class UpdateInvoiceDraftDto {
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  receptorRfc?: string;

  @IsOptional()
  @IsString()
  receptorName?: string;

  @IsOptional()
  @IsString()
  receptorRegime?: string;

  @IsOptional()
  @IsString()
  receptorZipCode?: string;

  @IsOptional()
  @IsString()
  cfdiUsage?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}

export class RegisterPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bankAccountId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  satPaymentForm?: string;

  @IsOptional()
  @IsString()
  speiTrackingKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  operationNumber?: string;

  @IsOptional()
  @IsBoolean()
  stampComplement?: boolean;
}

export class CancelInvoiceDto {
  @IsString()
  @MinLength(1)
  cancelReason!: string;

  @IsOptional()
  @IsString()
  substitutionUuid?: string;
}

export class CreateCreditNoteDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
