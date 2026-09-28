import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountAccessService } from './account-access.service.js';
import { VIGENCIA_FICHA_MS, emitirFicha, fichaValida, generarContrasenaSegura } from './account-access-token.js';
import { PLATFORM_DEVELOPER_EMAIL, PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';

const SECRETO = 'secreto-de-prueba-largo-y-aleatorio';

describe('ficha de acceso', () => {
  it('sirve para su dueño, se rechaza para otro usuario, otro secreto o alterada', () => {
    const { ficha } = emitirFicha(1, SECRETO);
    expect(fichaValida(ficha, 1, SECRETO)).toBe(true);
    expect(fichaValida(ficha, 2, SECRETO)).toBe(false);
    expect(fichaValida(ficha, 1, 'otro-secreto')).toBe(false);
    const [cuerpo, firma] = ficha.split('.');
    expect(fichaValida(`${cuerpo}x.${firma}`, 1, SECRETO)).toBe(false);
    expect(fichaValida(`${cuerpo}.${firma}x`, 1, SECRETO)).toBe(false);
    for (const basura of [undefined, null, '', 'abc', 'a.b.c', 42]) expect(fichaValida(basura, 1, SECRETO)).toBe(false);
  });

  it('dura 5 minutos', () => {
    const t0 = 1_000_000;
    const { ficha, venceEn } = emitirFicha(1, SECRETO, t0);
    expect(venceEn - t0).toBe(VIGENCIA_FICHA_MS);
    expect(fichaValida(ficha, 1, SECRETO, t0 + VIGENCIA_FICHA_MS - 1)).toBe(true);
    expect(fichaValida(ficha, 1, SECRETO, t0 + VIGENCIA_FICHA_MS)).toBe(false);
  });

  it('sin secreto no se emite ni se acepta nada', () => {
    expect(() => emitirFicha(1, '')).toThrow();
    expect(fichaValida('x.y', 1, '')).toBe(false);
  });
});

describe('generarContrasenaSegura', () => {
  it('14 caracteres con mayúscula, minúscula y número, sin ambiguos, y distinta cada vez', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const p = generarContrasenaSegura();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
      vistas.add(p);
    }
    expect(vistas.size).toBe(200);
  });
});

