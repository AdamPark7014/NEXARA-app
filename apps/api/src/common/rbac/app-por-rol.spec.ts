import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { isCeoEquivalentEmail, isSuperAdminEmail } from '../platform-accounts';
import { RbacGuard } from '../rbac.guard';
import { UrlAccessGuard } from './url-access.guard';
import { CostosVehiculosController } from '../../costos/vehiculos/costos-vehiculos.controller';
import { CotizacionesController } from '../../cotizaciones/cotizaciones.controller';
import { EmployeePaymentsController } from '../../employee-payments/employee-payments.controller';
import { ExpensesController } from '../../expenses/expenses.controller';
import { ProyectosProfesionalController } from '../../projects/proyectos-profesional.controller';
import { ToolRequestsController } from '../../tool-requests/tool-requests.controller';
import { VehiclesController } from '../../vehicles/vehicles.controller';
import { ViaticosController } from '../../viaticos/viaticos.controller';
import { StockController } from '../../warehouse/stock.controller';
import { WarehouseController } from '../../warehouse/warehouse.controller';
import { WorkflowController } from '../../workflow/workflow.controller';

/**
 * Lo que cada persona debe poder hacer desde la app, con las guardas reales de cada ruta.
 *
 * Adam (04-11-2026): «al CEO le aparece para escanear una herramienta [...] debería ver todo lo
 * relacionado a lo administrativo», «el que debe dar de alta es Iván» y «la gente debe poder solamente
 * solicitar préstamos». Antes la app ofrecía acciones que aquí se negaban y nadie se enteraba: Iván no
 * podía ni ver existencias, y salir con un vehículo solo le funcionaba a dos roles.
 *
 * Las reglas dentro de cada servicio (que sea lo propio, el paso de la cadena) no se miden aquí.
 */
