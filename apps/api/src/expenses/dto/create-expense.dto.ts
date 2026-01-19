export class CreateExpenseDto {
  actividadId!: number;
  usuarioId!: number;
  montoSolicitado!: number;
  razonGasto?: string;
  ticketEvidenciaUrl?: string;
  estatusPago?: string;
  fechaSolicitud?: Date;
}
