import {
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HikvisionApiService } from './hikvision-api.service';
import { DoorDto, UnlockDoorDto } from '../dto/door.dto';
import { AccessEventDto, AccessEventFilterDto } from '../dto/access-event.dto';
import { CreateAccessRuleDto } from '../dto/access-rule.dto';

/**
 * ACS de oficinas NEXARA (sedes propias).
 * No es la superficie del panel Integra.
 */
@Injectable()
export class AccessControlService {
  constructor(private hikvisionApi: HikvisionApiService) {}

  async getAllDoors(): Promise<DoorDto[]> {
    const doors = await this.hikvisionApi.getDoors();
    return doors.map((door) => this.mapHikvisionDoorToDto(door));
  }

  async getDoorStatus(doorId: string): Promise<any> {
    return this.hikvisionApi.getDoorStatus(doorId);
  }

  async unlockDoor(dto: UnlockDoorDto): Promise<{ success: boolean; message: string }> {
    await this.hikvisionApi.unlockDoor(dto.doorId, dto.durationSeconds);
    return {
      success: true,
      message: `Puerta ${dto.doorId} abierta`,
    };
  }

  async getAccessEvents(filter: AccessEventFilterDto): Promise<AccessEventDto[]> {
    const events = await this.hikvisionApi.getAccessEvents(
      filter.doorId,
      filter.limit || 50,
      filter.offset || 0,
    );
    return events.map((event) => this.mapHikvisionEventToDto(event));
  }

  async createAccessRule(_dto: CreateAccessRuleDto): Promise<never> {
    throw new HttpException(
      'Asignación a privilege/group Artemis aún no modelada para oficinas. Usar HikCentral o Integra.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  async deleteAccessRule(_ruleId: string): Promise<never> {
    throw new HttpException(
      'Borrado de privilege/group Artemis aún no modelado para oficinas.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  private mapHikvisionDoorToDto(door: any): DoorDto {
    return {
      id: door.doorIndexCode || String(door.doorNo ?? ''),
      name: door.doorName || door.name || 'Puerta',
      description: door.doorType,
      location: door.location,
      isOnline: door.status?.online ?? false,
      status: door.status?.locked ? 'locked' : 'unlocked',
      deviceType: door.doorType || 'DOOR',
    };
  }

  private mapHikvisionEventToDto(event: any): AccessEventDto {
    return {
      id: event.eventID || event.id,
      doorId: event.doorIndexCode || event.doorNo?.toString() || event.doorId,
      employeeId: event.personID,
      cardNumber: event.cardNo,
      eventType: 'entry',
      status: event.status === 'failed' ? 'failed' : 'success',
      timestamp: new Date(event.eventTime),
    };
  }

  getHikvisionConfig() {
    return this.hikvisionApi.getConfig();
  }

  async checkConnection(): Promise<boolean> {
    return this.hikvisionApi.checkConnection();
  }
}
