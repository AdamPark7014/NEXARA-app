import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ACCESOS, fijarCompartimentada, type Actor } from './visibilidad';
import { esClaveDeDinero, limpiarEntradaSinPrecios, ocultarContratos, ocultarMontos } from './montos';
import { MONTOS_PARA_CONTADORA, OcultarMontosInterceptor } from './ocultar-montos.interceptor';
import { SoloConPreciosGuard } from './solo-con-precios.guard';
import { VisibilidadService } from './visibilidad.service';
import { veTodoCostos } from '../../costos/costos-acceso';
import { ProyectosProfesionalController } from '../../projects/proyectos-profesional.controller';
import { CostosController } from '../../costos/costos.controller';
import { VentasProyectosController } from '../../ventas/ventas-proyectos.controller';
import { VendorProjectFinanceController } from '../../accounting/vendor-project-finance.controller';
import { WorkProjectsController } from '../../work-projects/work-projects.controller';

/**
 * Matriz «quién ve qué» · Entrega 2 (montos, contratos y archivos). Personas de ejemplo, sin datos reales.
 */
const CHRISTIAN: Actor = { id: 1, roleKey: 'ceo', isSuperAdmin: true };
const DAVID: Actor = { id: 8, roleKey: 'coord_operaciones', accesos: [ACCESOS.PRECIOS_VER] };
const LUIS: Actor = { id: 7, roleKey: 'dir_operaciones' };
const DANIELA: Actor = { id: 30, roleKey: 'administrativo' };
const PAULINA: Actor = { id: 41, roleKey: 'administrativo' };
const TECNICO: Actor = { id: 20, roleKey: 'ing_campo' };

beforeAll(() => fijarCompartimentada(true));
afterAll(() => fijarCompartimentada(false));

const PROYECTO = {
  id: 5,
  title: 'CCTV bodega',
  budgetAmount: 120000,
  currency: 'MXN',
  cotizacion: { id: 9, quoteNumber: 'COT-1', total: 98000, currency: 'MXN' },
  members: [{ id: 1, role: 'INGENIERO' }],
  documents: [
    { id: 1, kind: 'PLANO', nombre: 'plano.pdf' },
    { id: 2, kind: 'CONTRATO', nombre: 'contrato.pdf' },
  ],
  resumen: { avancePct: 40, totales: { semana: 3200, horas: 12 } },
  _count: { documents: 2 },
};

describe('quién ve qué · filtro de montos', () => {
  it('pone en null los montos, marca montosOcultos y deja el resto igual', () => {
    const r: any = ocultarMontos(PROYECTO);
    expect(r.budgetAmount).toBeNull();
    expect(r.montosOcultos).toBe(true);
    expect(r.cotizacion.total).toBeNull();
    expect(r.cotizacion.quoteNumber).toBe('COT-1');
    expect(r.resumen.totales.semana).toBeNull();
    expect(r.resumen.totales.horas).toBe(12);
    expect(r.resumen.avancePct).toBe(40);
    expect(r.title).toBe('CCTV bodega');
    expect(r.members).toEqual(PROYECTO.members);
    expect(PROYECTO.budgetAmount).toBe(120000); // no muta la entrada
  });

  it('el total de una paginación no es dinero', () => {
    expect(ocultarMontos({ items: [{ id: 1, costoTotal: 5 }], total: 40, page: 1 })).toEqual({
      items: [{ id: 1, costoTotal: null, montosOcultos: true }],
      total: 40,
      page: 1,
    });
  });

  it('conteos, horas e ids no son dinero; Decimal y texto numérico sí', () => {
    for (const k of ['partidasSinCosto', 'personasSinSueldo', 'horasTotal', 'totalKm', 'priceScore', 'clientId']) {
      expect(esClaveDeDinero(k)).toBe(false);
    }
    for (const k of ['importe', 'costoHora', 'sueldoSemanal', 'margenPct', 'budgetUsed', 'paidAmount', 'saldoPorPagar']) {
      expect(esClaveDeDinero(k)).toBe(true);
    }
    const decimal = { s: 1, e: 2, d: [150], toFixed: () => '150' };
    expect(ocultarMontos({ importe: decimal, monto: '1500.50' })).toEqual({ importe: null, monto: null, montosOcultos: true });
  });

  it('lo que regresa un formulario con «Confidencial» no borra el monto guardado', () => {
    const cuerpo: any = { title: 'X', budgetAmount: null, montosOcultos: true, partidas: [{ precio: '' }] };
    limpiarEntradaSinPrecios(cuerpo);
    expect(cuerpo).toEqual({ title: 'X', partidas: [{}] });
    const gasolina: any = { monto: 850 };
    limpiarEntradaSinPrecios(gasolina);
    expect(gasolina).toEqual({ monto: 850 });
  });

  it('contratos fuera de la lista de documentos; planos se quedan', () => {
    const r: any = ocultarContratos(PROYECTO);
    expect(r.documents.map((d: any) => d.kind)).toEqual(['PLANO']);
  });
});

