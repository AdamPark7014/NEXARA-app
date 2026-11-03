/**
 * El enlace que el cliente recibe por correo. Lo que se defiende: abre sin sesión, enseña lo mismo que
 * su PDF y nada interno, un borrador no se ve, y las rutas privadas siguen pidiendo sesión.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { getTenantStore, runWithTenantAsync } from '../common/tenant/tenant-context.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CotizacionesPublicasController } from './cotizaciones-publicas.controller.js';
import { CotizacionesController } from './cotizaciones.controller.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { formatoDesdeCotizacion } from './cotizacion-formato-nexara.js';
import { EN_REVISION, vistaPublica } from './cotizacion-publica.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';

const HOY = new Date('2026-11-03T12:00:00.000Z');
const INTERNO = /unitCost|marginPercent|supplier|productCt|CT-77|SKU-1|publicToken|companyId|createdBy|notes|nota interna/i;

const cotizacion = (extra: Record<string, unknown> = {}) => ({
  id: 50,
  companyId: 7,
  createdById: 15,
  publicToken: 'tok-1',
  quoteNumber: 'NEX-0007',
  status: 'SENT',
  issueDate: new Date('2026-11-01T00:00:00.000Z'),
  validUntil: new Date('2026-12-01T00:00:00.000Z'),
  clientName: 'Ana López',
  clientCompany: 'Bachoco',
  clientEmail: 'ana@example.com',
  projectName: 'CCTV planta 2',
  currency: 'MXN',
  marginPercent: 20,
  conIva: true,
  total: 0,
  items: [
    {
      id: 11,
      name: 'Cámara IP',
      qty: 3,
      unitPrice: 1204,
      unitCost: 1000,
      marginPercent: 20.4,
      productCtId: 77,
      supplierSku: 'CT-77',
      sku: 'SKU-1',
      notes: 'nota interna',
      discount: 0,
      tax: 16,
    },
    { id: 12, name: 'Instalación', qty: 1, unitPrice: 1000, discount: 10, tax: 16, laborHours: 2, laborRate: 100 },
  ],
  ...extra,
});

describe('vistaPublica', () => {
  it('lleva solo lo que el cliente puede ver, aunque la fila traiga todo', () => {
    const vista = vistaPublica(cotizacion() as never, HOY);
    expect(JSON.stringify(vista)).not.toMatch(INTERNO);
    expect(Object.keys(vista.items[0]!).sort()).toEqual(['id', 'lineTotal', 'name', 'qty', 'unitPrice']);
  });

  it('enseña los importes de su PDF: el margen general ya va en cada precio y las cuentas cuadran', () => {
    const quote = cotizacion();
    const vista = vistaPublica(quote as never, HOY);
    const pdf = formatoDesdeCotizacion(quote as never);
    expect(vista.items[0]).toMatchObject({ unitPrice: 1444.8, qty: 3, lineTotal: 4334.4 });
    expect(vista.items.map((i) => i.lineTotal)).toEqual(pdf.partidas.map((p) => p.importe));
    expect({ subtotal: vista.subtotal, iva: vista.taxTotal, total: vista.total }).toEqual({ subtotal: pdf.subtotal, iva: pdf.iva, total: pdf.total });
    expect(Math.round((vista.subtotal + vista.taxTotal) * 100) / 100).toBe(vista.total);
  });

  it('dice por qué ya no se firma, y nada si sigue abierta', () => {
    expect(vistaPublica(cotizacion() as never, HOY).motivoSinFirma).toBeNull();
    expect(vistaPublica(cotizacion({ status: 'APPROVED' }) as never, HOY).motivoSinFirma).toMatch(/aprobada/);
    expect(vistaPublica(cotizacion({ validUntil: new Date('2026-01-01') }) as never, HOY).motivoSinFirma).toMatch(/venció/);
  });
});

describe('rutas', () => {
  it('el enlace no pide sesión; lo demás de cotizaciones sí, y ahí ya no hay rutas públicas', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CotizacionesPublicasController)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, CotizacionesController)).toContain(UrlAccessGuard);
    const metodos = Object.getOwnPropertyNames(CotizacionesController.prototype);
    const rutas = metodos.map((m) => String(Reflect.getMetadata(PATH_METADATA, (CotizacionesController.prototype as any)[m]) ?? ''));
    expect(rutas.length).toBeGreaterThan(5);
    expect(rutas.filter((r) => r.startsWith('public'))).toEqual([]);
  });

  it('no se firma sin nombre ni con textos que no caben', () => {
    const errores = (cuerpo: Record<string, unknown>) => validateSync(plainToInstance(SignCotizacionDto, cuerpo)).length;
    expect(errores({ name: 'Ana López', email: 'ana@example.com' })).toBe(0);
    expect(errores({ name: '   ', email: 'ana@example.com' })).toBeGreaterThan(0);
    expect(errores({ name: 'A'.repeat(181), email: 'ana@example.com' })).toBeGreaterThan(0);
    expect(errores({ name: 'Ana López', email: 'no-es-correo' })).toBeGreaterThan(0);
  });
});

function armar(quote: Record<string, unknown> | null) {
  const contextos: Record<string, unknown> = {};
  const prisma = {
    cotizacion: {
      // Como Prisma: la consulta no corre al crearla, sino cuando alguien la espera.
      findUnique: jest.fn(() => ({
        then(resolver: (fila: unknown) => unknown) {
          contextos['busqueda'] = getTenantStore();
          return Promise.resolve(quote).then(resolver);
        },
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        contextos['firma'] = getTenantStore();
        return { ...quote, ...data };
      }),
    },
    salesOpportunityQuote: { findMany: jest.fn(async () => []) },
  } as any;
  const service = new CotizacionesService(
    prisma,
    {} as any,
    { notifyQuoteSigned: jest.fn(async () => undefined) } as any,
    {} as any,
    {} as any,
    { createDraftOnApproval: jest.fn(async () => null) } as any,
    { avisar: jest.fn(async () => undefined) } as any,
  );
  const rechazar = jest.spyOn(service, 'rechazar').mockResolvedValue({ publicToken: 'tok-1', items: [{ unitCost: 1000 }] } as never);
  jest.spyOn(service, 'sincronizarActividad').mockResolvedValue(undefined as never);
  /** Sin sesión, el interceptor de empresa pone la principal y el origen de la petición. */
  const sinSesion = <T>(fn: () => Promise<T>) => runWithTenantAsync({ companyId: 1, userId: null, ipAddress: '203.0.113.9' }, fn);
  return { service, prisma, contextos, rechazar, sinSesion };
}

