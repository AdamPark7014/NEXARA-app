import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntegraDetectionService } from './integra-detection.service';
import { DEFAULT_SENSITIVITY, SMART_EVENT_TYPES } from '../hikvision-isapi';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { IntegraSiteService } from './integra-site.service';

/**
 * La barandilla que impide que un valor inventado llegue al XML de una cámara
 * de un cliente real.
 *
 * El servicio valida ANTES de guardar, no al aplicar: si un
 * `alarmConfidence: "altísima"` entrase en la base, acabaría escribiéndose en
 * el equipo el día que alguien pulse «aplicar», y una cámara con un XML que su
 * firmware no entiende se queda sin detectar sin que nadie se entere.
 *
 * Sin base ni red: `prisma` y `sites` son dobles en memoria.
 */

const COMPANY = 4242;
const SITE = 7;
const CAMERA = 'cam-171';

type ProfileRow = Record<string, unknown> & { siteId: number; cameraId: string };

function scenario() {
  const profiles = new Map<string, ProfileRow>();
  const capabilities = new Map<string, Record<string, unknown>>();
  const key = (siteId: number, cameraId: string) => `${siteId}:${cameraId}`;

  const prisma = {
    integraCamera: {
      findUnique: jest.fn(async ({ where }: any) =>
        where?.siteId_cameraIndexCode?.cameraIndexCode === CAMERA
          ? {
              name: 'Recepción',
              raw: {
                channelId: '101',
                streamId: '102',
                source: { ipAddress: '192.168.9.171', reachableDirectly: true },
              },
            }
          : null,
      ),
      findMany: jest.fn(async () => [{ cameraIndexCode: CAMERA, name: 'Recepción' }]),
    },
    integraDetectionProfile: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          profiles.get(key(where.siteId_cameraId.siteId, where.siteId_cameraId.cameraId)) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where.siteId_cameraId.siteId, where.siteId_cameraId.cameraId);
        const prev = profiles.get(k);
        const row = prev
          ? { ...prev, ...update }
          : {
              sensitivity: null,
              alarmConfidence: null,
              detectionTarget: null,
              regions: null,
              eventTypes: null,
              timeThresholdSec: null,
              minTargetPct: null,
              schedule: null,
              enabled: true,
              lastAppliedAt: null,
              lastAppliedNote: null,
              ...create,
            };
        profiles.set(k, row as ProfileRow);
        return row;
      }),
    },
    integraCameraCapability: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          capabilities.get(key(where.siteId_cameraId.siteId, where.siteId_cameraId.cameraId)) ??
          null,
      ),
      upsert: jest.fn(async ({ where, create }: any) => {
        const k = key(where.siteId_cameraId.siteId, where.siteId_cameraId.cameraId);
        const row = { probedAt: new Date(), ...create };
        capabilities.set(k, row);
        return row;
      }),
      findMany: jest.fn(async () => [...capabilities.values()]),
    },
  } as unknown as PrismaService;

  const sites = {
    resolveClient: jest.fn(async () => ({
      provider: 'ISAPI' as const,
      siteId: SITE,
      companyId: COMPANY,
      host: 'http://192.168.9.34',
      isapi: {} as never,
      isapiForHost: () => ({}) as never,
    })),
  } as unknown as IntegraSiteService;

  return { service: new IntegraDetectionService(prisma, sites), prisma, profiles };
}

