export class CreateGpsDto {
  usuarioId!: number;
  actividadId?: number;
  latitud!: number;
  longitud!: number;
  velocidadKmh?: number;
  estaActivo?: boolean;
  ultimaActualizacion?: Date;
}
