import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { runWithTenantScope } from '../prisma/prisma.service.js';

/**
 * Avisos con la empresa vacía (24 % de la tabla en producción: los crons los crean sin contexto de empresa).
 *
 * Este spec NO simula el aislamiento: cada llamada de `notification` pasa por el mismo `runWithTenantScope` que corre el
 * middleware de PrismaService, y solo el final de la cadena es una tabla en memoria. Así se ve lo que de verdad pasa con
 * un `update({ where: { id } })` sobre una fila sin empresa: el middleware lo vuelve `updateMany` con la empresa activa,
 * cuenta 0 y devuelve null (era el «Cannot read properties of null (reading 'userId')» del PATCH /notifications/:id/read).
 */

const EMPRESA = 5;
const OTRA_EMPRESA = 9;

type Fila = {
  id: number;
  userId: number;
  companyId: number | null;
  isRead: boolean;
  readAt: Date | null;
  triggerUserId?: number | null;
  [campo: string]: unknown;
};

/** Entiende lo que usa el servicio: igualdad, `in`, `not`, `OR`, `AND`. Una clave desconocida revienta a propósito. */
function coincide(fila: Fila, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === 'AND') return (Array.isArray(valor) ? valor : [valor]).every((parte) => coincide(fila, parte));
    if (clave === 'OR') return (valor as any[]).some((parte) => coincide(fila, parte));
    if (clave === 'NOT') return !(Array.isArray(valor) ? valor : [valor]).some((parte) => coincide(fila, parte));
    const actual = fila[clave] === undefined ? null : fila[clave];
    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      const op = valor as { in?: unknown[]; not?: unknown };
      if (Array.isArray(op.in)) return op.in.includes(actual);
      if ('not' in op) return actual !== op.not;
      throw new Error(`Filtro no soportado por el spec: ${clave}`);
    }
    return actual === (valor === undefined ? null : valor);
  });
}

function armar(filas: Fila[], opciones: { empresaActiva?: number | null } = {}) {
  const empresaActiva = opciones.empresaActiva === undefined ? EMPRESA : opciones.empresaActiva;
  const tabla: Fila[] = filas.map((fila) => ({ ...fila }));
  const llamadas: Array<{ action: string; args: any }> = [];

  const usuarios: Record<number, { id: number; nombre: string }> = {
    3: { id: 3, nombre: 'Quien disparó el aviso' },
  };

  const conRelaciones = (fila: Fila, args: any) =>
    args?.include?.triggerUser
      ? { ...fila, triggerUser: fila.triggerUserId != null ? usuarios[fila.triggerUserId] ?? null : null }
      : { ...fila };

  // Último eslabón de la cadena: la base de datos. Lo que llega aquí ya pasó por el aislamiento por empresa.
  const base = async (params: { action: string; args?: any }) => {
    llamadas.push({ action: params.action, args: params.args });
    const { action, args } = params;
    if (action === 'findFirst') {
      const fila = tabla.find((f) => coincide(f, args?.where));
      return fila ? conRelaciones(fila, args) : null;
    }
    if (action === 'findMany') return tabla.filter((f) => coincide(f, args?.where)).map((f) => conRelaciones(f, args));
    if (action === 'updateMany') {
      const afectadas = tabla.filter((f) => coincide(f, args?.where));
      afectadas.forEach((f) => Object.assign(f, args.data));
      return { count: afectadas.length };
    }
    if (action === 'deleteMany') {
      const quedan = tabla.filter((f) => !coincide(f, args?.where));
      const count = tabla.length - quedan.length;
      tabla.splice(0, tabla.length, ...quedan);
      return { count };
    }
    throw new Error(`Acción sin soporte en el spec: ${action}`);
  };

  const delegado = (accion: string) => (args?: any) =>
    runWithTenantScope({ model: 'Notification', action: accion, args: structuredCloneSeguro(args) }, empresaActiva, base);

  const prisma: any = {
    notification: {
      findFirst: delegado('findFirst'),
      findMany: delegado('findMany'),
      update: delegado('update'),
      updateMany: delegado('updateMany'),
      delete: delegado('delete'),
      deleteMany: delegado('deleteMany'),
    },
    // Ventas: el vendedor 7 y el administrador 8 son de la empresa activa.
    user: { findMany: jest.fn(async () => [{ id: 7 }]) },
  };
  const gateway = { notifyUser: jest.fn() };
  const servicio = new NotificationsService(prisma, { sendToUser: jest.fn() } as any, gateway);
  return { servicio, prisma, gateway, tabla, llamadas };
}

