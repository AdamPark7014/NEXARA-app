import { ForbiddenException } from '@nestjs/common';
import { CostosLigaService } from './costos-liga.service';
import { CostosProyectoService } from './costos-proyecto.service';
import { CostosTarifasService } from './costos-tarifas.service';
import { LibroCostosService } from './libro-costos.service';

const hora = (h: number) => new Date(Date.UTC(2026, 9, 21, h));

/** Prisma de mentiras: solo lo que estos servicios usan, con el libro en memoria. */
function prismaFalso(semilla: Partial<Record<string, any[]>> = {}) {
  const t: Record<string, any[]> = {
    sesiones: [],
    viaticos: [],
    gastos: [],
    salidas: [],
    movimientos: [],
    parametros: [],
    categorias: [],
    personas: [],
    usuarios: [],
    ligas: [],
    actividades: [],
    proyectos: [],
    cotizaciones: [],
    ...semilla,
  };
  let siguiente = 1;
  const prisma: any = {
    t,
    activityWorkSession: {
      findMany: jest.fn(async () => t.sesiones),
    },
    viatico: { findMany: jest.fn(async () => t.viaticos) },
    expense: { findMany: jest.fn(async () => t.gastos) },
    stockMovement: { findMany: jest.fn(async () => t.salidas) },
    costoMovimiento: {
      findMany: jest.fn(async () => t.movimientos),
      deleteMany: jest.fn(async ({ where }: any) => {
        t.movimientos = t.movimientos.filter((m) => !where.id.in.includes(m.id));
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data) t.movimientos.push({ id: siguiente++, estado: 'PROVISIONAL', ...d });
        return { count: data.length };
      }),
      groupBy: jest.fn(async () => []),
    },
    costoParametros: {
      findFirst: jest.fn(async ({ where }: any) => t.parametros.find((p) => p.anio === where.anio) ?? null),
      findMany: jest.fn(async () => t.parametros),
      upsert: jest.fn(),
    },
    costoCategoria: {
      findMany: jest.fn(async () => t.categorias),
      count: jest.fn(async () => t.categorias.length),
      createMany: jest.fn(async ({ data }: any) => {
        t.categorias.push(...data.map((d: any, i: number) => ({ id: i + 1, activo: true, sueldoSemanalRef: null, ...d })));
      }),
    },
    costoPersona: { findMany: jest.fn(async () => t.personas) },
    costoFichaEquipo: { findMany: jest.fn(async () => []) },
    vehicleAsset: { findMany: jest.fn(async () => []) },
    toolInventoryItem: { findMany: jest.fn(async () => []) },
    user: {
      findMany: jest.fn(async () => t.usuarios),
    },
    costoActividadLiga: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        where?.tipo ? t.ligas.filter((l) => l.tipo) : t.ligas,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existente = t.ligas.find((l) => l.activityId === where.companyId_activityId.activityId);
        if (existente) Object.assign(existente, update);
        else t.ligas.push({ ...create });
      }),
      updateMany: jest.fn(),
    },
    activity: {
      findMany: jest.fn(async () => t.actividades),
      findFirst: jest.fn(async ({ where }: any) => t.actividades.find((a) => a.id === where.id) ?? null),
    },
    operationalProject: {
      findMany: jest.fn(async () => t.proyectos),
      findFirst: jest.fn(async ({ where }: any) => t.proyectos.find((p) => p.id === where.id) ?? null),
    },
    cotizacion: {
      findMany: jest.fn(async () => t.cotizaciones),
      findFirst: jest.fn(async ({ where }: any) => t.cotizaciones.find((c) => c.id === where.id) ?? null),
    },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  return prisma;
}

const persona = (id: number, sueldoSemanal: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  nombre: `Persona ${id}`,
  email: `p${id}@ejemplo.mx`,
  puesto: 'Técnico Instalador',
  fechaIngreso: null,
  isActive: true,
  perfil: sueldoSemanal == null ? null : { sueldoSemanal },
  horario: null,
  ...extra,
});

