import { IsArray, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NewsStatus } from '@prisma/client';

export class CreateNewsPostDto {
  @IsString()
  @MinLength(4)
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsString()
  @MinLength(20)
  content!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryUrls?: string[];

  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
