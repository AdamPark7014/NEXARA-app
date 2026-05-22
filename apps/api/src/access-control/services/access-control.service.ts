import { Injectable, Logger } from '@nestjs/common';
import { HikvisionApiService } from './hikvision-api.service';
import { DoorDto, UnlockDoorDto } from '../dto/door.dto';
import { AccessEventDto, AccessEventFilterDto } from '../dto/access-event.dto';
import { CreateAccessRuleDto, UpdateAccessRuleDto } from '../dto/access-rule.dto';

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);

  constructor(private hikvisionApi: HikvisionApiService) {}

  /**
   * Obtener todas las puertas
   */
  async getAllDoors(): Promise<DoorDto[]> {
    try {
      const doors = await this.hikvisionApi.getDoors();
      return doors.map((door) => this.mapHikvisionDoorToDto(door));
    } catch (error) {
      this.logger.error('Error obteniendo puertas', error);
      throw error;
    }
  }

  /**
   * Obtener estado de puerta
   */
  async getDoorStatus(doorId: string): Promise<any> {
    try {
      const doorNo = parseInt(doorId, 10);
      return await this.hikvisionApi.getDoorStatus(doorNo);
    } catch (error) {
      this.logger.error(`Error obteniendo estado de puerta ${doorId}`, error);
      throw error;
    }
  }

  /**
   * Desbloquear puerta
   */
  async unlockDoor(dto: UnlockDoorDto): Promise<{ success: boolean; message: string }> {
    try {
      const doorNo = parseInt(dto.doorId, 10);
      await this.hikvisionApi.unlockDoor(doorNo, dto.durationSeconds);

      return {
        success: true,
        message: `Puerta ${dto.doorId} desbloqueada exitosamente`,
      };
    } catch (error) {
      this.logger.error(`Error desbloqueando puerta ${dto.doorId}`, error);
      throw error;
    }
  }

  /**
   * Obtener eventos de acceso
   */
  async getAccessEvents(filter: AccessEventFilterDto): Promise<any[]> {
    try {
      const doorNo = filter.doorId ? parseInt(filter.doorId, 10) : undefined;
      const events = await this.hikvisionApi.getAccessEvents(
        doorNo,
        filter.limit || 50,
        filter.offset || 0,
      );

      return events.map((event) => this.mapHikvisionEventToDto(event));
    } catch (error) {
      this.logger.error('Error obteniendo eventos de acceso', error);
      throw error;
    }
  }

  /**
   * Crear regla de acceso
   */
  async createAccessRule(dto: CreateAccessRuleDto): Promise<any> {
    try {
      const startDate = dto.startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
      const endDate = dto.endDate?.toISOString().split('T')[0] || '2030-12-31';

      const doorNos = dto.doorIds.map((id) => parseInt(id, 10));

      const rule = await this.hikvisionApi.createAccessRule(
        dto.employeeId,
        doorNos,
        startDate,
        endDate,
      );

      return rule;
    } catch (error) {
      this.logger.error('Error creando regla de acceso', error);
      throw error;
    }
  }

  /**
   * Eliminar regla de acceso
   */
  async deleteAccessRule(ruleId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.hikvisionApi.deleteAccessRule(ruleId);

      return {
        success: true,
        message: `Regla de acceso ${ruleId} eliminada`,
      };
    } catch (error) {
      this.logger.error(`Error eliminando regla ${ruleId}`, error);
      throw error;
    }
  }

  /**
   * Mapeo de datos de Hikvision a DTO
   */
  private mapHikvisionDoorToDto(door: any): DoorDto {
    return {
      id: door.doorNo?.toString() || door.id,
      name: door.doorName || door.name,
      description: door.doorType,
      location: door.location,
      isOnline: door.status?.online || false,
      status: door.status?.locked ? 'locked' : 'unlocked',
      batteryLevel: door.batteryLevel || 100,
      deviceType: door.deviceType || 'DOOR_LOCK',
    };
  }

  /**
   * Mapeo de eventos de Hikvision a DTO
   */
  private mapHikvisionEventToDto(event: any): AccessEventDto {
    const eventTypeMap: Record<string, string> = {
      entry: 'entry',
      exit: 'exit',
      unlock: 'unlock',
      lock: 'lock',
      denied: 'denied',
      forced: 'alarmTriggered',
    };

    return {
      id: event.eventID || event.id,
      doorId: event.doorNo?.toString() || event.doorId,
      employeeId: event.personID,
      cardNumber: event.cardNo,
      eventType: (eventTypeMap[event.eventType?.toLowerCase()] || 'entry') as any,
      status: event.status === 'success' ? 'success' : event.status === 'failed' ? 'failed' : 'denied',
      timestamp: new Date(event.eventTime),
      notes: event.notes,
      temperature: event.temperature,
    };
  }

  /**
   * Obtener configuración de Hikvision
   */
  getHikvisionConfig() {
    return this.hikvisionApi.getConfig();
  }

  async checkConnection(): Promise<boolean> {
    return this.hikvisionApi.checkConnection();
  }
}
