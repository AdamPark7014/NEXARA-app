/**
 * La e.firma (FIEL) de la empresa para la Descarga Masiva del SAT. Puro salvo la lectura de disco.
 *
 * Dónde vive: `/etc/nexara-secrets/sat/efirma/` en el servidor (`efirma.cer`, `efirma.key` en DER
 * como los entrega el SAT, y `password` sin salto de línea), montada de solo lectura en el contenedor
 * de la API en la misma ruta. La sube Adam con `subir-llaves-sat.ps1 -Tipo efirma`. Se puede cambiar
 * con `SAT_EFIRMA_DIR`; por compatibilidad también se aceptan `EFIRMA_CER_BASE64`, `EFIRMA_KEY_BASE64`
 * y `EFIRMA_KEY_PASSWORD`. La contraseña y la llave nunca salen de este módulo ni se registran.
 */
import { X509Certificate } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const MENSAJE_FALTA_EFIRMA = 'Falta la e.firma: súbela con subir-llaves-sat.ps1 -Tipo efirma';
export const CARPETA_EFIRMA_POR_OMISION = '/etc/nexara-secrets/sat/efirma';

export type MaterialEfirma = { cer: Buffer; key: Buffer; password: string };

export type ResumenCertificado = {
  rfc: string | null;
  serie: string;
  titular: string | null;
  vigenteDesde: string;
  vigenteHasta: string;
  vencido: boolean;
};

type Entorno = Record<string, string | undefined>;

/** Lee la e.firma de la carpeta o de las variables; null si no está completa. */
export function leerEfirma(env: Entorno = process.env, leer: (ruta: string) => Buffer = (r) => fs.readFileSync(r)): MaterialEfirma | null {
  const dir = (env.SAT_EFIRMA_DIR || CARPETA_EFIRMA_POR_OMISION).trim();
  try {
    const cer = leer(path.posix.join(dir, 'efirma.cer'));
    const key = leer(path.posix.join(dir, 'efirma.key'));
    const password = leer(path.posix.join(dir, 'password')).toString('utf8').replace(/[\r\n]+$/, '');
    if (cer.length && key.length && password) return { cer, key, password };
  } catch {
    /* sin carpeta: se prueban las variables */
  }
  const cer64 = env.EFIRMA_CER_BASE64?.trim();
  const key64 = env.EFIRMA_KEY_BASE64?.trim();
  const password = env.EFIRMA_KEY_PASSWORD ?? env.EFIRMA_PASSWORD;
  if (cer64 && key64 && password) return { cer: Buffer.from(cer64, 'base64'), key: Buffer.from(key64, 'base64'), password };
  return null;
}

/** RFC, serie y vigencia del certificado (es público: se puede mostrar). */
export function resumenCertificado(cer: Buffer, ahora: Date = new Date()): ResumenCertificado {
  const x = new X509Certificate(cer);
  // El SAT pone «RFC / CURP del representante» en x500UniqueIdentifier (OID 2.5.4.45).
  const rfc = /(?:2\.5\.4\.45|x500UniqueIdentifier)=([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i.exec(x.subject)?.[1]?.toUpperCase() ?? null;
  const titular = /(?:^|\n)CN=([^\n]+)/.exec(x.subject)?.[1]?.trim() ?? null;
  // El número de serie del SAT viene en hexadecimal con los dígitos ASCII: «3030303031…» = «00001…».
  const hex = x.serialNumber.replace(/[^0-9a-f]/gi, '');
  const serie = /^(3\d)+$/.test(hex) ? hex.replace(/3(\d)/g, '$1') : hex;
  const hasta = new Date(x.validTo);
  return {
    rfc,
    serie,
    titular,
    vigenteDesde: new Date(x.validFrom).toISOString(),
    vigenteHasta: hasta.toISOString(),
    vencido: hasta.getTime() < ahora.getTime(),
  };
}

/** El SAT solo despacha periodos cerrados, en el pasado y de a lo más un año por solicitud. */
export function validarPeriodo(desde: string, hasta: string, ahora: Date = new Date()): string | null {
  const d = new Date(desde);
  const h = new Date(hasta);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime())) return 'Las fechas no son válidas (usa AAAA-MM-DD o AAAA-MM-DD HH:MM:SS).';
  if (d.getTime() >= h.getTime()) return '«Desde» tiene que ser antes de «hasta».';
  if (h.getTime() > ahora.getTime()) return '«Hasta» no puede estar en el futuro.';
  if (h.getTime() - d.getTime() > 366 * 24 * 60 * 60 * 1000) return 'El SAT permite como máximo un año por solicitud: pártelo en varias.';
  return null;
}

/** «2026-01-01» o «2026-01-01T10:00» → «2026-01-01 10:00:00» (formato que pide la librería). */
export function fechaSat(valor: string, finDelDia = false): string {
  const t = valor.trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t} ${finDelDia ? '23:59:59' : '00:00:00'}`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t.slice(0, 19);
}
