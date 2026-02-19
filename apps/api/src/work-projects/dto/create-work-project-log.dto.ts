import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWorkProjectLogDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
