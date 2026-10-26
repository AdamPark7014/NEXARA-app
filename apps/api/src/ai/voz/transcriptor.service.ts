import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { limpiarTextoWhisper, promptTranscriptor } from './transcriptor.js';

/**
 * Cliente del transcriptor propio (whisper.cpp, `deploy/docker/Dockerfile.transcriptor`).
 *
 * - `TRANSCRIPTOR_URL` apunta al contenedor (en Docker: `http://transcriptor:8080`). Sin
 *   ella, la voz propia queda apagada y la web usa el dictado del navegador.
 * - `TRANSCRIPTOR_DICTADO_URL` (opcional, `http://transcriptor-dictado:8080`): whisper `small` aparte
 *   para el dictado (voz cercana, audio corto). No hace fila detrás de las partes de una junta y
 *   contesta en ~½ de lo que dura el audio con 1 CPU; si no responde, el dictado cae al principal.
 * - Cada servidor de whisper atiende una petición a la vez: las demás esperan su turno.
 */
@Injectable()
export class TranscriptorService {
  private readonly logger = new Logger('Transcriptor');
  private ultimoPing: { at: number; ok: boolean } | null = null;

  url(): string | null {
    const raw = (process.env.TRANSCRIPTOR_URL || '').trim().replace(/\/+$/, '');
    return raw || null;
  }

  urlDictado(): string | null {
    const raw = (process.env.TRANSCRIPTOR_DICTADO_URL || '').trim().replace(/\/+$/, '');
    return raw || null;
  }

  /** ¿Está configurado y responde? Se recuerda 30 s para no golpearlo en cada pantalla. */
  async disponible(): Promise<boolean> {
    const base = this.url();
    if (!base) return false;
    if (this.ultimoPing && Date.now() - this.ultimoPing.at < 30_000) return this.ultimoPing.ok;
    let ok = false;
    try {
      const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(3_000) });
      ok = r.status < 500;
    } catch {
      ok = false;
    }
    this.ultimoPing = { at: Date.now(), ok };
    return ok;
  }

  /**
   * Audio (cualquier formato que lea ffmpeg) → texto en español.
   * - `prompt` reemplaza al vocabulario fijo (ver `promptTranscriptor`: nombres de la empresa).
   * - Sin `audio_ctx`, a propósito: whisper.cpp 1.9.5 no aguanta que en un mismo servidor se mezclen
   *   peticiones con y sin él. Medido en producción (26-10): tras una petición sin `audio_ctx` (un
   *   dictado), las partes de junta con 1100 salían inventadas y más lentas hasta reiniciar.
   */
  async transcribir(
    audio: Buffer,
    nombre: string,
    mime: string,
    timeoutMs = 600_000,
    opciones: { prompt?: string } = {},
  ): Promise<string> {
    const base = this.url();
    if (!base) {
      throw new ServiceUnavailableException(
        'El transcriptor no está configurado: falta TRANSCRIPTOR_URL en el servidor.',
      );
    }
    return this.pedir(base, true, audio, nombre, mime, timeoutMs, opciones.prompt);
  }

  /**
   * Dictado corto (voz cercana): al transcriptor de dictado si está configurado; si falla o tarda más
   * del 70 % del plazo, al principal con el tiempo que quede.
   */
  async dictar(audio: Buffer, nombre: string, mime: string, timeoutMs = 100_000): Promise<string> {
    const dictado = this.urlDictado();
    if (!dictado) return this.transcribir(audio, nombre, mime, timeoutMs);
    const t0 = Date.now();
    try {
      return await this.pedir(dictado, false, audio, nombre, mime, Math.round(timeoutMs * 0.7));
    } catch (error) {
      const resta = timeoutMs - (Date.now() - t0);
      if (!this.url() || resta < 5_000) throw error;
      this.logger.warn(`el de dictado falló; va al principal con ${Math.round(resta / 1000)} s`);
      return this.transcribir(audio, nombre, mime, resta);
    }
  }

  /** Una petición a un whisper-server. `principal` = el de `TRANSCRIPTOR_URL` (el que mide `disponible`). */
  private async pedir(
    base: string,
    principal: boolean,
    audio: Buffer,
    nombre: string,
    mime: string,
    timeoutMs: number,
    prompt?: string,
  ): Promise<string> {
    const quien = principal ? '' : 'dictado: ';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'application/octet-stream' }), nombre);
    form.append('response_format', 'json');
    form.append('language', 'es');
    form.append('temperature', '0');
    form.append('prompt', prompt?.trim() || promptTranscriptor());

    const t0 = Date.now();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/inference`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (principal) this.ultimoPing = { at: Date.now(), ok: false };
      this.logger.error(`${quien}no responde: ${(error as Error).message}`);
      throw new ServiceUnavailableException('El transcriptor no respondió: intenta de nuevo.');
    }
    const cuerpo = await respuesta.text();
    if (!respuesta.ok) {
      this.logger.error(`${quien}HTTP ${respuesta.status}: ${cuerpo.slice(0, 200)}`);
      throw new ServiceUnavailableException('El transcriptor no pudo leer ese audio.');
    }
    let texto = cuerpo;
    try {
      const json = JSON.parse(cuerpo) as { text?: string; error?: string };
      if (json.error) {
        this.logger.error(`${quien}error: ${json.error}`);
        throw new ServiceUnavailableException('El transcriptor no pudo leer ese audio.');
      }
      texto = json.text ?? '';
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
    }
    const limpio = limpiarTextoWhisper(texto);
    this.logger.log(
      `${quien}${(audio.length / 1024).toFixed(0)} KB → ${limpio.length} caracteres en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    return limpio;
  }
}
