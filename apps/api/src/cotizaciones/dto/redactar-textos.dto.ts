import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class PartidaParaRedactarDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  grupo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string | null;

  @IsOptional()
  @IsNumber()
  qty?: number | null;

  @IsOptional()
  @IsNumber()
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  laborHours?: number | null;

  @IsOptional()
  @IsNumber()
  laborRate?: number | null;
}

export class RedactarTextosDto {
  /** Las partidas del borrador tal como están, guardadas o no. */
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => PartidaParaRedactarDto)
  partidas!: PartidaParaRedactarDto[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  segmento?: string | null;

  /** Lo que quien cotiza quiere que diga. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  indicacion?: string | null;
}
