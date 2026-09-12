import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const SECTORS = ['PROYECTO', 'CORPORATIVO', 'COMERCIAL'] as const;

export class SalesPaginationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @IsIn(SECTORS)
  sector?: (typeof SECTORS)[number];
}
