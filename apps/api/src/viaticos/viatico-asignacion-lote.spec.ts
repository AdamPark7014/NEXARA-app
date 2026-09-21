import { BadRequestException } from '@nestjs/common';
import { ViaticosService } from './viaticos.service.js';

/**
 * Asignar viáticos a la cuadrilla completa de una sola captura.
 *
 * Lo que se cuida aquí es que el lote sea todo o nada: si uno de los
 * beneficiarios está inactivo o una actividad es de otra empresa, no se debe
 * crear NINGÚN viático. Un lote a medias deja a unos con dinero y a otros sin
 * él, y el que se quedó fuera no se entera hasta que reclama en la carretera.
 */
const EMPRESA = 7;
const ADMIN = { id: 1, nombre: 'Contabilidad', permissions: ['viatics.manage'] };

function build(over: Record<string, any> = {}) {
  let siguienteId = 500;
  const prisma: any = {
    companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: EMPRESA }) },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 3, nombre: 'Alejandro', isActive: true },
        { id: 4, nombre: 'Carolina', isActive: true },
      ]),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where.id, nombre: `Usuario ${where.id}`, isActive: true }),
        ),
    },
    activity: {
      findMany: jest.fn().mockResolvedValue([{ id: 101 }, { id: 202 }]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    viatico: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: siguienteId++, ...data, User: { id: data.usuarioId } }),
      ),
    },
    viaticoReparto: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation((args: any) => args),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    ...over,
  };

  const service = new ViaticosService(
    prisma,
    {
      notifyViaticRequested: jest.fn(),
      notifyViaticReview: jest.fn(),
      notifyViaticAssignedToUser: jest.fn(),
    } as any,
    { publishEntityLifecycle: jest.fn(), requestAutoApproval: jest.fn() } as any,
    { postOperationalDisbursement: jest.fn() } as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}

describe('ViaticosService.assignLote', () => {
  it('crea un viático por beneficiario y el monto es POR PERSONA', async () => {
    const { service, prisma } = build();

    const r = await service.assignLote(
      { usuarioIds: [3, 4], actividadIds: [101], montoPorPersona: 800 },
      ADMIN,
      EMPRESA,
    );

    expect(r.creados).toBe(2);
    expect(r.montoPorPersona).toBe(800);
    expect(r.montoTotal).toBe(1600);
    expect(prisma.viatico.create).toHaveBeenCalledTimes(2);
  });

  it('con varias actividades reparte el costo al centavo, no lo duplica', async () => {
    const { service, prisma } = build();

    await service.assignLote(
      { usuarioIds: [3], actividadIds: [101, 202], montoPorPersona: 100 },
      ADMIN,
      EMPRESA,
    );

    const montos = prisma.viaticoReparto.create.mock.calls.map((c: any) => c[0].data.monto);
    expect(montos).toHaveLength(2);
    expect(montos.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(100, 2);
    expect(montos).toEqual([50, 50]);
  });

  it('no crea nada si un beneficiario está inactivo, y dice quién', async () => {
    const { service, prisma } = build({
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 3, nombre: 'Alejandro', isActive: true },
          { id: 4, nombre: 'Carolina', isActive: false },
        ]),
        findUnique: jest.fn(),
      },
    });

    await expect(
      service.assignLote(
        { usuarioIds: [3, 4], actividadIds: [101], montoPorPersona: 800 },
        ADMIN,
        EMPRESA,
      ),
    ).rejects.toThrow(/Carolina/);
    expect(prisma.viatico.create).not.toHaveBeenCalled();
  });

  it('no crea nada si una actividad es de otra empresa', async () => {
    const { service, prisma } = build({
      activity: { findMany: jest.fn().mockResolvedValue([{ id: 101 }]), findUnique: jest.fn() },
    });

    await expect(
      service.assignLote(
        { usuarioIds: [3], actividadIds: [101, 999], montoPorPersona: 500 },
        ADMIN,
        EMPRESA,
      ),
    ).rejects.toThrow(/#999/);
    expect(prisma.viatico.create).not.toHaveBeenCalled();
  });

  it('exige colgar el viático de algo: ni actividad ni proyecto es un gasto huérfano', async () => {
    const { service } = build();
    await expect(
      service.assignLote({ usuarioIds: [3], montoPorPersona: 500 }, ADMIN, EMPRESA),
    ).rejects.toThrow(BadRequestException);
  });

  it('exige al menos un beneficiario', async () => {
    const { service } = build();
    await expect(
      service.assignLote({ usuarioIds: [], actividadIds: [101], montoPorPersona: 500 }, ADMIN, EMPRESA),
    ).rejects.toThrow(/al menos un beneficiario/);
  });

  it('el motivo dice de qué semana es: sin eso no se concilia tres meses después', async () => {
    const { service, prisma } = build();

    await service.assignLote(
      {
        usuarioIds: [3],
        actividadIds: [101, 202],
        montoPorPersona: 900,
        motivo: 'Gasolina y casetas',
        desde: '2026-09-14',
        hasta: '2026-09-20',
      },
      ADMIN,
      EMPRESA,
    );

    const motivo = prisma.viatico.create.mock.calls[0][0].data.motivo;
    expect(motivo).toContain('Gasolina y casetas');
    // El nombre corto del mes lo pone ICU y cambia entre versiones de Node
    // ('sep' / 'sept'), así que se comprueba lo que sí es nuestro: los días.
    expect(motivo).toMatch(/del 14 \w+\.? al 20 \w+\.?/);
    expect(motivo).toContain('2 actividades');
  });

  it('ignora beneficiarios repetidos en vez de pagarle dos veces al mismo', async () => {
    const { service, prisma } = build({
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 3, nombre: 'Alejandro', isActive: true }]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 3, nombre: 'Alejandro', isActive: true }),
      },
    });

    const r = await service.assignLote(
      { usuarioIds: [3, 3, 3], actividadIds: [101], montoPorPersona: 700 },
      ADMIN,
      EMPRESA,
    );

    expect(r.creados).toBe(1);
    expect(prisma.viatico.create).toHaveBeenCalledTimes(1);
  });
});