describe('libro de costos', () => {
  const armar = (semilla: Partial<Record<string, any[]>>) => {
    const prisma = prismaFalso(semilla);
    return { prisma, libro: new LibroCostosService(prisma, new CostosTarifasService(prisma)) };
  };
  const sesion = { id: 1, activityId: 50, userId: 7, startedAt: hora(15), endedAt: hora(19), endReason: 'FIN' };

  it('convierte el reloj en renglones con el costo real por hora', async () => {
    const { prisma, libro } = armar({ sesiones: [sesion], usuarios: [persona(7, 3500)] });
    const r = await libro.sincronizar(1);
    expect(r).toMatchObject({ creados: 1, actualizados: 0, borrados: 0, total: 1 });
    // 4 h × $125.19, con los valores por omisión del año 2026.
    expect(prisma.t.movimientos[0]).toMatchObject({
      origen: 'SESION:1',
      rubro: 'MANO_OBRA',
      cantidad: 4,
      costoUnitario: 125.19,
      importe: 500.76,
      companyId: 1,
    });
  });

  it('correrlo dos veces no duplica ni reescribe', async () => {
    const { prisma, libro } = armar({ sesiones: [sesion], usuarios: [persona(7, 3500)] });
    await libro.sincronizar(1);
    prisma.costoMovimiento.createMany.mockClear();
    const r = await libro.sincronizar(1);
    expect(r).toMatchObject({ creados: 0, actualizados: 0, borrados: 0, total: 1 });
    expect(prisma.t.movimientos).toHaveLength(1);
    expect(prisma.costoMovimiento.createMany).not.toHaveBeenCalled();
  });

  it('si cambia el sueldo, el renglón se actualiza', async () => {
    const { prisma, libro } = armar({ sesiones: [sesion], usuarios: [persona(7, 3500)] });
    await libro.sincronizar(1);
    prisma.t.usuarios = [persona(7, 7000)];
    const r = await libro.sincronizar(1);
    expect(r.actualizados).toBe(1);
    expect(prisma.t.movimientos).toHaveLength(1);
    // 7000 ÷ 7 × 2.0031 ÷ 8 = 250.3875
    expect(prisma.t.movimientos[0].costoUnitario).toBe(250.39);
  });

  it('si su origen ya no cuenta, el renglón se va', async () => {
    const viatico = {
      id: 5,
      actividadId: 50,
      usuarioId: 7,
      categoria: 'OTROS',
      estatus: 'Aprobado',
      montoSolicitado: 100,
      montoAprobado: 100,
      montoComprobado: null,
      fechaSolicitud: hora(15),
      repartos: [],
    };
    const { prisma, libro } = armar({ viaticos: [viatico] });
    await libro.sincronizar(1);
    expect(prisma.t.movimientos).toHaveLength(1);
    prisma.t.viaticos = [{ ...viatico, estatus: 'Rechazado' }];
    const r = await libro.sincronizar(1);
    expect(r.borrados).toBe(1);
    expect(prisma.t.movimientos).toHaveLength(0);
  });

  it('lo cerrado no se toca aunque cambie la tarifa', async () => {
    const { prisma, libro } = armar({ sesiones: [sesion], usuarios: [persona(7, 3500)] });
    await libro.sincronizar(1);
    prisma.t.movimientos[0].estado = 'CERRADO';
    prisma.t.usuarios = [persona(7, 7000)];
    const r = await libro.sincronizar(1);
    expect(r.actualizados).toBe(0);
    expect(prisma.t.movimientos[0].costoUnitario).toBe(125.19);
  });

  it('solo escribe en el libro: nunca en nómina, viáticos ni actividades', async () => {
    const { prisma, libro } = armar({ sesiones: [sesion], usuarios: [persona(7, 3500)] });
    await libro.sincronizar(1);
    for (const tabla of ['activityWorkSession', 'viatico', 'expense', 'stockMovement', 'activity']) {
      expect(Object.keys(prisma[tabla])).toEqual(expect.not.arrayContaining(['update', 'create', 'delete']));
    }
  });
});

