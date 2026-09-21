/**
 * El guardia vive en `prisma/` y no aquí: sus únicos consumidores son los dos
 * sembradores, y la imagen de producción solo lleva `dist/` de `src`, así que
 * un import a `../src/...` reventaba dentro del contenedor —`Cannot find
 * module`— al sembrar. La prueba se queda bajo `src` porque el `rootDir` de
 * Jest es `src`.
 */
import { DEMO_COMPANY_SLUG, DemoTenantGuardError, assertDemoTenant } from '../../../prisma/demo-tenant.js';
import { resolveDemoCompany, seedPlayDemoData } from '../../../prisma/seed-play-demo-data';

const DEMO_OK = { id: 2, slug: DEMO_COMPANY_SLUG, isPrimary: false, isActive: true };

/**
 * Doble de `PrismaClient` que solo sabe leer la empresa y que **cuenta**
 * cualquier intento de escritura: si el guardia falla, el fallo tiene que ser
 * "no se escribió nada", no "se escribió menos de la cuenta".
 */
function prismaFalso(empresa: typeof DEMO_OK | null) {
  const escrituras: string[] = [];
  const escritor = (modelo: string) =>
    new Proxy(
      {},
      {
        get: (_t, metodo: string) => {
          return (...args: unknown[]) => {
            escrituras.push(`${modelo}.${metodo}`);
            return Promise.resolve(args.length ? { id: 1 } : { id: 1 });
          };
        },
      },
    );

  const cliente = new Proxy(
    {
      companyProfile: {
        findUnique: jest.fn().mockResolvedValue(empresa),
      },
    } as Record<string, unknown>,
    {
      get: (target, prop: string) => {
        if (prop in target) return target[prop];
        return escritor(prop);
      },
    },
  );

  return { cliente, escrituras };
}

describe('assertDemoTenant', () => {
  it('devuelve el id cuando la empresa es el tenant demo', () => {
    expect(assertDemoTenant(DEMO_OK)).toBe(2);
  });

  it('aborta si la empresa está marcada como primaria', () => {
    expect(() => assertDemoTenant({ ...DEMO_OK, isPrimary: true })).toThrow(DemoTenantGuardError);
    expect(() => assertDemoTenant({ ...DEMO_OK, isPrimary: true })).toThrow(/primaria/i);
  });

  it('aborta si el slug no es el del tenant demo, aunque no sea primaria', () => {
    expect(() => assertDemoTenant({ id: 1, slug: 'nexara', isPrimary: false })).toThrow(DemoTenantGuardError);
    expect(() => assertDemoTenant({ id: 1, slug: null, isPrimary: false })).toThrow(DemoTenantGuardError);
  });

  it('aborta si no hay empresa o el id no sirve', () => {
    expect(() => assertDemoTenant(null)).toThrow(DemoTenantGuardError);
    expect(() => assertDemoTenant(undefined)).toThrow(DemoTenantGuardError);
    expect(() => assertDemoTenant({ ...DEMO_OK, id: 0 })).toThrow(DemoTenantGuardError);
    expect(() => assertDemoTenant({ ...DEMO_OK, id: null })).toThrow(DemoTenantGuardError);
  });

  it('no acepta que la empresa primaria se cuele renombrando su slug', () => {
    // Los dos controles son redundantes a propósito: cada uno solo dejaría pasar
    // este caso si el otro no existiera.
    expect(() => assertDemoTenant({ id: 1, slug: DEMO_COMPANY_SLUG, isPrimary: true })).toThrow(
      DemoTenantGuardError,
    );
  });
});

describe('resolveDemoCompany', () => {
  it('resuelve el tenant por slug, nunca por un id escrito a mano', async () => {
    const { cliente } = prismaFalso(DEMO_OK);
    await expect(resolveDemoCompany(cliente as never)).resolves.toBe(2);
    expect((cliente as never as { companyProfile: { findUnique: jest.Mock } }).companyProfile.findUnique)
      .toHaveBeenCalledWith(expect.objectContaining({ where: { slug: DEMO_COMPANY_SLUG } }));
  });

  it('aborta si el slug resuelve a la empresa primaria', async () => {
    const { cliente } = prismaFalso({ ...DEMO_OK, id: 1, isPrimary: true });
    await expect(resolveDemoCompany(cliente as never)).rejects.toThrow(DemoTenantGuardError);
  });

  it('aborta si el tenant demo todavía no existe', async () => {
    const { cliente } = prismaFalso(null);
    await expect(resolveDemoCompany(cliente as never)).rejects.toThrow(DemoTenantGuardError);
  });
});

describe('seedPlayDemoData', () => {
  it('se niega a escribir en la empresa primaria y no toca ni una tabla', async () => {
    const { cliente, escrituras } = prismaFalso({ ...DEMO_OK, id: 1, isPrimary: true });

    await expect(seedPlayDemoData(cliente as never)).rejects.toThrow(DemoTenantGuardError);
    expect(escrituras).toEqual([]);
  });

  it('se niega si el slug esperado resuelve a otra empresa', async () => {
    const { cliente, escrituras } = prismaFalso({ ...DEMO_OK, id: 1, slug: 'nexara' });

    await expect(seedPlayDemoData(cliente as never)).rejects.toThrow(DemoTenantGuardError);
    expect(escrituras).toEqual([]);
  });
});
