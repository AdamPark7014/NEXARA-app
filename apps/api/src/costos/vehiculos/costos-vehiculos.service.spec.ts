import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CostosTarifasService } from '../costos-tarifas.service';
import { LibroCostosService } from '../libro-costos.service';
import { CostosVehiculosService, limitesDelMes } from './costos-vehiculos.service';
import { VehiculosMotorService } from './vehiculos-motor.service';

const CEO = { id: 1, roleKey: 'ceo' };
const TECNICO = { id: 7, roleKey: 'ing_campo' };

/** Prisma de mentiras con lo que usan estos servicios. */
function prismaFalso(semilla: Partial<Record<string, any[]>> = {}) {
  const t: Record<string, any[]> = {
    assets: [],
    especs: [],
    planes: [],
    servicios: [],
    cargas: [],
    controles: [],
    documentos: [],
    fichas: [],
    movimientos: [],
    ligas: [],
    actividades: [],
    proyectos: [],
    cotizaciones: [],
    // Cada prueba con su copia: una carga registrada aquí no debe verla la siguiente.
    ...Object.fromEntries(Object.entries(semilla).map(([k, v]) => [k, [...(v ?? [])]])),
  };
  let siguiente = 100;
  const coincide = (fila: any, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(fila[k]);
        if ('not' in v) return v.not === null ? fila[k] != null : fila[k] !== v.not;
      }
      return fila[k] === v;
    });
  const tabla = (nombre: string, propias: Record<string, unknown> = {}) => ({
    findMany: jest.fn(async ({ where }: any = {}) => t[nombre].filter((f) => coincide(f, where))),
    findFirst: jest.fn(async ({ where }: any = {}) => t[nombre].find((f) => coincide(f, where)) ?? null),
    count: jest.fn(async ({ where }: any = {}) => t[nombre].filter((f) => coincide(f, where)).length),
    create: jest.fn(async ({ data }: any) => {
      const fila = { id: siguiente++, createdAt: new Date('2026-06-30T12:00:00Z'), activo: true, ...data };
      t[nombre].push(fila);
      return fila;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const fila = t[nombre].find((f) => f.id === where.id);
      Object.assign(fila, data);
      return fila;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      for (const f of t[nombre].filter((x) => coincide(x, where))) Object.assign(f, data);
    }),
    delete: jest.fn(async ({ where }: any) => {
      t[nombre] = t[nombre].filter((f) => f.id !== where.id);
    }),
    ...propias,
  });
  const prisma: any = {
    t,
    vehicleAsset: tabla('assets'),
    vehiculoEspecificacion: tabla('especs', {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const previo = t.especs.find((e) => e.vehicleId === where.vehicleId);
        if (previo) Object.assign(previo, update);
        else t.especs.push({ id: siguiente++, createdAt: new Date('2026-06-30T12:00:00Z'), ...create });
      }),
    }),
    vehiculoServicioPlan: tabla('planes'),
    vehiculoServicio: tabla('servicios'),
    vehiculoCarga: tabla('cargas'),
    vehicleControl: tabla('controles'),
    vehiculoDocumento: tabla('documentos'),
    costoFichaEquipo: tabla('fichas'),
    costoMovimiento: tabla('movimientos'),
    costoParametros: { findFirst: jest.fn(async () => null) },
    costoActividadLiga: tabla('ligas'),
    activity: tabla('actividades'),
    operationalProject: tabla('proyectos'),
    cotizacion: tabla('cotizaciones'),
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

function armar(semilla: Partial<Record<string, any[]>> = {}) {
  const prisma = prismaFalso(semilla);
  const motor = new VehiculosMotorService(prisma);
  const tarifas = new CostosTarifasService(prisma);
  const libro = { sincronizar: jest.fn(async () => ({})) } as unknown as LibroCostosService;
  return { prisma, libro, servicio: new CostosVehiculosService(prisma, motor, tarifas, libro) };
}

