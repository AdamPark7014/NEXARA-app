import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VehiclesService, type EntradaCaptura } from './vehicles.service';
import { SLOTS_CHECKLIST } from './checklist-entrega';
import { CAMPO_VIDEO_VUELTA, SLOTS_GUIADA } from './captura-guiada';
import { reiniciarCacheInterruptor } from './interruptor-vehiculos';

/**
 * El servicio con la captura guiada: quién registra, km contra el último registro, el interruptor,
 * la salida de inventario ligada a una actividad, la devolución que cierra el uso y la comparación con IA.
 */

const EN_VIVO = () => ({ capturedAt: new Date().toISOString(), lat: 19.04, lng: -98.2 });

function guiada(extra: Record<string, unknown> = {}): EntradaCaptura {
  const fotos: Record<string, string> = Object.fromEntries(SLOTS_GUIADA.map((s) => [s, `/uploads/vehicles/${s}.jpg`]));
  fotos[CAMPO_VIDEO_VUELTA] = '/uploads/vehicles/vuelta.mp4';
  const meta: Record<string, any> = Object.fromEntries(SLOTS_GUIADA.map((s) => [s, EN_VIVO()]));
  meta[CAMPO_VIDEO_VUELTA] = { capturedAt: new Date().toISOString(), duracionSeg: 15 };
  return { version: 2, fotos, meta, odometroKm: 48_215, combustible: '1/2', ...extra } as EntradaCaptura;
}

function checklist(extra: Record<string, unknown> = {}): EntradaCaptura {
  return {
    fotos: Object.fromEntries(SLOTS_CHECKLIST.map((s) => [s, `/uploads/vehicles/${s}.jpg`])),
    meta: Object.fromEntries(SLOTS_CHECKLIST.map((s) => [s, EN_VIVO()])),
    odometroKm: 48_215,
    combustible: '1/2',
    ...extra,
  } as EntradaCaptura;
}

function build(over: { control?: any; asset?: any; interruptor?: boolean; ultimoKm?: number | null; actividad?: any } = {}) {
  const control = {
    id: 1,
    companyId: 7,
    solicitanteId: 5,
    encargadoId: 6,
    vehicleId: 3,
    nombreVehiculo: 'Hilux 2',
    estatusAprobacion: 'Aprobado',
    entregaEstatus: 'Pendiente',
    fotosSalida: null,
    fotosDevolucion: null,
    fotosMeta: null,
    odometroInicio: null,
    capturaVersion: 1,
    lecturasKm: null,
    alertasKm: null,
    kmEsperados: null,
    firmas: null,
    fechaInicioAprobada: null,
    ...over.control,
  };
  const asset = {
    id: 3,
    companyId: 7,
    nombre: 'Hilux 2',
    placas: 'ABC-123',
    estatus: 'Disponible',
    activo: true,
    assignedToId: null,
    assignedAt: null,
    salidaFotos: null,
    devolucionFotos: null,
    ...over.asset,
  };
  const prisma: any = {
    systemSetting: { findFirst: jest.fn().mockResolvedValue(over.interruptor ? { id: 1 } : null) },
    vehicleControl: {
      findFirst: jest.fn().mockResolvedValue(control),
      findMany: jest.fn().mockResolvedValue(
        over.ultimoKm != null
          ? [{ odometroInicio: null, odometroFin: over.ultimoKm, fechaFin: new Date(), fechaInicio: null, fotosSalida: null, fotosDevolucion: null }]
          : [],
      ),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...control, ...data })),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 77, ...data })),
    },
    vehicleAsset: {
      findFirst: jest.fn().mockImplementation(({ select }: any = {}) =>
        Promise.resolve(select?.salidaFotos && !select?.id ? { salidaFotos: null, devolucionFotos: null } : asset),
      ),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...asset, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehiculoCarga: { findFirst: jest.fn().mockResolvedValue(null) },
    activity: {
      findFirst: jest.fn().mockResolvedValue(
        over.actividad === null
          ? null
          : { id: 40, estatus: 'En proceso', destino: null, fechaEntregaEsperada: new Date('2026-11-22T00:00:00Z'), fechaMaxima: null, ...over.actividad },
      ),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 9 }), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const danos = { analizarEnSegundoPlano: jest.fn() };
  const service = new VehiclesService(prisma, { notifyVehicleRequested: jest.fn() } as any, danos as any);
  return { service, prisma, danos, control, asset };
}

