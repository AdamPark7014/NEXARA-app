import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { limpiarTextoWhisper, promptTranscriptor } from './transcriptor.js';

/**
 * Cliente del transcriptor propio (whisper.cpp, `deploy/docker/Dockerfile.transcriptor`).
 *
 * - `TRANSCRIPTOR_URL` apunta al contenedor (en Docker: `http://transcriptor:8080`). Sin
 *   ella, la voz propia queda apagada y la web usa el dictado del navegador.
 * - El servidor de whisper atiende una petición a la vez: las demás esperan su turno.
 */
@Injectable()
export class TranscriptorService {
  private readonly logger = new Logger('Transcriptor');
  private ultimoPing: { at: number; ok: boolean } | null = null;

  url(): string | null {
    const raw = (process.env.TRANSCRIPTOR_URL || '').trim().replace(/\/+$/, '');
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
   * - `audioCtx`: contexto del codificador en cuadros de 20 ms (1100 = 22 s). Para audio corto de
   *   largo conocido (partes de una junta) acelera ~40 % sin perder calidad; 0 = los 30 s completos.
   */
  async transcribir(
    audio: Buffer,
    nombre: string,
    mime: string,
    timeoutMs = 600_000,
    opciones: { prompt?: string; audioCtx?: number } = {},
  ): Promise<string> {
    const base = this.url();
    if (!base) {
      throw new ServiceUnavailableException(
        'El transcriptor no está configurado: falta TRANSCRIPTOR_URL en el servidor.',
      );
    }
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'application/octet-stream' }), nombre);
    form.append('response_format', 'json');
    form.append('language', 'es');
    form.append('temperature', '0');
    form.append('prompt', opciones.prompt?.trim() || promptTranscriptor());
    if (opciones.audioCtx) form.append('audio_ctx', String(opciones.audioCtx));

    const t0 = Date.now();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/inference`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.ultimoPing = { at: Date.now(), ok: false };
      this.logger.error(`no responde: ${(error as Error).message}`);
      throw new ServiceUnavailableException('El transcriptor no respondió: intenta de nuevo.');
    }
    const cuerpo = await respuesta.text();
    if (!respuesta.ok) {
      this.logger.error(`HTTP ${respuesta.status}: ${cuerpo.slice(0, 200)}`);
      throw new ServiceUnavailableException('El transcriptor no pudo leer ese audio.');
    }
    let texto = cuerpo;
    try {
      const json = JSON.parse(cuerpo) as { text?: string; error?: string };
      if (json.error) {
        this.logger.error(`error: ${json.error}`);
        throw new ServiceUnavailableException('El transcriptor no pudo leer ese audio.');
      }
      texto = json.text ?? '';
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
    }
    const limpio = limpiarTextoWhisper(texto);
    this.logger.log(
      `${(audio.length / 1024).toFixed(0)} KB → ${limpio.length} caracteres en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    return limpio;
  }
}
