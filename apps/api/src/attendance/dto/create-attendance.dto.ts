import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, IsISO8601 } from 'class-validator';

export class CreateAttendanceDto {
  @IsEnum(['entrada', 'salida'], { message: 'type debe ser "entrada" o "salida"' })
  type!: 'entrada' | 'salida';

  /**
   * Campo viejo de la app 1.0.2. Ya no fija la hora del registro: se lee como
   * `capturedAt` (hora del teléfono, informativa). La hora es la del servidor.
   */
  @IsOptional()
  @IsISO8601({}, { message: 'timestamp debe ser una fecha ISO8601 válida' })
  timestamp?: string; // ISO8601 string instead of Date

  /** Hora del teléfono al capturar la checada (informativa). */
  @IsOptional()
  @IsISO8601({}, { message: 'capturedAt debe ser una fecha ISO8601 válida' })
  capturedAt?: string;

  @IsString({ message: 'photoBase64 debe ser un string' })
  @IsNotEmpty({ message: 'La foto es obligatoria para registrar asistencia' })
  photoBase64!: string;

  @IsOptional()
  @IsNumber({}, { message: 'latitude debe ser un número' })
  latitude?: number; // Ubicación GPS

  @IsOptional()
  @IsNumber({}, { message: 'longitude debe ser un número' })
  longitude?: number; // Ubicación GPS

  /** Precisión del GPS en metros. Peor que 200 m se acepta, pero queda a revisión. */
  @IsOptional()
  @IsNumber({}, { message: 'accuracyM debe ser un número' })
  accuracyM?: number;

  /**
   * Antigüedad de la medición al mandarla, en milisegundos.
   *
   * La calcula el teléfono con su reloj monótono —Android `elapsedRealtimeNanos`, iOS la
   * diferencia contra `CLLocation.timestamp`— así que cambiar la hora del sistema no la
   * altera. Arriba de 5 min la checada queda a revisión; arriba de 30 min se rechaza: eso
   * ya no es dónde está la persona, es la última posición que su teléfono tenía guardada.
   */
  @IsOptional()
  @IsNumber({}, { message: 'fixAgeMs debe ser un número' })
  fixAgeMs?: number;

  /**
   * El teléfono detectó ubicación simulada (Android `isMock`/`isFromMockProvider`,
   * iOS `CLLocation.sourceInformation?.isSimulatedBySoftware`). Se rechaza con 422.
   */
  @IsOptional()
  @IsBoolean({ message: 'mockLocation debe ser booleano' })
  mockLocation?: boolean;

  /** Se capturó sin conexión y se manda después: se respeta `capturedAt` si es razonable. */
  @IsOptional()
  @IsBoolean({ message: 'offline debe ser booleano' })
  offline?: boolean;

  constructor(type: 'entrada' | 'salida', timestamp?: string, photoBase64?: string, latitude?: number, longitude?: number) {
    this.type = type;
    if (timestamp) this.timestamp = timestamp;
    if (photoBase64) this.photoBase64 = photoBase64;
    if (latitude !== undefined) this.latitude = latitude;
    if (longitude !== undefined) this.longitude = longitude;
  }
}
