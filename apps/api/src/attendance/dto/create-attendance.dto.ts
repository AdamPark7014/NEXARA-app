import { IsEnum, IsOptional, IsString, IsNumber, IsISO8601 } from 'class-validator';

export class CreateAttendanceDto {
  @IsEnum(['entrada', 'salida'], { message: 'type debe ser "entrada" o "salida"' })
  type!: 'entrada' | 'salida';

  @IsOptional()
  @IsISO8601({}, { message: 'timestamp debe ser una fecha ISO8601 válida' })
  timestamp?: string; // ISO8601 string instead of Date

  @IsOptional()
  @IsString({ message: 'photoBase64 debe ser un string' })
  photoBase64?: string; // Foto en base64 desde la cámara

  @IsOptional()
  @IsNumber({}, { message: 'latitude debe ser un número' })
  latitude?: number; // Ubicación GPS

  @IsOptional()
  @IsNumber({}, { message: 'longitude debe ser un número' })
  longitude?: number; // Ubicación GPS

  constructor(type: 'entrada' | 'salida', timestamp?: string, photoBase64?: string, latitude?: number, longitude?: number) {
    this.type = type;
    if (timestamp) this.timestamp = timestamp;
    if (photoBase64) this.photoBase64 = photoBase64;
    if (latitude !== undefined) this.latitude = latitude;
    if (longitude !== undefined) this.longitude = longitude;
  }
}
