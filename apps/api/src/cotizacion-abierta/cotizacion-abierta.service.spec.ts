import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { normalizeItems } from '../cotizaciones/cotizacion-totals';
import { CotizacionAbiertaService } from './cotizacion-abierta.service';

const VERSION = new Date('2026-11-03T10:00:00.000Z');
const david = { id: 8, roleKey: 'coord_operaciones', email: 'd@x', permissions: ['activities.manage'] } as never;
const carolina = { id: 13, roleKey: 'ing_soporte', email: 'c@x' } as never;
const ajena = { id: 40, roleKey: 'ing_soporte', email: 'r@x' } as never;
const direccion = { id: 1, roleKey: 'ceo', email: 'g@x' } as never;

function partidas() {
  return [
    { id: 1, name: 'Cámara IP', unit: 'pieza', qty: 2, unitPrice: 1500, unitCost: 1000, marginPercent: 50, productCtId: 77, ieps: 8, category: 'Equipos' },
    { id: 2, name: 'NVR', unit: 'pieza', qty: 1, unitPrice: 5000, unitCost: 4000, marginPercent: 25, productCtId: 78, ieps: 0, category: 'Equipos' },
    { id: 3, name: 'Mano de obra', unit: 'hora', qty: 3, unitPrice: 800, unitCost: null, marginPercent: null, productCtId: null, ieps: 0, category: 'Servicios' },
  ];
}

function build(over: { estatus?: string; status?: string; acceso?: Record<string, unknown> | null } = {}) {
  const acceso =
    over.acceso === null ? null : { id: 5, activityId: 50, cotizacionId: 70, userId: 13, otorgadoPorId: 8, cambios: 0, ultimoCambioAt: null, revocadoAt: null, createdAt: VERSION, ...over.acceso };
  const update = jest.fn(async () => ({}));
  const accesoUpdate = jest.fn(async () => ({}));
  const accesoCreate = jest.fn(async () => ({}));
  const cotizacion = {
    id: 70, quoteNumber: 'NEX-0042', projectName: 'Crepería', clientName: 'Luna', status: over.status ?? 'DRAFT', updatedAt: VERSION,
    unitCost: 'NO DEBE SALIR', marginPercent: 10, publicToken: 'secreto', total: 99, items: partidas(),
  };
  const prisma = {
    cotizacionAcceso: { findFirst: jest.fn(async () => acceso), update: accesoUpdate, create: accesoCreate },
    activity: { findFirst: jest.fn(async () => ({ estatus: over.estatus ?? 'En Proceso', deletedAt: null })) },
    cotizacion: {
      findFirst: jest.fn(async (args: { select?: Record<string, boolean>; include?: unknown }) => {
        if (!args.select) return cotizacion;
        return Object.fromEntries(Object.keys(args.select).map((k) => [k, (cotizacion as Record<string, unknown>)[k]]));
      }),
    },
    cotizacionItem: {
      findMany: jest.fn(async () => partidas().map((p) => ({ id: p.id, name: p.name, unit: p.unit, qty: p.qty, unitPrice: p.unitPrice }))),
    },
    user: { findMany: jest.fn(async () => [{ id: 13, nombre: 'Carolina' }, { id: 8, nombre: 'David' }]) },
  };
  const service = new CotizacionAbiertaService(prisma as never, { update } as never, { create: jest.fn(async () => ({ id: 50 })) } as never, {
    findOne: jest.fn(async () => ({ id: 13, isActive: true, email: 'c@x', managerId: 39, departmentId: null, roleKey: 'ing_soporte' })),
    listAssignmentRoster: jest.fn(async () => []),
  } as never);
  return { service, update, accesoUpdate, accesoCreate };
}

describe('leer', () => {
  it('quien la trabaja recibe partidas, y nada de costo, margen ni token', async () => {
    const { service } = build();
    const v = await service.leer(50, carolina, 1);
    expect(v?.puedeEditar).toBe(true);
    expect(v?.partidas).toHaveLength(3);
    expect(v?.version).toBe(VERSION.toISOString());
    expect(JSON.stringify(v)).not.toMatch(/unitCost|marginPercent|publicToken|secreto|NO DEBE SALIR|"total"|1000|4000/);
  });

  it('quien la abrió y dirección ven la bitácora, sin partidas; alguien más, nada', async () => {
    const { service } = build();
    expect(await service.leer(50, david, 1)).toMatchObject({ partidas: null, puedeEditar: false, puedeCerrar: true, para: 'Carolina' });
    expect(await service.leer(50, direccion, 1)).toMatchObject({ partidas: null, puedeCerrar: true });
    expect(await service.leer(50, ajena, 1)).toBeNull();
  });

  it.each(['Por Validar', 'Finalizada', 'Cancelada', 'No cumplida'])('con %s se cerró sola: ya no recibe partidas', async (estatus) => {
    const { service } = build({ estatus });
    expect(await service.leer(50, carolina, 1)).toMatchObject({ estado: 'terminada', puedeEditar: false, partidas: null, version: null });
  });

  it('una cotización que ya salió al cliente no se edita', async () => {
    const { service } = build({ status: 'SENT' });
    expect(await service.leer(50, carolina, 1)).toMatchObject({ puedeEditar: false, partidas: null });
  });

  it('sin acceso registrado, nada', async () => {
    const { service } = build({ acceso: null });
    expect(await service.leer(50, carolina, 1)).toBeNull();
  });
});

