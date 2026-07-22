export class AssignViaticoDto {
  /** Beneficiario del viático (obligatorio). */
  usuarioId!: number | string;
  actividadId?: number | null;
  projectId?: number | null;
  vehicleId?: number | null;
  /** COMBUSTIBLE | CASETA | HOSPEDAJE | ALIMENTACION | TRANSPORTE | OTROS */
  categoria?: string;
  montoSolicitado!: number | string;
  motivo?: string;
  concepto?: string;
}