beforeEach(() => reiniciarCacheInterruptor());

describe('salida con captura guiada', () => {
  it('guarda video, versión 2 y lo que leyó la IA', async () => {
    const { service, prisma } = build();
    await service.startUse(1, 5, guiada({ lecturaIa: { odometroKm: 48_215, combustiblePct: 50 } }), 7);
    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.capturaVersion).toBe(2);
    expect(data.videoSalidaUrl).toBe('/uploads/vehicles/vuelta.mp4');
    expect(data.fotoTableroSalidaUrl).toBe('/uploads/vehicles/km-gasolina.jpg');
    expect(data.odometroInicio).toBe(48_215);
    expect(data.fotosSalida.videoUrl).toBe('/uploads/vehicles/vuelta.mp4');
    expect(data.lecturasKm.salida).toMatchObject({ corregido: false, confirmado: { odometroKm: 48_215, combustiblePct: 50 } });
    expect(data.fotosMeta.salida).toHaveLength(12);
  });

  it('el encargado también puede registrarla; un tercero no', async () => {
    await expect(build().service.startUse(1, 6, guiada(), 7)).resolves.toBeTruthy();
    await expect(build().service.startUse(1, 99, guiada(), 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Liz (o un mando con vehicles.review) puede registrarla en persona', async () => {
    await expect(build().service.startUse(1, { id: 99, puedeRevisar: true }, guiada(), 7)).resolves.toBeTruthy();
  });

  it('con el interruptor prendido, un km menor al último registro de la unidad es 400', async () => {
    const { service, prisma } = build({ ultimoKm: 50_000, interruptor: true });
    await expect(service.startUse(1, 5, guiada(), 7)).rejects.toThrow(/menor al último registro/);
    expect(prisma.vehicleControl.update).not.toHaveBeenCalled();
  });

  it('apagado, no bloquea a nadie: entra con alerta y sin avisos', async () => {
    const { service, prisma } = build({ ultimoKm: 50_000 });
    await service.startUse(1, 5, guiada(), 7);
    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.alertasKm).toEqual([expect.objectContaining({ tipo: 'KM_MENOR', mensaje: expect.stringMatching(/Revisa cuál/) })]);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('salvo que Liz lo autorice porque el registro anterior estaba mal: pasa con alerta a su nombre', async () => {
    const { service, prisma } = build({ ultimoKm: 50_000, interruptor: true });
    await service.startUse(1, { id: 8, nombre: 'Liz', puedeRevisar: true }, guiada({ forzarKm: true }), 7);
    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.alertasKm).toEqual([expect.objectContaining({ tipo: 'KM_MENOR', mensaje: expect.stringMatching(/autorización de Liz/) })]);
  });

  it('forzarKm de alguien que no revisa vehículos no sirve', async () => {
    const { service } = build({ ultimoKm: 50_000, interruptor: true });
    await expect(service.startUse(1, 5, guiada({ forzarKm: true }), 7)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un salto grande desde el último registro queda como alerta y avisa a Liz', async () => {
    const { service, prisma } = build({ ultimoKm: 48_000, interruptor: true });
    prisma.user.findMany.mockResolvedValue([{ id: 8, email: 'lizeth.antonio@nexara.com.mx', puesto: null }]);
    await service.startUse(1, 5, guiada(), 7);
    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.alertasKm).toEqual([expect.objectContaining({ tipo: 'KM_SIN_REGISTRO', km: 215 })]);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ userId: 8, title: 'Kilometraje: Hilux 2' });
  });
});