describe('AccountAccessService', () => {
  const ORIGINAL_SECRET = process.env['JWT_SECRET'];
  beforeAll(() => {
    process.env['JWT_SECRET'] = SECRETO;
  });
  afterAll(() => {
    process.env['JWT_SECRET'] = ORIGINAL_SECRET;
  });

  const HASH = bcrypt.hashSync('MiClaveDeDueno9', 4);

  function crear(over: { failed?: number; lockedUntil?: Date | null } = {}) {
    const usuarios: Record<number, any> = {
      1: { id: 1, email: PLATFORM_OWNER_EMAIL, passwordHash: HASH, isActive: true, failedLoginCount: over.failed ?? 0, lockedUntil: over.lockedUntil ?? null },
      2: { id: 2, email: 'jose.ramirez@nexara.com.mx', passwordHash: 'x', isActive: true, failedLoginCount: 0, lockedUntil: null },
      9: { id: 9, email: PLATFORM_DEVELOPER_EMAIL, passwordHash: 'x', isActive: true, failedLoginCount: 0, lockedUntil: null },
    };
    const update = jest.fn(async ({ where, data }: any) => ({ ...usuarios[where.id], ...data }));
    const prisma: any = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => usuarios[where.id] ?? null),
        findFirst: jest.fn(async ({ where }: any) => usuarios[where.id] ?? null),
        findMany: jest.fn(async () => [
          { id: 1, nombre: 'Christian', email: PLATFORM_OWNER_EMAIL, roleKey: 'ceo', isActive: true, passwordChangedAt: null },
          { id: 2, nombre: 'Antonio', email: 'jose.ramirez@nexara.com.mx', roleKey: 'ing_soporte', isActive: true, passwordChangedAt: new Date('2026-09-01T00:00:00Z') },
          { id: 9, nombre: 'Dev', email: PLATFORM_DEVELOPER_EMAIL, roleKey: 'ceo', isActive: true, passwordChangedAt: null },
        ]),
        update,
      },
    };
    const log = jest.fn(async () => ({}));
    const revokeAllUserSessions = jest.fn(async () => ({ revoked: 2 }));
    const vault = {
      disponible: jest.fn(() => true),
      guardar: jest.fn(async () => true),
      olvidar: jest.fn(async () => undefined),
      revelar: jest.fn(async (id: number) => (id === 2 ? 'Guardada-Prueba-3333' : null)),
      guardadas: jest.fn(async () => new Map<number, Date>([[2, new Date('2026-09-28T12:00:00Z')]])),
    };
    const servicio = new AccountAccessService(prisma, { log } as any, { revokeAllUserSessions } as any, vault as any);
    return { servicio, prisma, update, log, revokeAllUserSessions, vault };
  }

  it('solo el dueño puede entrar: cualquier otra persona, cliente o sesión sin usuario recibe 403', async () => {
    const { servicio } = crear();
    expect(await servicio.puedeEntrar({ id: 1 })).toBe(true);
    for (const otro of [{ id: 2 }, { id: 9 }, { id: 999 }, { id: null }, { id: 1, isClient: true }]) {
      expect(await servicio.puedeEntrar(otro as any)).toBe(false);
      await expect(servicio.desbloquear(otro as any, 'MiClaveDeDueno9', 7)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('con su contraseña correcta recibe una ficha de 5 minutos y queda en la auditoría', async () => {
    const { servicio, log } = crear({ failed: 2 });
    const r = await servicio.desbloquear({ id: 1 }, 'MiClaveDeDueno9', 7);
    expect(fichaValida(r.ficha, 1, SECRETO)).toBe(true);
    expect(new Date(r.venceEn).getTime()).toBeGreaterThan(Date.now());
    expect((log.mock.calls[0] as any[])[0].action).toBe('ACCOUNT_ACCESS_UNLOCK');
  });

  it('contraseña equivocada: 401, cuenta un fallo y a los 5 bloquea 15 minutos', async () => {
    const { servicio, update, log } = crear({ failed: 3 });
    await expect(servicio.desbloquear({ id: 1 }, 'incorrecta', 7)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((update.mock.calls[0] as any[])[0].data.failedLoginCount).toBe(4);
    expect((update.mock.calls[0] as any[])[0].data.lockedUntil).toBeUndefined();
    expect((log.mock.calls[0] as any[])[0].action).toBe('ACCOUNT_ACCESS_DENIED');

    const quinto = crear({ failed: 4 });
    await expect(quinto.servicio.desbloquear({ id: 1 }, 'incorrecta', 7)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((quinto.update.mock.calls[0] as any[])[0].data.lockedUntil).toBeInstanceOf(Date);
  });

  it('bloqueada: ni siquiera compara la contraseña', async () => {
    const { servicio } = crear({ lockedUntil: new Date(Date.now() + 10 * 60_000) });
    await expect(servicio.desbloquear({ id: 1 }, 'MiClaveDeDueno9', 7)).rejects.toThrow(/bloqueada temporalmente/);
  });

  it('sin ficha (o con una ajena/vencida) no se lista ni se restablece nada', async () => {
    const { servicio, update } = crear();
    await expect(servicio.listar({ id: 1 }, undefined, 7)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(servicio.restablecer({ id: 1 }, 'a.b', 2, 7)).rejects.toBeInstanceOf(UnauthorizedException);
    const ajena = emitirFicha(2, SECRETO).ficha;
    await expect(servicio.restablecer({ id: 1 }, ajena, 2, 7)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
  });

  it('la lista no incluye al dueño ni a la cuenta de desarrollo, y nunca trae contraseñas ni hashes', async () => {
    const { servicio } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    const lista = await servicio.listar({ id: 1 }, ficha, 7);
    expect(lista.map((u) => u.email)).toEqual(['jose.ramirez@nexara.com.mx']);
    expect(JSON.stringify(lista)).not.toMatch(/passwordHash|"password"|$2[aby]$/);
  });

  it('restablecer: pone una contraseña nueva (guardada solo como hash), cierra sus sesiones, la muestra una vez y audita sin ella', async () => {
    const { servicio, update, log, revokeAllUserSessions } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    const r = await servicio.restablecer({ id: 1 }, ficha, 2, 7);

    expect(r).toMatchObject({ id: 2, email: 'jose.ramirez@nexara.com.mx' });
    expect(r.password).toHaveLength(14);
    const datos = (update.mock.calls[0] as any[])[0].data;
    expect(datos.passwordHash).not.toBe(r.password);
    expect(bcrypt.compareSync(r.password, datos.passwordHash)).toBe(true);
    expect(datos).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    expect(datos.passwordChangedAt).toBeInstanceOf(Date);
    expect(revokeAllUserSessions).toHaveBeenCalledWith(2, 7, 'admin_password_reset');

    const auditoria = JSON.stringify(log.mock.calls);
    expect(auditoria).toContain('ACCOUNT_PASSWORD_RESET');
    expect(auditoria).not.toContain(r.password);
  });

  it('la lista dice quién tiene contraseña guardada, sin traerla', async () => {
    const { servicio } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    const lista = await servicio.listar({ id: 1 }, ficha, 7);
    expect(lista[0]).toMatchObject({ email: 'jose.ramirez@nexara.com.mx', guardada: true, guardadaEl: '2026-09-28T12:00:00.000Z' });
    expect(JSON.stringify(lista)).not.toContain('Guardada-Prueba');
  });

  it('revelar: con ficha muestra la contraseña guardada de UNA cuenta y audita la vista sin ella', async () => {
    const { servicio, log } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    const r = await servicio.revelar({ id: 1 }, ficha, 2, 7);
    expect(r).toMatchObject({ id: 2, email: 'jose.ramirez@nexara.com.mx', password: 'Guardada-Prueba-3333' });
    const auditoria = JSON.stringify(log.mock.calls);
    expect(auditoria).toContain('ACCOUNT_PASSWORD_REVEAL');
    expect(auditoria).not.toContain('Guardada-Prueba-3333');
  });

  it('revelar: sin ficha, con ficha ajena, para el dueño/desarrollo o sin nada guardado no entrega nada', async () => {
    const { servicio, vault, prisma } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    await expect(servicio.revelar({ id: 1 }, undefined, 2, 7)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(servicio.revelar({ id: 1 }, emitirFicha(2, SECRETO).ficha, 2, 7)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(servicio.revelar({ id: 2 }, ficha, 2, 7)).rejects.toBeInstanceOf(ForbiddenException); // no es el dueño
    await expect(servicio.revelar({ id: 1 }, ficha, 1, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.revelar({ id: 1 }, ficha, 9, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(vault.revelar).not.toHaveBeenCalled();
    prisma.user.findFirst.mockImplementationOnce(async () => ({ id: 3, nombre: 'Sin bóveda', email: 'otro@nexara.com.mx' }));
    await expect(servicio.revelar({ id: 1 }, ficha, 3, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restablecer también guarda la contraseña nueva en la bóveda (y olvida la vieja si no puede)', async () => {
    const { servicio, vault } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    const r = await servicio.restablecer({ id: 1 }, ficha, 2, 7);
    expect(vault.guardar).toHaveBeenCalledWith(expect.objectContaining({ userId: 2, password: r.password, companyId: 7, porUserId: 1 }));
    expect(vault.olvidar).not.toHaveBeenCalled();

    vault.guardar.mockResolvedValueOnce(false as any);
    await servicio.restablecer({ id: 1 }, ficha, 2, 7);
    expect(vault.olvidar).toHaveBeenCalledWith(2);
  });

  it('no restablece al dueño ni a la cuenta de desarrollo, ni a quien no es de la empresa', async () => {
    const { servicio, update, prisma } = crear();
    const { ficha } = emitirFicha(1, SECRETO);
    await expect(servicio.restablecer({ id: 1 }, ficha, 1, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.restablecer({ id: 1 }, ficha, 9, 7)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(servicio.restablecer({ id: 1 }, ficha, 555, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
