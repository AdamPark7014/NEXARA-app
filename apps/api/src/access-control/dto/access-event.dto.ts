import { IsString, IsOptional, IsDate, IsNumber, IsEnum } from 'class-validator';

export class AccessEventDto {
  @IsString()
  id!: string;

  @IsString()
  doorId!: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  cardNumber?: string;

  @IsEnum(['entry', 'exit', 'unlock', 'lock', 'denied', 'alarmTriggered'])
  eventType!: 'entry' | 'exit' | 'unlock' | 'lock' | 'denied' | 'alarmTriggered';

  @IsString()
  @IsOptional()
  status?: 'success' | 'failed' | 'denied';

  @IsDate()
  timestamp!: Date;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  temperature?: number; // Para algunos dispositivos que capturan temperatura
}

export class AccessEventFilterDto {
  @IsString()
  @IsOptional()
  doorId?: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  offset?: number;
}