describe('quién ve qué · interceptor de montos (persona × ruta)', () => {
  const prisma: any = { user: { findUnique: jest.fn() } };
  const reflector = new Reflector();

  function ctx(user: Actor, opts: { method?: string; body?: any; contadora?: boolean } = {}) {
    class Ruta {}
    const handler = () => undefined;
    if (opts.contadora) Reflect.defineMetadata(MONTOS_PARA_CONTADORA, true, Ruta);
    return {
      switchToHttp: () => ({ getRequest: () => ({ user, method: opts.method ?? 'GET', body: opts.body }) }),
      getHandler: () => handler,
      getClass: () => Ruta,
    } as any;
  }
  const correr = (c: any) =>
    lastValueFrom(new OcultarMontosInterceptor(reflector, prisma).intercept(c, { handle: () => of(PROYECTO) }));

  const ESPERADO: Array<[string, Actor, boolean]> = [
    ['Christian (superadmin)', CHRISTIAN, true],
    ['David (Ver precios)', DAVID, true],
    ['Luis', LUIS, false],
    ['Daniela', DANIELA, false],
    ['Paulina fuera de Contabilidad', PAULINA, false],
    ['Técnico', TECNICO, false],
  ];
  it.each(ESPERADO)('proyecto · %s ve montos: %s', async (_n, actor, ve) => {
    const r: any = await correr(ctx(actor));
    expect(r.budgetAmount === 120000).toBe(ve);
    expect(r.documents.some((d: any) => d.kind === 'CONTRATO')).toBe(ve);
  });

  it('Paulina sí ve montos en Contabilidad (por su puesto)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ puesto: 'Contadora' });
    const r: any = await correr(ctx(PAULINA, { contadora: true }));
    expect(r.budgetAmount).toBe(120000);
  });

  it('en Contabilidad, alguien sin ese puesto no los ve', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ puesto: 'Auxiliar administrativo' });
    const r: any = await correr(ctx(DANIELA, { contadora: true }));
    expect(r.budgetAmount).toBeNull();
  });

  it('un PATCH con el monto vacío llega al controlador sin ese campo', async () => {
    const body: any = { title: 'Nuevo', budgetAmount: null, montosOcultos: true };
    await correr(ctx(LUIS, { method: 'PATCH', body }));
    expect(body).toEqual({ title: 'Nuevo' });
  });

  it('apagado: no toca la respuesta', async () => {
    fijarCompartimentada(false);
    try {
      const r: any = await correr(ctx(TECNICO));
      expect(r).toBe(PROYECTO);
    } finally {
      fijarCompartimentada(true);
    }
  });

  it('las rutas con montos llevan el interceptor', () => {
    for (const C of [
      ProyectosProfesionalController,
      CostosController,
      VentasProyectosController,
      VendorProjectFinanceController,
      WorkProjectsController,
    ]) {
      expect(Reflect.getMetadata('__interceptors__', C) ?? []).toContain(OcultarMontosInterceptor);
    }
    expect(Reflect.getMetadata(MONTOS_PARA_CONTADORA, VendorProjectFinanceController)).toBe(true);
  });

  it('reportes en PDF: sin Ver precios, 403', () => {
    const g = new SoloConPreciosGuard();
    const c = (u: Actor) => ({ switchToHttp: () => ({ getRequest: () => ({ user: u }) }) }) as any;
    expect(g.canActivate(c(DAVID))).toBe(true);
    expect(() => g.canActivate(c(LUIS))).toThrow(ForbiddenException);
  });
});