describe('guardar', () => {
  const version = VERSION.toISOString();
  const enviadas = () => partidas().map(({ id, name, unit, qty, unitPrice }) => ({ id, name, unit, qty, unitPrice }));

  it('al pasar por el cálculo real, costo y margen sobreviven y el precio escrito manda solo donde cambió', async () => {
    const { service, update, accesoUpdate } = build();
    const [camara, nvr] = enviadas();
    await service.guardar(50, { version, partidas: [{ ...camara, qty: 5 }, { ...nvr, unitPrice: 4500 }, { name: 'Canaleta', unit: 'metro', qty: 10, unitPrice: 25 }] }, carolina, 1);
    const [, dto] = update.mock.calls[0] as unknown as [number, { items: never[] }];
    const n = normalizeItems(dto.items) as Array<Record<string, unknown>>;
    expect(n[0]).toMatchObject({ qty: 5, unitCost: 1000, marginPercent: 50, unitPrice: 1500, productCtId: 77, ieps: 8 });
    expect(n[1]).toMatchObject({ unitPrice: 4500, unitCost: 4000, marginPercent: null, productCtId: 78 });
    expect(n[2]).toMatchObject({ name: 'Canaleta', qty: 10, unitPrice: 25, unit: 'metro' });
    expect(n[2].unitCost ?? null).toBeNull();
    expect(n[2].marginPercent ?? null).toBeNull();
    expect(n).toHaveLength(3);
    expect(accesoUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cambios: { increment: 1 } }) }));
  });

  it('el navegador no puede colar costo ni margen, ni tocar el margen general o el estado', async () => {
    const { service, update } = build();
    const [camara] = enviadas();
    await service.guardar(50, { version, partidas: [{ ...camara, unitCost: 1, marginPercent: 99 } as never] }, carolina, 1);
    const [, dto] = update.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(Object.keys(dto)).toEqual(['items']);
    expect((normalizeItems(dto.items as never) as Array<Record<string, unknown>>)[0]).toMatchObject({ unitCost: 1000, marginPercent: 50 });
  });

  it('solo quien la trabaja, con la actividad abierta', async () => {
    await expect(build().service.guardar(50, { version, partidas: [] }, ajena, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build().service.guardar(50, { version, partidas: [] }, david, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ estatus: 'Finalizada' }).service.guardar(50, { version, partidas: [] }, carolina, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ acceso: { revocadoAt: new Date() } }).service.guardar(50, { version, partidas: [] }, carolina, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no pisa lo que otra persona guardó', async () => {
    const { service, update } = build();
    await expect(service.guardar(50, { version: '2020-01-01T00:00:00.000Z', partidas: enviadas() }, carolina, 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.guardar(50, { version, partidas: [{ id: 999, name: 'X', qty: 1, unitPrice: 1 }] }, carolina, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('una cotización enviada no se regresa a borrador por aquí, y una partida mala se rechaza', async () => {
    const enviada = build({ status: 'SENT' });
    await expect(enviada.service.guardar(50, { version, partidas: enviadas() }, carolina, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(enviada.update).not.toHaveBeenCalled();
    await expect(build().service.guardar(50, { version, partidas: [{ name: ' ', qty: 1, unitPrice: 1 }] }, carolina, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('pedir apoyo y cerrar', () => {
  it('crea la actividad y abre solo esa cotización', async () => {
    const { service, accesoCreate } = build();
    await expect(service.pedirApoyo(70, { userId: 13, nota: 'Revisa' }, { ...(david as object), roleKey: 'ceo' } as never, 1)).resolves.toEqual({ activityId: 50 });
    expect(accesoCreate).toHaveBeenCalledWith({ data: { companyId: 1, cotizacionId: 70, activityId: 50, userId: 13, otorgadoPorId: 8 } });
  });

  it('quien no asigna no la abre, ni a sí mismo ni sobre una enviada', async () => {
    await expect(build().service.pedirApoyo(70, { userId: 40 }, carolina, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build().service.pedirApoyo(70, { userId: 8 }, david, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ status: 'SENT' }).service.pedirApoyo(70, { userId: 13 }, { ...(david as object), roleKey: 'ceo' } as never, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no se la abre a quien no entra al detalle de una actividad', async () => {
    const { service } = build();
    (service as unknown as { users: { findOne: jest.Mock } }).users.findOne.mockResolvedValueOnce({ id: 13, isActive: true, email: 'c@x', managerId: 39, departmentId: null, roleKey: 'rh' });
    await expect(service.pedirApoyo(70, { userId: 13 }, { ...(david as object), roleKey: 'ceo' } as never, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la cierra quien la abrió o dirección; quien la trabaja, no', async () => {
    const { service, accesoUpdate } = build();
    await service.cerrar(50, david, 1);
    expect(accesoUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revocadoPorId: 8 }) }));
    await expect(build().service.cerrar(50, carolina, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build().service.cerrar(50, ajena, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build().service.cerrar(50, direccion, 1)).resolves.toBeTruthy();
  });
});
