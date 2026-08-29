import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HikCentralArtemisClient,
  rethrowArtemis,
  toArtemisOffsetIso,
} from '../hikvision-artemis/index';

@Injectable()
export class IntegraArtemisService {
  private readonly logger = new Logger(IntegraArtemisService.name);
  private readonly client: HikCentralArtemisClient;

  constructor(config: ConfigService) {
    const host = (config.get<string>('INTEGRA_HIK_HOST') || '').replace(/\/$/, '');
    const appKey = config.get<string>('INTEGRA_HIK_APP_KEY') || '';
    const appSecret = config.get<string>('INTEGRA_HIK_APP_SECRET') || '';
    const timeout = Number(config.get('INTEGRA_HIK_TIMEOUT') || 15000);

    this.client = new HikCentralArtemisClient({
      host,
      appKey,
      appSecret,
      timeoutMs: timeout,
      scope: 'integra',
    });
  }

  get configured() {
    return this.client.configured;
  }

  get host() {
    return this.client.host;
  }

  async health() {
    if (!this.client.configured) {
      return { connected: false, configured: false, host: this.host || null, version: null };
    }
    try {
      const version = await this.client.version();
      return { connected: true, configured: true, host: this.host, version };
    } catch (error) {
      this.logger.warn(`Integra Artemis down: ${String(error)}`);
      return { connected: false, configured: true, host: this.host, version: null };
    }
  }

  async listCameras(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.cameras(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((c) => ({
          id: String(c.cameraIndexCode ?? ''),
          name: c.cameraName || String(c.cameraIndexCode ?? ''),
          region: c.regionName,
          status: c.status,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar cámaras Integra');
    }
  }

  async preview(cameraIndexCode: string) {
    try {
      const data = await this.client.previewUrls(cameraIndexCode);
      return {
        cameraIndexCode,
        url: data?.url ?? null,
        protocol: 'rtsp_s',
        note: 'URL RTSP para VLC o media gateway; no es HTML5.',
      };
    } catch (error) {
      rethrowArtemis(error, `No se pudo obtener preview de ${cameraIndexCode}`);
    }
  }

  async listDoors(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.doorList(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((d) => ({
          id: String(d.doorIndexCode ?? d.doorNo ?? ''),
          name: d.doorName || String(d.doorIndexCode ?? ''),
          location: d.regionName,
          online: d.online !== false,
          status: String(d.doorState ?? '') === '1' ? 'unlocked' : 'locked',
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar puertas Integra');
    }
  }

  async openDoor(doorIndexCode: string, actor?: { id?: number; email?: string }) {
    try {
      await this.client.doorControl([doorIndexCode], '0');
      this.logger.log(
        JSON.stringify({
          action: 'integra.door.open',
          doorIndexCode,
          userId: actor?.id,
          email: actor?.email,
        }),
      );
      return { success: true, message: `Puerta ${doorIndexCode} abierta` };
    } catch (error) {
      rethrowArtemis(error, `No se pudo abrir la puerta ${doorIndexCode}`);
    }
  }

  async listEvents(limit = 50, doorId?: string) {
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
      if (doorId) {
        list = list.filter((e) => String(e.doorIndexCode) === String(doorId));
      }
      return {
        total: list.length,
        items: list.map((e) => ({
          id: String(e.eventId ?? ''),
          doorId: String(e.doorIndexCode ?? ''),
          doorName: e.doorName,
          personId: e.personId ? String(e.personId) : undefined,
          personName: e.personName,
          cardNo: e.cardNo,
          eventType: String(e.eventTypeName || e.eventType || ''),
          timestamp: e.eventTime,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar eventos Integra');
    }
  }

  async listOrgs(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.orgList(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((o) => ({
          id: String(o.orgIndexCode ?? ''),
          name: o.orgName || '',
          parentId: o.parentOrgIndexCode,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar organizaciones');
    }
  }

  async listPeople(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.personList(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((p) => ({
          id: String(p.personId ?? ''),
          name: p.personName || '',
          code: p.personCode,
          orgId: p.orgIndexCode,
          orgName: p.orgName,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar personas');
    }
  }

  async addPerson(input: { personName: string; personCode?: string; orgIndexCode: string }) {
    try {
      const data = await this.client.personAdd({
        personName: input.personName,
        personCode: input.personCode,
        orgIndexCode: input.orgIndexCode,
      });
      return { success: true, data };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo crear la persona en Artemis');
    }
  }

  async deletePerson(personId: string) {
    try {
      await this.client.personDelete(personId);
      return { success: true };
    } catch (error) {
      rethrowArtemis(error, `No se pudo eliminar persona ${personId}`);
    }
  }

  async listPrivilegeGroups(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.privilegeGroups(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((g) => ({
          id: String(g.privilegeGroupId ?? ''),
          name: g.privilegeGroupName || '',
          description: g.description,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar grupos de privilegio');
    }
  }

  async assignPersonsToGroup(privilegeGroupId: string, personIds: string[]) {
    try {
      await this.client.privilegeAddPersons(privilegeGroupId, personIds);
      return { success: true };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron asignar personas al grupo');
    }
  }

  async applyAuth() {
    try {
      await this.client.authReapplication();
      return { success: true, message: 'Reaplicación de privilegios solicitada' };
    } catch (error) {
      rethrowArtemis(error, 'No se pudo reaplicar privilegios');
    }
  }

  async listVehicles(pageNo = 1, pageSize = 100) {
    try {
      const data = await this.client.vehicleList(pageNo, pageSize);
      return {
        total: data?.total ?? data?.list?.length ?? 0,
        items: (data?.list ?? []).map((v) => ({
          id: String(v.vehicleId ?? ''),
          plate: v.plateNo || '',
          personId: v.personId,
          personName: v.personName,
        })),
      };
    } catch (error) {
      rethrowArtemis(error, 'No se pudieron listar vehículos');
    }
  }
}
