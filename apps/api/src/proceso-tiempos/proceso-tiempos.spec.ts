import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { skipsMutationAudit } from '../audit/mutation-audit.interceptor.js';
import { ProcesoTiemposController } from './proceso-tiempos.controller.js';

describe('cronómetro de procesos', () => {
  const crear = () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    return { create, controller: new ProcesoTiemposController({ procesoTiempo: { create } } as any) };
  };

  it('el usuario y la empresa salen de la sesión, no del cuerpo', async () => {
    const { controller, create } = crear();
    await controller.registrar(
      { proceso: 'asignar', duracionMs: 24_000, clics: 5, entidadId: 9, detalle: ' tarea ', userId: 99, companyId: 88 } as any,
      { id: 3 },
      7,
    );
    expect(create.mock.calls[0][0].data).toEqual({
      companyId: 7,
      userId: 3,
      proceso: 'asignar',
      duracionMs: 24_000,
      clics: 5,
      entidadId: 9,
      detalle: 'tarea',
    });
  });

  it('sin empresa no registra', async () => {
    const { controller, create } = crear();
    await expect(controller.registrar({ proceso: 'asignar', duracionMs: 1 } as any, { id: 3 }, null)).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('no se audita cada medición', () => {
    expect(skipsMutationAudit('/api/proceso-tiempos')).toBe(true);
  });
});
