import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class InboundContactMessageDto {
  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  threadId?: string;
}
