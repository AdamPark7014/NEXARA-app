export class UpdateViaticoDto {
  actividadId?: number | null;
  projectId?: number | null;
  vehicleId?: number | null;
  categoria?: string;
  montoSolicitado?: number | string;
  motivo?: string;
  concepto?: string;
  ticketEvidenciaUrl?: string;
  comprobante?: string;
}
