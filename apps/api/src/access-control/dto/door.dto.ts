import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class DoorDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsBoolean()
  @IsOptional()
  isOnline?: boolean;

  @IsString()
  @IsOptional()
  status?: 'open' | 'closed' | 'locked' | 'unlocked';

  @IsNumber()
  @IsOptional()
  batteryLevel?: number;

  @IsString()
  @IsOptional()
  deviceType?: string;
}

export class UnlockDoorDto {
  @IsString()
  doorId!: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsNumber()
  @IsOptional()
  durationSeconds?: number; // Duración del desbloqueo
}

export class DoorStatusDto {
  @IsString()
  id!: string;

  @IsString()
  status!: 'open' | 'closed' | 'locked' | 'unlocked';

  @IsString()
  @IsOptional()
  lastEvent?: string;

  @IsString()
  @IsOptional()
  lastEventTime?: string;
}
