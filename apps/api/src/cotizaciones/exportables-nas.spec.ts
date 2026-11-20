import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import {
  NAS_EXPORT_TOKEN_MIN,
  NasExportGuard,
  empresaNasExport,
  tokenNasExportValido,
} from '../common/nas-export.guard.js';
import {
  estadoExportable,
  limpiarNombreArchivoWindows,
  nombreArchivoExportable,
  parseLimiteExportable,
  parseSoloConProyecto,
} from './exportables-nas.js';
import { ExportablesNasService } from './exportables-nas.service.js';

const TOKEN_OK = 'a'.repeat(NAS_EXPORT_TOKEN_MIN);

function ctxCon(headers: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as any;
}

describe('tokenNasExportValido', () => {
  it('niega sin token o con token corto', () => {
    expect(tokenNasExportValido('x', undefined)).toBe(false);
    expect(tokenNasExportValido(TOKEN_OK, 'corto')).toBe(false);
    expect(tokenNasExportValido('', TOKEN_OK)).toBe(false);
  });
  it('acepta solo si coincide en tiempo constante', () => {
    expect(tokenNasExportValido(TOKEN_OK, TOKEN_OK)).toBe(true);
    expect(tokenNasExportValido('b'.repeat(NAS_EXPORT_TOKEN_MIN), TOKEN_OK)).toBe(false);
    expect(tokenNasExportValido(TOKEN_OK + 'x', TOKEN_OK)).toBe(false);
  });
});

describe('empresaNasExport', () => {
  it('usa 1 por omisión y parsea enteros positivos', () => {
    expect(empresaNasExport(undefined)).toBe(1);
    expect(empresaNasExport('9')).toBe(9);
    expect(empresaNasExport('0')).toBe(1);
  });
});

describe('NasExportGuard', () => {
  const guard = new NasExportGuard();
  const prevToken = process.env.NAS_EXPORT_TOKEN;
  const prevCompany = process.env.NAS_EXPORT_COMPANY_ID;
  afterEach(() => {
    if (prevToken === undefined) delete process.env.NAS_EXPORT_TOKEN; else process.env.NAS_EXPORT_TOKEN = prevToken;
    if (prevCompany === undefined) delete process.env.NAS_EXPORT_COMPANY_ID; else process.env.NAS_EXPORT_COMPANY_ID = prevCompany;
  });
  it('401 sin token, con variable vacía o token incorrecto', () => {
    delete process.env.NAS_EXPORT_TOKEN;
    expect(() => guard.canActivate(ctxCon({}))).toThrow(UnauthorizedException);
    process.env.NAS_EXPORT_TOKEN = TOKEN_OK;
    expect(() => guard.canActivate(ctxCon({}))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctxCon({ 'x-nas-token': 'b'.repeat(32) }))).toThrow(UnauthorizedException);
  });
  it('acepta X-Nas-Token y fija la empresa', () => {
    process.env.NAS_EXPORT_TOKEN = TOKEN_OK;
    process.env.NAS_EXPORT_COMPANY_ID = '4';
    const req: any = { headers: { 'x-nas-token': TOKEN_OK } };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.nasExportCompanyId).toBe(4);
  });
});

describe('helpers exportables NAS', () => {
  it('traduce estados al español del encargo', () => {
    expect(estadoExportable('DRAFT')).toBe('Borrador');
    expect(estadoExportable('APPROVED')).toBe('Aprobada');
    expect(estadoExportable('RECHAZADA')).toBe('Rechazada');
  });
  it('limpia nombre de archivo Windows y arma el PDF', () => {
    expect(limpiarNombreArchivoWindows('A<>:"/\\|?*B')).toBe('AB');
    const nombre = nombreArchivoExportable({
      folio: 'NEX-1',
      cliente: 'Cliente Demo',
      actualizada: new Date('2026-11-20T18:00:00.000Z'),
    });
    expect(nombre).toBe('NEX-1 Cliente Demo 2026-11-20.pdf');
  });
  it('parsea limite y soloConProyecto', () => {
    expect(parseLimiteExportable(undefined)).toBe(100);
    expect(parseLimiteExportable(999)).toBe(500);
    expect(parseSoloConProyecto(undefined)).toBe(true);
    expect(parseSoloConProyecto('false')).toBe(false);
  });
});

describe('ExportablesNasService', () => {
  const prisma: any = { cotizacion: { findMany: jest.fn(), findFirst: jest.fn() } };
  const cotizaciones: any = { getPdfBuffer: jest.fn() };
  const svc = new ExportablesNasService(prisma, cotizaciones);

  it('lista con desde, limite y paginación', async () => {
    const t1 = new Date('2026-11-01T00:00:00.000Z');
    const t2 = new Date('2026-11-02T00:00:00.000Z');
    prisma.cotizacion.findMany.mockResolvedValue([
      { id: 1, quoteNumber: 'NEX-1', revision: 1, status: 'SENT', updatedAt: t1, total: 10, currency: 'MXN', projectName: 'P1', clientName: null, clientCompany: 'ACME', salesClient: null, proyectos: [{ id: 9, title: 'P1' }] },
      { id: 2, quoteNumber: 'NEX-2', revision: 1, status: 'DRAFT', updatedAt: t2, total: 20, currency: 'MXN', projectName: null, clientName: 'Eva', clientCompany: null, salesClient: { name: 'Hotel' }, proyectos: [{ id: 11, title: 'Obra' }] },
    ]);
    const r = await svc.listar(1, { desde: '2026-10-01T00:00:00.000Z', limite: 2 });
    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, where: expect.objectContaining({ companyId: 1, updatedAt: { gt: new Date('2026-10-01T00:00:00.000Z') }, proyectos: { some: { deletedAt: null } } }) }));
    expect(r.items).toHaveLength(2);
    expect(r.items[0].operationalProjectId).toBe(9);
    expect(r.items[1].cliente).toBe('Hotel');
    expect(r.siguienteDesde).toBe(t2.toISOString());
  });

  it('PDF de otra empresa → 404; PDF propio ok', async () => {
    prisma.cotizacion.findFirst.mockResolvedValueOnce(null);
    await expect(svc.pdf(99, 1)).rejects.toBeInstanceOf(NotFoundException);
    prisma.cotizacion.findFirst.mockResolvedValueOnce({
      id: 5, quoteNumber: 'NEX-5', revision: 1, updatedAt: new Date('2026-11-20T18:00:00.000Z'),
      projectName: 'X', clientName: null, clientCompany: 'ACME', salesClient: null, proyectos: [],
    });
    cotizaciones.getPdfBuffer.mockResolvedValue(Buffer.from('%PDF'));
    const out = await svc.pdf(5, 1);
    expect(out.buffer.toString()).toBe('%PDF');
    expect(out.nombreArchivo).toBe('NEX-5 ACME 2026-11-20.pdf');
  });
});