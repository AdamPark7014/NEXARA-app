export class CreateAttendanceDto {
  type!: 'entrada' | 'salida';
  timestamp?: Date;

  constructor(type: 'entrada' | 'salida', timestamp?: Date) {
    this.type = type;
    if (timestamp) this.timestamp = timestamp;
  }
}
