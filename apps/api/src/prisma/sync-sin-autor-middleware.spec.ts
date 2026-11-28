import { PrismaClient } from '@prisma/client';
import { runWithTenant } from '../common/tenant/tenant-context.js';
import { PrismaService } from './prisma.service.js';

type Middleware = (params: any, next: (p: any) => Promise<any>) => Promise<any>;

/**
 * Prueba el middleware real de tiempo real y auditoría (el último que registra el constructor), no solo las funciones
 * sueltas: que un UPSERT de ProductCT sin autor no genere ni `entity:updated` ni una fila de auditoría, y que lo que
 * hace una persona sí.
 */
describe('middleware de tiempo real y auditoría · sincronización sin autor', () => {
  let alta: jest.SpyInstance;
  let gateway: { emit: jest.Mock; emitToCompany: jest.Mock };
  let buffer: { add: jest.Mock; flush: jest.Mock };
  let middleware: Middleware;
  let interruptorPrevio: string | undefined;

  beforeEach(() => {
    interruptorPrevio = process.env['AUDIT_SYNC_SIN_AUTOR'];
    delete process.env['AUDIT_SYNC_SIN_AUTOR'];
    const registrados: Middleware[] = [];
    alta = jest
      .spyOn(PrismaClient.prototype as any, '$use')
      .mockImplementation(((cb: Middleware) => {
        registrados.push(cb);
      }) as any);
    gateway = { emit: jest.fn(), emitToCompany: jest.fn() };
    const prisma = new PrismaService(gateway as any) as any;
    buffer = { add: jest.fn(), flush: jest.fn() };
    prisma.auditBuffer = buffer;
    middleware = registrados[registrados.length - 1];
  });

  afterEach(() => {
    alta.mockRestore();
    if (interruptorPrevio === undefined) delete process.env['AUDIT_SYNC_SIN_AUTOR'];
    else process.env['AUDIT_SYNC_SIN_AUTOR'] = interruptorPrevio;
  });

  const escribir = (model: string, action: string, result: unknown, args: unknown = { data: { a: 1 } }) =>
    middleware({ model, action, args }, async () => result);

  it('un UPSERT de ProductCT sin autor no avisa por socket ni se audita', async () => {
    await expect(escribir('ProductCT', 'upsert', { id: 5 })).resolves.toEqual({ id: 5 });
    expect(gateway.emit).not.toHaveBeenCalled();
    expect(gateway.emitToCompany).not.toHaveBeenCalled();
    expect(buffer.add).not.toHaveBeenCalled();
  });

  it('lo mismo con una empresa en el contexto pero sin persona (cron dentro de una empresa)', async () => {
    await runWithTenant({ companyId: 3, userId: null }, () => escribir('IntegraDevice', 'update', { id: 9 }));
    expect(gateway.emit).not.toHaveBeenCalled();
    expect(gateway.emitToCompany).not.toHaveBeenCalled();
    expect(buffer.add).not.toHaveBeenCalled();
  });

  it('si una persona dispara el sync a mano, se avisa a su empresa y se audita con su userId', async () => {
    await runWithTenant({ companyId: 3, userId: 7 }, () => escribir('ProductCT', 'upsert', { id: 5 }));
    expect(gateway.emitToCompany).toHaveBeenCalledWith(3, 'entity:updated', expect.objectContaining({ model: 'ProductCT' }));
    expect(buffer.add).toHaveBeenCalledTimes(1);
    expect(buffer.add).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'ProductCT', entityId: 5, action: 'UPSERT', companyId: 3, userId: 7 }),
    );
  });

  it('un UPDATE de Activity sin autor sigue avisando (global) y auditándose', async () => {
    await escribir('Activity', 'update', { id: 12 });
    expect(gateway.emit).toHaveBeenCalledWith('entity:updated', expect.objectContaining({ model: 'Activity' }));
    expect(buffer.add).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Activity', entityId: 12, action: 'UPDATE', userId: undefined }),
    );
  });

  it('los borrados masivos del sync siguen auditándose (cámaras dadas de baja)', async () => {
    await escribir('IntegraCamera', 'deleteMany', { count: 165 }, { where: { id: { in: [1, 2] } } });
    expect(gateway.emit).toHaveBeenCalledTimes(1);
    expect(buffer.add).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'IntegraCamera', action: 'BULK_DELETE' }),
    );
  });

  it('las actualizaciones masivas del sync que sí tocaron filas siguen auditándose (productos apagados)', async () => {
    await escribir('ProductCT', 'updateMany', { count: 22 }, { data: { active: false }, where: { id: { in: [1] } } });
    expect(gateway.emit).toHaveBeenCalledTimes(1);
    expect(buffer.add).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ProductCT',
        action: 'BULK_UPDATE',
        changes: expect.objectContaining({ affected: 22 }),
      }),
    );
  });

  it('Notification no se audita pero sigue avisando (las apps se refrescan con ella)', async () => {
    await runWithTenant({ companyId: 3, userId: 7 }, () => escribir('Notification', 'create', { id: 1 }));
    expect(gateway.emitToCompany).toHaveBeenCalledTimes(1);
    expect(buffer.add).not.toHaveBeenCalled();
  });

  it('la escritura de la propia auditoría no avisa ni se audita', async () => {
    await escribir('AuditLog', 'createMany', { count: 40 });
    expect(gateway.emit).not.toHaveBeenCalled();
    expect(buffer.add).not.toHaveBeenCalled();
  });

  it('con AUDIT_SYNC_SIN_AUTOR=1 todo vuelve a avisar y a auditarse como antes', async () => {
    process.env['AUDIT_SYNC_SIN_AUTOR'] = '1';
    await escribir('ProductCT', 'upsert', { id: 5 });
    expect(gateway.emit).toHaveBeenCalledTimes(1);
    expect(buffer.add).toHaveBeenCalledTimes(1);
  });

  it('una lectura no hace nada', async () => {
    await escribir('ProductCT', 'findMany', []);
    expect(gateway.emit).not.toHaveBeenCalled();
    expect(buffer.add).not.toHaveBeenCalled();
  });
});
