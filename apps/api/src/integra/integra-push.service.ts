import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  clearHttpNotificationHost,
  disableFieldDetection,
  enableHumanFieldDetection,
  setHttpNotificationHost,
} from '../hikvision-isapi';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';

/**
 * Recepción de eventos **empujados** por los equipos.
 *
 * El sondeo que había pregunta cada 4 s por una ventana de 2 h: llega tarde,
 * repite y no trae imagen. Con el empuje el evento entra en menos de un
 * segundo, y esa diferencia es justo la que permite fotografiar a quien acaba
 * de pasar: el terminal no manda su captura —medido, 596 eventos del
 * alertStream sin un solo JPEG— pero como cámara responde en ~300 ms, así que
 * la foto la toma NEXARA en cuanto el evento aterriza.
 *
 * Autenticación: los equipos no saben hablar nuestro JWT. Llevan un token por
 * sitio en la propia URL (`urlLen max=128` en el firmware, así que va corto) y
 * en la base solo queda su sha256.
 */

/** Un evento ya normalizado, venga en XML de cámara o en JSON de terminal. */
export type NormalizedEvent = {
  deviceIp: string;
  deviceName: string | null;
  eventType: string;
  major: number | null;
  minor: number | null;
  label: string | null;
  occurredAt: Date;
  personId: string | null;
  personName: string | null;
  doorNo: number | null;
  verifyMode: string | null;
  targets: Array<{ type: string; x: number; y: number; w: number; h: number }> | null;
  raw: unknown;
};

