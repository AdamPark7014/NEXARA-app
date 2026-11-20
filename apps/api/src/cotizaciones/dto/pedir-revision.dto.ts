import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MAX_NOTA } from '../envio-interno.js';

/** «Pedir revisión»: a quién se le pide revisar la cotización (no cambia autor ni «Mandar a»). */
export class PedirRevisionDto {
  @IsInt()
  @Min(1)
  userId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTA)
  nota?: string;
}