/** El middleware real puede reescribir args; el spec le pasa una copia para no ver mutaciones del servicio. */
function structuredCloneSeguro<T>(valor: T): T {
  if (valor === undefined) return valor;
  return JSON.parse(JSON.stringify(valor), (_clave, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v));
}

const aviso = (extra: Partial<Fila> = {}): Fila => ({
  id: 1,
  userId: 10,
  companyId: null,
  isRead: false,
  readAt: null,
  triggerUserId: 3,
  ...extra,
});

describe('Avisos sin empresa · caracterización del aislamiento', () => {
  it('el update por id de la forma antigua sobre una fila sin empresa devuelve null (por eso se leía userId de null)', async () => {
    const { prisma, tabla } = armar([aviso()]);
    const resultado = await prisma.notification.update({
      where: { id: 1 },
      data: { isRead: true, readAt: new Date() },
      include: { triggerUser: true },
    });
    expect(resultado).toBeNull();
    expect(tabla[0].isRead).toBe(false);
  });

  it('el delete por id de la forma antigua sobre una fila sin empresa no borra nada (y respondía 200)', async () => {
    const { prisma, tabla } = armar([aviso()]);
    const resultado = await prisma.notification.delete({ where: { id: 1 } });
    expect(resultado).toEqual({ count: 0 });
    expect(tabla).toHaveLength(1);
  });
});

