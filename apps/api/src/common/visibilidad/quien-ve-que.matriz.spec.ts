import { NotFoundException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  ACCESOS,
  fijarCompartimentada,
  cotizacionVisible,
  normalizarAccesos,
  puedeVerDeAutor,
  puedeVerPrecios,
  usuariosBajoMiMando,
  whereCotizacionesVisibles,
  type Actor,
  type PersonaOrganigrama,
} from './visibilidad';
import { VisibilidadService } from './visibilidad.service';
import { CotizacionVisibleInterceptor } from './cotizacion-visible.interceptor';
import { CotizacionesController } from '../../cotizaciones/cotizaciones.controller';

/**
 * Matriz «quién ve qué» (aprobada por Adam el 20-11-2026), persona × registro. Si alguien ve una
 * cotización o una evidencia que no le toca, esta prueba falla antes de desplegar.
 * Personas de ejemplo (sin correos ni ids reales).
 */
const ORG: Array<PersonaOrganigrama & { nombre: string; actor: Actor }> = [
  { id: 1, nombre: 'Christian (superadmin)', roleKey: 'ceo', managerId: null, actor: { id: 1, roleKey: 'ceo', isSuperAdmin: true } },
  { id: 7, nombre: 'Luis (encima de todos)', roleKey: 'dir_operaciones', managerId: 1, actor: { id: 7, roleKey: 'dir_operaciones' } },
  { id: 8, nombre: 'David (jefe de 2 técnicos)', roleKey: 'coord_operaciones', managerId: 7, actor: { id: 8, roleKey: 'coord_operaciones', accesos: [ACCESOS.PRECIOS_VER] } },
  { id: 20, nombre: 'Técnico A', roleKey: 'ing_campo', managerId: 8, actor: { id: 20, roleKey: 'ing_campo' } },
  { id: 21, nombre: 'Técnico B', roleKey: 'ing_campo', managerId: 8, actor: { id: 21, roleKey: 'ing_campo' } },
  { id: 30, nombre: 'Daniela (cotiza)', roleKey: 'administrativo', managerId: 7, actor: { id: 30, roleKey: 'administrativo' } },
  { id: 41, nombre: 'Paulina (contadora)', roleKey: 'administrativo', managerId: 7, actor: { id: 41, roleKey: 'administrativo' } },
  { id: 50, nombre: 'Sin jefe', roleKey: 'ing_campo', managerId: null, actor: { id: 50, roleKey: 'ing_campo' } },
];
const actor = (id: number) => ORG.find((p) => p.id === id)!.actor;

// La matriz describe las reglas con el interruptor PRENDIDO; al final se prueba apagado.
beforeAll(() => fijarCompartimentada(true));
afterAll(() => fijarCompartimentada(false));

// Cotizaciones de ejemplo.
const COT = {
  deDaniela: { createdById: 30, asignadoAId: null, participantes: [{ userId: 30 }] },
  mandadaADavid: { createdById: 30, asignadoAId: 8, participantes: [{ userId: 30 }] },
  revisionPedidaALuis: { createdById: 30, asignadoAId: null, participantes: [{ userId: 30 }, { userId: 7 }] },
  deChristian: { createdById: 1, asignadoAId: null, participantes: [{ userId: 1 }] },
};

describe('quién ve qué · cotizaciones (persona × cotización)', () => {
  const ESPERADO: Record<keyof typeof COT, number[]> = {
    deDaniela: [1, 30],
    mandadaADavid: [1, 8, 30],
    revisionPedidaALuis: [1, 7, 30],
    deChristian: [1],
  };

  for (const [clave, quienes] of Object.entries(ESPERADO) as Array<[keyof typeof COT, number[]]>) {
    it.each(ORG.map((p) => [p.nombre, p.id] as const))(`${clave}: %s`, (_n, id) => {
      expect(cotizacionVisible(actor(id), COT[clave])).toBe(quienes.includes(id));
    });
  }

  it('«ver todas» por acceso, sin ser superadmin', () => {
    expect(cotizacionVisible({ id: 41, accesos: [ACCESOS.COTIZACIONES_VER_TODAS] }, COT.deChristian)).toBe(true);
  });

  it('el filtro de consulta dice lo mismo que la regla en memoria', () => {
    expect(whereCotizacionesVisibles(actor(1))).toEqual({});
    expect(whereCotizacionesVisibles(actor(30))).toEqual({
      OR: [{ createdById: 30 }, { asignadoAId: 30 }, { participantes: { some: { userId: 30 } } }],
    });
    expect(whereCotizacionesVisibles(null)).toEqual({ id: -1 });
  });
});

