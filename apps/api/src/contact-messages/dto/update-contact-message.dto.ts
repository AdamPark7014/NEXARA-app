import { PartialType } from '@nestjs/mapped-types';
import { CreateContactMessageDto } from './create-contact-message.dto.js';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ContactStatus } from '@prisma/client';

export class UpdateContactMessageDto extends PartialType(CreateContactMessageDto) {
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsString()
  responseMessage?: string;

  @IsOptional()
  @IsIn(['EMAIL', 'WHATSAPP'])
  sendChannel?: 'EMAIL' | 'WHATSAPP';

  @IsOptional()
  @IsBoolean()
  sendResponse?: boolean;
}
