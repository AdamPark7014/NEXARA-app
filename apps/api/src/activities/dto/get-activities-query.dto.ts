import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class GetActivitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['mine'], description: 'Scope for activity listing' })
  @IsOptional()
  @IsIn(['mine'])
  scope?: 'mine';
}