describe('tarifas', () => {
  it('sin capturar nada rigen los valores por omisión y lo avisa', async () => {
    const prisma = prismaFalso({ usuarios: [persona(7, 3500), persona(8, null)] });
    const r = await new CostosTarifasService(prisma).tarifas(1, 2026);
    expect(r.parametros.guardado).toBe(false);
    expect(r.factor).toMatchObject({ tp: 383, tl: 239, fsr: 2.0031 });
    expect(r.avisos).toMatchObject({ psSinValidar: true, personasSinSueldo: 1 });
    expect(r.categorias.map((c) => c.clave)).toEqual(['INSTALADOR', 'SOPORTE', 'ENCARGADO', 'OFICINA']);
    const instalador = r.categorias.find((c) => c.clave === 'INSTALADOR');
    expect(instalador).toMatchObject({ personas: 2, costoHora: 125.19, origenTarifa: 'PROMEDIO' });
  });

  it('no enseña a quienes no son empleados', async () => {
    const prisma = prismaFalso({ usuarios: [persona(7, 3500), persona(1, 9000, { email: 'gerencia@nexara.com.mx' })] });
    const r = await new CostosTarifasService(prisma).tarifas(1, 2026);
    expect(r.personas.map((p) => p.userId)).toEqual([7]);
  });

  it('las cuotas propias de una persona mandan sobre las de la empresa', async () => {
    const prisma = prismaFalso({
      usuarios: [persona(7, 3500)],
      personas: [{ userId: 7, categoriaId: null, psPropio: 0 }],
    });
    const r = await new CostosTarifasService(prisma).tarifas(1, 2026);
    expect(r.personas[0].fsr).toBe(1.6025);
  });
});

