import {
  BadRequestException,
  ConflictException,
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
import { EmailService } from '../common/email/email.service.js';
import { TranscriptorService } from '../ai/voz/transcriptor.service.js';
import { EXTENSIONES_AUDIO, extensionAudio } from '../ai/voz/transcriptor.js';
import { ClaudeService, type UsoClaude } from '../ai/claude/claude.service.js';
import { MEETING_DEFAULTS, type AgreementKind, type MeetingType } from './meeting-rhythm.js';
import { MeetingsService } from './meetings.service.js';
import {
  MAX_PARTES,
  carpetaGrabacion,
  msValidos,
  nombreParte,
  partirTexto,
  resumirPartes,
} from './grabacion.js';
import {
  MAX_DURACION_MS,
  construirMinuta,
  contarPalabras,
  entradaMinuta,
  minutaTexto,
  partesNuevas,
  peticionMinuta,
  peticionNotas,
  siguienteTramo,
  tramoAlConcluir,
  transcripcionConMarcas,
  type AcuerdoPrevio,
  type ContextoReunion,
  type Minuta,
  type MinutaPlan,
  type NotasGuardadas,
  type NotasTramo,
  type ParteTexto,
  type PersonaMinuta,
  type Prioridad,
  type ReunionAnterior,
} from './minuta-ia.js';
import { generarMinutaPdf, type MinutaPdfPayload } from './minuta-pdf.js';
import { nombreArchivoActa } from './acta-pdf.js';

const TRANSCRIBIR = 'reunion.transcribir-parte';
const NOTAS = 'reunion.notas';
const MINUTA = 'reunion.minuta';
const INTENTOS = 3;
/** Un candado de notas más viejo que esto es de un proceso que murió. */
const LEASE_MS = 4 * 60_000;
/** Una parte que no se transcribe en este tiempo se da por perdida al concluir. */
const PARTE_PERDIDA_MS = 20 * 60_000;
const MAX_TEXTO_PEGADO = 400_000;

type ArchivoSubido = { buffer: Buffer; mimetype: string; size: number };

export type CuerpoParte = { parte?: unknown; inicioMs?: unknown; duracionMs?: unknown };

export type AcuerdoConfirmado = {
  tipo?: AgreementKind;
  descripcion: string;
  responsableId?: number | null;
  fechaCompromiso?: string | null;
  prioridad?: Prioridad;
  crearActividad?: boolean;
};

const dia = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Grabación de juntas con minuta automática (Adam, 22-10-2026): «le pulsas comenzar a grabar
 * reunión y tiene que empezar a tomar todas las notas… en cuanto le das que concluyó, genera el
 * PDF». Todo lo pesado va en la cola: transcribir cada parte, las notas por tramo y la minuta.
 */
@Injectable()
export class GrabacionService implements OnModuleInit {
  private readonly logger = new Logger('GrabacionReunion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
    private readonly transcriptor: TranscriptorService,
    private readonly claude: ClaudeService,
    private readonly meetings: MeetingsService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.jobs.register(TRANSCRIBIR, async (p, intento) => {
      await this.transcribirParte(Number(p.companyId), Number(p.meetingId), Number(p.parte), intento);
    });
    this.jobs.register(NOTAS, async (p) => {
      await this.tomarNotas(Number(p.companyId), Number(p.meetingId));
    });
    this.jobs.register(MINUTA, async (p, intento) => {
      await this.escribirMinuta(Number(p.companyId), Number(p.meetingId), intento);
    });
  }

  // ── Grabar ─────────────────────────────────────────────────────────────

  private carpeta(companyId: number, meetingId: number): string {
    return getUploadSubdir(__dirname, carpetaGrabacion(companyId, meetingId));
  }

  private async reunion(meetingId: number, companyId: number) {
    const r = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(companyId) },
      select: { id: true, tipo: true, titulo: true, fecha: true, horaInicio: true, agenda: true, estado: true, notas: true },
    });
    if (!r) throw new NotFoundException('Reunión no encontrada');
    return r;
  }

  private grabacionDe(meetingId: number) {
    return this.prisma.meetingRecording.findUnique({ where: { meetingId } });
  }

  async subirParte(meetingId: number, cuerpo: CuerpoParte, file: ArchivoSubido | undefined, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    if (!this.transcriptor.url()) {
      throw new ServiceUnavailableException('El transcriptor no está configurado en el servidor (TRANSCRIPTOR_URL).');
    }
    const parte = Number(cuerpo?.parte);
    if (!Number.isInteger(parte) || parte < 1 || parte > MAX_PARTES) throw new BadRequestException('Número de parte inválido.');
    if (!file?.buffer?.length) throw new BadRequestException('No llegó el audio.');
    const ext = extensionAudio(file.mimetype);
    if (!ext) throw new BadRequestException('Ese archivo no es de audio.');
    const inicioMs = msValidos(cuerpo?.inicioMs, MAX_DURACION_MS + 10 * 60_000);
    const duracionMs = msValidos(cuerpo?.duracionMs, 15 * 60_000);
    if (inicioMs != null && inicioMs >= MAX_DURACION_MS) {
      throw new BadRequestException('La grabación llegó al máximo de 3 horas. Concluye la reunión.');
    }
    await this.reunion(meetingId, tenantId);

    const grabacion = await this.prisma.meetingRecording.upsert({
      where: { meetingId },
      create: { meetingId, companyId: tenantId },
      update: {},
    });
    if (grabacion.estado === 'LISTA') throw new ConflictException('Esta reunión ya concluyó y tiene su minuta.');

    const previa = await this.prisma.meetingRecordingPart.findUnique({
      where: { recordingId_parte: { recordingId: grabacion.id, parte } },
      select: { estado: true },
    });
    // Reintento de la web tras un corte: lo que ya se transcribió no se repite.
    if (previa?.estado !== 'LISTA') {
      const dir = this.carpeta(tenantId, meetingId);
      for (const n of await this.archivos(dir)) {
        if (n.startsWith(nombreParte(parte, ''))) await fs.rm(path.join(dir, n), { force: true });
      }
      await fs.writeFile(path.join(dir, nombreParte(parte, ext)), file.buffer);
      await this.prisma.meetingRecordingPart.upsert({
        where: { recordingId_parte: { recordingId: grabacion.id, parte } },
        create: { recordingId: grabacion.id, parte, inicioMs, duracionMs },
        update: { estado: 'PENDIENTE', error: null, inicioMs, duracionMs },
      });
      if (grabacion.estado === 'ERROR') {
        await this.prisma.meetingRecording.update({ where: { id: grabacion.id }, data: { estado: 'GRABANDO', error: null } });
      }
      await this.jobs.enqueue(
        TRANSCRIBIR,
        { companyId: tenantId, meetingId, parte },
        { maxAttempts: INTENTOS, jobId: `reunion-${tenantId}-${meetingId}-${parte}-${Date.now()}` },
      );
    }
    return { ok: true, parte };
  }

  private async archivos(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  /** Trabajo de la cola: una parte de audio → texto. El audio se borra pase lo que pase al final. */
  async transcribirParte(companyId: number, meetingId: number, parte: number, intento: number) {
    const grabacion = await this.grabacionDe(meetingId);
    if (!grabacion) return; // se borró mientras esperaba
    const fila = await this.prisma.meetingRecordingPart.findUnique({
      where: { recordingId_parte: { recordingId: grabacion.id, parte } },
    });
    if (!fila || fila.estado === 'LISTA') return;
    const dir = this.carpeta(companyId, meetingId);
    const audio = (await this.archivos(dir)).find((n) => EXTENSIONES_AUDIO.some((ext) => n === nombreParte(parte, ext)));
    if (!audio) {
      await this.marcarParte(fila.id, 'ERROR', null, 'El audio ya no estaba en el servidor.');
      return this.despuesDeParte(companyId, meetingId);
    }
    const ext = audio.split('.').pop()!;
    try {
      const buffer = await fs.readFile(path.join(dir, audio));
      const texto = await this.transcriptor.transcribir(buffer, audio, mimeDe(ext));
      await this.marcarParte(fila.id, 'LISTA', texto, null);
      await this.borrarAudio(dir, audio);
    } catch (error) {
      const mensaje = (error as Error)?.message || String(error);
      this.logger.warn(`reunión ${meetingId} parte ${parte} intento ${intento}: ${mensaje}`);
      if (intento < INTENTOS) throw error;
      await this.marcarParte(fila.id, 'ERROR', null, mensaje);
      await this.borrarAudio(dir, audio);
    }
    await this.despuesDeParte(companyId, meetingId);
  }

  private async borrarAudio(dir: string, audio: string) {
    // Privacidad y disco: el audio no se guarda (GRABACION_CONSERVAR_AUDIO=1 solo para depurar).
    if (process.env.GRABACION_CONSERVAR_AUDIO !== '1') await fs.rm(path.join(dir, audio), { force: true });
  }

  private marcarParte(id: number, estado: 'LISTA' | 'ERROR', texto: string | null, error: string | null) {
    return this.prisma.meetingRecordingPart.update({
      where: { id },
      data: {
        estado,
        texto,
        palabras: contarPalabras(texto),
        error: error ? error.slice(0, 300) : null,
        transcritaAt: new Date(),
      },
    });
  }

  /** Cada parte lista puede completar un tramo de notas; al concluir, puede destrabar la minuta. */
  private async despuesDeParte(companyId: number, meetingId: number) {
    const g = await this.prisma.meetingRecording.findUnique({ where: { meetingId }, select: { estado: true } });
    if (!g) return;
    if (g.estado === 'CONCLUYENDO') {
      await this.jobs.enqueue(MINUTA, { companyId, meetingId }, { maxAttempts: 2, jobId: `minuta-${meetingId}-${Date.now()}` });
    } else if (g.estado === 'GRABANDO') {
      await this.jobs.enqueue(NOTAS, { companyId, meetingId }, { maxAttempts: 1, jobId: `notas-${meetingId}-${Date.now()}` });
    }
  }

  // ── Notas en vivo ──────────────────────────────────────────────────────

  private async tomarCandado(recordingId: number): Promise<boolean> {
    const r = await this.prisma.meetingRecording.updateMany({
      where: { id: recordingId, OR: [{ notasLease: null }, { notasLease: { lt: new Date(Date.now() - LEASE_MS) } }] },
      data: { notasLease: new Date() },
    });
    return r.count === 1;
  }

  private soltarCandado(recordingId: number) {
    return this.prisma.meetingRecording.update({ where: { id: recordingId }, data: { notasLease: null } });
  }

  /** Partes después de `hasta`, sin texto de las ya cubiertas (una junta de 3 h no se relee entera). */
  private async partesDesde(recordingId: number, hasta: number): Promise<ParteTexto[]> {
    const filas = await this.prisma.meetingRecordingPart.findMany({
      where: { recordingId, parte: { gt: hasta } },
      select: { parte: true, estado: true, texto: true, inicioMs: true, duracionMs: true },
      orderBy: { parte: 'asc' },
    });
    return filas.map((f) => ({ ...f, estado: f.estado as ParteTexto['estado'] }));
  }

  /** Trabajo de la cola: anota los tramos completos que haya (uno tras otro, con candado). */
  async tomarNotas(companyId: number, meetingId: number, opciones: { alConcluir?: boolean } = {}) {
    const g = await this.grabacionDe(meetingId);
    if (!g || (g.estado !== 'GRABANDO' && !opciones.alConcluir)) return;
    if (!opciones.alConcluir && !(await this.tomarCandado(g.id))) return; // otro trabajo ya está anotando
    try {
      let ctx: ContextoReunion | null = null;
      let notas = (g.notas as unknown as NotasGuardadas[]) ?? [];
      let hasta = g.notasHasta;
      for (let vuelta = 0; vuelta < 60; vuelta++) {
        const partes = await this.partesDesde(g.id, hasta);
        const tramo = opciones.alConcluir
          ? tramoAlConcluir(await this.todasLasPartes(g.id), hasta)
          : siguienteTramo(partesNuevas(partes, hasta));
        if (!tramo) break;
        ctx ??= (await this.contexto(companyId, meetingId)).ctx;
        const temas = [...new Set(notas.flatMap((n) => n.notas.temas.map((t) => t.titulo)))];
        const p = peticionNotas(ctx, tramo, temas);
        const { datos, uso } = await this.claude.json<NotasTramo>({
          ...p,
          proceso: 'reunion-notas',
          companyId,
          modelo: process.env.ANTHROPIC_NOTAS_MODEL || p.modelo,
        });
        const ult = tramo[tramo.length - 1];
        notas = [
          ...notas,
          {
            desde: tramo[0].parte,
            hasta: ult.parte,
            inicioMs: tramo[0].inicioMs,
            finMs: ult.inicioMs != null ? ult.inicioMs + (ult.duracionMs ?? 0) : null,
            palabras: tramo.reduce((s, x) => s + contarPalabras(x.texto), 0),
            notas: datos,
          },
        ];
        hasta = ult.parte;
        await this.prisma.meetingRecording.update({
          where: { id: g.id },
          data: { notas: notas as object[], notasHasta: hasta, notasLease: opciones.alConcluir ? undefined : new Date(), ...this.gasto(uso) },
        });
      }
    } catch (error) {
      // Sin reintento: la siguiente parte que llegue lo vuelve a intentar con el mismo tramo.
      this.logger.warn(`reunión ${meetingId}: notas pendientes (${(error as Error)?.message})`);
      if (opciones.alConcluir) throw error;
    } finally {
      if (!opciones.alConcluir) await this.soltarCandado(g.id);
    }
  }

  private async todasLasPartes(recordingId: number) {
    return this.partesDesde(recordingId, 0);
  }

  private gasto(uso: UsoClaude) {
    return { usdIa: { increment: uso.usdAprox ?? 0 }, tokensIa: { increment: uso.tokensEntrada + uso.tokensSalida + uso.tokensCacheLeidos } };
  }

  /** Datos de la reunión, personas de la empresa y acuerdos de la reunión anterior de la serie. */
  private async contexto(companyId: number, meetingId: number) {
    const r = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(companyId) },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        fecha: true,
        horaInicio: true,
        agenda: true,
        asistentes: { select: { user: { select: { nombre: true } } } },
      },
    });
    if (!r) throw new NotFoundException('Reunión no encontrada');
    // `User` no lleva `companyId`: la pertenencia vive en `UserCompany`.
    const personas: PersonaMinuta[] = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, puesto: true },
      orderBy: { nombre: 'asc' },
    });
    const { anterior, previos } = await this.reunionAnterior(companyId, r);
    const ctx: ContextoReunion = {
      titulo: r.titulo,
      fecha: dia(r.fecha),
      horaInicio: r.horaInicio,
      asistentes: r.asistentes.map((a) => a.user?.nombre).filter(Boolean) as string[],
      agenda: r.agenda,
      personas,
      anterior,
      previos,
    };
    return { ctx, personas, reunion: r };
  }

  /**
   * La reunión anterior de la misma serie (mismo tipo; en extraordinarias, mismo título) y sus
   * acuerdos: los guardados o, si nadie los confirmó, los que propuso su minuta.
   */
  private async reunionAnterior(
    companyId: number,
    r: { id: number; tipo: string; titulo: string; fecha: Date },
  ): Promise<{ anterior: ReunionAnterior | null; previos: AcuerdoPrevio[] }> {
    const previa = await this.prisma.operationalMeeting.findFirst({
      where: {
        ...companyWhere(companyId),
        tipo: r.tipo as MeetingType,
        ...(r.tipo === 'EXTRAORDINARIA' ? { titulo: r.titulo } : {}),
        estado: { not: 'CANCELADA' },
        id: { not: r.id },
        OR: [{ fecha: { lt: r.fecha } }, { fecha: r.fecha, id: { lt: r.id } }],
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        titulo: true,
        fecha: true,
        acuerdos: {
          where: { tipo: 'ACUERDO' },
          select: { id: true, descripcion: true, fechaCompromiso: true, estado: true, responsable: { select: { nombre: true } } },
          orderBy: { createdAt: 'asc' },
          take: 30,
        },
        grabacion: { select: { minuta: true } },
      },
    });
    if (!previa) return { anterior: null, previos: [] };
    const anterior = { id: previa.id, titulo: previa.titulo, fecha: dia(previa.fecha) };
    if (previa.acuerdos.length) {
      return {
        anterior,
        previos: previa.acuerdos.map((a, i) => ({
          ref: `A${i + 1}`,
          agreementId: a.id,
          descripcion: a.descripcion,
          responsable: a.responsable?.nombre ?? null,
          fechaCompromiso: a.fechaCompromiso ? dia(a.fechaCompromiso) : null,
          estado: a.estado,
        })),
      };
    }
    const propuestos = ((previa.grabacion?.minuta as unknown as Minuta | null)?.acuerdos ?? []).slice(0, 30);
    return {
      anterior,
      previos: propuestos.map((a, i) => ({
        ref: `A${i + 1}`,
        agreementId: null,
        descripcion: a.descripcion,
        responsable: a.responsable?.nombre ?? a.textoResponsable,
        fechaCompromiso: a.fechaCompromiso,
        estado: 'PROPUESTO',
      })),
    };
  }

  // ── Concluir y minuta ──────────────────────────────────────────────────

  async concluir(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.reunion(meetingId, tenantId);
    const g = await this.grabacionDe(meetingId);
    if (!g) throw new BadRequestException('Esta reunión no tiene grabación.');
    if (g.estado === 'LISTA' && !(g.minuta == null)) return this.estado(meetingId, companyId);
    await this.prisma.meetingRecording.update({
      where: { id: g.id },
      data: { estado: 'CONCLUYENDO', concluidaAt: g.concluidaAt ?? new Date(), error: null },
    });
    await this.jobs.enqueue(MINUTA, { companyId: tenantId, meetingId }, { maxAttempts: 2, jobId: `minuta-${meetingId}-${Date.now()}` });
    return this.estado(meetingId, companyId);
  }

  /** Volver a escribir la minuta (si falló o se quiere otra versión). */
  async regenerar(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const g = await this.grabacionDe(meetingId);
    if (!g) throw new BadRequestException('Esta reunión no tiene grabación.');
    await this.reunion(meetingId, tenantId);
    await this.prisma.meetingRecording.update({ where: { id: g.id }, data: { estado: 'CONCLUYENDO', error: null } });
    await this.jobs.enqueue(MINUTA, { companyId: tenantId, meetingId }, { maxAttempts: 2, jobId: `minuta-${meetingId}-${Date.now()}` });
    return this.estado(meetingId, companyId);
  }

  /** Trabajo de la cola: espera a que todo esté transcrito, anota la cola y escribe la minuta. */
  async escribirMinuta(companyId: number, meetingId: number, intento: number) {
    const g = await this.grabacionDe(meetingId);
    if (!g || g.estado !== 'CONCLUYENDO') return;

    const pendientes = await this.prisma.meetingRecordingPart.findMany({
      where: { recordingId: g.id, estado: 'PENDIENTE' },
      select: { id: true, createdAt: true },
    });
    const perdidas = pendientes.filter((p) => Date.now() - p.createdAt.getTime() > PARTE_PERDIDA_MS);
    if (perdidas.length) {
      await this.prisma.meetingRecordingPart.updateMany({
        where: { id: { in: perdidas.map((p) => p.id) } },
        data: { estado: 'ERROR', error: 'No se transcribió a tiempo.' },
      });
    }
    if (pendientes.length > perdidas.length) return; // la última parte transcrita vuelve a llamar
    if (!(await this.tomarCandado(g.id))) {
      // Unas notas en vivo siguen en curso: reintento en unos segundos.
      await this.jobs.enqueue(MINUTA, { companyId, meetingId }, { maxAttempts: 2, delayMs: 15_000, jobId: `minuta-${meetingId}-${Date.now()}` });
      return;
    }
    try {
      await this.tomarNotas(companyId, meetingId, { alConcluir: true });
      const fresca = await this.prisma.meetingRecording.findUniqueOrThrow({ where: { id: g.id } });
      const partes = await this.todasLasPartes(g.id);
      const notas = (fresca.notas as unknown as NotasGuardadas[]) ?? [];
      const entrada = entradaMinuta(partes, notas);
      if (!entrada.texto.trim()) {
        await this.prisma.meetingRecording.update({
          where: { id: g.id },
          data: { estado: 'ERROR', error: 'No se escuchó nada en la grabación: revisa el micrófono.' },
        });
        return;
      }
      const { ctx, personas, reunion } = await this.contexto(companyId, meetingId);
      ctx.duracionMs = resumirPartes(partes.map((p) => ({ ...p, palabras: 0 }))).duracionMs || null;
      const p = peticionMinuta(ctx, entrada);
      const { datos, uso } = await this.claude.json<MinutaPlan>({
        ...p,
        proceso: 'reunion-minuta',
        companyId,
        modelo: process.env.ANTHROPIC_MINUTA_MODEL || p.modelo,
      });
      const minuta = construirMinuta(datos, personas, ctx.previos, { anterior: ctx.anterior ?? null, fuente: entrada.fuente });
      await this.prisma.meetingRecording.update({
        where: { id: g.id },
        data: { estado: 'LISTA', minuta: minuta as object, minutaAt: new Date(), error: null, ...this.gasto(uso) },
      });
      await this.cerrarReunion(meetingId, reunion, minuta);
    } catch (error) {
      const mensaje = (error as Error)?.message || String(error);
      this.logger.error(`reunión ${meetingId}: minuta intento ${intento}: ${mensaje}`);
      if (intento < 2) throw error;
      await this.prisma.meetingRecording.update({
        where: { id: g.id },
        data: { estado: 'ERROR', error: mensaje.slice(0, 500) },
      });
    } finally {
      await this.soltarCandado(g.id);
    }
  }

  /**
   * Con la minuta lista, la reunión queda realizada, con la minuta en `notas` (si no tenía) y el
   * título que sugiere la IA si seguía con el genérico del tipo («Reunión diaria»). Los acuerdos
   * no: esos se confirman a mano.
   */
  private async cerrarReunion(meetingId: number, r: { tipo: string; titulo: string }, minuta: Minuta) {
    const actual = await this.prisma.operationalMeeting.findUnique({
      where: { id: meetingId },
      select: { estado: true, notas: true, realizadaAt: true },
    });
    if (!actual) return;
    const generico = Object.values(MEETING_DEFAULTS).some((d) => d.titulo === r.titulo);
    await this.prisma.operationalMeeting.update({
      where: { id: meetingId },
      data: {
        ...(actual.notas?.trim() ? {} : { notas: minutaTexto(minuta) }),
        ...(generico && minuta.tituloSugerido ? { titulo: minuta.tituloSugerido.slice(0, 200) } : {}),
        ...(actual.estado === 'PROGRAMADA' ? { estado: 'REALIZADA', realizadaAt: actual.realizadaAt ?? new Date() } : {}),
      },
    });
  }

  // ── Texto pegado ───────────────────────────────────────────────────────

  /** Transcripción o notas pegadas: mismo camino que una grabación, sin audio. */
  async desdeTexto(meetingId: number, textoRaw: unknown, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const texto = String(textoRaw ?? '').trim();
    if (contarPalabras(texto) < 15) throw new BadRequestException('Pega la transcripción o las notas de la reunión.');
    if (texto.length > MAX_TEXTO_PEGADO) throw new BadRequestException('El texto es demasiado largo (más de 4 horas de junta).');
    await this.reunion(meetingId, tenantId);
    const existente = await this.grabacionDe(meetingId);
    if (existente) {
      const partes = await this.prisma.meetingRecordingPart.count({ where: { recordingId: existente.id } });
      if (partes) throw new ConflictException('Esta reunión ya tiene grabación. Bórrala antes de pegar otro texto.');
      await this.prisma.meetingRecording.delete({ where: { id: existente.id } });
    }
    const trozos = partirTexto(texto);
    await this.prisma.meetingRecording.create({
      data: {
        meetingId,
        companyId: tenantId,
        estado: 'GRABANDO',
        partes: {
          create: trozos.map((t, i) => ({ parte: i + 1, estado: 'LISTA', texto: t, palabras: contarPalabras(t), transcritaAt: new Date() })),
        },
      },
    });
    return this.concluir(meetingId, companyId);
  }

  // ── Leer ───────────────────────────────────────────────────────────────

  async estado(meetingId: number, companyId: number | null, notasDesde = 0) {
    const tenantId = requireCompanyId(companyId);
    await this.reunion(meetingId, tenantId);
    const disponible = Boolean(this.transcriptor.url());
    const g = await this.grabacionDe(meetingId);
    if (!g) return { disponible, existe: false as const };
    const partes = await this.prisma.meetingRecordingPart.findMany({
      where: { recordingId: g.id },
      select: { parte: true, estado: true, duracionMs: true, palabras: true },
    });
    const notas = (g.notas as unknown as NotasGuardadas[]) ?? [];
    const desde = Math.max(0, Math.min(Number(notasDesde) || 0, notas.length));
    return {
      disponible,
      existe: true as const,
      estado: g.estado,
      iniciadaAt: g.iniciadaAt,
      concluidaAt: g.concluidaAt,
      ...resumirPartes(partes),
      totalNotas: notas.length,
      notasDesde: desde,
      notas: notas.slice(desde),
      minuta: g.minuta as unknown as Minuta | null,
      minutaAt: g.minutaAt,
      error: g.error,
      usdIa: Number(g.usdIa.toFixed(4)),
      acuerdosConfirmadosAt: g.acuerdosConfirmadosAt,
    };
  }

  async transcripcion(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.reunion(meetingId, tenantId);
    const g = await this.grabacionDe(meetingId);
    if (!g) return { texto: '' };
    return { texto: transcripcionConMarcas(await this.todasLasPartes(g.id)) };
  }

  /** Borra audio, texto, notas y minuta de la grabación (el acta y los acuerdos guardados se quedan). */
  async borrar(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.reunion(meetingId, tenantId);
    await this.prisma.meetingRecording.deleteMany({ where: { meetingId } });
    await fs.rm(this.carpeta(tenantId, meetingId), { recursive: true, force: true });
    return { ok: true };
  }

  // ── Después de la minuta ───────────────────────────────────────────────

  /** Guarda los acuerdos que la persona dejó marcados (y sus actividades). Nada se crea solo. */
  async confirmarAcuerdos(meetingId: number, lista: AcuerdoConfirmado[], userId: number | null, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.reunion(meetingId, tenantId);
    if (!Array.isArray(lista)) throw new BadRequestException('Lista de acuerdos inválida.');
    let guardados = 0;
    let actividades = 0;
    const errores: string[] = [];
    for (const a of lista.slice(0, 60)) {
      try {
        const r = (await this.meetings.addAgreement(
          meetingId,
          {
            tipo: a.tipo,
            descripcion: a.descripcion,
            responsableId: a.responsableId ?? null,
            fechaCompromiso: a.fechaCompromiso ?? null,
            crearActividad: Boolean(a.crearActividad),
            prioridad: a.prioridad,
          },
          tenantId,
          userId,
        )) as { activity?: { id: number } | null; avisoActividad?: string };
        guardados++;
        if (r.activity?.id && a.crearActividad) actividades++;
        if (r.avisoActividad) errores.push(`${a.descripcion}: ${r.avisoActividad}`);
      } catch (e) {
        errores.push(`${String(a?.descripcion ?? '').slice(0, 80)}: ${(e as Error)?.message}`);
      }
    }
    await this.prisma.meetingRecording.updateMany({ where: { meetingId }, data: { acuerdosConfirmadosAt: new Date() } });
    return { guardados, actividades, errores };
  }

  /** Lo que necesita el PDF de la minuta, o null si la reunión no tiene minuta. */
  async datosPdf(meetingId: number, companyId: number | null): Promise<MinutaPdfPayload | null> {
    const tenantId = requireCompanyId(companyId);
    const g = await this.grabacionDe(meetingId);
    if (!g?.minuta) return null;
    const r = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(tenantId) },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        fecha: true,
        horaInicio: true,
        facilitador: { select: { nombre: true } },
        asistentes: { select: { asistio: true, user: { select: { nombre: true } } }, orderBy: { id: 'asc' } },
      },
    });
    if (!r) return null;
    const partes = await this.todasLasPartes(g.id);
    return {
      ...r,
      minuta: g.minuta as unknown as Minuta,
      duracionMs: resumirPartes(partes.map((p) => ({ ...p, palabras: 0 }))).duracionMs,
      iniciadaAt: g.iniciadaAt,
      transcripcion: transcripcionConMarcas(partes),
    };
  }

  async pdf(meetingId: number, companyId: number | null) {
    const datos = await this.datosPdf(meetingId, companyId);
    if (!datos) return null;
    return { pdf: await generarMinutaPdf(datos), nombre: nombreArchivoActa(datos).replace(/^acta-/, 'minuta-') };
  }

  /** Manda el PDF de la minuta a los convocados que tienen correo. */
  async enviar(meetingId: number, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const archivo = await this.pdf(meetingId, tenantId);
    if (!archivo) throw new BadRequestException('Esta reunión todavía no tiene minuta.');
    const r = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(tenantId) },
      select: { titulo: true, fecha: true, asistentes: { select: { user: { select: { email: true } } } } },
    });
    const correos = [...new Set((r?.asistentes ?? []).map((a) => a.user?.email?.trim()).filter((c): c is string => Boolean(c)))];
    if (!correos.length) throw new BadRequestException('Ningún convocado tiene correo registrado. Agrega asistentes a la reunión.');
    const titulo = escapar(r!.titulo);
    const ok = await this.email.send({
      to: correos,
      subject: `[NEXARA] Minuta: ${r!.titulo} (${dia(r!.fecha)})`,
      html: `<p>Hola:</p><p>Adjuntamos la minuta de la reunión <strong>${titulo}</strong> del ${dia(r!.fecha)}, con el resumen, los temas tratados y los acuerdos.</p><p>NEXARA</p>`,
      attachments: [{ filename: archivo.nombre, content: archivo.pdf, contentType: 'application/pdf' }],
    });
    if (!ok) throw new ServiceUnavailableException('No se pudo enviar el correo. Intenta de nuevo más tarde.');
    return { enviados: correos.length };
  }
}

function mimeDe(ext: string): string {
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'mp3') return 'audio/mpeg';
  return `audio/${ext}`;
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
