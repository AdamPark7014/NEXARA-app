import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  HikvisionApiConfig,
  HikvisionAuthResponse,
  HikvisionDoor,
  HikvisionDoorEvent,
  HikvisionAccessRule,
} from '../interfaces/hikvision-api.interface';

@Injectable()
export class HikvisionApiService {
  private readonly logger = new Logger(HikvisionApiService.name);
  private config: HikvisionApiConfig = {} as HikvisionApiConfig;
  private authToken: string = '';
  private tokenExpiresAt: number = 0;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.initializeConfig();
  }

  private initializeConfig() {
    this.config = {
      baseUrl: this.configService.get('HIKVISION_URL', 'http://localhost:54483'),
      port: this.configService.get('HIKVISION_PORT', 54483),
      username: this.configService.get('HIKVISION_USERNAME', 'admin'),
      password: this.configService.get('HIKVISION_PASSWORD', 'password'),
      timeout: this.configService.get('HIKVISION_TIMEOUT', 10000),
    };
  }

  /**
   * Obtener token de autenticación con HikCentral
   */
  async authenticate(): Promise<string> {
    try {
      // Verificar si el token aún es válido
      if (this.authToken && Date.now() < this.tokenExpiresAt) {
        return this.authToken;
      }

      const url = `${this.config.baseUrl}/api/v1/auth/login`;
      const credentials = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString('base64');

      const response = await this.httpService.post<HikvisionAuthResponse>(url, {}, {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
        timeout: this.config.timeout,
      }).toPromise();

      const data = response!.data as any;
      this.authToken = data.token;
      this.tokenExpiresAt = Date.now() + data.expiresIn * 1000;

      this.logger.log('Autenticación con HikCentral exitosa');
      return this.authToken;
    } catch (error) {
      this.logger.error('Error autenticando con HikCentral', error);
      throw new HttpException(
        'No se pudo autenticar con HikCentral',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Obtener lista de puertas/dispositivos
   */
  async getDoors(): Promise<HikvisionDoor[]> {
    try {
      const token = await this.authenticate();
      const url = `${this.config.baseUrl}/api/v1/devices/doors`;

      const response = await this.httpService.get<HikvisionDoor[]>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: this.config.timeout,
      }).toPromise();

      return (response!.data as any) as HikvisionDoor[];
    } catch (error) {
      this.logger.error('Error obteniendo puertas de HikCentral', error);
      throw new HttpException(
        'No se pudieron obtener las puertas',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtener estado de una puerta específica
   */
  async getDoorStatus(doorNo: number) {
    try {
      const token = await this.authenticate();
      const url = `${this.config.baseUrl}/api/v1/devices/doors/${doorNo}/status`;

      const response = await this.httpService.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: this.config.timeout,
      }).toPromise();

      return (response!.data as any);
    } catch (error) {
      this.logger.error(`Error obteniendo estado de puerta ${doorNo}`, error);
      throw new HttpException(
        'No se pudo obtener el estado de la puerta',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Abrir puerta remota
   */
  async unlockDoor(doorNo: number, durationSeconds?: number): Promise<void> {
    try {
      const token = await this.authenticate();
      const url = `${this.config.baseUrl}/api/v1/devices/doors/${doorNo}/unlock`;

      await this.httpService.post(
        url,
        {
          durationSeconds: durationSeconds || 5,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: this.config.timeout,
        },
      ).toPromise();

      this.logger.log(`Puerta ${doorNo} desbloqueada exitosamente`);
    } catch (error) {
      this.logger.error(`Error desbloqueando puerta ${doorNo}`, error);
      throw new HttpException(
        'No se pudo desbloquear la puerta',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtener eventos de acceso
   */
  async getAccessEvents(
    doorNo?: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<HikvisionDoorEvent[]> {
    try {
      const token = await this.authenticate();
      let url = `${this.config.baseUrl}/api/v1/events/access?limit=${limit}&offset=${offset}`;

      if (doorNo) {
        url += `&doorNo=${doorNo}`;
      }

      const response = await this.httpService.get<HikvisionDoorEvent[]>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: this.config.timeout,
      }).toPromise();

      return (response!.data as any) as HikvisionDoorEvent[];
    } catch (error) {
      this.logger.error('Error obteniendo eventos de acceso', error);
      throw new HttpException(
        'No se pudieron obtener los eventos',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Crear regla de acceso
   */
  async createAccessRule(
    cardNo: string,
    doorNos: number[],
    validFrom: string,
    validTo: string,
  ): Promise<HikvisionAccessRule> {
    try {
      const token = await this.authenticate();
      const url = `${this.config.baseUrl}/api/v1/access-rules`;

      const response = await this.httpService.post<HikvisionAccessRule>(
        url,
        {
          cardNo,
          doorNoList: doorNos,
          validFrom,
          validTo,
          accessLevel: 1,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: this.config.timeout,
        },
      ).toPromise();

      this.logger.log(`Regla de acceso creada para tarjeta ${cardNo}`);
      return (response!.data as any) as HikvisionAccessRule;
    } catch (error) {
      this.logger.error('Error creando regla de acceso', error);
      throw new HttpException(
        'No se pudo crear la regla de acceso',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Eliminar regla de acceso
   */
  async deleteAccessRule(ruleId: string): Promise<void> {
    try {
      const token = await this.authenticate();
      const url = `${this.config.baseUrl}/api/v1/access-rules/${ruleId}`;

      await this.httpService.delete(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: this.config.timeout,
      }).toPromise();

      this.logger.log(`Regla de acceso ${ruleId} eliminada`);
    } catch (error) {
      this.logger.error('Error eliminando regla de acceso', error);
      throw new HttpException(
        'No se pudo eliminar la regla de acceso',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtener configuración actual
   */
  getConfig(): HikvisionApiConfig {
    return this.config;
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      this.logger.warn('HikCentral no disponible en health check');
      return false;
    }
  }
}
