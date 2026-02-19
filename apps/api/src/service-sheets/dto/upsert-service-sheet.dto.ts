import { IsOptional, IsString } from 'class-validator';

export class UpsertServiceSheetDto {
  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  managerRole?: string;

  @IsOptional()
  @IsString()
  workSummary?: string;

  @IsOptional()
  equipmentList?: unknown;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  signedName?: string;

  @IsOptional()
  survey?: unknown;
}
