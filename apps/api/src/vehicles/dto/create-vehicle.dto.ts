export class CreateVehicleDto {
  actividadId!: number;
  solicitanteId!: number;
  placasVehiculo?: string;
  motivoUso?: string;
  estatusAprobacion?: string;
  evidenciaEntregaUrl?: string;
  evidenciaDevolucionUrl?: string;
  fechaInicio?: Date;
  fechaFin?: Date;
}
