import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPageContentDto {
  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  updatedBy?: string;
}
