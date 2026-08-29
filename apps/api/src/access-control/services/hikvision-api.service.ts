import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HikCentralArtemisClient,
  rethrowArtemis,
  toArtemisOffsetIso,
  type ArtemisDoorRaw,
  type ArtemisEventRaw,
} from '../../hikvision-artemis/index';
import {
  HikvisionApiConfig,
  HikvisionDoor,
  HikvisionDoorEvent,
} from '../interfaces/hikvision-api.interface';

/**
 * Puente oficinas NEXARA → HikCentral Artemis (cliente compartido).
 */
@Injectable()
export class HikvisionApiService {
  private readonly logger = new Logger(HikvisionApiService.name);
  private readonly client: HikCentralArtemisClient;
  private readonly config: HikvisionApiConfig;

  constructor(private configService: ConfigService) {
    const host = (
      this.configService.get<string>('OFFICES_HIK_HOST') ||
      this.configService.get<string>('HIKVISION_URL') ||
      ''
    ).replace(/\/$/, '');

    const appKey =
      this.configService.get<string>('OFFICES_HIK_APP_KEY') ||
      this.configService.get<string>('HIK_APP_KEY') ||
      '';
    const appSecret =
      this.configService.get<string>('OFFICES_HIK_APP_SECRET') ||
      this.configService.get<string>('HIK_APP_SECRET') ||
      '';

    const timeout = Number(
      this.configService.get('OFFICES_HIK_TIMEOUT') ||
        this.configService.get('HIKVISION_TIMEOUT') ||
        15000,
    );

    this.client = new HikCentralArtemisClient({
      host,
      appKey,
      appSecret,
      timeoutMs: timeout,
      scope: 'oficinas',
    });

    this.config = {
      baseUrl: host,
      port: 443,
      username: '(artemis-app-key)',
      password: '',
      timeout,
      configured: this.client.configured,
    };
  }

  getConfig(): HikvisionApiConfig {
    return this.config;
  }

  async checkConnection(): Promise<boolean> {
    if (!this.client.configured) return false;
    try {
      await this.client.version();
      return true;
    } catch (error) {
      this.logger.warn(`HikCentral oficinas no responde: ${String(error)}`);
      return false;
    }
  }

  async getDoors(): Promise<HikvisionDoor[]> {
    try {
      const data = await this.client.doorList(1, 200);
      return (data?.list ?? []).map((d) => this.mapDoor(d));
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar las puertas de oficinas');
    }
  }

  async getDoorStatus(doorIndexCode: string) {
    try {
      const doors = await this.getDoors();
      const door = doors.find((d) => String(d.doorIndexCode) === String(doorIndexCode));
      if (!door) {
        throw new HttpException('Puerta no encontrada', HttpStatus.NOT_FOUND);
      }
      return {
        id: door.doorIndexCode,
        status: door.status?.locked ? 'locked' : 'unlocked',
        online: door.status?.online ?? false,
        name: door.doorName,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      rethrowArtemis(error, `No se pudo obtener estado de puerta ${doorIndexCode}`);
    }
  }

  async unlockDoor(doorIndexCode: string, _durationSeconds?: number): Promise<void> {
    try {
      await this.client.doorControl([doorIndexCode], '0');
      this.logger.log(`Oficinas: apertura remota puerta ${doorIndexCode}`);
    } catch (error) {
      rethrowArtemis(error, `No se pudo abrir la puerta ${doorIndexCode}`);
    }
  }

  async getAccessEvents(
    doorIndexCode?: string,
    limit: number = 50,
    _offset: number = 0,
  ): Promise<HikvisionDoorEvent[]> {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const data = await this.client.doorEvents(
        toArtemisOffsetIso(start),
        toArtemisOffsetIso(end),
        1,
        Math.min(limit, 200),
      );
      let list = data?.list ?? [];
      if (doorIndexCode) {
        list = list.filter((e) => String(e.doorIndexCode) === String(doorIndexCode));
      }
      return list.map((e) => this.mapEvent(e));
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron obtener eventos de acceso de oficinas');
    }
  }

  private mapDoor(raw: ArtemisDoorRaw): HikvisionDoor {
    const code = String(raw.doorIndexCode ?? raw.doorNo ?? '');
    return {
      doorIndexCode: code,
      doorNo: Number(raw.doorNo) || 0,
      doorName: raw.doorName || code || 'Puerta',
      doorType: raw.channelType || 'DOOR',
      readerCount: 0,
      location: raw.regionName,
      status: {
        online: raw.online !== false,
        locked: String(raw.doorState ?? '') !== '1',
      },
    };
  }

  private mapEvent(raw: ArtemisEventRaw): HikvisionDoorEvent {
    return {
      eventID: String(raw.eventId ?? ''),
      doorIndexCode: String(raw.doorIndexCode ?? ''),
      doorNo: 0,
      readerNo: 0,
      cardNo: raw.cardNo || '',
      personID: String(raw.personId ?? ''),
      eventTime: raw.eventTime || new Date().toISOString(),
      eventType: String(raw.eventTypeName || raw.eventType || 'entry'),
      status: 'success',
    };
  }
}
