import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { getUsersUploadDir } from '../common/upload-paths.js';
import { IntegraArtemisService } from './integra-artemis.service';
import { hasLocalPersonFace } from './integra-person-media';
import {
  matchUsersToAcsPeople,
  type AvatarAmbiguous,
  type AvatarMatchPerson,
  type AvatarUnmatchedUser,
} from './acs-avatar-match';

/**
 * Importa la cara enrolada en los terminales ACS como `User.avatarUrl`.
 *
 * Nadie tenía foto de perfil y los avisos mostraban iniciales, pero el
 * Hikvision ya guarda la foto de cada empleado. Empareja por vínculo de
 * identidad o por nombre (`acs-avatar-match.ts`), baja el JPEG con el mismo
 * camino que la ficha (`getPersonFace`: copia local o proxy ISAPI) y lo deja
 * en `uploads/users` con el mismo nombre de archivo y la misma URL
 * (`/uploads/users/<archivo>`) que la subida manual de `users.controller.ts`.
 *
 * `dryRun` hace todo —incluida la descarga, para saber qué foto existe de
 * verdad— salvo escribir el archivo y la base.
 */

export type AcsAvatarImportOptions = {
  dryRun: boolean;
  /** false (por defecto): solo usuarios sin avatar. */
  overwrite?: boolean;
};

export type AcsAvatarImported = {
  userId: number;
  userName: string;
  personId: string;
  personName: string;
  siteId: number;
  score: number;
  reason: string;
  avatarUrl: string;
  previousAvatarUrl: string | null;
  bytes: number;
};

export type AcsAvatarSkipped = {
  userId: number;
  userName: string;
  personId: string | null;
  personName: string | null;
  reason: string;
};

export type AcsAvatarImportReport = {
  companyId: number;
  dryRun: boolean;
  overwrite: boolean;
  summary: {
    users: number;
    people: number;
    matched: number;
    imported: number;
    skipped: number;
    ambiguous: number;
    unmatchedUsers: number;
    unmatchedPeople: number;
  };
  /** En `dryRun` son los que SE importarían (la foto ya se descargó bien). */
  imported: AcsAvatarImported[];
  skipped: AcsAvatarSkipped[];
  ambiguous: AvatarAmbiguous[];
  unmatchedUsers: AvatarUnmatchedUser[];
  /** Registros ACS sin usuario ERP (visitantes, familiares, bajas…). */
  unmatchedPeople: Array<{ personId: string; personName: string; siteId: number }>;
};

const MIN_IMAGE_BYTES = 256;

/** Extensión real por firma de bytes; `null` si no es JPG/PNG/WEBP. */
export function detectAvatarImageExt(buffer: Buffer): '.jpg' | '.png' | '.webp' | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return '.png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }
  return null;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const resp = (e as { getResponse?: () => unknown }).getResponse?.();
    if (resp && typeof resp === 'object' && 'message' in resp) {
      const msg = (resp as { message: unknown }).message;
      return Array.isArray(msg) ? msg.join('; ') : String(msg);
    }
  }
  return e instanceof Error ? e.message : String(e);
}

@Injectable()
export class AcsAvatarImportService {
  private readonly logger = new Logger(AcsAvatarImportService.name);

