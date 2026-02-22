export class CreateAttendanceDto {
  type!: 'entrada' | 'salida';
  timestamp?: Date;
  photoBase64?: string; // Foto en base64 desde la cámara

  constructor(type: 'entrada' | 'salida', timestamp?: Date, photoBase64?: string) {
    this.type = type;
    if (timestamp) this.timestamp = timestamp;
    if (photoBase64) this.photoBase64 = photoBase64;
  }
}