describe('desde el enlace', () => {
  it('encuentra la cotización de otra empresa y trabaja con la empresa de esa cotización', async () => {
    const { service, contextos, sinSesion } = armar(cotizacion());
    await sinSesion(() => service.signByToken('tok-1', { name: 'Ana', email: 'ana@example.com' }));
    expect(contextos['busqueda']).toMatchObject({ bypass: true });
    expect(contextos['firma']).toMatchObject({ companyId: 7, bypass: false, ipAddress: '203.0.113.9' });
  });

  it('un enlace que no existe no encuentra nada', async () => {
    const { service, sinSesion } = armar(null);
    await expect(sinSesion(() => service.getPublicByToken('nada'))).rejects.toMatchObject({ status: 404 });
    await expect(sinSesion(() => service.signByToken('nada', { name: 'Ana', email: 'ana@example.com' }))).rejects.toMatchObject({ status: 404 });
    await expect(sinSesion(() => service.rechazarPorToken('nada', 'Ya compramos'))).rejects.toMatchObject({ status: 404 });
  });

  it('un borrador que se está corrigiendo no enseña nada, ni se firma, ni se rechaza', async () => {
    const { service, prisma, rechazar, sinSesion } = armar(cotizacion({ status: 'DRAFT' }));
    await expect(sinSesion(() => service.getPublicByToken('tok-1'))).rejects.toMatchObject({ status: 409, message: EN_REVISION });
    await expect(sinSesion(() => service.signByToken('tok-1', { name: 'Ana', email: 'ana@example.com' }))).rejects.toMatchObject({ status: 400 });
    await expect(sinSesion(() => service.rechazarPorToken('tok-1', 'Ya compramos'))).rejects.toMatchObject({ status: 400 });
    expect(prisma.cotizacion.update).not.toHaveBeenCalled();
    expect(rechazar).not.toHaveBeenCalled();
  });

  it('firmar y rechazar responden sin datos internos, y firmar dos veces no firma de nuevo', async () => {
    const abierta = armar(cotizacion());
    expect(await abierta.sinSesion(() => abierta.service.signByToken('tok-1', { name: 'Ana', email: 'ana@example.com' }))).toEqual({ ok: true });
    expect(abierta.prisma.cotizacion.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', signedByName: 'Ana' });

    const firmada = armar(cotizacion({ status: 'APPROVED' }));
    expect(await firmada.sinSesion(() => firmada.service.signByToken('tok-1', { name: 'Otra', email: 'otra@example.com' }))).toEqual({ ok: true });
    expect(firmada.prisma.cotizacion.update).not.toHaveBeenCalled();

    const rechazo = armar(cotizacion());
    expect(await rechazo.sinSesion(() => rechazo.service.rechazarPorToken('tok-1', 'Ya compramos', 'Ana'))).toEqual({ ok: true });
    expect(rechazo.rechazar).toHaveBeenCalledWith(50, 'Ya compramos', { porNombre: 'Ana', companyId: 7 });
  });

  it('una vista de la cotización abierta no lleva nada interno', async () => {
    const { service, sinSesion } = armar(cotizacion());
    expect(JSON.stringify(await sinSesion(() => service.getPublicByToken('tok-1')))).not.toMatch(INTERNO);
  });
});