@Injectable()
export class IntegraPushService {
  private readonly logger = new Logger(IntegraPushService.name);
  /** Un canal por sitio: la consola se engancha y ve los eventos al vuelo. */
  private readonly streams = new Map<number, Subject<NormalizedEvent & { photoUrl: string | null }>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
  ) {}

  stream(siteId: number) {
    let s = this.streams.get(siteId);
    if (!s) {
      s = new Subject();
      this.streams.set(siteId, s);
    }
    return s.asObservable();
  }

  /** Token nuevo para un sitio. Se devuelve en claro una sola vez. */
  async issueToken(siteId: number): Promise<{ token: string; url: string }> {
    const site = await this.prisma.integraSite.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException(`Sitio ${siteId} no existe`);
    // 24 hex = 96 bits. La URL entera tiene que caber en 128 caracteres.
    const token = randomBytes(12).toString('hex');
    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { pushTokenHash: sha256(token), pushTokenAt: new Date() },
    });
    return { token, url: `${publicBase()}/api/integra/hik/${siteId}/${token}` };
  }

  /** Resuelve el sitio a partir del token de la URL. */
  async siteForToken(siteId: number, token: string) {
    const site = await this.prisma.integraSite.findUnique({ where: { id: siteId } });
    if (!site?.pushTokenHash) throw new NotFoundException('Sitio sin token de eventos');
    if (site.pushTokenHash !== sha256(token)) throw new NotFoundException('Token no válido');
    return site;
  }

  /** Lo que ya llegó, del más reciente al más antiguo. */
  async listEvents(
    companyId: number,
    opts: { siteId?: number | null; personId?: string | null; take: number },
  ) {
    return this.prisma.integraPushEvent.findMany({
      where: {
        companyId,
        ...(opts.siteId ? { siteId: opts.siteId } : {}),
        ...(opts.personId ? { personId: opts.personId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: opts.take,
      select: {
        id: true,
        deviceIp: true,
        deviceName: true,
        eventType: true,
        label: true,
        occurredAt: true,
        personId: true,
        personName: true,
        doorNo: true,
        verifyMode: true,
        photoPath: true,
        targets: true,
      },
    });
  }

  /**
   * Deja a todos los equipos del sitio avisando a NEXARA.
   *
   * Se emite un token nuevo en cada pasada: si el anterior se filtró en un log
   * o en la pantalla de alguien, deja de valer en cuanto se reconfigura. Como
   * el token va en la URL de todos los equipos, reconfigurarlos es justo lo que
   * se está haciendo.
   */
  async wireDevices(
    companyId: number,
    siteId: number,
    opts: { detection?: boolean } = {},
  ) {
    const { token, url } = await this.issueToken(siteId);
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.isapiForHost) {
      throw new BadRequestException('El empuje de eventos solo aplica a sitios ISAPI');
    }

    const devices = await this.prisma.integraDevice.findMany({
      where: { siteId, ip: { not: null } },
      select: { ip: true, name: true, kind: true },
    });
    // Varias filas comparten IP (un terminal es ACS y a la vez fuente de video).
    const byIp = new Map<string, { name: string; kind: string }>();
    for (const d of devices) {
      const ip = d.ip as string;
      const prev = byIp.get(ip);
      // ACS manda sobre ENCODE: decide si se le piden imágenes o no.
      if (!prev || d.kind === 'ACS') byIp.set(ip, { name: d.name, kind: d.kind });
    }

    const results: Array<{
      ip: string;
      name: string;
      kind: string;
      push: 'ok' | string;
      detection?: 'ok' | 'no-soportado' | string;
    }> = [];

    for (const [ip, info] of byIp) {
      const client = resolved.isapiForHost(ip);
      if (!client) continue;
      const isCamera = info.kind !== 'ACS';
      const entry: (typeof results)[number] = {
        ip,
        name: info.name,
        kind: info.kind,
        push: 'ok',
      };

      try {
        // Solo las cámaras declaran `uploadImagesDataType`: pedírselo a un
        // terminal es mandarle un campo que no conoce.
        await setHttpNotificationHost(client, { url, withImages: isCamera });
      } catch (e) {
        entry.push = describeErr(e);
      }

      if (opts.detection && isCamera) {
        try {
          entry.detection = (await enableHumanFieldDetection(client)) ? 'ok' : 'no-soportado';
        } catch (e) {
          entry.detection = describeErr(e);
        }
      }
      results.push(entry);
    }

    return {
      url,
      token,
      devices: results,
      ok: results.filter((r) => r.push === 'ok').length,
      total: results.length,
    };
  }

  /** Deshace lo anterior: los equipos dejan de avisar y de detectar. */
  async unwireDevices(companyId: number, siteId: number, opts: { detection?: boolean } = {}) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.isapiForHost) throw new BadRequestException('Sitio no ISAPI');
    const devices = await this.prisma.integraDevice.findMany({
      where: { siteId, ip: { not: null } },
      select: { ip: true, kind: true },
    });
    const ips = [...new Set(devices.map((d) => d.ip as string))];
    const results: Array<{ ip: string; push: string; detection?: string }> = [];
    for (const ip of ips) {
      const client = resolved.isapiForHost(ip);
      if (!client) continue;
      const entry: (typeof results)[number] = { ip, push: 'ok' };
      try {
        await clearHttpNotificationHost(client);
      } catch (e) {
        entry.push = describeErr(e);
      }
      if (opts.detection) {
        try {
          entry.detection = (await disableFieldDetection(client)) ? 'ok' : 'no-soportado';
        } catch (e) {
          entry.detection = describeErr(e);
        }
      }
      results.push(entry);
    }
    // El token deja de valer: aunque un equipo se quede mal configurado, sus
    // avisos ya no entran.
    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { pushTokenHash: null, pushTokenAt: null },
    });
    return { devices: results };
  }

  /**
   * Guarda el evento y, si toca, le pone cara.
   *
   * Solo se fotografía lo que lo merece —un acceso concedido, una persona
   * detectada—: disparar una captura por cada latido del equipo llenaría el
   * disco de fotos de un pasillo vacío.
   */
  async ingest(
    site: { id: number; companyId: number },
    ev: NormalizedEvent,
    pushedImage?: Buffer | null,
  ) {
    let photoPath: string | null = null;
    if (pushedImage?.length) {
      // Si el equipo mandó la imagen, esa es la buena: es el fotograma exacto
      // del evento. Solo las cámaras la mandan; los terminales, nunca.
      photoPath = await this.savePhoto(site, ev, pushedImage).catch(() => null);
    } else if (worthAPhoto(ev)) {
      photoPath = await this.snapshot(site, ev).catch((e) => {
        this.logger.warn(`Sin foto para ${ev.deviceIp}: ${String(e)}`);
        return null;
      });
    }

    const row = await this.prisma.integraPushEvent.create({
      data: {
        companyId: site.companyId,
        siteId: site.id,
        deviceIp: ev.deviceIp,
        deviceName: ev.deviceName,
        eventType: ev.eventType,
        major: ev.major,
        minor: ev.minor,
        label: ev.label,
        occurredAt: ev.occurredAt,
        personId: ev.personId,
        personName: ev.personName,
        doorNo: ev.doorNo,
        verifyMode: ev.verifyMode,
        photoPath,
        targets: (ev.targets ?? undefined) as never,
        raw: (ev.raw ?? undefined) as never,
      },
    });

    this.streams.get(site.id)?.next({ ...ev, photoUrl: photoPath });
    return row;
  }

  /** Captura del propio equipo que mandó el evento. */
  private async snapshot(
    site: { id: number; companyId: number },
    ev: NormalizedEvent,
  ): Promise<string | null> {
    const resolved = await this.sites.resolveClient({
      companyId: site.companyId,
      siteId: site.id,
    });
    if (!resolved.isapiForHost) return null;
    const client = resolved.isapiForHost(ev.deviceIp);
    if (!client) return null;

    const { buffer, contentType } = await client.getBinary(
      '/ISAPI/Streaming/channels/101/picture',
    );
    if (!contentType.includes('image')) return null;
    return this.savePhoto(site, ev, buffer);
  }

  private async savePhoto(
    site: { id: number },
    ev: NormalizedEvent,
    buffer: Buffer,
  ): Promise<string> {
    // Un directorio por día: buscar «lo del martes» no debería recorrer un año.
    const day = ev.occurredAt.toISOString().slice(0, 10);
    const safeIp = ev.deviceIp.replace(/[^0-9a-zA-Z.]/g, '_');
    const rel = path.posix.join('integra', String(site.id), day, `${Date.now()}-${safeIp}.jpg`);
    const abs = path.resolve(process.cwd(), 'uploads', rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return `/uploads/${rel}`;
  }
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function publicBase(): string {
  return (process.env.PUBLIC_API_URL || 'https://integra.nexara.com.mx').replace(/\/$/, '');
}

/**
 * `major 5 / minor 75` es acceso concedido; los `linedetection` y
 * `fielddetection` de la cámara ya vienen filtrados a persona por el propio
 * equipo. Lo demás —latidos, videoloss, puerta abierta por botón— no.
 */
function worthAPhoto(ev: NormalizedEvent): boolean {
  if (ev.eventType === 'AccessControllerEvent') return ev.major === 5;
  return ['linedetection', 'fielddetection', 'facedetection'].includes(ev.eventType);
}

function describeErr(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
}
