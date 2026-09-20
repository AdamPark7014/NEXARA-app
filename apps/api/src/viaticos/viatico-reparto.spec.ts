import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ViaticosService } from './viaticos.service.js';
import { normalizarPartes, resumenLiquidacion, validarReparto } from './viatico-reparto.js';

const EMPRESA = 7;
const OTRA_EMPRESA = 9;

/** Un viático de $1,200 que cubrió dos servicios en la misma salida. */
const VIATICO = {
  id: 50,
  usuarioId: 3,
  actividadId: 101,
  projectId: null,
  companyId: EMPRESA,
  estatus: 'Pendiente',
  montoSolicitado: 1200,
  montoAprobado: null,
  montoComprobado: null,
  approvalTrail: [],
  approvalStep: 0,
};

const ADMIN = { id: 1, nombre: 'Contabilidad', permissions: ['viatics.manage'] };
const CAMPO = { id: 3, nombre: 'Alejandro', permissions: ['viatics.create'] };
const OTRO_CAMPO = { id: 4, nombre: 'Carolina', permissions: ['viatics.create'] };

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    viatico: {
      findFirst: jest.fn().mockResolvedValue({ ...VIATICO }),
      findUnique: jest.fn().mockResolvedValue({ ...VIATICO }),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...VIATICO, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    viaticoReparto: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation((args: any) => args),
      findMany: jest.fn().mockResolvedValue([]),
    },
    activity: {
      // Por defecto, las dos actividades del reparto existen en la empresa activa.
      findMany: jest.fn().mockResolvedValue([{ id: 101 }, { id: 202 }]),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    ...over.prisma,
  };

  const service = new ViaticosService(
    prisma,
    { notifyViaticRequested: jest.fn(), notifyViaticReview: jest.fn(), notifyViaticAssignedToUser: jest.fn() } as any,
    { publishEntityLifecycle: jest.fn(), requestAutoApproval: jest.fn() } as any,
    { postOperationalDisbursement: jest.fn() } as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}

describe('reparto de un viático entre actividades — la regla del cuadre', () => {
  it('acepta un reparto que suma exactamente el total', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 700 },
      { actividadId: 202, monto: 500 },
    ]);
    expect(validarReparto(partes, 1200)).toEqual({ ok: true });
  });

  it('rechaza un reparto que no llega al total y dice cuánto falta', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 700 },
      { actividadId: 202, monto: 300 },
    ]);
    const r = validarReparto(partes, 1200);
    expect(r.ok).toBe(false);
    // Lo que falta es costo que se pierde: el mensaje tiene que decir la cifra.
    expect((r as { mensaje: string }).mensaje).toContain('faltan');
    expect((r as { mensaje: string }).mensaje).toContain('200.00');
  });

  it('rechaza un reparto que se pasa del total y dice cuánto sobra', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 900 },
      { actividadId: 202, monto: 500 },
    ]);
    const r = validarReparto(partes, 1200);
    expect(r.ok).toBe(false);
    expect((r as { mensaje: string }).mensaje).toContain('sobran');
    expect((r as { mensaje: string }).mensaje).toContain('200.00');
  });

  it('cuadra con decimales que en coma flotante no suman', () => {
    // 0.1 + 0.2 !== 0.3 en binario. Si se comparara en float, este reparto
    // legítimo se rechazaría y nadie entendería por qué.
    const partes = normalizarPartes([
      { actividadId: 101, monto: 0.1 },
      { actividadId: 202, monto: 0.2 },
    ]);
    expect(validarReparto(partes, 0.3)).toEqual({ ok: true });
  });

  it('rechaza una diferencia de un solo centavo', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 600 },
      { actividadId: 202, monto: 599.99 },
    ]);
    expect(validarReparto(partes, 1200).ok).toBe(false);
  });

  it('no deja repetir la misma actividad', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 600 },
      { actividadId: 101, monto: 600 },
    ]);
    const r = validarReparto(partes, 1200);
    expect(r.ok).toBe(false);
    expect((r as { mensaje: string }).mensaje).toContain('#101');
  });

  it('no deja partes en cero ni negativas', () => {
    const partes = normalizarPartes([
      { actividadId: 101, monto: 1200 },
      { actividadId: 202, monto: 0 },
    ]);
    expect(validarReparto(partes, 1200).ok).toBe(false);
  });

  it('sin partes no hay reparto: el viático sigue siendo de una sola actividad', () => {
    expect(validarReparto([], 1200)).toEqual({ ok: true });
  });

  it('una parte que no dice a qué actividad va se rechaza al normalizar', () => {
    expect(() => normalizarPartes([{ monto: 1200 }])).toThrow(/actividad/i);
  });
});

