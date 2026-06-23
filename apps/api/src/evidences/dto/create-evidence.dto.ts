export class CreateEvidenceDto {
  actividadId!: number;
  tipoEvidencia!: string;
  archivoUrl!: string;
  aprobada?: boolean;
  estatus?: string;
  comentarios?: string;
  observacionesRevision?: string;
  calificacionEficiencia?: string;
  latitud?: number;
  longitud?: number;
  aprobadoPorId?: number;
  revisadoEn?: Date;
  subidoEn?: Date;
  userId?: number;
}
