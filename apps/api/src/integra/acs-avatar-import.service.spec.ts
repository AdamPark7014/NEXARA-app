import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NotFoundException } from '@nestjs/common';

jest.mock('./integra-artemis.service', () => ({ IntegraArtemisService: class {} }));
jest.mock('./integra-person-media', () => ({ hasLocalPersonFace: () => false }));

import { AcsAvatarImportService, detectAvatarImageExt } from './acs-avatar-import.service';

const tempDirs: string[] = [];
afterAll(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1024, 7)]);

function setup(opts: { avatarUrl?: string | null; faceError?: boolean; notImage?: boolean } = {}) {
  const prisma = {
    userCompany: {
      findMany: jest.fn().mockResolvedValue([
        {
          employeeNumber: null,
          user: { id: 1, nombre: 'Israel Ramos Lima', employeeNumber: null, avatarUrl: opts.avatarUrl ?? null },
        },
        {
          employeeNumber: null,
          user: { id: 2, nombre: 'Adam Del Pozo', employeeNumber: null, avatarUrl: null },
        },
      ]),
    },
    integraPerson: {
      findMany: jest.fn().mockResolvedValue([
        { personId: '10', personName: 'Israel Ramos', personCode: null, siteId: 1, syncedAt: new Date(), faceUrl: 'http://x/face' },
        { personId: '11', personName: 'Arturo taja', personCode: null, siteId: 1, syncedAt: new Date(), faceUrl: null },
      ]),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const integra = {
    getPersonFace: jest.fn().mockImplementation(async () => {
      if (opts.faceError) throw new NotFoundException('Persona 10: sin JPEG local ni faceURL');
      return { buffer: opts.notImage ? Buffer.from('<html>nope</html>'.repeat(40)) : JPEG, contentType: 'image/jpeg' };
    }),
  };
  const service = new AcsAvatarImportService(prisma as any, integra as any);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acs-avatars-'));
  tempDirs.push(dir);
  service.usersUploadDir = dir;
  return { service, prisma, integra, dir };
}

describe('AcsAvatarImportService', () => {
  it('detecta la firma real de la imagen', () => {
    expect(detectAvatarImageExt(JPEG)).toBe('.jpg');
    expect(detectAvatarImageExt(Buffer.from('<html></html>'))).toBeNull();
  });

  it('dryRun descarga la foto pero no escribe archivo ni base', async () => {
    const { service, prisma, integra, dir } = setup();
    const report = await service.importAvatars(1, { dryRun: true });
    expect(integra.getPersonFace).toHaveBeenCalledWith(1, '10', 1);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(report.imported).toHaveLength(1);
    expect(report.imported[0]).toMatchObject({ userId: 1, personName: 'Israel Ramos' });
    expect(report.imported[0].avatarUrl).toMatch(/^\/uploads\/users\/\d+-[a-z0-9]+\.jpg$/);
    expect(report.unmatchedUsers.map((u) => u.userName)).toEqual(['Adam Del Pozo']);
    expect(report.unmatchedPeople.map((p) => p.personName)).toEqual(['Arturo taja']);
  });

  it('apply guarda el JPEG en uploads/users y actualiza avatarUrl', async () => {
    const { service, prisma, dir } = setup();
    const report = await service.importAvatars(1, { dryRun: false });
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, files[0])).equals(JPEG)).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { avatarUrl: `/uploads/users/${files[0]}` },
    });
    expect(report.summary.imported).toBe(1);
  });

  it('no pisa un avatar existente salvo overwrite', async () => {
    const kept = setup({ avatarUrl: '/uploads/users/propia.jpg' });
    const r1 = await kept.service.importAvatars(1, { dryRun: false });
    expect(r1.imported).toEqual([]);
    expect(r1.skipped[0].reason).toContain('ya tiene avatar');
    expect(kept.integra.getPersonFace).not.toHaveBeenCalled();

    const over = setup({ avatarUrl: '/uploads/users/propia.jpg' });
    const r2 = await over.service.importAvatars(1, { dryRun: false, overwrite: true });
    expect(r2.imported[0].previousAvatarUrl).toBe('/uploads/users/propia.jpg');
  });

  it('un fallo al bajar la foto o una respuesta que no es imagen se omite con motivo', async () => {
    const failing = setup({ faceError: true });
    const r1 = await failing.service.importAvatars(1, { dryRun: false });
    expect(r1.imported).toEqual([]);
    expect(r1.skipped[0].reason).toContain('sin JPEG local ni faceURL');
    expect(failing.prisma.user.update).not.toHaveBeenCalled();

    const html = setup({ notImage: true });
    const r2 = await html.service.importAvatars(1, { dryRun: false });
    expect(r2.skipped[0].reason).toContain('no es una imagen');
    expect(fs.readdirSync(html.dir)).toEqual([]);
  });
});
