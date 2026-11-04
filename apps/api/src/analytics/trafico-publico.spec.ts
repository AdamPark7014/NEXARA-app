/**
 * El tráfico del sitio público es de la empresa del sitio. Lo que se defiende: una visita cae en esa empresa
 * venga la petición con la cabecera que venga, y el resumen enseña solo lo de la empresa de la sesión.
 */
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { runWithTenantAsync } from '../common/tenant/tenant-context.js';
import { runWithTenantScope } from '../prisma/prisma.service.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { AnalyticsService } from './analytics.service.js';
import { PublicAnalyticsController } from './public-analytics.controller.js';

const SITIO_PUBLICO = 1;
const OTRA_EMPRESA = 2;
const VISITA = { landingKey: 'home', eventType: 'view' as const };

describe('evento de tráfico público', () => {
  /** Hace lo que el middleware de empresa: si el `create` no trae empresa, le pone la de la petición. */
  const armar = (empresaDeLaPeticion: number) => {
    const guardado: Array<Record<string, unknown>> = [];
    const prisma = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO_PUBLICO })) },
      kpiSnapshot: {
        create: jest.fn((args: Record<string, unknown>) =>
          runWithTenantScope({ model: 'KpiSnapshot', action: 'create', args }, empresaDeLaPeticion, async (plan) => {
            guardado.push(plan.args.data);
            return plan.args.data;
          }),
        ),
      },
    } as any;
    return { service: new AnalyticsService(prisma), guardado };
  };

  it.each([
    ['sin cabecera', SITIO_PUBLICO],
    ['con la cabecera de otra empresa', OTRA_EMPRESA],
  ])('cae en la empresa del sitio %s', async (_caso, empresaDeLaPeticion) => {
    const { service, guardado } = armar(empresaDeLaPeticion);

    await runWithTenantAsync({ companyId: empresaDeLaPeticion, bypass: false }, () =>
      service.recordPublicLandingEvent(VISITA),
    );

    expect(guardado).toHaveLength(1);
    expect(guardado[0]).toMatchObject({
      companyId: SITIO_PUBLICO,
      kpiName: 'landing:home',
      kpiCategory: 'PUBLIC_TRAFFIC',
      unit: 'view',
    });
  });
});

describe('resumen de tráfico público', () => {
  const armar = (filas: Array<{ landing: string; event: string; total: bigint }> = []) => {
    const $queryRaw = jest.fn(async (..._args: unknown[]) => filas);
    return { service: new AnalyticsService({ $queryRaw } as any), $queryRaw };
  };

  it('lee solo las filas de la empresa de la sesión', async () => {
    const { service, $queryRaw } = armar();

    await service.getPublicLandingSummary(OTRA_EMPRESA, 7);

    const [partes, ...valores] = $queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = partes.join('?');
    expect(sql).toContain(`"kpiCategory" = 'PUBLIC_TRAFFIC'`);
    expect(sql).toContain('"companyId" = ?');
    expect(sql).not.toContain('IS NULL');
    expect(valores).toContain(OTRA_EMPRESA);
  });

  it('sin empresa no lee nada', async () => {
    const { service, $queryRaw } = armar();

    await expect(service.getPublicLandingSummary(null)).rejects.toBeInstanceOf(ForbiddenException);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('suma por página y calcula sus porcentajes', async () => {
    const { service } = armar([
      { landing: 'landing:home', event: 'view', total: 40n },
      { landing: 'landing:home', event: 'click', total: 10n },
      { landing: 'landing:home', event: 'conversion', total: 2n },
    ]);

    await expect(service.getPublicLandingSummary(SITIO_PUBLICO)).resolves.toEqual([
      { landing: 'landing:home', views: 40, clicks: 10, conversions: 2, ctr: 25, conversionRate: 5 },
    ]);
  });
});

describe('PublicAnalyticsController', () => {
  const armar = () => {
    const svc = { getPublicLandingSummary: jest.fn(async () => []) };
    return { controller: new PublicAnalyticsController(svc as any), svc };
  };

  it('pide el resumen con la empresa de la sesión y 30 días si no dicen otra cosa', async () => {
    const { controller, svc } = armar();

    await controller.summary(OTRA_EMPRESA, '15');
    await controller.summary(OTRA_EMPRESA, 'x');

    expect(svc.getPublicLandingSummary).toHaveBeenNthCalledWith(1, OTRA_EMPRESA, 15);
    expect(svc.getPublicLandingSummary).toHaveBeenNthCalledWith(2, OTRA_EMPRESA, 30);
  });

  it('el resumen sigue pidiendo sesión y permiso de BI; el evento sigue abierto', () => {
    const { summary, recordEvent } = PublicAnalyticsController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, summary)).toContain(RbacGuard);
    expect(Reflect.getMetadata('rbac', summary)).toEqual({ permissions: [PERMISSIONS.BI_VIEW] });
    expect(Reflect.getMetadata(GUARDS_METADATA, recordEvent)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicAnalyticsController)).toBeUndefined();
  });
});
