import { ContadorDeRecortes, camposDeFiltro, runWithRowCap } from './row-cap.js';
import { PrismaService } from './prisma.service.js';

describe('campos del filtro de una consulta recortada', () => {
  it('da los nombres ordenados', () => {
    expect(camposDeFiltro({ entityType: 'Auth', createdAt: { gte: new Date() } })).toEqual([
      'createdAt',
      'entityType',
    ]);
  });

  it('entra a AND, OR y NOT sin listarlos como campos', () => {
    expect(
      camposDeFiltro({
        usuarioId: { in: [1] },
        OR: [{ estaActivo: true }, { ultimaActualizacion: { gte: new Date() } }],
        NOT: { deletedAt: null },
      }),
    ).toEqual(['deletedAt', 'estaActivo', 'ultimaActualizacion', 'usuarioId']);
  });

  it('nunca guarda un valor: pueden ser datos de clientes', () => {
    const texto = JSON.stringify(camposDeFiltro({ personName: 'Fulana', OR: [{ email: 'a@b.mx' }] }));
    expect(texto).not.toContain('Fulana');
    expect(texto).not.toContain('a@b.mx');
  });

  it('sin filtro no truena', () => {
    expect(camposDeFiltro(undefined)).toEqual([]);
    expect(camposDeFiltro(null)).toEqual([]);
    expect(camposDeFiltro({})).toEqual([]);
  });
});

describe('middleware del tope', () => {
  const filas = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('recorta, y reporta el modelo y los campos que filtra', async () => {
    const onRecorte = jest.fn();
    const next = jest.fn(async () => filas(4));
    const params = { model: 'AuditLog', action: 'findMany', args: { where: { entityId: 3 } } };

    const rows = await runWithRowCap(params, next, 3, onRecorte);

    expect(rows).toEqual([0, 1, 2]);
    expect(next.mock.calls[0]).toEqual([expect.objectContaining({ args: { where: { entityId: 3 }, take: 4 } })]);
    expect(onRecorte).toHaveBeenCalledWith({ modelo: 'AuditLog', tope: 3, filtro: ['entityId'] });
  });

  it('justo en el tope no reporta', async () => {
    const onRecorte = jest.fn();
    await runWithRowCap({ model: 'A', action: 'findMany' }, async () => filas(3), 3, onRecorte);
    expect(onRecorte).not.toHaveBeenCalled();
  });

  it('con take propio no toca la consulta ni reporta', async () => {
    const onRecorte = jest.fn();
    const params = { model: 'A', action: 'findMany', args: { take: 9 } };
    const next = jest.fn(async () => filas(9));

    await expect(runWithRowCap(params, next, 3, onRecorte)).resolves.toHaveLength(9);
    expect(next).toHaveBeenCalledWith(params);
    expect(params.args).toEqual({ take: 9 });
    expect(onRecorte).not.toHaveBeenCalled();
  });

  it('no estorba a las acciones que no son listas', async () => {
    const onRecorte = jest.fn();
    await expect(runWithRowCap({ action: 'count' }, async () => 7, 3, onRecorte)).resolves.toBe(7);
    expect(onRecorte).not.toHaveBeenCalled();
  });
});

describe('cuándo se guarda un recorte', () => {
  const HORA = 3_600_000;

  it('el primero siempre', () => {
    expect(new ContadorDeRecortes().anotar('A|x', 0)).toBe(1);
  });

  it('dentro de la hora no guarda y a la hora guarda lo que lleva', () => {
    const contador = new ContadorDeRecortes();
    contador.anotar('A|x', 0);
    expect(contador.anotar('A|x', 1_000)).toBeNull();
    expect(contador.anotar('A|x', HORA - 1)).toBeNull();
    expect(contador.anotar('A|x', HORA)).toBe(3);
    expect(contador.anotar('A|x', HORA + 1)).toBeNull();
    expect(contador.anotar('A|x', 2 * HORA)).toBe(2);
  });

  it('cada consulta lleva su cuenta', () => {
    const contador = new ContadorDeRecortes();
    contador.anotar('A|x', 0);
    expect(contador.anotar('A|y', 1)).toBe(1);
    expect(contador.anotar('B|x', 2)).toBe(1);
  });
});

describe('PrismaService guarda el recorte en auditoría', () => {
  const armar = () => {
    const prisma = new PrismaService({ emit: jest.fn(), emitToCompany: jest.fn() } as any) as any;
    prisma.capLogger = { warn: jest.fn() };
    prisma.auditBuffer = { add: jest.fn(), flush: jest.fn() };
    return prisma;
  };
  const recorte = { modelo: 'ProductCT', tope: 5000, filtro: ['activo'] };

  it('deja una entrada sin empresa, con el modelo y los campos', () => {
    const prisma = armar();
    prisma.registrarRecorte(recorte);

    expect(prisma.auditBuffer.add).toHaveBeenCalledWith({
      entityType: 'PrismaRowCap',
      entityId: 0,
      action: 'RECORTE',
      changes: { modelo: 'ProductCT', tope: 5000, filtro: ['activo'], veces: 1 },
      userId: undefined,
    });
  });

  it('avisa en el log cada vez, pero guarda una sola por hora', () => {
    const prisma = armar();
    prisma.registrarRecorte(recorte);
    prisma.registrarRecorte(recorte);

    expect(prisma.capLogger.warn).toHaveBeenCalledTimes(2);
    expect(prisma.capLogger.warn.mock.calls[0][0]).toContain(
      'recortada al tope de 5000 filas: modelo=ProductCT filtro=activo.',
    );
    expect(prisma.auditBuffer.add).toHaveBeenCalledTimes(1);
  });
});