describe('setReparto — servidor, no solo pantalla', () => {
  it('guarda el reparto cuando cuadra', async () => {
    const { service, prisma } = build();
    await service.setReparto(
      50,
      [
        { actividadId: 101, monto: 700 },
        { actividadId: 202, monto: 500 },
      ],
      ADMIN,
      EMPRESA,
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.viaticoReparto.create).toHaveBeenCalledTimes(2);
    const primera = prisma.viaticoReparto.create.mock.calls[0][0];
    expect(primera.data.companyId).toBe(EMPRESA);
    expect(primera.data.viaticoId).toBe(50);
  });

  it('rechaza en el servidor un reparto descuadrado aunque la pantalla lo mande', async () => {
    const { service, prisma } = build();
    await expect(
      service.setReparto(50, [{ actividadId: 101, monto: 700 }], ADMIN, EMPRESA),
    ).rejects.toThrow(BadRequestException);
    // Nada se escribió: un reparto a medias es peor que ninguno.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una lista vacía deshace el reparto sin dejar partes sueltas', async () => {
    const { service, prisma } = build();
    await service.setReparto(50, [], ADMIN, EMPRESA);
    expect(prisma.viaticoReparto.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('no reparte hacia actividades de otra empresa', async () => {
    // La actividad 202 no existe dentro del filtro por empresa.
    const { service } = build({
      prisma: { activity: { findMany: jest.fn().mockResolvedValue([{ id: 101 }]) } },
    });
    await expect(
      service.setReparto(
        50,
        [
          { actividadId: 101, monto: 700 },
          { actividadId: 202, monto: 500 },
        ],
        ADMIN,
        EMPRESA,
      ),
    ).rejects.toThrow(/#202/);
  });

  it('busca las actividades filtrando por la empresa activa', async () => {
    const { service, prisma } = build();
    await service.setReparto(
      50,
      [
        { actividadId: 101, monto: 700 },
        { actividadId: 202, monto: 500 },
      ],
      ADMIN,
      EMPRESA,
    );
    expect(prisma.activity.findMany.mock.calls[0][0].where).toMatchObject({ companyId: EMPRESA });
  });

  it('sin empresa activa no se reparte nada', async () => {
    const { service } = build();
    await expect(
      service.setReparto(50, [{ actividadId: 101, monto: 1200 }], ADMIN, null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('el viático de otra empresa no existe para quien pregunta', async () => {
    const { service } = build({
      prisma: {
        viatico: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      },
    });
    await expect(
      service.setReparto(50, [{ actividadId: 101, monto: 1200 }], ADMIN, OTRA_EMPRESA),
    ).rejects.toThrow(/no encontrado/i);
  });

  it('quien no administra viáticos no reparte el de otra persona', async () => {
    const { service } = build();
    await expect(
      service.setReparto(50, [{ actividadId: 101, monto: 1200 }], OTRO_CAMPO, EMPRESA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('quien lo pidió sí puede repartir el suyo', async () => {
    const { service, prisma } = build();
    await service.setReparto(50, [{ actividadId: 101, monto: 1200 }], CAMPO, EMPRESA);
    expect(prisma.viaticoReparto.create).toHaveBeenCalledTimes(1);
  });

  it('un viático ya pagado no se re-reparte: el asiento ya salió', async () => {
    const { service } = build({
      prisma: {
        viatico: {
          findFirst: jest.fn().mockResolvedValue({ ...VIATICO, estatus: 'Pagado' }),
          findUnique: jest.fn().mockResolvedValue({ ...VIATICO, estatus: 'Pagado' }),
        },
      },
    });
    await expect(
      service.setReparto(50, [{ actividadId: 101, monto: 1200 }], ADMIN, EMPRESA),
    ).rejects.toThrow(/contabilidad/i);
  });
});

describe('cambiar el monto de un viático repartido', () => {
  it('se rechaza si el reparto viejo deja de cuadrar', async () => {
    const { service } = build({
      prisma: {
        viaticoReparto: {
          deleteMany: jest.fn(),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            { actividadId: 101, monto: 700, nota: null },
            { actividadId: 202, monto: 500, nota: null },
          ]),
        },
      },
    });
    await expect(service.update(50, { montoSolicitado: 1500 }, EMPRESA)).rejects.toThrow(
      /reparto/i,
    );
  });

  it('se acepta si el reparto corregido llega en el mismo guardado', async () => {
    const { service, prisma } = build();
    await service.update(
      50,
      {
        montoSolicitado: 1500,
        partes: [
          { actividadId: 101, monto: 900 },
          { actividadId: 202, monto: 600 },
        ],
      },
      EMPRESA,
    );
    expect(prisma.viaticoReparto.create).toHaveBeenCalledTimes(2);
    expect(prisma.viatico.update).toHaveBeenCalled();
  });
});

describe('cierre del anticipo — entregado, comprobado y saldo', () => {
  it('sin comprobar, el saldo no existe todavía', () => {
    expect(resumenLiquidacion({ montoSolicitado: 1200, montoAprobado: 1200 })).toEqual({
      entregado: 1200,
      comprobado: null,
      saldo: null,
      estado: 'SIN_COMPROBAR',
    });
  });

  it('sobró dinero: la persona lo tiene que devolver', () => {
    const r = resumenLiquidacion({
      montoSolicitado: 1200,
      montoAprobado: 1200,
      montoComprobado: 900,
    });
    expect(r.saldo).toBe(300);
    expect(r.estado).toBe('POR_DEVOLVER');
  });

  it('gastó de más: la empresa le debe el reembolso', () => {
    const r = resumenLiquidacion({
      montoSolicitado: 1200,
      montoAprobado: 1200,
      montoComprobado: 1350,
    });
    expect(r.saldo).toBe(-150);
    expect(r.estado).toBe('POR_REEMBOLSAR');
  });

  it('el saldo se mide contra lo autorizado, no contra lo pedido', () => {
    // Pidió 1,200; le autorizaron 800; comprobó 800. Está a mano, no debe 400.
    const r = resumenLiquidacion({
      montoSolicitado: 1200,
      montoAprobado: 800,
      montoComprobado: 800,
    });
    expect(r.entregado).toBe(800);
    expect(r.estado).toBe('CUADRADO');
  });

  it('sin resolución todavía, lo entregado es lo solicitado', () => {
    expect(resumenLiquidacion({ montoSolicitado: 1200 }).entregado).toBe(1200);
  });
});

describe('comprobar — contrato de autorización', () => {
  const APROBADO = { ...VIATICO, estatus: 'Aprobado', montoAprobado: 1200 };

  function buildAprobado(over: Record<string, any> = {}) {
    return build({
      prisma: {
        viatico: {
          findFirst: jest.fn().mockResolvedValue({ ...APROBADO }),
          findUnique: jest.fn().mockResolvedValue({ ...APROBADO }),
          update: jest.fn().mockImplementation(({ data }: any) => ({ ...APROBADO, ...data })),
          ...over.viatico,
        },
      },
    });
  }

  it('registra lo comprobado y devuelve el saldo', async () => {
    const { service, prisma } = buildAprobado();
    const r: any = await service.comprobar(50, { montoComprobado: 900 }, CAMPO, EMPRESA);
    expect(prisma.viatico.update.mock.calls[0][0].data.montoComprobado).toBe(900);
    expect(prisma.viatico.update.mock.calls[0][0].data.comprobadoPorId).toBe(CAMPO.id);
    expect(r.liquidacion.saldo).toBe(300);
    expect(r.liquidacion.estado).toBe('POR_DEVOLVER');
  });

  it('deja la comprobación anotada en la cadena de autorización', async () => {
    const { service, prisma } = buildAprobado();
    await service.comprobar(50, { montoComprobado: 900 }, CAMPO, EMPRESA);
    const trail = prisma.viatico.update.mock.calls[0][0].data.approvalTrail;
    expect(trail[trail.length - 1]).toMatchObject({ action: 'comprobar', userId: CAMPO.id });
  });

  it('no se comprueba lo que todavía nadie autorizó', async () => {
    const { service } = build();
    await expect(service.comprobar(50, { montoComprobado: 900 }, CAMPO, EMPRESA)).rejects.toThrow(
      /Pendiente/,
    );
  });

  it('quien no administra viáticos no comprueba el de otra persona', async () => {
    const { service } = buildAprobado();
    await expect(
      service.comprobar(50, { montoComprobado: 900 }, OTRO_CAMPO, EMPRESA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sin empresa activa no se comprueba nada', async () => {
    const { service } = buildAprobado();
    await expect(service.comprobar(50, { montoComprobado: 900 }, ADMIN, null)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('busca el viático filtrando por la empresa activa', async () => {
    const { service, prisma } = buildAprobado();
    await service.comprobar(50, { montoComprobado: 900 }, ADMIN, EMPRESA);
    expect(prisma.viatico.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: EMPRESA });
  });

  it('una cifra disparatada se frena en vez de entrar al P&L', async () => {
    const { service } = buildAprobado();
    await expect(service.comprobar(50, { montoComprobado: 9000 }, ADMIN, EMPRESA)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('autorizar por menos de lo solicitado', () => {
  it('sella lo autorizado al aprobar, aunque nadie recorte la cifra', async () => {
    const { service, prisma } = build({
      prisma: {
        viatico: {
          findFirst: jest.fn().mockResolvedValue({ ...VIATICO, approvalStep: 99 }),
          findUnique: jest.fn().mockResolvedValue({ ...VIATICO }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    await service.approveOrReject(50, { ...ADMIN, isSuperAdmin: true }, 'approve', undefined, EMPRESA);
    const escrito = prisma.viatico.updateMany.mock.calls[0][0].data;
    expect(escrito.estatus).toBe('Aprobado');
    expect(escrito.montoAprobado).toBe(1200);
  });

  it('no deja autorizar más de lo que se pidió', async () => {
    const { service } = build({
      prisma: {
        viatico: {
          findFirst: jest.fn().mockResolvedValue({ ...VIATICO, approvalStep: 99 }),
          findUnique: jest.fn().mockResolvedValue({ ...VIATICO }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    await expect(
      service.approveOrReject(50, { ...ADMIN, isSuperAdmin: true }, 'approve', undefined, EMPRESA, 5000),
    ).rejects.toThrow(/más de lo solicitado/i);
  });
});