  /**
   * Mismo directorio que `UsersController` (`getUsersUploadDir(__dirname)`) y
   * que sirve `main.ts` en `/uploads`. Mutable solo para las pruebas.
   */
  usersUploadDir = getUsersUploadDir(__dirname);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integra: IntegraArtemisService,
  ) {}

  async importAvatars(
    companyId: number | null,
    opts: AcsAvatarImportOptions,
  ): Promise<AcsAvatarImportReport> {
    const tenantId = requireCompanyId(companyId);
    const dryRun = opts.dryRun !== false;
    const overwrite = opts.overwrite === true;

    const memberships = await this.prisma.userCompany.findMany({
      where: { companyId: tenantId, user: { isActive: true } },
      orderBy: { userId: 'asc' },
      select: {
        employeeNumber: true,
        user: {
          select: { id: true, nombre: true, employeeNumber: true, avatarUrl: true },
        },
      },
    });
    const users = memberships
      .filter((m) => Boolean(m.user))
      .map((m) => ({
        id: m.user.id,
        nombre: m.user.nombre,
        employeeNumber: m.user.employeeNumber,
        companyEmployeeNumber: m.employeeNumber,
        avatarUrl: m.user.avatarUrl,
      }));
    const userById = new Map(users.map((u) => [u.id, u]));

    const rows = await this.prisma.integraPerson.findMany({
      where: { companyId: tenantId },
      orderBy: [{ siteId: 'asc' }, { personId: 'asc' }],
      select: {
        personId: true,
        personName: true,
        personCode: true,
        siteId: true,
        syncedAt: true,
        faceUrl: true,
      },
    });
    const people: AvatarMatchPerson[] = rows.map((r) => ({
      personId: r.personId,
      personName: r.personName,
      personCode: r.personCode,
      siteId: r.siteId,
      syncedAt: r.syncedAt,
      hasFace: hasLocalPersonFace(tenantId, r.personId) || Boolean(r.faceUrl?.trim()),
    }));

    // Se empareja contra TODOS los usuarios activos: si alguien que ya tiene
    // avatar es el dueño legítimo de una cara, no se la puede quedar otro.
    const match = matchUsersToAcsPeople(users, people);

    const imported: AcsAvatarImported[] = [];
    const skipped: AcsAvatarSkipped[] = [];

    for (const m of match.matched) {
      const user = userById.get(m.userId);
      const previousAvatarUrl = String(user?.avatarUrl ?? '').trim() || null;
      const base = {
        userId: m.userId,
        userName: m.userName,
        personId: m.personId,
        personName: m.personName,
      };

      if (previousAvatarUrl && !overwrite) {
        skipped.push({ ...base, reason: `ya tiene avatar (${previousAvatarUrl})` });
        continue;
      }

      let buffer: Buffer;
      try {
        const face = await this.integra.getPersonFace(tenantId, m.personId, m.siteId);
        buffer = face.buffer;
      } catch (e) {
        skipped.push({ ...base, reason: `sin foto en ACS: ${errorMessage(e)}` });
        continue;
      }

      const ext = detectAvatarImageExt(buffer);
      if (!ext || buffer.length < MIN_IMAGE_BYTES) {
        skipped.push({
          ...base,
          reason: `la respuesta del terminal no es una imagen válida (${buffer?.length ?? 0} bytes)`,
        });
        continue;
      }

      // Mismo patrón de nombre que la subida manual del controlador de usuarios.
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      const avatarUrl = `/uploads/users/${filename}`;

      if (!dryRun) {
        const abs = path.join(this.usersUploadDir, filename);
        try {
          fs.mkdirSync(this.usersUploadDir, { recursive: true });
          fs.writeFileSync(abs, buffer);
        } catch (e) {
          skipped.push({ ...base, reason: `no se pudo guardar el archivo: ${errorMessage(e)}` });
          continue;
        }
        try {
          await this.prisma.user.update({
            where: { id: m.userId },
            data: { avatarUrl },
          });
        } catch (e) {
          try {
            fs.unlinkSync(abs);
          } catch {
            // El archivo huérfano no rompe nada; el error que importa es el de la base.
          }
          skipped.push({ ...base, reason: `no se pudo actualizar el usuario: ${errorMessage(e)}` });
          continue;
        }
      }

      imported.push({
        ...base,
        siteId: m.siteId,
        score: m.score,
        reason: m.reason,
        avatarUrl,
        previousAvatarUrl,
        bytes: buffer.length,
      });
    }

    const matchedPersonIds = new Set(match.matched.map((m) => m.personId.trim().toLowerCase()));
    const ambiguousPersonIds = new Set(
      match.ambiguous.flatMap((a) => a.candidates.map((c) => c.personId.trim().toLowerCase())),
    );
    const unmatchedPeople = rows
      .filter((r) => {
        const k = r.personId.trim().toLowerCase();
        return !matchedPersonIds.has(k) && !ambiguousPersonIds.has(k);
      })
      .map((r) => ({ personId: r.personId, personName: r.personName, siteId: r.siteId }));

    const report: AcsAvatarImportReport = {
      companyId: tenantId,
      dryRun,
      overwrite,
      summary: {
        users: users.length,
        people: rows.length,
        matched: match.matched.length,
        imported: imported.length,
        skipped: skipped.length,
        ambiguous: match.ambiguous.length,
        unmatchedUsers: match.unmatchedUsers.length,
        unmatchedPeople: unmatchedPeople.length,
      },
      imported,
      skipped,
      ambiguous: match.ambiguous,
      unmatchedUsers: match.unmatchedUsers,
      unmatchedPeople,
    };

    this.logger.log(
      `Avatares ACS empresa ${tenantId}${dryRun ? ' (simulación)' : ''}: ` +
        `${imported.length} importados, ${skipped.length} omitidos, ` +
        `${match.ambiguous.length} ambiguos, ${match.unmatchedUsers.length} sin registro ACS`,
    );
    return report;
  }
}