describe('NotificationsService.markAsRead con avisos sin empresa', () => {
  it('(a) marca como leído un aviso sin empresa, le pone la empresa activa y lo devuelve con quien lo disparó', async () => {
    const { servicio, tabla, gateway } = armar([aviso()]);

    const lectura = await servicio.markAsRead(1, 10, EMPRESA);

    expect(lectura.isRead).toBe(true);
    expect(lectura.readAt).toBeInstanceOf(Date);
    expect(lectura.companyId).toBe(EMPRESA);
    expect(lectura.triggerUser).toEqual({ id: 3, nombre: 'Quien disparó el aviso' });
    expect(tabla[0]).toMatchObject({ isRead: true, companyId: EMPRESA });
    expect(gateway.notifyUser).toHaveBeenCalledWith(10, { event: 'notification:read', notificationId: 1 });
  });

  it('marca un aviso que ya tenía la empresa activa, sin cambiarle la empresa', async () => {
    const { servicio, tabla } = armar([aviso({ companyId: EMPRESA })]);
    const lectura = await servicio.markAsRead(1, 10, EMPRESA);
    expect(lectura.isRead).toBe(true);
    expect(tabla[0].companyId).toBe(EMPRESA);
  });

  it('(b) un aviso de otra empresa responde «no encontrada» y no se toca', async () => {
    const { servicio, tabla } = armar([aviso({ companyId: OTRA_EMPRESA })]);
    await expect(servicio.markAsRead(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
    expect(tabla[0]).toMatchObject({ isRead: false, companyId: OTRA_EMPRESA });
  });

  it('(c) un aviso de otra persona responde «no encontrada», aunque no tenga empresa', async () => {
    const { servicio, tabla } = armar([aviso({ userId: 11 })]);
    await expect(servicio.markAsRead(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
    expect(tabla[0]).toMatchObject({ isRead: false, companyId: null });
  });

  it('un aviso que no existe responde «no encontrada»', async () => {
    const { servicio } = armar([]);
    await expect(servicio.markAsRead(99, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin empresa activa no se toca ningún aviso (cierra por defecto)', async () => {
    const { servicio, tabla } = armar([aviso()], { empresaActiva: null });
    await expect(servicio.markAsRead(1, 10, null)).rejects.toBeInstanceOf(NotFoundException);
    expect(tabla[0].isRead).toBe(false);
  });

  it('(d) uno que ya estaba leído se vuelve a marcar sin error', async () => {
    const leidoAntes = new Date('2026-11-20T15:00:00.000Z');
    const { servicio } = armar([aviso({ companyId: EMPRESA, isRead: true, readAt: leidoAntes })]);
    const lectura = await servicio.markAsRead(1, 10, EMPRESA);
    expect(lectura.isRead).toBe(true);
    expect(lectura.readAt).toBeInstanceOf(Date);
  });

  it('(e) dos toques seguidos, o a la vez, terminan bien (las apps reintentaban hasta 7 veces)', async () => {
    const seguidos = armar([aviso()]);
    await seguidos.servicio.markAsRead(1, 10, EMPRESA);
    await expect(seguidos.servicio.markAsRead(1, 10, EMPRESA)).resolves.toMatchObject({ isRead: true });

    const juntos = armar([aviso()]);
    const [uno, dos] = await Promise.all([
      juntos.servicio.markAsRead(1, 10, EMPRESA),
      juntos.servicio.markAsRead(1, 10, EMPRESA),
    ]);
    expect(uno.isRead).toBe(true);
    expect(dos.isRead).toBe(true);
    expect(juntos.tabla[0].companyId).toBe(EMPRESA);
  });

  it('solo marca el aviso pedido, no otros de la misma persona', async () => {
    const { servicio, tabla } = armar([aviso({ id: 1 }), aviso({ id: 2 })]);
    await servicio.markAsRead(1, 10, EMPRESA);
    expect(tabla.find((f) => f.id === 2)).toMatchObject({ isRead: false, companyId: null });
  });

  it('no usa update ni delete por id: todo va por consultas que ya traen el alcance de empresa', async () => {
    const { servicio, llamadas } = armar([aviso()]);
    await servicio.markAsRead(1, 10, EMPRESA);
    expect(llamadas.map((llamada) => llamada.action)).toEqual(['findFirst', 'updateMany', 'findFirst']);
  });
});

describe('NotificationsService.deleteNotification con avisos sin empresa', () => {
  it('(f) borra un aviso sin empresa y responde con la cuenta, igual que antes', async () => {
    const { servicio, tabla } = armar([aviso(), aviso({ id: 2 })]);
    const respuesta = await servicio.deleteNotification(1, 10, EMPRESA);
    expect(respuesta).toEqual({ count: 1 });
    expect(tabla.map((f) => f.id)).toEqual([2]);
  });

  it('borra uno que tiene la empresa activa', async () => {
    const { servicio, tabla } = armar([aviso({ companyId: EMPRESA })]);
    await expect(servicio.deleteNotification(1, 10, EMPRESA)).resolves.toEqual({ count: 1 });
    expect(tabla).toHaveLength(0);
  });

  it('(f) responde «no encontrada» si el aviso es de otra persona o de otra empresa, y no borra nada', async () => {
    const ajeno = armar([aviso({ userId: 11 })]);
    await expect(ajeno.servicio.deleteNotification(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
    expect(ajeno.tabla).toHaveLength(1);

    const deOtraEmpresa = armar([aviso({ companyId: OTRA_EMPRESA })]);
    await expect(deOtraEmpresa.servicio.deleteNotification(1, 10, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deOtraEmpresa.tabla).toHaveLength(1);
  });

  it('un segundo borrado del mismo aviso responde «no encontrada» (ya no hay nada que borrar)', async () => {
    const { servicio } = armar([aviso()]);
    await servicio.deleteNotification(1, 10, EMPRESA);
    await expect(servicio.deleteNotification(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('NotificationsService · avisos del panel de ventas con empresa vacía', () => {
  const vendedor = { id: 7, permissions: [] };
  const administrador = { id: 8, isSuperAdmin: true, permissions: [] };

  it('(g) marca como leído un aviso de ventas sin empresa y lo devuelve con quien lo disparó', async () => {
    const { servicio, gateway, tabla } = armar([aviso({ userId: 7 })]);
    const lectura = await servicio.markSalesNotificationAsRead(vendedor, 1, EMPRESA);
    expect(lectura.isRead).toBe(true);
    expect(lectura.triggerUser).toEqual({ id: 3, nombre: 'Quien disparó el aviso' });
    expect(tabla[0].isRead).toBe(true);
    expect(gateway.notifyUser).toHaveBeenCalledWith(7, { event: 'notification:read', notificationId: 1 });
  });

  it('(g) el administrador marca el aviso de un vendedor y se avisa al dueño del aviso', async () => {
    const { servicio, gateway } = armar([aviso({ userId: 7 })]);
    await servicio.markSalesNotificationAsRead(administrador, 1, EMPRESA);
    expect(gateway.notifyUser).toHaveBeenCalledWith(7, { event: 'notification:read', notificationId: 1 });
  });

  it('(g) borra un aviso de ventas sin empresa', async () => {
    const { servicio, tabla } = armar([aviso({ userId: 7 })]);
    await expect(servicio.deleteSalesNotification(vendedor, 1, EMPRESA)).resolves.toEqual({ count: 1 });
    expect(tabla).toHaveLength(0);
  });

  it('(g) el vendedor no puede tocar el aviso de otro vendedor y el de otra empresa no existe para él', async () => {
    const deOtro = armar([aviso({ userId: 12 })]);
    await expect(deOtro.servicio.markSalesNotificationAsRead(vendedor, 1, EMPRESA)).rejects.toThrow();
    await expect(deOtro.servicio.deleteSalesNotification(vendedor, 1, EMPRESA)).rejects.toThrow();
    expect(deOtro.tabla).toHaveLength(1);

    const deOtraEmpresa = armar([aviso({ userId: 7, companyId: OTRA_EMPRESA })]);
    await expect(deOtraEmpresa.servicio.markSalesNotificationAsRead(vendedor, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(deOtraEmpresa.servicio.deleteSalesNotification(vendedor, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deOtraEmpresa.tabla).toHaveLength(1);
  });
});

describe('NotificationsService · el aviso desaparece entre la lectura previa y la escritura', () => {
  // Dos pestañas, o dos empresas, sobre el mismo aviso a la vez: antes era un 500, ahora «no encontrada».
  const vaciarTabla = (tabla: Fila[]) => tabla.splice(0, tabla.length);

  it('marcar: si se borra justo antes del updateMany, responde «no encontrada»', async () => {
    const { servicio, prisma, tabla } = armar([aviso()]);
    const original = prisma.notification.updateMany;
    prisma.notification.updateMany = (args: any) => {
      vaciarTabla(tabla);
      return original(args);
    };
    await expect(servicio.markAsRead(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marcar: si se borra entre el updateMany y la lectura, responde «no encontrada»', async () => {
    const { servicio, prisma, tabla } = armar([aviso()]);
    const original = prisma.notification.updateMany;
    prisma.notification.updateMany = async (args: any) => {
      const resultado = await original(args);
      vaciarTabla(tabla);
      return resultado;
    };
    await expect(servicio.markAsRead(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borrar: si ya lo borró otra pestaña antes del deleteMany, responde «no encontrada»', async () => {
    const { servicio, prisma, tabla } = armar([aviso()]);
    const original = prisma.notification.deleteMany;
    prisma.notification.deleteMany = (args: any) => {
      vaciarTabla(tabla);
      return original(args);
    };
    await expect(servicio.deleteNotification(1, 10, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ventas: marcar y borrar con el aviso ya desaparecido responden «no encontrada»', async () => {
    const vendedor = { id: 7, permissions: [] };
    const marcar = armar([aviso({ userId: 7 })]);
    const updateMany = marcar.prisma.notification.updateMany;
    marcar.prisma.notification.updateMany = (args: any) => {
      vaciarTabla(marcar.tabla);
      return updateMany(args);
    };
    await expect(marcar.servicio.markSalesNotificationAsRead(vendedor, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const borrar = armar([aviso({ userId: 7 })]);
    const deleteMany = borrar.prisma.notification.deleteMany;
    borrar.prisma.notification.deleteMany = (args: any) => {
      vaciarTabla(borrar.tabla);
      return deleteMany(args);
    };
    await expect(borrar.servicio.deleteSalesNotification(vendedor, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
