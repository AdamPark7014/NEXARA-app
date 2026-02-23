export class CreateAttendanceDto {
  type!: 'entrada' | 'salida';
  timestamp?: Date;
  photoBase64?: string; // Foto en base64 desde la cámara
  latitude?: number; // Ubicación GPS
  longitude?: number; // Ubicación GPS

  constructor(type: 'entrada' | 'salida', timestamp?: Date, photoBase64?: string, latitude?: number, longitude?: number) {
    this.type = type;
    if (timestamp) this.timestamp = timestamp;
    if (photoBase64) this.photoBase64 = photoBase64;
    if (latitude !== undefined) this.latitude = latitude;
    if (longitude !== undefined) this.longitude = longitude;
  }
}
