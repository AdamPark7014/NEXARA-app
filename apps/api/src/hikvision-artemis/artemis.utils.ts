import { HttpException, HttpStatus } from '@nestjs/common';
import { ArtemisApiError, ArtemisNotConfiguredError } from './artemis.errors';

/** ISO 8601 con offset local (Artemis rechaza Z a secas). */
export function toArtemisOffsetIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

export function rethrowArtemis(error: unknown, message: string): never {
  if (error instanceof ArtemisNotConfiguredError) {
    throw new HttpException(
      { message: 'ACS Artemis sin configurar', detail: error.message },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  if (error instanceof ArtemisApiError) {
    throw new HttpException(
      { message, code: error.code, path: error.path },
      HttpStatus.BAD_GATEWAY,
    );
  }
  if (error instanceof HttpException) throw error;
  throw new HttpException(message, HttpStatus.BAD_GATEWAY);
}
