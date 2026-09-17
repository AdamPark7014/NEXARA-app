import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto.js';

export class UpdateActivityDto extends PartialType(CreateActivityDto) {
  /**
   * Motivo obligatorio (mín. 10 caracteres) cuando `estatus` pasa a «Cancelada». Solo lo aceptan
   * los superiores de quien la ejecuta; en cualquier otro cambio se ignora.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}
