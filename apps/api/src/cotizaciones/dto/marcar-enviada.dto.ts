import { IsIn } from 'class-validator';
import { MEDIOS_ENVIO } from '../seguimiento-cotizacion.js';

export class MarcarEnviadaDto {
  @IsIn(MEDIOS_ENVIO as unknown as string[])
  medio!: string;
}