const CONTROLADORES: Array<[string, any]> = [
  ['stock', StockController],
  ['warehouse', WarehouseController],
  ['tool-requests', ToolRequestsController],
  ['vehicles/ficha', CostosVehiculosController],
  ['vehicles', VehiclesController],
  ['viatics', ViaticosController],
  ['employee-payments', EmployeePaymentsController],
  ['workflow', WorkflowController],
  ['proyectos', ProyectosProfesionalController],
  ['expenses', ExpensesController],
  ['cotizaciones', CotizacionesController],
];
const VERBOS: Record<number, string> = { 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' };

const rutas: Array<{ verbo: string; patron: RegExp; handler: any; guardas: any[] }> = [];
for (const [prefijo, Controlador] of CONTROLADORES) {
  const deClase = Reflect.getMetadata('__guards__', Controlador) ?? [];
  for (const nombre of Object.getOwnPropertyNames(Controlador.prototype)) {
    const handler = Controlador.prototype[nombre];
    if (nombre === 'constructor' || typeof handler !== 'function') continue;
    const verbo = Reflect.getMetadata('method', handler);
    const ruta = Reflect.getMetadata('path', handler);
    if (verbo === undefined || ruta === undefined) continue;
    const completa = `${prefijo}/${String(ruta).replace(/^\//, '')}`.replace(/\/$/, '');
    rutas.push({
      verbo: VERBOS[verbo],
      patron: new RegExp('^' + completa.replace(/:[A-Za-z]+/g, '[^/]+') + '$'),
      handler,
      guardas: [...deClase, ...(Reflect.getMetadata('__guards__', handler) ?? [])],
    });
  }
}

const reflector = new Reflector();
const auth: any = Object.create(AuthService.prototype);

function usuario(email: string, roleKey: string) {
  const isSuperAdmin = isSuperAdminEmail(email) || isCeoEquivalentEmail(email);
  const u: any = { id: 99, email, roleKey, role: { key: roleKey }, isSuperAdmin };
  u.permissions = auth.resolveUserPermissions(u, isSuperAdmin);
  return u;
}

async function pasa(user: any, llamada: string): Promise<boolean> {
  const [verbo, ruta] = llamada.split(' ');
  const r = rutas.find((x) => x.verbo === verbo && x.patron.test(ruta));
  if (!r) throw new Error(`Sin ruta en el servidor: ${llamada}`);
  const url = `/api/${ruta}`;
  const req = { user, method: verbo, originalUrl: url, url, body: {} };
  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => r.handler,
    getClass: () => class {},
  };
  try {
    for (const G of r.guardas) {
      const g = G === RbacGuard ? new RbacGuard(reflector) : G === UrlAccessGuard ? new UrlAccessGuard() : new G();
      await g.canActivate(ctx);
    }
    return true;
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

async function revisar(user: any, si: string[], no: string[]) {
  const faltan: string[] = [];
  const sobran: string[] = [];
  for (const l of si) if (!(await pasa(user, l))) faltan.push(l);
  for (const l of no) if (await pasa(user, l)) sobran.push(l);
  expect({ faltan, sobran }).toEqual({ faltan: [], sobran: [] });
}

/** Lo que cualquiera del personal hace desde el teléfono. */
const DE_TODO_EL_PERSONAL = [
  'GET tool-requests/kits/my',
  'GET tool-requests/my-requests',
  'GET tool-requests/inventory/search',
  'POST tool-requests',
  'POST tool-requests/1/renewal-request',
  'POST tool-requests/kits/1/report',
  'GET vehicles/mis-vehiculos',
  'POST vehicles/inventory/1/checkout',
  'POST vehicles/inventory/1/return',
  'POST vehicles/ficha/1/cargas',
  'GET viatics',
  'POST viatics',
  'PATCH viatics/1/comprobar',
  'PUT viatics/1/reparto',
];

const LO_DE_ALMACEN = [
  'POST stock/products/por-codigo',
  'POST stock/movements',
  'POST stock/movements/por-codigo',
  'POST stock/lots',
];
const LO_DE_HERRAMIENTAS = [
  'POST tool-requests/inventory',
  'POST tool-requests/1/approve',
  'POST tool-requests/1/reject',
  'POST tool-requests/1/deliver',
  'POST tool-requests/1/return',
  'POST tool-requests/kits/assign',
];
const LO_DE_DINERO = ['GET employee-payments', 'POST employee-payments', 'PATCH employee-payments/1/pagado'];
const BORRAR = ['DELETE tool-requests/1', 'DELETE vehicles/inventory/1', 'DELETE employee-payments/1'];

describe('la app, persona por persona, contra las guardas reales', () => {
  beforeAll(() => {
    Object.getPrototypeOf(RbacGuard.prototype).canActivate = async () => true;
  });

  it('Christian: todo lo administrativo, y Pagos', async () => {
    await revisar(
      usuario('gerencia@nexara.com.mx', 'ceo'),
      [
        ...LO_DE_DINERO,
        ...LO_DE_ALMACEN,
        'GET stock/levels',
        'GET stock/movements',
        'GET tool-requests',
        'GET tool-requests/inventory',
        'GET tool-requests/status/PENDING',
        'GET vehicles/flotilla',
        'PATCH vehicles/1/approve',
        'POST viatics/assign',
        'PATCH viatics/1/approve',
        'GET workflow/my-pending',
        'PATCH proyectos/1/estado',
      ],
      [],
    );
  });

  it('el CEO sin acceso total (la cuenta de revisión de tiendas) lee lo de dirección y no escribe', async () => {
    await revisar(
      usuario('play.review@nexara.com.mx', 'ceo'),
      [
        'GET stock/levels',
        'GET tool-requests',
        'GET tool-requests/inventory',
        'GET tool-requests/status/PENDING',
        'GET vehicles/flotilla',
        'GET viatics',
        'GET expenses',
        'GET proyectos',
        'GET proyectos/1',
      ],
      ['POST stock/movements', 'POST tool-requests/inventory', 'POST employee-payments'],
    );
  });

  it('Iván: da de alta y opera almacén y herramientas, sin borrar ni tocar dinero', async () => {
    await revisar(
      usuario('administracion.ventas@nexara.com.mx', 'ing_campo'),
      [
        ...DE_TODO_EL_PERSONAL,
        ...LO_DE_ALMACEN,
        ...LO_DE_HERRAMIENTAS,
        'GET stock/levels',
        'GET stock/movements',
        'GET tool-requests',
        'GET tool-requests/inventory',
        'GET tool-requests/status/PENDING',
        'POST vehicles/inventory',
        'PATCH vehicles/inventory/1',
      ],
      [...LO_DE_DINERO, ...BORRAR, 'POST viatics/assign', 'PATCH vehicles/1/approve'],
    );
  });

  it.each([
    ['otro de campo', 'tecnico@example.com', 'ing_campo'],
    ['soporte', 'soporte@example.com', 'ing_soporte'],
  ])('%s: pide y usa, no administra', async (_n, email, rol) => {
    await revisar(
      usuario(email, rol),
      DE_TODO_EL_PERSONAL,
      [...LO_DE_DINERO, ...LO_DE_ALMACEN, ...BORRAR, 'POST tool-requests/inventory', 'POST vehicles/inventory', 'POST viatics/assign', 'GET stock/levels'],
    );
  });

  it('administración: lo de todos, consulta almacén y registra gastos', async () => {
    await revisar(
      usuario('daniela@example.com', 'administrativo'),
      [...DE_TODO_EL_PERSONAL, 'GET stock/levels', 'GET expenses', 'POST expenses', 'GET workflow/my-pending', 'GET proyectos/1'],
      [...LO_DE_DINERO, ...LO_DE_ALMACEN, ...BORRAR, 'POST tool-requests/inventory', 'POST viatics/assign'],
    );
  });

  it('encargado de instalación: lo de todos, consulta almacén, asigna viáticos y aprueba vehículos', async () => {
    await revisar(
      usuario('operaciones@nexara.com.mx', 'coord_operaciones'),
      [...DE_TODO_EL_PERSONAL, 'GET stock/levels', 'POST viatics/assign', 'PATCH vehicles/1/approve', 'POST vehicles/inventory', 'GET proyectos/1', 'PATCH proyectos/1/estado'],
      [...LO_DE_DINERO, ...LO_DE_ALMACEN],
    );
  });

  it('encargado de soporte y arquitecto: lo de todos, sin administrar almacén ni dinero', async () => {
    for (const [email, rol] of [
      ['jose.ramirez@nexara.com.mx', 'enc_soporte'],
      ['josue@example.com', 'arquitecto'],
    ]) {
      await revisar(usuario(email, rol), DE_TODO_EL_PERSONAL, [...LO_DE_DINERO, ...LO_DE_ALMACEN, 'POST tool-requests/inventory']);
    }
  });
});
