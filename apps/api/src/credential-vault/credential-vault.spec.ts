import { randomBytes } from 'crypto';
import { CredentialVaultService } from './credential-vault.service.js';
import { aadDe, cifrarContrasena, descifrarContrasena, leerLlaveBoveda } from './credential-vault-crypto.js';
import { HojaInvalida, esCuentaProtegida, leerHoja } from './carga-credenciales.js';
import { PLATFORM_DEVELOPER_EMAIL, PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';

const LLAVE_HEX = randomBytes(32).toString('hex');

describe('leerLlaveBoveda', () => {
  it('acepta 64 hex o 32 bytes en base64, y rechaza todo lo demás', () => {
    expect(leerLlaveBoveda(LLAVE_HEX)?.length).toBe(32);
    expect(leerLlaveBoveda(randomBytes(32).toString('base64'))?.length).toBe(32);
    for (const mala of [undefined, null, '', '   ', 'corta', 'x'.repeat(64), randomBytes(16).toString('base64'), randomBytes(31).toString('hex')]) {
      expect(leerLlaveBoveda(mala as any)).toBeNull();
    }
  });
});

describe('cifrado AES-256-GCM', () => {
  const llave = leerLlaveBoveda(LLAVE_HEX)!;
  const aad = aadDe(1, 7);

  it('ida y vuelta, con IV distinto cada vez y sin la contraseña a la vista', () => {
    const a = cifrarContrasena('Ejemplo-Prueba-1111!', llave, aad);
    const b = cifrarContrasena('Ejemplo-Prueba-1111!', llave, aad);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(a).not.toContain('Ejemplo');
    expect(descifrarContrasena(a, llave, aad)).toBe('Ejemplo-Prueba-1111!');
    expect(descifrarContrasena(b, llave, aad)).toBe('Ejemplo-Prueba-1111!');
  });

  it('acentos y símbolos sobreviven', () => {
    const p = 'Contraseña-ñandú-€-42!';
    expect(descifrarContrasena(cifrarContrasena(p, llave, aad), llave, aad)).toBe(p);
  });

  it('no descifra con otra llave, otra cuenta/empresa (AAD), ni si está alterado o mal formado', () => {
    const paquete = cifrarContrasena('secreta', llave, aad);
    expect(descifrarContrasena(paquete, leerLlaveBoveda(randomBytes(32).toString('hex'))!, aad)).toBeNull();
    expect(descifrarContrasena(paquete, llave, aadDe(1, 8))).toBeNull();
    expect(descifrarContrasena(paquete, llave, aadDe(2, 7))).toBeNull();
    const partes = paquete.split('.');
    expect(descifrarContrasena([...partes.slice(0, 3), partes[3] + 'A'].join('.'), llave, aad)).toBeNull();
    for (const basura of ['', 'v1', 'v2.a.b.c', 'v1.a.b', 'no es un paquete', null, undefined]) {
      expect(descifrarContrasena(basura as any, llave, aad)).toBeNull();
    }
  });

  it('no cifra una contraseña vacía', () => {
    expect(() => cifrarContrasena('', llave, aad)).toThrow();
  });
});

describe('CredentialVaultService', () => {
  const ORIGINAL = process.env['VAULT_ENCRYPTION_KEY'];
  afterEach(() => {
    process.env['VAULT_ENCRYPTION_KEY'] = ORIGINAL;
  });

  function crear() {
    const filas = new Map<number, any>();
    const prisma: any = {
      userCompany: { findFirst: jest.fn(async () => ({ companyId: 1 })) },
      credentialVaultEntry: {
        upsert: jest.fn(async ({ where, create, update }: any) => {
          const previa = filas.get(where.userId);
          const fila = previa ? { ...previa, ...update, updatedAt: new Date() } : { id: filas.size + 1, ...create, updatedAt: new Date() };
          filas.set(where.userId, fila);
          return fila;
        }),
        findUnique: jest.fn(async ({ where }: any) => filas.get(where.userId) ?? null),
        findMany: jest.fn(async ({ where }: any) => [...filas.values()].filter((f) => f.companyId === where.companyId && where.userId.in.includes(f.userId))),
        deleteMany: jest.fn(async ({ where }: any) => {
          filas.delete(where.userId);
          return { count: 1 };
        }),
      },
    };
    return { servicio: new CredentialVaultService(prisma), prisma, filas };
  }

  it('guarda cifrado (la base nunca ve la contraseña) y la revela solo en su empresa', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio, filas } = crear();
    expect(await servicio.guardar({ userId: 5, email: 'jose.ramirez@nexara.com.mx', password: 'Otra-Prueba-2222%', companyId: 1, porUserId: 9 })).toBe(true);
    expect(JSON.stringify([...filas.values()])).not.toContain('Otra-Prueba');
    expect(await servicio.revelar(5, 1)).toBe('Otra-Prueba-2222%');
    expect(await servicio.revelar(5, 2)).toBeNull(); // otra empresa
    expect(await servicio.revelar(6, 1)).toBeNull(); // sin fila
  });

  it('reemplaza la contraseña anterior de la misma cuenta', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio, filas } = crear();
    await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'primera-CLAVE-1', companyId: 1 });
    await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'segunda-CLAVE-2', companyId: 1 });
    expect(filas.size).toBe(1);
    expect(await servicio.revelar(5, 1)).toBe('segunda-CLAVE-2');
  });

  it('nunca guarda la del dueño ni la de la cuenta de desarrollo', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio, prisma } = crear();
    expect(await servicio.guardar({ userId: 1, email: PLATFORM_OWNER_EMAIL, password: 'x-Clave-1', companyId: 1 })).toBe(false);
    expect(await servicio.guardar({ userId: 2, email: PLATFORM_DEVELOPER_EMAIL.toUpperCase(), password: 'x-Clave-1', companyId: 1 })).toBe(false);
    expect(prisma.credentialVaultEntry.upsert).not.toHaveBeenCalled();
  });

  it('sin llave válida no guarda ni revela, y no lanza (el alta de usuarios no se rompe)', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = '';
    const { servicio, prisma } = crear();
    expect(servicio.disponible()).toBe(false);
    expect(await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'algo-Clave-1', companyId: 1 })).toBe(false);
    expect(prisma.credentialVaultEntry.upsert).not.toHaveBeenCalled();
    expect(await servicio.revelar(5, 1)).toBeNull();
  });

  it('un error de base de datos devuelve false en vez de lanzar', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio, prisma } = crear();
    prisma.credentialVaultEntry.upsert.mockRejectedValueOnce(new Error('db caída'));
    expect(await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'algo-Clave-1', companyId: 1 })).toBe(false);
  });

  it('sin empresa explícita usa la predeterminada de la cuenta', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio, filas } = crear();
    await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'algo-Clave-1' });
    expect(filas.get(5).companyId).toBe(1);
  });

  it('guardadas() dice quién tiene contraseña sin descifrar nada; olvidar() la quita', async () => {
    process.env['VAULT_ENCRYPTION_KEY'] = LLAVE_HEX;
    const { servicio } = crear();
    await servicio.guardar({ userId: 5, email: 'a@nexara.com.mx', password: 'algo-Clave-1', companyId: 1 });
    const g = await servicio.guardadas(1, [5, 6]);
    expect([...g.keys()]).toEqual([5]);
    expect((await servicio.guardadas(1, [])).size).toBe(0);
    await servicio.olvidar(5);
    expect((await servicio.guardadas(1, [5])).size).toBe(0);
  });
});

