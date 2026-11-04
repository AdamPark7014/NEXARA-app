/**
 * `X-Company-Id` solo cuenta si hay a quién revisarle la pertenencia. En una ruta sin guardia no existe `req.user`,
 * y un token de portal trae `id: null`: los dos caían en la misma rama, que aceptaba cualquier número. Con eso, un
 * cliente del portal leía el contenido y los borradores de otra empresa en `GET studio/page-content`.
 *
 * Aquí corren el interceptor y `CompanyService` de verdad; lo único simulado es la base.
 */
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { of } from 'rxjs';
import { CompanyService } from '../../company/company.service.js';
import { EmpresaPorCabeceraSinSesion } from './current-company.decorator.js';
import { getTenantStore } from './tenant-context.js';
import { TenantInterceptor } from './tenant.interceptor.js';

const PRINCIPAL = 1;
const OTRA = 2;
const TERCERA = 3;

const armarServicio = (membresias: Array<{ userId: number; companyId: number; isDefault?: boolean }> = []) => {
  const empresas = [PRINCIPAL, OTRA, TERCERA];
  const prisma = {
    companyProfile: {
      findFirst: jest.fn(async () => ({ id: PRINCIPAL, isPrimary: true })),
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        empresas.includes(where.id) ? { id: where.id } : null,
      ),
    },
    userCompany: {
      findUnique: jest.fn(
        async ({ where }: { where: { userId_companyId: { userId: number; companyId: number } } }) =>
          membresias.find(
            (m) => m.userId === where.userId_companyId.userId && m.companyId === where.userId_companyId.companyId,
          ) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { userId: number } }) =>
          membresias.find((m) => m.userId === where.userId && m.isDefault) ?? null,
      ),
    },
  };
  return new CompanyService(prisma as any);
};

const rutaSinMarca = () => undefined;

/** Pasa la petición por el interceptor y dice con qué empresa llegó al controlador. */
const pedir = async (
  servicio: CompanyService,
  req: Record<string, unknown>,
  ruta: (...args: never[]) => unknown = rutaSinMarca,
) => {
  const contexto = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => ruta } as any;
  const siguiente = { handle: () => of(getTenantStore()?.companyId ?? null) };
  const filtro = await new Promise((resolve, reject) =>
    new TenantInterceptor(servicio, new Reflector()).intercept(contexto, siguiente).subscribe({ next: resolve, error: reject }),
  );
  return { req: req.companyId, filtro };
};

const cabecera = (id: number | string) => ({ 'x-company-id': String(id) });

describe('sin sesión la cabecera no cambia la empresa', () => {
  it('con la cabecera de otra empresa sigue en la principal', async () => {
    const r = await pedir(armarServicio(), { headers: cabecera(OTRA) });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });

  it('sin cabecera, la principal', async () => {
    const r = await pedir(armarServicio(), { headers: {} });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });

  it('con una empresa que no existe tampoco se queda sin empresa', async () => {
    const r = await pedir(armarServicio(), { headers: cabecera(999) });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });

  it('resolveForUser tampoco la acepta sin persona', async () => {
    await expect(armarServicio().resolveForUser({ companyId: OTRA })).resolves.toMatchObject({ id: PRINCIPAL });
  });

  it('una llave SCIM no cambia de empresa con la cabecera', async () => {
    const r = await pedir(armarServicio(), { headers: cabecera(OTRA), scimCompanyId: TERCERA });
    expect(r.filtro).not.toBe(OTRA);
  });
});

describe('el portal queda en la empresa de su token', () => {
  const cliente = (companyId: number | null) => ({ id: null, isClient: true, clientId: 5, companyId });
  const sucursal = (companyId: number | null) => ({ id: null, isBranchUser: true, branchId: 6, companyId });

  it('un cliente no entra a otra empresa con la cabecera', async () => {
    const r = await pedir(armarServicio(), { user: cliente(PRINCIPAL), headers: cabecera(OTRA) });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });

  it('una sucursal tampoco', async () => {
    const r = await pedir(armarServicio(), { user: sucursal(PRINCIPAL), headers: cabecera(OTRA) });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });

  it('un cliente de una empresa que no es la principal queda en la suya, sin cabecera', async () => {
    const r = await pedir(armarServicio(), { user: cliente(OTRA), headers: {} });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  it('y una cabecera no lo saca de ahí', async () => {
    const r = await pedir(armarServicio(), { user: cliente(OTRA), headers: cabecera(PRINCIPAL) });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  it('un token sin empresa cae en la principal, no en la de la cabecera', async () => {
    const r = await pedir(armarServicio(), { user: cliente(null), headers: cabecera(OTRA) });
    expect(r).toEqual({ req: PRINCIPAL, filtro: PRINCIPAL });
  });
});

describe('con sesión de persona no cambia nada', () => {
  const persona = { id: 42, isSuperAdmin: false };

  it('quien pertenece a la empresa de la cabecera entra', async () => {
    const r = await pedir(armarServicio([{ userId: 42, companyId: OTRA }]), { user: persona, headers: cabecera(OTRA) });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  it('quien no pertenece recibe 403', async () => {
    await expect(pedir(armarServicio(), { user: persona, headers: cabecera(OTRA) })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('sin cabecera, su empresa predeterminada', async () => {
    const r = await pedir(armarServicio([{ userId: 42, companyId: OTRA, isDefault: true }]), { user: persona, headers: {} });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  it('la plataforma elige cualquiera', async () => {
    const r = await pedir(armarServicio(), { user: { id: 1, isSuperAdmin: true }, headers: cabecera(OTRA) });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });
});

describe('las dos excepciones', () => {
  it('SCIM con el secreto de la plataforma elige empresa con la cabecera', async () => {
    const r = await pedir(armarServicio(), { headers: cabecera(OTRA), scimLegacyAuth: true, scimCompanyId: PRINCIPAL });
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  it('la ruta marcada sigue obedeciendo la cabecera sin sesión', async () => {
    class Ruta {
      @EmpresaPorCabeceraSinSesion()
      marcada() {
        return undefined;
      }
    }
    const r = await pedir(armarServicio(), { headers: cabecera(OTRA) }, Ruta.prototype.marcada);
    expect(r).toEqual({ req: OTRA, filtro: OTRA });
  });

  // Cada ruta que se agregue aquí vuelve a abrir la cabecera sin sesión: es una decisión de Adam, no un detalle.
  it('la marca solo está en users/public-team', () => {
    const raiz = join(__dirname, '..', '..');
    const conMarca: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && /@EmpresaPorCabeceraSinSesion\(\)/.test(readFileSync(ruta, 'utf8'))) {
          conMarca.push(ruta.slice(raiz.length + 1).replace(/\\/g, '/'));
        }
      }
    };
    recorrer(raiz);
    expect(conMarca).toEqual(['users/users.controller.ts']);
  });
});
