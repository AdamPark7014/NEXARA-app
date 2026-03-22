import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordPublicLandingEventDto {
  @IsString()
  @MaxLength(100)
  landingKey!: string;

  @IsString()
  @IsIn(['view', 'click', 'conversion'])
  eventType!: 'view' | 'click' | 'conversion';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  landingPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referrer?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