describe('leerHoja', () => {
  it('normaliza correos e ignora las demás columnas', () => {
    expect(leerHoja([{ email: ' Jose.Ramirez@Nexara.com.mx ', password: 'abc', puesto: 'Soporte' }])).toEqual([
      { email: 'jose.ramirez@nexara.com.mx', password: 'abc' },
    ]);
  });

  it('rechaza lo que no sea una lista, filas sin correo o sin contraseña y correos repetidos, sin filtrar contraseñas', () => {
    expect(() => leerHoja({} as any)).toThrow(HojaInvalida);
    expect(() => leerHoja([{ password: 'x' }])).toThrow(/falta el correo/);
    expect(() => leerHoja([{ email: 'a@b.com' }])).toThrow(/falta la contraseña/);
    expect(() => leerHoja([{ email: 'a@b.com', password: 'p1' }, { email: 'A@B.com', password: 'p2' }])).toThrow(/repetido/);
    try {
      leerHoja([{ email: 'a@b.com', password: 'SecretaMuySecreta9' }, { email: 'a@b.com', password: 'SecretaMuySecreta9' }]);
    } catch (e) {
      expect((e as Error).message).not.toContain('SecretaMuySecreta9');
    }
  });

  it('esCuentaProtegida: solo el dueño y la cuenta de desarrollo', () => {
    expect(esCuentaProtegida(PLATFORM_OWNER_EMAIL)).toBe(true);
    expect(esCuentaProtegida(PLATFORM_DEVELOPER_EMAIL)).toBe(true);
    expect(esCuentaProtegida('jose.ramirez@nexara.com.mx')).toBe(false);
    expect(esCuentaProtegida('play.review@nexara.com.mx')).toBe(false);
  });
});