describe('el interruptor', () => {
  it('apagado: el checklist de 7 fotos sigue entrando', async () => {
    await expect(build().service.startUse(1, 5, checklist(), 7)).resolves.toBeTruthy();
  });

  it('prendido: una salida con la app vieja pide actualizar', async () => {
    await expect(build({ interruptor: true }).service.startUse(1, 5, checklist(), 7)).rejects.toThrow(/Actualiza la app/);
  });

  it('prendido: la devolución con la app vieja sí entra (nadie se queda con la unidad)', async () => {
    const { service } = build({ interruptor: true, control: { fotosSalida: { odometroKm: 48_000 }, odometroInicio: 48_000, entregaEstatus: 'En uso' } });
    await expect(service.endUse(1, 5, checklist(), 7)).resolves.toBeTruthy();
  });

  it('prendido: sacar del inventario pide actividad', async () => {
    await expect(build({ interruptor: true }).service.checkoutAsset(3, 5, guiada(), 7)).rejects.toThrow(/elige la actividad/);
  });
});

describe('devolución', () => {
  const enUso = { fotosSalida: { odometroKm: 48_000 }, odometroInicio: 48_000, entregaEstatus: 'En uso', capturaVersion: 2 };

  it('guarda video y lectura, libera la unidad del inventario y manda a comparar con IA', async () => {
    const { service, prisma, danos } = build({ control: enUso, interruptor: true });
    await service.endUse(1, 6, guiada({ odometroKm: 48_100 }), 7);
    const data = prisma.vehicleControl.update.mock.calls[0][0].data;
    expect(data.videoDevolucionUrl).toBe('/uploads/vehicles/vuelta.mp4');
    expect(data.odometroFin).toBe(48_100);
    expect(data.entregaEstatus).toBe('Devuelto');
    expect(data.capturaVersion).toBeUndefined();
    expect(prisma.vehicleAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3, estatus: 'Asignado', assignedToId: { in: [5, 6] } } }),
    );
    expect(danos.analizarEnSegundoPlano).toHaveBeenCalledWith(1);
  });

  it('con el interruptor apagado no llama a la IA', async () => {
    const { service, danos } = build({ control: enUso });
    await service.endUse(1, 6, guiada({ odometroKm: 48_100 }), 7);
    expect(danos.analizarEnSegundoPlano).not.toHaveBeenCalled();
  });

  it('salió con la guiada y vuelve con la app vieja: baja a versión 1 para no comparar vistas distintas', async () => {
    const { service, prisma } = build({ control: enUso });
    await service.endUse(1, 5, checklist({ odometroKm: 48_100 }), 7);
    expect(prisma.vehicleControl.update.mock.calls[0][0].data.capturaVersion).toBe(1);
  });

  it('recorrer mucho más de lo que pide la actividad es alerta para Liz', async () => {
    const { service, prisma } = build({ control: { ...enUso, kmEsperados: 20 } });
    await service.endUse(1, 5, guiada({ odometroKm: 48_300 }), 7);
    expect(prisma.vehicleControl.update.mock.calls[0][0].data.alertasKm).toEqual([
      expect.objectContaining({ tipo: 'KM_DE_MAS', km: 300 }),
    ]);
  });
});