describe('quién ve qué · Costos: sueldos solo superadmin', () => {
  it('con el interruptor prendido, ni CEO de rol ni contadora ven sueldos', () => {
    expect(veTodoCostos({ id: 1, isSuperAdmin: true })).toBe(true);
    expect(veTodoCostos({ id: 2, roleKey: 'ceo' })).toBe(false);
    expect(veTodoCostos({ id: 41, roleKey: 'administrativo', puesto: 'Contadora' })).toBe(false);
  });
  it('apagado, como antes (CEO y contadora)', () => {
    fijarCompartimentada(false);
    try {
      expect(veTodoCostos({ id: 2, roleKey: 'ceo' })).toBe(true);
      expect(veTodoCostos({ id: 41, roleKey: 'administrativo', puesto: 'Contadora' })).toBe(true);
    } finally {
      fijarCompartimentada(true);
    }
  });
});

describe('quién ve qué · archivos de /uploads', () => {
  const ORG = [
    { id: 7, managerId: 1, roleKey: 'dir_operaciones', isActive: true },
    { id: 8, managerId: 7, roleKey: 'coord_operaciones', isActive: true },
    { id: 20, managerId: 8, roleKey: 'ing_campo', isActive: true },
    { id: 30, managerId: 7, roleKey: 'administrativo', isActive: true },
  ];
  function servicio(filas: { flujo?: number[]; contrato?: boolean } = {}) {
    const prisma: any = {
      systemSetting: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      user: { findMany: jest.fn().mockResolvedValue(ORG) },
      activityEvidence: { findMany: jest.fn().mockResolvedValue((filas.flujo ?? []).map((userId) => ({ userId }))) },
      activityEvidenceFieldPhoto: { findMany: jest.fn().mockResolvedValue([]) },
      evidence: { findMany: jest.fn().mockResolvedValue([]) },
      projectDocument: { findFirst: jest.fn().mockResolvedValue(filas.contrato ? { id: 1 } : null) },
    };
    return { svc: new VisibilidadService(prisma), prisma };
  }

  it('foto de evidencia del técnico: él, David, Luis y superadmin; Daniela no', async () => {
    const { svc } = servicio({ flujo: [20] });
    const ruta = '/activities/1790-x.jpg';
    expect(await svc.puedeAbrirArchivo(ruta, TECNICO)).toBe(true);
    expect(await svc.puedeAbrirArchivo(ruta, DAVID)).toBe(true);
    expect(await svc.puedeAbrirArchivo(ruta, LUIS)).toBe(true);
    expect(await svc.puedeAbrirArchivo(ruta, CHRISTIAN)).toBe(true);
    expect(await svc.puedeAbrirArchivo(ruta, DANIELA)).toBe(false);
  });

  it('contrato de proyecto: solo con Ver precios', async () => {
    const { svc } = servicio({ contrato: true });
    expect(await svc.puedeAbrirArchivo('/project-docs/c.pdf', DAVID)).toBe(true);
    expect(await svc.puedeAbrirArchivo('/project-docs/c.pdf', LUIS)).toBe(false);
  });

  it('archivo sin registro ligado sigue como antes; travesías no pasan', async () => {
    const { svc } = servicio();
    expect(await svc.puedeAbrirArchivo('/activities/suelto.jpg', DANIELA)).toBe(true);
    expect(await svc.puedeAbrirArchivo('/activities/../project-docs/c.pdf', DANIELA)).toBe(false);
    expect(await svc.puedeAbrirArchivo('/activities/%2e%2e/project-docs/c.pdf', DANIELA)).toBe(false);
  });

  it('apagado: abre todo y no consulta', async () => {
    fijarCompartimentada(false);
    try {
      const { svc, prisma } = servicio({ flujo: [20] });
      prisma.systemSetting.findFirst.mockResolvedValue(null);
      expect(await svc.puedeAbrirArchivo('/activities/1790-x.jpg', DANIELA)).toBe(true);
      expect(prisma.activityEvidence.findMany).not.toHaveBeenCalled();
    } finally {
      fijarCompartimentada(true);
    }
  });
});