describe('quién ve qué · evidencias (persona × autor)', () => {
  const bajo = (id: number) => usuariosBajoMiMando(id, ORG);
  const ve = (quien: number, autor: number) => puedeVerDeAutor(actor(quien), autor, bajo(quien));

  // filas: quien mira; columnas: de quién es la evidencia.
  const ESPERADO: Record<number, number[]> = {
    1: [1, 7, 8, 20, 21, 30, 41, 50], // superadmin
    7: [7, 8, 20, 21, 30, 41, 50], // Luis: todos le reportan, y el que no tiene jefe cuelga de él
    8: [8, 20, 21], // David: él y sus 2 técnicos
    20: [20],
    21: [21],
    30: [30],
    41: [41],
    50: [50],
  };

  for (const [quien, autores] of Object.entries(ESPERADO)) {
    it.each(ORG.map((p) => [p.nombre, p.id] as const))(`mira ${quien}, de %s`, (_n, autor) => {
      expect(ve(Number(quien), autor)).toBe(autores.includes(autor));
    });
  }

  it('un ciclo en la cadena de jefes no se cuelga ni se cuenta a sí mismo', () => {
    const ciclo: PersonaOrganigrama[] = [
      { id: 1, managerId: 2, roleKey: 'ing_campo' },
      { id: 2, managerId: 1, roleKey: 'ing_campo' },
    ];
    expect([...usuariosBajoMiMando(1, ciclo)]).toEqual([2]);
  });
});

describe('quién ve qué · precios y accesos', () => {
  it('solo superadmin o con «Ver precios»', () => {
    expect(puedeVerPrecios(actor(1))).toBe(true);
    expect(puedeVerPrecios(actor(8))).toBe(true);
    for (const id of [7, 20, 30, 41, 50]) expect(puedeVerPrecios(actor(id))).toBe(false);
  });

  it('los accesos guardados solo aceptan claves conocidas', () => {
    expect(normalizarAccesos(['precios.ver', 'x', 'precios.ver', 'cotizaciones.ver_todas'])).toEqual([
      'precios.ver',
      'cotizaciones.ver_todas',
    ]);
    expect(normalizarAccesos('precios.ver')).toEqual([]);
  });
});

describe('quién ve qué · interruptor APAGADO = todo como antes', () => {
  beforeEach(() => fijarCompartimentada(false));
  afterEach(() => fijarCompartimentada(true));

  it('cotizaciones: todos ven todas y el filtro de consulta no agrega nada', () => {
    for (const p of ORG) {
      for (const c of Object.values(COT)) expect(cotizacionVisible(p.actor, c)).toBe(true);
      expect(whereCotizacionesVisibles(p.actor)).toEqual({});
    }
  });

  it('evidencias y precios: sin recorte', () => {
    expect(puedeVerDeAutor(actor(20), 30, new Set())).toBe(true);
    for (const p of ORG) expect(puedeVerPrecios(p.actor)).toBe(true);
  });

  it('el servicio no consulta nada para cotizaciones ni recorta autores', async () => {
    const prisma: any = {
      systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      cotizacion: { findFirst: jest.fn() },
      user: { findMany: jest.fn() },
    };
    const svc = new VisibilidadService(prisma);
    await expect(svc.assertCotizacionVisible(99, actor(20), 1)).resolves.toBeUndefined();
    await expect(svc.autoresVisibles(actor(20), 1)).resolves.toBeNull();
    expect(prisma.cotizacion.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('se prende solo con el renglón system_settings en «true»', async () => {
    const prisma: any = { systemSetting: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) } };
    await expect(new VisibilidadService(prisma).refrescarInterruptor()).resolves.toBe(true);
    expect(prisma.systemSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ key: 'visibilidad.compartimentada' }) }),
    );
  });
});

describe('quién ve qué · rutas de cotizaciones con :id', () => {
  it('el controlador de cotizaciones lleva el interceptor de visibilidad', () => {
    const interceptores = Reflect.getMetadata('__interceptors__', CotizacionesController) ?? [];
    expect(interceptores).toContain(CotizacionVisibleInterceptor);
  });

  function ctx(params: Record<string, string>) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ params, user: { id: 30 }, companyId: 1 }) }),
    } as any;
  }

  it('una cotización que no ve responde 404 y no llega al controlador', async () => {
    const visibilidad = { assertCotizacionVisible: jest.fn().mockRejectedValue(new NotFoundException()) };
    const handle = jest.fn(() => of('detalle'));
    const i = new CotizacionVisibleInterceptor(visibilidad as any);
    await expect(lastValueFrom(i.intercept(ctx({ id: '99' }), { handle }))).rejects.toBeInstanceOf(NotFoundException);
    expect(handle).not.toHaveBeenCalled();
    expect(visibilidad.assertCotizacionVisible).toHaveBeenCalledWith(99, { id: 30 }, 1);
  });

  it('una que sí ve pasa; una ruta sin :id no consulta', async () => {
    const visibilidad = { assertCotizacionVisible: jest.fn().mockResolvedValue(undefined) };
    const i = new CotizacionVisibleInterceptor(visibilidad as any);
    await expect(lastValueFrom(i.intercept(ctx({ id: '5' }), { handle: () => of('ok') }))).resolves.toBe('ok');
    await expect(lastValueFrom(i.intercept(ctx({}), { handle: () => of('lista') }))).resolves.toBe('lista');
    expect(visibilidad.assertCotizacionVisible).toHaveBeenCalledTimes(1);
  });
});
