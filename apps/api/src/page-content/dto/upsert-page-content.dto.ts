import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';

export class UpsertPageContentDto {
  @IsObject()
  content!: Prisma.InputJsonObject;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  updatedBy?: string;
}
