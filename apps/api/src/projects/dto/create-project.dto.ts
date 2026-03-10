import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(2)
  sector!: string;

  @IsString()
  @MinLength(10)
  summary!: string;

  @IsString()
  @MinLength(5)
  impact!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsArray()
  @IsString({ each: true })
  services!: string[];

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsArray()
  @IsString({ each: true })
  highlights!: string[];

  @IsOptional()
  @IsBoolean()
  showInCatalog?: boolean;
}