const ASSET = { id: 2, companyId: 1, nombre: 'Nissan Frontier 2026', placas: 'TXA-12-34', estatus: 'Disponible', activo: true, updatedAt: new Date('2026-06-30') };
const ESPEC = {
  id: 3,
  companyId: 1,
  vehicleId: 2,
  marca: 'Nissan',
  rendimientoOficial: 11.91,
  tanqueLitros: 80,
  fechaCompra: new Date('2026-06-30'),
  odometroAlta: 5000,
  createdAt: new Date('2026-06-30T12:00:00Z'),
  fuentes: { tanqueLitros: { tipo: 'MANUAL', pagina: 418 } },
};
/** La camioneta de los casos a mano. Con estos números: $7.43 por km a 8.6 km/L. */
const FICHA = {
  id: 9,
  companyId: 1,
  tipo: 'VEHICULO',
  vehicleId: 2,
  activo: true,
  valor: 480000,
  valorLlantas: 12000,
  rescatePct: 0.3,
  vidaUnidades: 200000,
  unidadesAnio: 30000,
  tasaInteres: 0.12,
  primaSeguro: 0.04,
  ko: 0.6,
  rendimiento: null,
  precioCombustible: 24.5,
  costoAceite: 1200,
  aceiteCadaUnidades: 10000,
  vidaLlantasUnidades: 50000,
  otrosAnuales: 0,
};
const carga = (id: number, fecha: string, odometro: number, litros = 50, tanqueLleno = true) => ({
  id,
  companyId: 1,
  vehicleId: 2,
  fecha: new Date(`${fecha}T18:00:00Z`),
  odometro,
  litros,
  importe: litros * 24.5,
  tanqueLleno,
  ticketUrl: null,
  tableroUrl: null,
});
const CARGAS = [carga(1, '2026-08-01', 10000), carga(2, '2026-08-15', 10430), carga(3, '2026-09-01', 10860), carga(4, '2026-09-30', 11290)];
const salida = (id: number, actividadId: number, ini: number, fin: number, dia: string, foto = true) => ({
  id,
  companyId: 1,
  vehicleId: 2,
  actividadId,
  odometroInicio: ini,
  odometroFin: fin,
  fechaInicio: new Date(`${dia}T14:00:00Z`),
  fechaFin: new Date(`${dia}T22:00:00Z`),
  fechaSolicitud: new Date(`${dia}T12:00:00Z`),
  fotoTableroDevolucionUrl: foto ? '/uploads/vehicles/t.jpg' : null,
  actividad: { id: actividadId, anNumber: `AN-${actividadId}`, titulo: `Trabajo ${actividadId}` },
});

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-15T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => jest.useRealTimers());

