import { ConflictException } from '@nestjs/common';
import {
  mensajeDeAutorizacion,
  parsearUmbrales,
  requiereAutorizacion,
  tipoBase,
} from './approval-thresholds.js';
import { ApprovalThresholdService } from './approval-thresholds.service.js';

describe('parsearUmbrales', () => {
  it('sin valor, JSON roto o forma equivocada = sin topes', () => {
    expect(parsearUmbrales(null)).toEqual({});
    expect(parsearUmbrales('')).toEqual({});
    expect(parsearUmbrales('{no')).toEqual({});
    expect(parsearUmbrales('[1]')).toEqual({});
  });

  it('lee `desde` y también el número suelto; ignora tipos desconocidos, ceros, negativos y textos', () => {
    expect(
      parsearUmbrales('{"COTIZACION":{"desde":250000},"PURCHASE_ORDER":25000,"EXPENSE":10,"X":{"desde":1}}'),
    ).toEqual({ COTIZACION: { desde: 250000 }, PURCHASE_ORDER: { desde: 25000 } });
    expect(parsearUmbrales('{"COTIZACION":{"desde":0},"PURCHASE_ORDER":{"desde":"mucho"}}')).toEqual({});
    expect(parsearUmbrales('{"COTIZACION":{"desde":-5}}')).toEqual({});
  });
});

describe('requiereAutorizacion', () => {
  const umbrales = parsearUmbrales('{"COTIZACION":{"desde":100000}}');
  it('desde el tope inclusive, no antes; sin tope configurado, nunca', () => {
    expect(requiereAutorizacion(umbrales, 'COTIZACION', 99999.99)).toBe(false);
    expect(requiereAutorizacion(umbrales, 'COTIZACION', 100000)).toBe(true);
    expect(requiereAutorizacion(umbrales, 'PURCHASE_ORDER', 9e9)).toBe(false);
    expect(requiereAutorizacion({}, 'COTIZACION', 9e9)).toBe(false);
    expect(requiereAutorizacion(umbrales, 'COTIZACION', 'x')).toBe(false);
  });
});

describe('tipoBase / mensaje', () => {
  it('COTIZACION_MONTO es una cotización', () => {
    expect(tipoBase('cotizacion_monto')).toBe('COTIZACION');
    expect(tipoBase('PURCHASE_ORDER')).toBe('PURCHASE_ORDER');
  });
  it('el mensaje dice el monto y si la solicitud ya estaba abierta', () => {
    expect(mensajeDeAutorizacion('COTIZACION', 250000, false)).toMatch(/La cotización es de \$250,000\.00.*Se la pedimos ahora/);
    expect(mensajeDeAutorizacion('PURCHASE_ORDER', 30000, true)).toMatch(/La orden de compra.*Ya se pidió/);
  });
});

