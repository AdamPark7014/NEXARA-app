import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsString()
  @MinLength(1)
  accountNumber!: string;

  @IsOptional()
  @IsString()
  clabe?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsBoolean()
  speiEnabled?: boolean;

  /**
   * Saldo inicial de la cuenta. Es el único momento en que el saldo se captura
   * a mano: a partir del alta lo mueven los movimientos bancarios. Sin esto la
   * cuenta arranca en cero y la conciliación del primer mes nunca cuadra.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentBalance?: number;
}

export class UpdateBankAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  clabe?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BankTransactionImportItemDto {
  @IsDateString()
  transactionDate!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsBoolean()
  isDebit!: boolean;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  speiTrackingKey?: string;

  @IsOptional()
  @IsString()
  counterpartyRfc?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  counterpartyClabe?: string;

  @IsOptional()
  @IsString()
  counterpartyBank?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsString()
  beneficiaryRef?: string;
}

export class ImportBankTransactionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BankTransactionImportItemDto)
  transactions!: BankTransactionImportItemDto[];
}

export class ReconcileTransactionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  matchedAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paymentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  invoiceId?: number;
}
