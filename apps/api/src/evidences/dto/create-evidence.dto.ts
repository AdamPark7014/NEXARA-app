export class CreateEvidenceDto {
  actividadId!: number;
  tipoEvidencia!: string;
  archivoUrl!: string;
  aprobada?: boolean;
  subidoEn?: Date;
  userId?: number;
}