describe('ApprovalThresholdService.exigir', () => {
  const DIRECCION = { roleKey: 'ceo', role: { nombre: 'Dirección', accesoConsoleAdmin: true } };
  const VENDEDOR = { roleKey: 'vendedor', role: { nombre: 'Ventas', accesoConsoleAdmin: false } };

  function crear(opts: { setting?: string | null; actor?: any; autorizada?: boolean; abierta?: boolean; sinDefinicion?: boolean; falla?: boolean } = {}) {
    const workflowInstance = {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.isComplete === true) return opts.autorizada ? { id: 1 } : null;
        return opts.abierta ? { id: 2 } : null;
      }),
    };
    const workflowDefinition = { findFirst: jest.fn(async () => (opts.sinDefinicion ? null : { id: 3 })) };
    const prisma: any = {
      systemSetting: {
        findMany: jest.fn(async () =>
          opts.setting === null ? [] : [{ companyId: 7, value: opts.setting ?? '{"COTIZACION":{"desde":100000},"PURCHASE_ORDER":{"desde":25000}}' }],
        ),
      },
      user: { findUnique: jest.fn(async () => opts.actor ?? VENDEDOR) },
      workflowInstance,
      workflowDefinition,
    };
    const workflow: any = {
      requestApproval: jest.fn(async () => {
        if (opts.falla) throw new Error('sin definición');
        return {};
      }),
      createDefinition: jest.fn(async () => ({})),
    };
    return { servicio: new ApprovalThresholdService(prisma, workflow), prisma, workflow };
  }

  const cot = (over: Partial<Parameters<ApprovalThresholdService['exigir']>[0]> = {}) => ({
    tipo: 'COTIZACION' as const,
    entityId: 40,
    monto: 250000,
    actorId: 11,
    companyId: 7,
    ...over,
  });

  it('sin tope configurado no cambia nada', async () => {
    const { servicio, workflow } = crear({ setting: null });
    await expect(servicio.exigir(cot())).resolves.toBeUndefined();
    expect(workflow.requestApproval).not.toHaveBeenCalled();
  });

  it('monto por debajo del tope o acción del sistema (sin actor): pasa', async () => {
    const { servicio, workflow } = crear();
    await expect(servicio.exigir(cot({ monto: 99000 }))).resolves.toBeUndefined();
    await expect(servicio.exigir(cot({ actorId: null }))).resolves.toBeUndefined();
    expect(workflow.requestApproval).not.toHaveBeenCalled();
  });

  it('dirección envía o aprueba lo suyo sin pedirse permiso a sí misma', async () => {
    const { servicio, workflow } = crear({ actor: DIRECCION });
    await expect(servicio.exigir(cot())).resolves.toBeUndefined();
    expect(workflow.requestApproval).not.toHaveBeenCalled();
  });

  it('ya autorizada por dirección: pasa', async () => {
    const { servicio, workflow } = crear({ autorizada: true });
    await expect(servicio.exigir(cot())).resolves.toBeUndefined();
    expect(workflow.requestApproval).not.toHaveBeenCalled();
  });

  it('cotización sobre el tope de un vendedor: crea el flujo la primera vez, pide la autorización y responde 409 con el monto', async () => {
    const { servicio, workflow } = crear({ sinDefinicion: true });
    const promesa = servicio.exigir(cot());
    await expect(promesa).rejects.toBeInstanceOf(ConflictException);
    await expect(servicio.exigir(cot())).rejects.toThrow(/\$250,000\.00.*autorización de dirección/);
    expect(workflow.createDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'COTIZACION_MONTO', steps: [expect.objectContaining({ stepNumber: 1 })] }),
      7,
    );
    expect(workflow.requestApproval).toHaveBeenCalledWith({ entityType: 'COTIZACION_MONTO', entityId: 40, startedById: 11, companyId: 7 });
  });

  it('con la solicitud ya abierta no la duplica y avisa que sigue esperando', async () => {
    const { servicio, workflow } = crear({ abierta: true });
    await expect(servicio.exigir(cot())).rejects.toThrow(/Ya se pidió y sigue esperando/);
    expect(workflow.requestApproval).not.toHaveBeenCalled();
  });

  it('OC: usa el flujo «toda OC» que ya existe y no crea definición', async () => {
    const { servicio, workflow } = crear({ sinDefinicion: true });
    await expect(servicio.exigir({ tipo: 'PURCHASE_ORDER', entityId: 9, monto: 30000, actorId: 11, companyId: 7 })).rejects.toBeInstanceOf(ConflictException);
    expect(workflow.createDefinition).not.toHaveBeenCalled();
    expect(workflow.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'PURCHASE_ORDER', entityId: 9 }));
  });

  it('si no se puede pedir la autorización, igual no deja pasar y explica qué hacer', async () => {
    const { servicio } = crear({ falla: true });
    await expect(servicio.exigir(cot())).rejects.toThrow(/no se pudo pedir la autorización a dirección/);
  });

  it('la política de una empresa no afecta a otra', async () => {
    const { servicio, prisma } = crear();
    prisma.systemSetting.findMany.mockImplementation(async (a: any) => (a.where.OR.some((o: any) => o.companyId === 7) ? [{ companyId: 7, value: '{"COTIZACION":{"desde":1}}' }] : []));
    await expect(servicio.exigir(cot({ companyId: 9 }))).resolves.toBeUndefined();
    await expect(servicio.exigir(cot({ companyId: 7 }))).rejects.toBeInstanceOf(ConflictException);
  });
});