describe('IntegraDetectionService · lectura', () => {
  it('sin fila guardada devuelve el perfil de compatibilidad', async () => {
    const { service } = scenario();
    const dto = await service.getProfile(COMPANY, CAMERA, SITE);

    expect(dto.stored).toBeNull();
    expect(dto.enabled).toBe(true);
    // Lo que se le escribiría hoy: fotograma completo (regions null) y humano.
    expect(dto.effective.regions).toBeNull();
    expect(dto.effective.detectionTarget).toBe('human');
    expect(dto.effective.alarmConfidence).toBe('low');
    // La única desviación deliberada respecto a lo de antes.
    expect(dto.effective.sensitivity).toBe(DEFAULT_SENSITIVITY);
    expect(dto.effective.sensitivity).toBeLessThan(100);
    expect(dto.effective.eventTypes).toEqual([...SMART_EVENT_TYPES]);
  });

  it('publica los límites para que la UI no invente valores', async () => {
    const { service } = scenario();
    const { limits } = await service.getProfile(COMPANY, CAMERA, SITE);
    expect(limits.sensitivityMin).toBe(0);
    expect(limits.sensitivityMax).toBe(100);
    expect(limits.maxRegions).toBe(4);
    expect(limits.alarmConfidences).toEqual(['low', 'mediumLow', 'mediumHigh', 'high']);
  });

  it('una cámara que no está en el espejo es 404, no un perfil vacío', async () => {
    const { service } = scenario();
    await expect(service.getProfile(COMPANY, 'no-existe', SITE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('IntegraDetectionService · edición', () => {
  it('guarda zona, sensibilidad y confianza, y los refleja en `effective`', async () => {
    const { service } = scenario();
    const dto = await service.updateProfile(
      COMPANY,
      CAMERA,
      {
        sensitivity: 35,
        alarmConfidence: 'mediumHigh',
        detectionTarget: 'human,vehicle',
        regions: [
          [
            { x: 0.1, y: 0.5 },
            { x: 0.4, y: 0.5 },
            { x: 0.4, y: 0.9 },
          ],
        ],
      },
      SITE,
    );

    expect(dto.stored?.sensitivity).toBe(35);
    expect(dto.effective.sensitivity).toBe(35);
    expect(dto.effective.alarmConfidence).toBe('mediumHigh');
    expect(dto.effective.detectionTarget).toBe('human,vehicle');
    expect(dto.effective.regions).toHaveLength(1);
  });

  it('rechaza un alarmConfidence que no existe en vez de guardarlo', async () => {
    const { service } = scenario();
    await expect(
      service.updateProfile(COMPANY, CAMERA, { alarmConfidence: 'altísima' }, SITE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un detectionTarget fuera del enum documentado', async () => {
    const { service } = scenario();
    await expect(
      service.updateProfile(COMPANY, CAMERA, { detectionTarget: 'perro' }, SITE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza eventTypes fuera del Apéndice B (ANPR no existe en ISAPI)', async () => {
    const { service } = scenario();
    await expect(
      service.updateProfile(COMPANY, CAMERA, { eventTypes: ['loitering', 'ANPR'] }, SITE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta eventTypes del catálogo y los suma a la lista blanca base', async () => {
    const { service } = scenario();
    const dto = await service.updateProfile(
      COMPANY,
      CAMERA,
      { eventTypes: ['loitering', 'regionEntrance'] },
      SITE,
    );
    // El 5 estaba escrito a mano y la base creció a ocho al entrar los avisos
    // de salud de cámara. Se ata al tamaño real de la base, no a un número.
    expect(dto.effective.eventTypes.slice(0, SMART_EVENT_TYPES.length)).toEqual([
      ...SMART_EVENT_TYPES,
    ]);
    expect(dto.effective.eventTypes).toContain('loitering');
    // En la fila solo se guarda lo que AMPLÍA: la base no se duplica.
    expect(dto.stored?.eventTypes).toEqual(['loitering', 'regionEntrance']);
  });

  it('recorta una sensibilidad imposible en vez de mandarla al equipo', async () => {
    const { service } = scenario();
    const dto = await service.updateProfile(COMPANY, CAMERA, { sensitivity: 4000 }, SITE);
    expect(dto.effective.sensitivity).toBe(100);
  });

  it('rechaza regiones que no son polígonos', async () => {
    const { service } = scenario();
    await expect(
      service.updateProfile(COMPANY, CAMERA, { regions: [[{ x: 0.1, y: 0.1 }]] }, SITE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un minTargetPct que no es una fracción', async () => {
    const { service } = scenario();
    await expect(
      service.updateProfile(COMPANY, CAMERA, { minTargetPct: 40 }, SITE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('null explícito devuelve el campo a su valor por defecto', async () => {
    const { service } = scenario();
    await service.updateProfile(COMPANY, CAMERA, { sensitivity: 20 }, SITE);
    const dto = await service.updateProfile(COMPANY, CAMERA, { sensitivity: null }, SITE);
    expect(dto.stored?.sensitivity).toBeNull();
    expect(dto.effective.sensitivity).toBe(DEFAULT_SENSITIVITY);
  });

  it('un perfil apagado no toca el equipo al aplicarlo', async () => {
    const { service } = scenario();
    await service.updateProfile(COMPANY, CAMERA, { enabled: false }, SITE);
    const res = await service.applyProfile(COMPANY, CAMERA, SITE);
    expect(res.applied).toBe(false);
    expect(res.report).toBeNull();
    expect(res.note).toContain('apagado');
  });
});
