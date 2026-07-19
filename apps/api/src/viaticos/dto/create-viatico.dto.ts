export class CreateViaticoDto {
  usuarioId?: number;
  actividadId?: number | null;
  projectId?: number | null;
  vehicleId?: number | null;
  /** COMBUSTIBLE | CASETA | HOSPEDAJE | ALIMENTACION | TRANSPORTE | OTROS */
  categoria?: string;
  montoSolicitado!: number | string;
  motivo?: string;
  concepto?: string;
  ticketEvidenciaUrl?: string;
  comprobante?: string;
}
