import * as fs from 'fs';
import * as path from 'path';
import { resolveUploadsDir } from '../common/uploads-path';

/**
 * Copia local de biometría ACS (JPEG de rostro / plantilla de huella).
 *
 * Los DS-K1T a menudo enrolan Face ID como modelo sin JPEG descargable
 * (`faceURL` 404). Guardamos lo que el operador subió para que listado y
 * ficha siempre puedan mostrar `<img>`.
 *
 * Huella: `fingerData` Base64 vía CaptureFingerPrint / FingerPrintUpload
 * (HikGateway §5.11 + Postman). Si el terminal no exporta, solo contamos
 * `numOfFP` del UserInfo.
 */

function safeId(personId: string): string {
  return String(personId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
}

function faceDir(companyId: number): string {
  return resolveUploadsDir('integra-faces', String(companyId));
}

function fpDir(companyId: number): string {
  return resolveUploadsDir('integra-fp', String(companyId));
}

export function personFaceAbsolutePath(companyId: number, personId: string): string {
  return path.join(faceDir(companyId), `${safeId(personId)}.jpg`);
}

export function personFpAbsolutePath(
  companyId: number,
  personId: string,
  fingerPrintID: number,
): string {
  const n = Math.min(10, Math.max(1, Math.floor(fingerPrintID) || 1));
  return path.join(fpDir(companyId), `${safeId(personId)}-fp${n}.b64`);
}

export function hasLocalPersonFace(companyId: number, personId: string): boolean {
  try {
    const p = personFaceAbsolutePath(companyId, personId);
    return fs.existsSync(p) && fs.statSync(p).size > 32;
  } catch {
    return false;
  }
}

export function readLocalPersonFace(
  companyId: number,
  personId: string,
): { buffer: Buffer; contentType: string } | null {
  const p = personFaceAbsolutePath(companyId, personId);
  try {
    if (!fs.existsSync(p)) return null;
    const buffer = fs.readFileSync(p);
    if (buffer.length < 32) return null;
    return { buffer, contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}

export function writeLocalPersonFace(
  companyId: number,
  personId: string,
  jpeg: Buffer,
): string {
  const dir = faceDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const abs = personFaceAbsolutePath(companyId, personId);
  fs.writeFileSync(abs, jpeg);
  return abs;
}

export function deleteLocalPersonFace(companyId: number, personId: string): void {
  const abs = personFaceAbsolutePath(companyId, personId);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // ignore
  }
}

export function writeLocalFingerData(
  companyId: number,
  personId: string,
  fingerPrintID: number,
  fingerDataBase64: string,
): string {
  const dir = fpDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const abs = personFpAbsolutePath(companyId, personId, fingerPrintID);
  fs.writeFileSync(abs, fingerDataBase64, 'utf8');
  return abs;
}

export function readLocalFingerData(
  companyId: number,
  personId: string,
  fingerPrintID: number,
): string | null {
  const abs = personFpAbsolutePath(companyId, personId, fingerPrintID);
  try {
    if (!fs.existsSync(abs)) return null;
    const s = fs.readFileSync(abs, 'utf8').trim();
    return s.length > 8 ? s : null;
  } catch {
    return null;
  }
}

export function listLocalFingerIds(companyId: number, personId: string): number[] {
  const dir = fpDir(companyId);
  const prefix = `${safeId(personId)}-fp`;
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .map((f) => {
        if (!f.startsWith(prefix) || !f.endsWith('.b64')) return null;
        const m = /-fp(\d+)\.b64$/i.exec(f);
        return m ? Number(m[1]) : null;
      })
      .filter((n): n is number => n != null && n >= 1 && n <= 10)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function deleteLocalFingerData(
  companyId: number,
  personId: string,
  fingerPrintID?: number,
): void {
  if (fingerPrintID != null) {
    const abs = personFpAbsolutePath(companyId, personId, fingerPrintID);
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // ignore
    }
    return;
  }
  for (const id of listLocalFingerIds(companyId, personId)) {
    deleteLocalFingerData(companyId, personId, id);
  }
}

export function deleteAllLocalPersonMedia(companyId: number, personId: string): void {
  deleteLocalPersonFace(companyId, personId);
  deleteLocalFingerData(companyId, personId);
}