describe('inventario ligado a una actividad', () => {
  it('la salida crea un uso aprobado y en uso, con su actividad, encargado y fin', async () => {
    const { service, prisma } = build();
    const r: any = await service.checkoutAsset(3, { id: 5, nombre: 'Oscar' }, guiada(), 7, { actividadId: '40', encargadoId: 9 });
    expect(r.usoId).toBe(77);
    expect(prisma.vehicleAsset.update.mock.calls[0][0].data).toMatchObject({ estatus: 'Asignado', assignedToId: 9 });
    const data = prisma.vehicleControl.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      actividadId: 40,
      vehicleId: 3,
      solicitanteId: 5,
      encargadoId: 9,
      estatusAprobacion: 'Aprobado',
      entregaEstatus: 'En uso',
      odometroInicio: 48_215,
      capturaVersion: 2,
      videoSalidaUrl: '/uploads/vehicles/vuelta.mp4',
      companyId: 7,
    });
    expect(data.fechaFinAprobada).toEqual(new Date('2026-11-22T00:00:00Z'));
  });

  it('no sale para una actividad cerrada', async () => {
    const { service } = build({ actividad: { estatus: 'Finalizada' } });
    await expect(service.checkoutAsset(3, 5, guiada(), 7, { actividadId: 40 })).rejects.toThrow(/actividad ya está cerrada/);
  });

  it('un encargado que no es de la empresa no vale', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.checkoutAsset(3, 5, guiada(), 7, { actividadId: 40, encargadoId: 123 })).rejects.toThrow(/encargado/);
  });

  it('la devolución por inventario cierra el uso abierto y lo manda a comparar', async () => {
    const { service, prisma, danos } = build({
      interruptor: true,
      asset: { estatus: 'Asignado', assignedToId: 9, assignedAt: new Date(), salidaFotos: { odometroKm: 48_000 } },
      control: { id: 77, vehicleId: 3, entregaEstatus: 'En uso', fotosSalida: { odometroKm: 48_000 }, odometroInicio: 48_000, solicitanteId: 5, encargadoId: 9 },
    });
    await service.returnAsset(3, { id: 9 }, guiada({ odometroKm: 48_050 }), 7);
    expect(prisma.vehicleAsset.update.mock.calls[0][0].data).toMatchObject({ estatus: 'Disponible', assignedToId: null });
    expect(prisma.vehicleControl.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77 }, data: expect.objectContaining({ entregaEstatus: 'Devuelto', odometroFin: 48_050 }) }),
    );
    expect(danos.analizarEnSegundoPlano).toHaveBeenCalledWith(77);
  });
});

describe('firmas', () => {
  it('guarda la firma de quien entrega y de quien recibe, por momento', async () => {
    const { service, prisma } = build({ control: { firmas: { salida: { entrega: { nombre: 'Liz' } } } } });
    await service.registrarFirma(1, { id: 8, puedeRevisar: true }, { momento: 'salida', rol: 'recibe', nombre: 'Oscar', userId: 6, url: '/uploads/vehicles/firma-1.png' }, 7);
    const firmas = prisma.vehicleControl.update.mock.calls[0][0].data.firmas;
    expect(firmas.salida.entrega).toEqual({ nombre: 'Liz' });
    expect(firmas.salida.recibe).toMatchObject({ nombre: 'Oscar', userId: 6, url: '/uploads/vehicles/firma-1.png', registradoPorId: 8 });
  });

  it('pide momento, rol y nombre válidos; la devolución solo después de la salida', async () => {
    const { service } = build();
    const actor = { id: 8, puedeRevisar: true };
    await expect(service.registrarFirma(1, actor, { momento: 'ayer', rol: 'recibe', nombre: 'x', url: 'u' }, 7)).rejects.toThrow(/momento/);
    await expect(service.registrarFirma(1, actor, { momento: 'salida', rol: 'testigo', nombre: 'x', url: 'u' }, 7)).rejects.toThrow(/rol/);
    await expect(service.registrarFirma(1, actor, { momento: 'salida', rol: 'recibe', nombre: ' ', url: 'u' }, 7)).rejects.toThrow(/nombre/);
    await expect(service.registrarFirma(1, actor, { momento: 'devolucion', rol: 'recibe', nombre: 'x', url: 'u' }, 7)).rejects.toThrow(/salida/);
  });

  it('un id de persona ajena al uso no se guarda', async () => {
    const { service, prisma } = build();
    await service.registrarFirma(1, { id: 8, puedeRevisar: true }, { momento: 'salida', rol: 'recibe', nombre: 'X', userId: 500, url: 'u' }, 7);
    expect(prisma.vehicleControl.update.mock.calls[0][0].data.firmas.salida.recibe.userId).toBeNull();
  });
});