describe('límites del mes', () => {
  it('va del día 1 al siguiente en hora de México', () => {
    const { desde, hasta } = limitesDelMes('2026-10');
    expect(desde.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(limitesDelMes('2026-12').hasta.toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });

  it('un mes mal escrito se rechaza', () => {
    expect(() => limitesDelMes('2026-13')).toThrow(BadRequestException);
    expect(() => limitesDelMes('octubre')).toThrow(BadRequestException);
  });
});

describe('ficha del vehículo', () => {
  const semilla = {
    assets: [ASSET],
    especs: [ESPEC],
    fichas: [FICHA],
    cargas: CARGAS,
    controles: [salida(11, 40, 11290, 11446, '2026-10-28')],
    servicios: [
      { id: 21, companyId: 1, vehicleId: 2, fecha: new Date('2026-09-05'), odometro: 10020, concepto: 'Aceite y filtro', costo: 4200, planIds: [31] },
    ],
    planes: [{ id: 31, companyId: 1, vehicleId: 2, concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6, activo: true, orden: 0 }],
    actividades: [{ id: 40, companyId: 1, projectId: 5, cotizacionId: null }],
    proyectos: [{ id: 5, companyId: 1, title: 'CCTV Bodega Norte', cotizacionId: null }],
    movimientos: [{ origen: 'VEHICULO:11', companyId: 1, importe: 1159.08 }],
  };

  it('el CEO ve costo por km, de qué se compone, valor y lo gastado en servicios', async () => {
    const { servicio } = armar(semilla);
    const f = await servicio.ficha(1, 2, CEO);
    expect(f.costos?.porKm).toBe(7.43);
    expect(f.costos?.desglose[0]).toEqual({ clave: 'co', nombre: 'Gasolina', importe: 2.8488 });
    expect(f.costos?.mantenimiento.gastado).toBe(4200);
    expect(f.odometro).toEqual({ km: 11446, fecha: '2026-10-28' });
    expect(f.rendimiento).toMatchObject({ fuente: 'REAL', usado: 8.6, oficial: 11.91, tanques: 3 });
    expect(f.autonomiaKm).toBe(688);
    expect(f.viajes[0]).toMatchObject({
      km: 156,
      importe: 1159.08,
      destino: { tipo: 'PROYECTO', id: 5, nombre: 'CCTV Bodega Norte' },
      actividad: { folio: 'AN-40' },
    });
    expect(f.proximoServicio).toMatchObject({ km: 20020, conceptos: ['Aceite y filtro'] });
    expect(f.especificacion?.fuentes).toEqual({ tanqueLitros: { tipo: 'MANUAL', pagina: 418 } });
  });

  it('un técnico ve kilómetros y rendimiento, pero ningún importe', async () => {
    const { servicio } = armar(semilla);
    const f = await servicio.ficha(1, 2, TECNICO);
    expect(f.costos).toBeNull();
    expect(f.viajes[0].importe).toBeNull();
    expect(f.viajes[0].km).toBe(156);
    expect(f.servicios[0].costo).toBeNull();
    expect(f.rendimiento.usado).toBe(8.6);
    expect(f.acceso.veCostos).toBe(false);
  });

  it('un vehículo sin ficha también abre, y dice lo que le falta', async () => {
    const { servicio } = armar({ assets: [ASSET] });
    const f = await servicio.ficha(1, 2, CEO);
    expect(f.tieneFicha).toBe(false);
    expect(f.costos).toBeNull();
    expect(f.avisos).toMatchObject({ sinFichaDeCosto: true, sinSalidas: true });
  });

  it('un vehículo de otra empresa no existe', async () => {
    const { servicio } = armar({ assets: [{ ...ASSET, companyId: 99 }] });
    await expect(servicio.ficha(1, 2, CEO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('flotilla del mes', () => {
  /**
   * Octubre: del odómetro 11,290 al 11,750 son 460 km.
   * Con salida: 156 a proyecto, 62 a cotización, 38 a oficina, 104 sin ligar. Sin salida: 100.
   */
  const semilla = {
    assets: [ASSET],
    especs: [ESPEC],
    fichas: [FICHA],
    cargas: [...CARGAS, carga(5, '2026-10-30', 11750, 30, false)],
    controles: [
      salida(11, 40, 11290, 11446, '2026-10-05'),
      salida(12, 41, 11446, 11508, '2026-10-10'),
      salida(13, 42, 11508, 11546, '2026-10-15', false),
      salida(14, 43, 11546, 11650, '2026-10-20'),
    ],
    actividades: [
      { id: 40, companyId: 1, projectId: 5, cotizacionId: null },
      { id: 41, companyId: 1, projectId: null, cotizacionId: 8 },
      { id: 42, companyId: 1, projectId: null, cotizacionId: null },
      { id: 43, companyId: 1, projectId: null, cotizacionId: null },
    ],
    ligas: [{ companyId: 1, activityId: 42, tipo: 'INTERNA', proyectoId: null, cotizacionId: null }],
    proyectos: [{ id: 5, companyId: 1, title: 'CCTV Bodega Norte', cotizacionId: null }],
    cotizaciones: [{ id: 8, companyId: 1, quoteNumber: 'NEX-0042' }],
  };

  it('reparte el mes por destino, con la cuenta a mano', async () => {
    const { servicio } = armar(semilla);
    const r = await servicio.flotilla(1, '2026-10', CEO);
    expect(r.vehiculos[0]).toMatchObject({ kmDelMes: 460, porKm: 7.43, rendimientoReal: 8.6, rendimientoOficial: 11.91 });
    expect(r.reparto.proyectos).toEqual({ km: 156, importe: 1159.08 });
    expect(r.reparto.cotizaciones).toEqual({ km: 62, importe: 460.66 });
    expect(r.reparto.oficina).toEqual({ km: 38, importe: 282.34 });
    expect(r.reparto.sinLigar).toEqual({ km: 204, importe: 1515.72 });
    // 30,000 km × 31/365 = 2,547.95 de plan; 2,087.95 km parados × ($1.224 + $0.408).
    expect(r.reparto.parado).toBe(3407.53);
    expect(r.resumen).toEqual({ km: 460, costoMes: 6825.33, porKm: 7.43, aIndirectos: 3689.87 });
  });

  it('lo que el libro ya costeó manda sobre la tarifa de hoy', async () => {
    const { servicio } = armar({ ...semilla, movimientos: [{ origen: 'VEHICULO:11', companyId: 1, importe: 1000 }] });
    const r = await servicio.flotilla(1, '2026-10', CEO);
    expect(r.reparto.proyectos).toEqual({ km: 156, importe: 1000 });
  });

  it('avisa la salida sin foto y los km que el odómetro avanzó sin salida', async () => {
    const { servicio } = armar(semilla);
    const { avisos } = await servicio.flotilla(1, '2026-10', CEO);
    expect(avisos.map((a) => a.titulo)).toEqual(
      expect.arrayContaining(['Nissan Frontier 2026: 1 salida sin foto del tablero', 'Nissan Frontier 2026: 100 km sin salida']),
    );
  });

  it('avisa servicio vencido primero, y el documento por vencer', async () => {
    const { servicio } = armar({
      ...semilla,
      planes: [{ id: 31, companyId: 1, vehicleId: 2, concepto: 'Aceite y filtro', cadaKm: 1000, cadaMeses: null, activo: true, orden: 0 }],
      documentos: [{ id: 1, companyId: 1, vehicleId: 2, tipo: 'POLIZA', nombre: 'Póliza', url: '/uploads/vehicles/p.pdf', venceEl: new Date('2026-11-27'), createdAt: new Date() }],
    });
    const { avisos } = await servicio.flotilla(1, '2026-10', CEO);
    expect(avisos[0]).toMatchObject({ tono: 'danger', titulo: 'Nissan Frontier 2026: servicio vencido' });
    expect(avisos.map((a) => a.titulo)).toContain('Nissan Frontier 2026: Póliza por vencer');
  });

  it('un técnico ve kilómetros sin un solo peso', async () => {
    const { servicio } = armar(semilla);
    const r = await servicio.flotilla(1, '2026-10', TECNICO);
    expect(r.vehiculos[0]).toMatchObject({ kmDelMes: 460, porKm: null, rendimientoReal: 8.6 });
    expect(r.reparto.proyectos).toEqual({ km: 156, importe: null });
    expect(r.reparto.parado).toBeNull();
    expect(r.resumen).toEqual({ km: 460, costoMes: null, porKm: null, aIndirectos: null });
  });

  it('sin ficha no hay costo, pero sí se cuentan los km y se avisa', async () => {
    const { servicio } = armar({ ...semilla, especs: [], fichas: [] });
    const r = await servicio.flotilla(1, '2026-10', CEO);
    expect(r.resumen.costoMes).toBe(0);
    expect(r.vehiculos[0].porKm).toBeNull();
    expect(r.avisos.map((a) => a.titulo)).toContain('Nissan Frontier 2026: sin ficha');
  });

  it('el mes en curso solo cuenta el plan hasta hoy', async () => {
    const { servicio } = armar(semilla);
    const r = await servicio.flotilla(1, '2026-11', CEO);
    // Del 1 a las 06:00 UTC al 15 a las 18:00 UTC: 14.5 días. 30,000 × 14.5/365 × $1.632.
    expect(r.reparto.parado).toBeCloseTo(1944.99, 1);
  });
});

describe('alta y edición', () => {
  const datos = {
    marca: 'Nissan',
    modelo: 'Frontier',
    anio: 2026,
    placas: ' TXA-12-34 ',
    tanqueLitros: 80,
    rendimientoOficial: 11.91,
    odometroAlta: 12480,
    fechaCompra: '2026-06-30',
    fuentes: { tanqueLitros: { tipo: 'MANUAL', pagina: 418 } },
    plan: [{ concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6, paginaManual: 431 }],
    costo: { valor: 480000 },
    manual: { url: '/uploads/vehicles/m.pdf', nombre: 'Manual Frontier.pdf', paginas: 612 },
  };

  it('crea todo junto: vehículo, ficha, programa, costo y manual', async () => {
    const { prisma, servicio } = armar();
    const f = await servicio.guardar(1, null, datos, CEO);
    expect(prisma.t.assets[0]).toMatchObject({ nombre: 'Nissan Frontier 2026', placas: 'TXA-12-34', estatus: 'Disponible' });
    expect(prisma.t.especs[0]).toMatchObject({ tanqueLitros: 80, odometroAlta: 12480 });
    expect(prisma.t.planes[0]).toMatchObject({ concepto: 'Aceite y filtro', paginaManual: 431 });
    expect(prisma.t.documentos[0]).toMatchObject({ tipo: 'MANUAL', paginas: 612 });
    // Con los valores iniciales y el rendimiento oficial: $6.64 por km.
    expect(prisma.t.fichas[0]).toMatchObject({ tipo: 'VEHICULO', unidad: 'KM', valor: 480000, vidaUnidades: 200000, unidadesAnio: 30000 });
    expect(f.costos?.porKm).toBeCloseTo(6.64, 2);
  });

  it('el costo lo captura dirección o contabilidad', async () => {
    const { prisma, servicio } = armar();
    await expect(servicio.guardar(1, null, datos, TECNICO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.t.assets).toHaveLength(0);
  });

  it('sin costo también se puede dar de alta, pero no sale tarifa', async () => {
    const { servicio } = armar();
    const { costo: _sinCosto, ...resto } = datos;
    const f = await servicio.guardar(1, null, resto, { ...TECNICO, roleKey: 'dir_operaciones' });
    expect(f.tieneFicha).toBe(true);
    expect(f.costos).toBeNull();
  });

  it('pide marca y modelo, precio, y un intervalo para cada servicio', async () => {
    const { servicio } = armar();
    await expect(servicio.guardar(1, null, { placas: 'X' }, CEO)).rejects.toThrow('marca y el modelo');
    await expect(servicio.guardar(1, null, { ...datos, costo: {} }, CEO)).rejects.toThrow('precio de compra');
    await expect(servicio.guardar(1, null, { ...datos, plan: [{ concepto: 'Bujías' }] }, CEO)).rejects.toThrow('cada cuánto');
  });

  it('solo acepta un manual que se subió aquí', async () => {
    const { servicio } = armar();
    await expect(
      servicio.guardar(1, null, { ...datos, manual: { url: 'https://otro.com/m.pdf', nombre: 'm' } }, CEO),
    ).rejects.toThrow('no se subió aquí');
  });

  it('completar la ficha de un vehículo que ya estaba no crea otro', async () => {
    const { prisma, servicio } = armar({ assets: [ASSET] });
    await servicio.guardar(1, 2, { ...datos, nombre: undefined }, CEO);
    expect(prisma.t.assets).toHaveLength(1);
    expect(prisma.t.especs[0].vehicleId).toBe(2);
    expect(prisma.t.fichas[0].vehicleId).toBe(2);
  });

  it('editar la ficha de costo conserva lo capturado que no venga', async () => {
    const { prisma, servicio } = armar({ assets: [ASSET], especs: [ESPEC], fichas: [{ ...FICHA, vidaUnidades: 300000 }] });
    await servicio.guardar(1, 2, { costo: { valor: 500000 } }, CEO);
    expect(prisma.t.fichas).toHaveLength(1);
    expect(prisma.t.fichas[0]).toMatchObject({ valor: 500000, vidaUnidades: 300000 });
  });

  it('volver a costear los viajes solo cuando se pide', async () => {
    const { libro, servicio } = armar({ assets: [ASSET], especs: [ESPEC], fichas: [FICHA] });
    await servicio.guardar(1, 2, { costo: { valor: 500000 } }, CEO);
    expect(libro.sincronizar).not.toHaveBeenCalled();
    await servicio.guardar(1, 2, { costo: { valor: 500000 } }, CEO, { recostear: true });
    expect(libro.sincronizar).toHaveBeenCalledWith(1, { vehicleId: 2 });
  });

  it('el programa conserva ids, agrega lo nuevo y apaga lo que ya no viene', async () => {
    const planes = [
      { id: 31, companyId: 1, vehicleId: 2, concepto: 'Aceite', cadaKm: 10000, cadaMeses: null, activo: true, orden: 0 },
      { id: 32, companyId: 1, vehicleId: 2, concepto: 'Bujías', cadaKm: 100000, cadaMeses: null, activo: true, orden: 1 },
    ];
    const { prisma, servicio } = armar({ assets: [ASSET], planes });
    await servicio.guardarPlan(1, 2, [{ id: 31, concepto: 'Aceite y filtro', cadaKm: 15000 }, { concepto: 'Filtro de aire', cadaKm: 20000 }], CEO);
    expect(prisma.t.planes.find((p: any) => p.id === 31)).toMatchObject({ concepto: 'Aceite y filtro', cadaKm: 15000, activo: true });
    expect(prisma.t.planes.find((p: any) => p.id === 32).activo).toBe(false);
    expect(prisma.t.planes.find((p: any) => p.concepto === 'Filtro de aire').activo).toBe(true);
  });
});

describe('gasolina', () => {
  const semilla = { assets: [ASSET], especs: [ESPEC], fichas: [FICHA], cargas: [carga(1, '2026-10-20', 12030)] };

  it('registrar un tanque lleno da el rendimiento de ese tanque', async () => {
    const { servicio } = armar(semilla);
    const f = await servicio.registrarCarga(1, 2, { odometro: 12480, litros: 52.3, importe: 1281.35, tanqueLleno: true }, TECNICO);
    expect(f.tanques).toEqual([expect.objectContaining({ km: 450, kmPorLitro: 8.6 })]);
    expect(f.odometro?.km).toBe(12480);
  });

  it('una carga de hoy no puede traer menos km que lo último leído', async () => {
    const { servicio } = armar(semilla);
    await expect(servicio.registrarCarga(1, 2, { odometro: 12000, litros: 50, importe: 1200, tanqueLleno: true }, TECNICO)).rejects.toThrow('12,030');
  });

  it('una vieja capturada tarde sí, y no mueve el odómetro vigente', async () => {
    const { servicio } = armar(semilla);
    const f = await servicio.registrarCarga(1, 2, { fecha: '2026-10-01', odometro: 11000, litros: 50, importe: 1200, tanqueLleno: true }, TECNICO);
    expect(f.odometro?.km).toBe(12030);
  });

  it('rechaza lo que no cuadra y una fecha futura', async () => {
    const { servicio } = armar(semilla);
    const base = { odometro: 13000, litros: 50, importe: 1200, tanqueLleno: true };
    await expect(servicio.registrarCarga(1, 2, { ...base, litros: 0 }, TECNICO)).rejects.toThrow('litros');
    await expect(servicio.registrarCarga(1, 2, { ...base, importe: 99999 }, TECNICO)).rejects.toThrow('importe');
    await expect(servicio.registrarCarga(1, 2, { ...base, odometro: 1.5 }, TECNICO)).rejects.toThrow('odómetro');
    await expect(servicio.registrarCarga(1, 2, { ...base, fecha: '2027-01-01' }, TECNICO)).rejects.toThrow('futura');
  });

  it('solo acepta fotos que se subieron aquí', async () => {
    const { servicio } = armar(semilla);
    await expect(
      servicio.registrarCarga(1, 2, { odometro: 13000, litros: 50, importe: 1200, tanqueLleno: true, ticketUrl: 'https://x/y.jpg' }, TECNICO),
    ).rejects.toThrow('no se subió aquí');
  });

  it('quitar una carga de otro vehículo no se puede', async () => {
    const { servicio } = armar(semilla);
    await expect(servicio.quitarCarga(1, 3, 1, CEO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('servicios y documentos', () => {
  const planes = [{ id: 31, companyId: 1, vehicleId: 2, concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6, activo: true, orden: 0 }];
  const semilla = { assets: [ASSET], especs: [ESPEC], fichas: [FICHA], planes };

  it('un servicio hecho mueve el programa', async () => {
    const { servicio } = armar(semilla);
    const f = await servicio.registrarServicio(
      1,
      2,
      { fecha: '2026-09-05', odometro: 10020, concepto: 'Servicio de 10,000', costo: 1550, planIds: [31] },
      CEO,
    );
    expect(f.programa[0]).toMatchObject({ ultimoKm: 10020, proximoKm: 20020, proximaFecha: '2027-03-05' });
    expect(f.costos?.mantenimiento.gastado).toBe(1550);
    expect(f.desgaste.vida.km).toBe(10020);
  });

  it('no acepta conceptos de otro vehículo', async () => {
    const { servicio } = armar(semilla);
    await expect(
      servicio.registrarServicio(1, 2, { fecha: '2026-09-05', concepto: 'X', planIds: [999] }, CEO),
    ).rejects.toThrow('programa de este vehículo');
  });

  it('pide qué se hizo y cuándo', async () => {
    const { servicio } = armar(semilla);
    await expect(servicio.registrarServicio(1, 2, { fecha: '2026-09-05', concepto: ' ' }, CEO)).rejects.toThrow('qué se le hizo');
    await expect(servicio.registrarServicio(1, 2, { fecha: '', concepto: 'X' }, CEO)).rejects.toThrow('fecha');
  });

  it('un documento dice si está vigente, por vencer o vencido', async () => {
    const { servicio } = armar(semilla);
    const subir = (venceEl: string | null, nombre: string) =>
      servicio.agregarDocumento(1, 2, { tipo: 'POLIZA', nombre, url: '/uploads/vehicles/p.pdf', venceEl }, CEO);
    await subir('2027-06-30', 'Vigente');
    await subir('2026-11-20', 'Pronto');
    await subir('2026-10-01', 'Vencido');
    const f = await subir(null, 'Sin fecha');
    const estado = Object.fromEntries(f.documentos.map((d) => [d.nombre, d.estado]));
    expect(estado).toEqual({ Vigente: 'VIGENTE', Pronto: 'PRONTO', Vencido: 'VENCIDO', 'Sin fecha': 'SIN_FECHA' });
  });

  it('rechaza un tipo de documento que no existe', async () => {
    const { servicio } = armar(semilla);
    await expect(servicio.agregarDocumento(1, 2, { tipo: 'RECIBO', nombre: 'x', url: '/uploads/vehicles/p.pdf' }, CEO)).rejects.toThrow('Tipo de documento');
  });
});
