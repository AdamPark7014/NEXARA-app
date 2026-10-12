import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { JobQueueService } from '../jobs/job-queue.service.js';
import { TranscriptorService } from '../ai/voz/transcriptor.service.js';
import { EXTENSIONES_AUDIO, extensionAudio } from '../ai/voz/transcriptor.js';
import {
  MAX_PARTES,
  carpetaGrabacion,
  nombreParte,
  partesDesdeArchivos,
  resumenGrabacion,
  unirTranscripcion,
} from './grabacion.js';

const TRABAJO = 'reunion.transcribir-parte';
const INTENTOS = 3;

type ArchivoSubido = { buffer: Buffer; mimetype: string; size: number };

/**
 * Graba y transcribe juntas con nuestro propio transcriptor (ver `grabacion.ts`).
 * La transcripción va a la cola para que una junta de horas no dependa de una petición.
 */
@Injectable()
export class GrabacionService implements OnModuleInit {
  private readonly logger = new Logger('GrabacionReunion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
    private readonly transcriptor: TranscriptorService,
  ) {}

  onModuleInit() {
    this.jobs.register(TRABAJO, async (payload, intento) => {
      await this.transcribirParte(
        Number(payload.companyId),
        Number(payload.meetingId),
        Number(payload.parte),
        intento,
      );
    });
  }

  private carpeta(companyId: number, meetingId: number): string {
    return getUploadSubdir(__dirname, carpetaGrabacion(companyId, meetingId));
  }

  private async exigirReunion(meetingId: number, companyId: number) {
    const existe = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(companyId) },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Reunión no encontrada');
  }

  private async archivos(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  async subirParte(
    meetingId: number,
    parteRaw: unknown,
    file: ArchivoSubido | undefined,
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!this.transcriptor.url()) {
      throw new ServiceUnavailableException(
        'El transcriptor no está configurado en el servidor (TRANSCRIPTOR_URL).',
      );
    }
    const parte = Number(parteRaw);
    if (!Number.isInteger(parte) || parte < 1 || parte > MAX_PARTES) {
      throw new BadRequestException('Número de parte inválido.');
    }
    if (!file?.buffer?.length) throw new BadRequestException('No llegó el audio.');
    const ext = extensionAudio(file.mimetype);
    if (!ext) throw new BadRequestException('Ese archivo no es de audio.');
    await this.exigirReunion(meetingId, tenantId);

    const dir = this.carpeta(tenantId, meetingId);
    // Reintento de la web tras un corte: si la parte ya quedó transcrita, no se repite.
    const yaEstan = await this.archivos(dir);
    if (!yaEstan.includes(nombreParte(parte, 'txt'))) {
      for (const n of yaEstan) {
        if (n.startsWith(nombreParte(parte, ''))) await fs.rm(path.join(dir, n), { force: true });
      }
      await fs.writeFile(path.join(dir, nombreParte(parte, ext)), file.buffer);
      await this.jobs.enqueue(
        TRABAJO,
        { companyId: tenantId, meetingId, parte },
        { maxAttempts: INTENTOS, jobId: `reunion-${tenantId}-${meetingId}-${parte}-${Date.now()}` },
      );
    }
    return this.estado(meetingId, companyId);
  }

  async estado(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.exigirReunion(meetingId, tenantId);
    const dir = this.carpeta(tenantId, meetingId);
    const partes = partesDesdeArchivos(await this.archivos(dir));
    const textos: Array<{ parte: number; texto: string }> = [];
    for (const p of partes) {
      if (p.estado === 'lista') {
        const texto = await fs.readFile(path.join(dir, nombreParte(p.parte, 'txt')), 'utf8').catch(() => '');
        textos.push({ parte: p.parte, texto });
      } else if (p.estado === 'error') {
        p.error = (await fs.readFile(path.join(dir, nombreParte(p.parte, 'err')), 'utf8').catch(() => '')).slice(0, 300);
      }
    }
    return {
      disponible: Boolean(this.transcriptor.url()),
      ...resumenGrabacion(partes),
      partes,
      texto: unirTranscripcion(textos),
    };
  }

  /** Borra audio y texto de la grabación (el acta guardada no se toca). */
  async borrar(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.exigirReunion(meetingId, tenantId);
    await fs.rm(this.carpeta(tenantId, meetingId), { recursive: true, force: true });
    return { ok: true };
  }

  /** Trabajo de la cola: una parte de audio → texto junto al audio. */
  async transcribirParte(companyId: number, meetingId: number, parte: number, intento: number) {
    const dir = this.carpeta(companyId, meetingId);
    const nombres = await this.archivos(dir);
    if (nombres.includes(nombreParte(parte, 'txt'))) return;
    const audio = nombres.find((n) =>
      EXTENSIONES_AUDIO.some((ext) => n === nombreParte(parte, ext)),
    );
    if (!audio) return; // se borró la grabación mientras esperaba
    const ext = audio.split('.').pop()!;
    try {
      const buffer = await fs.readFile(path.join(dir, audio));
      const texto = await this.transcriptor.transcribir(buffer, audio, mimeDe(ext));
      await fs.writeFile(path.join(dir, nombreParte(parte, 'txt')), texto, 'utf8');
      await fs.rm(path.join(dir, nombreParte(parte, 'err')), { force: true });
      if (process.env.GRABACION_CONSERVAR_AUDIO !== '1') await fs.rm(path.join(dir, audio), { force: true });
    } catch (error) {
      const mensaje = (error as Error)?.message || String(error);
      this.logger.warn(`reunión ${meetingId} parte ${parte} intento ${intento}: ${mensaje}`);
      if (intento >= INTENTOS) {
        await fs.writeFile(path.join(dir, nombreParte(parte, 'err')), mensaje, 'utf8').catch(() => undefined);
        return;
      }
      throw error;
    }
  }
}

function mimeDe(ext: string): string {
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'mp3') return 'audio/mpeg';
  return `audio/${ext}`;
}
