import { IsIn } from 'class-validator';
import { ESTADOS_UBICACION, type EstadoUbicacion } from '../estado-ubicacion.js';

/** `POST attendance/estado-ubicacion`: la app avisa que la ubicación del teléfono cambió. */
export class EstadoUbicacionDto {
  @IsIn(ESTADOS_UBICACION as unknown as string[], { message: 'estado debe ser APAGADA, SIN_PERMISO o ENCENDIDA' })
  estado!: EstadoUbicacion;
}