describe('costos de un proyecto', () => {
  const ceo = { id: 1, roleKey: 'ceo' };
  const proyecto = {
    id: 9,
    title: 'CCTV Bodega Norte',
    budgetAmount: null,
    cotizacionId: 42,
    responsableId: 20,
    vendorId: 21,
    cotizacion: {
      quoteNumber: 'NEX-0042',
      subtotal: 100_000,
      discountTotal: 0,
      marginPercent: null,
      items: [
        { name: 'Cámara', qty: 10, unitCost: 2000, grupo: 'EQUIPOS' },
        { name: 'Instalación', qty: 10, unitCost: 1500, grupo: 'MANO_DE_OBRA' },
        { name: 'Sin costo', qty: 1, unitCost: null },
      ],
    },
  };
  const armar = (extra: Partial<Record<string, any[]>> = {}) => {
    const prisma = prismaFalso({
      proyectos: [proyecto],
      actividades: [{ id: 50, projectId: 9, cotizacionId: null }],
      movimientos: [
        { rubro: 'MANO_OBRA', importe: 12_000, cantidad: 96, userId: 7, nota: null, fecha: new Date() },
        { rubro: 'MATERIAL', importe: 21_000, cantidad: 10, userId: null, nota: null, fecha: new Date() },
        { rubro: 'VIATICO_GASTO', importe: 3_000, cantidad: 1, userId: 7, nota: null, fecha: new Date() },
      ],
      usuarios: [{ id: 7, puesto: 'Técnico Instalador' }],
      ...extra,
    });
    return { prisma, servicio: new CostosProyectoService(prisma, new CostosTarifasService(prisma)) };
  };

  it('cotizado contra real por rubro y margen', async () => {
    const { servicio } = armar();
    const r = await servicio.proyecto(1, 9, ceo);
    const rubro = (x: string) => r.rubros.find((f) => f.rubro === x);
    expect(rubro('MANO_OBRA')).toMatchObject({ cotizado: 15_000, real: 12_000 });
    expect(rubro('MATERIAL')).toMatchObject({ cotizado: 20_000, real: 21_000 });
    expect(r.directo).toEqual({ cotizado: 35_000, real: 36_000 });
    expect(r.venta).toBe(100_000);
    expect(r.margen.cotizado).toEqual({ importe: 65_000, pct: 65 });
    expect(r.margen.hoy).toEqual({ importe: 64_000, pct: 64 });
    expect(r.avisos).toMatchObject({ partidasSinCosto: 1, indirectoSinCapturar: true });
  });

  it('con indirectos capturados, entran al margen', async () => {
    const { servicio } = armar({ parametros: [{ anio: new Date().getFullYear(), ps: 0.25, indirectoPct: 0.1, updatedAt: new Date() }] });
    const r = await servicio.proyecto(1, 9, ceo);
    expect(r.indirecto).toEqual({ pct: 0.1, cotizado: 3_500, real: 3_600 });
    expect(r.margen.hoy).toEqual({ importe: 60_400, pct: 60.4 });
  });

  it('una actividad ligada desde la bandeja suma al proyecto', async () => {
    const { prisma, servicio } = armar({ ligas: [{ activityId: 77, tipo: 'PROYECTO', proyectoId: 9, cotizacionId: null }] });
    await servicio.proyecto(1, 9, ceo);
    const pedido = prisma.costoMovimiento.findMany.mock.calls.at(-1)[0];
    expect(pedido.where.activityId.in.sort()).toEqual([50, 77]);
  });

  it('una liga a su cotización también suma: el proyecto nació de ella', async () => {
    const { prisma, servicio } = armar({ ligas: [{ activityId: 78, tipo: 'COTIZACION', proyectoId: null, cotizacionId: 42 }] });
    prisma.t.proyectos = [{ ...proyecto, cotizacionId: 42 }];
    await servicio.proyecto(1, 9, ceo);
    expect(prisma.costoMovimiento.findMany.mock.calls.at(-1)[0].where.activityId.in).toContain(78);
  });

  it('CEO ve la mano de obra por categoría', async () => {
    const { servicio } = armar();
    const r = await servicio.proyecto(1, 9, ceo);
    expect(r.acceso.detalle).toBe(true);
    expect(r.manoDeObra.categorias).not.toBeNull();
  });

  it('el responsable ve totales, pero nunca el importe por categoría', async () => {
    const { servicio } = armar();
    const r = await servicio.proyecto(1, 9, { id: 20, roleKey: 'ing_campo' });
    expect(r.acceso.detalle).toBe(false);
    expect(r.manoDeObra.categorias).toBeNull();
    expect(r.manoDeObra.horas).toBe(96);
    expect(JSON.stringify(r)).not.toMatch(/costoUnitario|sueldo/);
  });

  it('quien no es del proyecto ni coordina no entra', async () => {
    const { servicio } = armar();
    await expect(servicio.proyecto(1, 9, { id: 99, roleKey: 'ing_campo' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('la lista de todos los proyectos es solo para CEO y contadora', async () => {
    const { servicio } = armar();
    await expect(servicio.lista(1, { id: 5, roleKey: 'coord_operaciones' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('bandeja de horas sin proyecto', () => {
  const claude = (disponible = true, datos: unknown = { tipo: 'NINGUNA', id: null, motivo: 'no se sabe' }) =>
    ({ disponible: () => disponible, json: jest.fn(async () => ({ datos })) }) as any;

  const armar = (ia = claude()) => {
    const prisma = prismaFalso({
      sesiones: [
        { id: 1, activityId: 50, userId: 7, startedAt: hora(15), endedAt: hora(19), endReason: 'FIN' },
        { id: 2, activityId: 51, userId: 7, startedAt: hora(20), endedAt: hora(22), endReason: 'FIN' },
        { id: 3, activityId: 52, userId: 8, startedAt: hora(15), endedAt: hora(18), endReason: 'FIN' },
      ],
      actividades: [
        { id: 50, anNumber: 'A-50', titulo: 'Revisar pendiente', coreKind: 'tarea', projectId: null, clientId: null, cotizacionId: null },
        { id: 51, anNumber: 'A-51', titulo: 'Ya tiene proyecto', coreKind: 'proyecto', projectId: 9, clientId: null, cotizacionId: null },
        { id: 52, anNumber: 'A-52', titulo: 'Ordenar la bodega', coreKind: 'tarea', projectId: null, clientId: null, cotizacionId: null },
      ],
      proyectos: [{ id: 9, title: 'CCTV Norte', clientId: 3, cotizacionId: null, client: { name: 'Bodegas Luna' } }],
    });
    return { prisma, ia, servicio: new CostosLigaService(prisma, ia) };
  };
  const ahora = new Date(Date.UTC(2026, 9, 22));

  it('solo trae lo que no está ligado, de más a menos horas', async () => {
    const { servicio } = armar();
    const r = await servicio.porLigar(1, 'semana', ahora);
    expect(r.filas.map((f) => f.activityId)).toEqual([50, 52]);
    expect(r.resumen).toMatchObject({ horasTotal: 9, horasLigadas: 2, horasPorLigar: 7, actividades: 2 });
  });

  it('nunca lleva dinero: la bandeja la ve quien no puede ver sueldos', async () => {
    const { servicio } = armar();
    const r = await servicio.porLigar(1, 'semana', ahora);
    expect(JSON.stringify(r)).not.toMatch(/importe|costo|sueldo/i);
  });

  it('la regla resuelve lo obvio sin llamar a la IA', async () => {
    const { servicio, ia } = armar();
    const r = await servicio.porLigar(1, 'semana', ahora);
    expect(r.filas.find((f) => f.activityId === 52)?.sugerencia).toMatchObject({ tipo: 'INTERNA', fuente: 'REGLA' });
    expect(ia.json).not.toHaveBeenCalled();
  });

  it('una decisión saca la actividad de la bandeja', async () => {
    const { prisma, servicio } = armar();
    await servicio.decidir(1, 52, { tipo: 'INTERNA' }, 5);
    const r = await servicio.porLigar(1, 'semana', ahora);
    expect(r.filas.map((f) => f.activityId)).toEqual([50]);
    expect(prisma.t.ligas[0]).toMatchObject({ activityId: 52, tipo: 'INTERNA', decididoPorId: 5 });
  });

  it('ligar no toca la actividad', async () => {
    const { prisma, servicio } = armar();
    await servicio.decidir(1, 50, { tipo: 'PROYECTO', id: 9 }, 5);
    expect(prisma.activity.update).toBeUndefined();
    expect(prisma.t.ligas[0]).toMatchObject({ tipo: 'PROYECTO', proyectoId: 9 });
  });

  it('un proyecto de otra empresa no se puede elegir', async () => {
    const { servicio } = armar();
    await expect(servicio.decidir(1, 50, { tipo: 'PROYECTO', id: 999 })).rejects.toThrow(/no encontrado/);
  });

  it('la IA solo ve lo que las reglas no resolvieron, y se guarda para no pagarlo dos veces', async () => {
    const ia = claude(true, { tipo: 'PROYECTO', id: 9, motivo: 'dice norte' });
    const { prisma, servicio } = armar(ia);
    const primera = await servicio.sugerirConIa(1, 'todo');
    expect(primera).toMatchObject({ consultadas: 1, sugeridas: 1 });
    expect(ia.json).toHaveBeenCalledTimes(1);
    expect(ia.json.mock.calls[0][0]).toMatchObject({ proceso: 'costos-liga', companyId: 1, modelo: 'claude-haiku-5-5' });
    expect(prisma.t.ligas[0]).toMatchObject({ activityId: 50, sugerenciaTipo: 'PROYECTO', sugerenciaId: 9 });
    expect(prisma.t.ligas[0].tipo).toBeUndefined();
    await servicio.sugerirConIa(1, 'todo');
    expect(ia.json).toHaveBeenCalledTimes(1);
  });

  it('una sugerencia guardada no decide sola', async () => {
    const ia = claude(true, { tipo: 'PROYECTO', id: 9, motivo: 'dice norte' });
    const { servicio } = armar(ia);
    await servicio.sugerirConIa(1, 'todo');
    const r = await servicio.porLigar(1, 'todo', ahora);
    const fila = r.filas.find((f) => f.activityId === 50);
    expect(fila?.sugerencia).toMatchObject({ tipo: 'PROYECTO', id: 9, fuente: 'IA' });
  });

  it('sin IA la bandeja sigue funcionando', async () => {
    const { servicio } = armar(claude(false));
    expect(await servicio.sugerirConIa(1)).toMatchObject({ consultadas: 0, iaDisponible: false });
    expect((await servicio.porLigar(1, 'semana', ahora)).iaDisponible).toBe(false);
  });

  it('si la IA falla no truena', async () => {
    const ia = claude();
    ia.json.mockRejectedValue(new Error('caída'));
    const { servicio } = armar(ia);
    expect(await servicio.sugerirConIa(1, 'todo')).toMatchObject({ consultadas: 0, sugeridas: 0 });
  });
});