describe('bloque «Vehículo» de la actividad', () => {
  function conActividad(usos: any[]) {
    const b = build();
    b.prisma.activity.findFirst.mockResolvedValue({
      id: 40,
      anNumber: 'AN-0500',
      titulo: 'Instalación IPADE día 1',
      estatus: 'En proceso',
      responsableId: 20,
      creadoPorId: 21,
      responsable: { managerId: 22 },
      assignees: [{ userId: 23 }],
    });
    b.prisma.vehicleControl.findMany.mockResolvedValue(usos);
    b.prisma.costoMovimiento = { findMany: jest.fn().mockResolvedValue([{ origen: 'VEHICULO:1', importe: '350.5' }]) };
    return b;
  }
  const uso = {
    id: 1,
    entregaEstatus: 'Devuelto',
    estatusAprobacion: 'Aprobado',
    capturaVersion: 2,
    solicitanteId: 5,
    encargadoId: 6,
    vehiculo: { id: 3, nombre: 'Hilux 2', placas: 'ABC-123' },
    solicitante: { id: 5, nombre: 'Oscar' },
    encargado: { id: 6, nombre: 'David' },
    fotosSalida: { fotos: [{ slot: 'vuelta-1', url: 'a.jpg' }], registradoEn: '2026-11-21T14:00:00Z' },
    fotosDevolucion: { fotos: [{ slot: 'vuelta-1', url: 'b.jpg' }], registradoEn: '2026-11-21T20:00:00Z' },
    odometroInicio: 48_000,
    odometroFin: 48_120,
    combustibleInicioPct: 75,
    combustibleFinPct: 50,
    videoSalidaUrl: 'v1.mp4',
    videoDevolucionUrl: 'v2.mp4',
    kmEsperados: 110,
    alertasKm: [],
    hallazgos: [{ estatus: 'PROPUESTO' }, { estatus: 'CONFIRMADO' }],
    incidencias: [{ id: 4, tipo: 'DANO', estatus: 'ABIERTA', descripcion: 'rayón', quienPaga: 'EMPRESA', costoEstimado: '1200', costoReal: null }],
  };

  it('enseña unidad, encargado, km, gasolina, fotos, video, daños e incidencias', async () => {
    const { service } = conActividad([uso]);
    const r = await service.porActividad(40, { id: 8, esGestor: true, roleKey: 'coord_admin' } as any, 7);
    expect(r.actividad).toEqual({ id: 40, folio: 'AN-0500', titulo: 'Instalación IPADE día 1', estatus: 'En proceso' });
    const u = r.usos[0];
    expect(u.unidad).toEqual({ id: 3, nombre: 'Hilux 2', placas: 'ABC-123' });
    expect(u.encargado).toEqual({ id: 6, nombre: 'David' });
    expect(u.kmRecorridos).toBe(120);
    expect(u.salida).toMatchObject({ km: 48_000, combustiblePct: 75, videoUrl: 'v1.mp4' });
    expect(u.devolucion).toMatchObject({ km: 48_120, combustiblePct: 50, videoUrl: 'v2.mp4' });
    expect(u.danos).toEqual({ estatus: null, propuestos: 1, confirmados: 1 });
    expect(u.incidencias[0].costo).toBe(1200);
    expect(u.costoIncidencias).toBe(1200);
    // Liz no ve el costo del libro (solo dirección).
    expect(u.costoViaje).toBeNull();
  });

  it('dirección ve el costo del viaje', async () => {
    const { service } = conActividad([uso]);
    const r = await service.porActividad(40, { id: 1, isSuperAdmin: true } as any, 7);
    expect(r.usos[0].costoViaje).toBe(350.5);
  });

  it('el responsable lo ve sin montos; alguien ajeno, no', async () => {
    const { service } = conActividad([uso]);
    const r = await service.porActividad(40, { id: 20, roleKey: 'ing_campo' } as any, 7);
    expect(r.usos[0].costoIncidencias).toBeNull();
    expect(r.usos[0].incidencias[0]).not.toHaveProperty('costo');
    await expect(service.porActividad(40, { id: 300, roleKey: 'ing_campo' } as any, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('quien trae la unidad también lo ve', async () => {
    const { service } = conActividad([uso]);
    await expect(service.porActividad(40, { id: 6, roleKey: 'ing_campo' } as any, 7)).resolves.toBeTruthy();
  });
});
