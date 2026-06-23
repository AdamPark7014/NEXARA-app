import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class ClientTicketRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by ticket request status' })
  @IsOptional()
  @IsString()
  status?: string;
}