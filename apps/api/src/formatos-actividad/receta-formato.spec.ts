import { BadRequestException } from '@nestjs/common';
import { JORNADA_OFICINA } from '../activities/tiempo-entrega.js';
import { completarTiempos } from '../activities/tiempo-entrega.js';
import {
  formatosIniciales,
  minutosDeRenglon,
  normalizarReceta,
  normalizarRenglon,
  planearRenglones,
  recetaDesdeActividad,
} from './receta-formato.js';

// Martes 10-11-2026, 10:00 de México.
const INICIO = new Date('2026-11-10T16:00:00Z');

describe('normalizarReceta', () => {
  it('sin renglones no hay formato', () => {
    expect(() => normalizarReceta({ renglones: [] })).toThrow(BadRequestException);
    expect(() => normalizarReceta({ renglones: [{ titulo: '   ' }] })).toThrow('al menos una actividad');
  });

  it('limpia: tipo desconocido, fotos fuera de rango y herramientas repetidas', () => {
    const r = normalizarRenglon({
      titulo: ' Montaje ',
      coreKind: 'inventado',
      fotos: 20,
      minutosBase: -5,
      herramientas: [{ descripcion: 'Taladro', cantidad: 2 }, { descripcion: 'taladro' }, { descripcion: '' }],
    })!;
    expect(r).toMatchObject({ titulo: 'Montaje', coreKind: 'tarea', fotos: 8, minutosBase: 0 });
    expect(r.herramientas).toEqual([{ descripcion: 'Taladro', cantidad: 2 }]);
  });

  it('solo la tarea lleva subtipo', () => {
    expect(normalizarRenglon({ titulo: 'x', coreKind: 'tarea', tipo: 'Instalación' })!.tipo).toBe('Instalación');
    expect(normalizarRenglon({ titulo: 'x', coreKind: 'servicio', tipo: 'Instalación' })!.tipo).toBeNull();
  });

  it('los puntos de evidencia siguen la regla de siempre: sin momentos no cuentan', () => {
    const r = normalizarRenglon({
      titulo: 'x',
      puntos: [{ nombre: 'Rack', momentos: ['DESPUES'] }, { nombre: 'Sin momentos', momentos: [] }],
    })!;
    expect(r.puntos).toEqual([{ nombre: 'Rack', momentos: ['DESPUES'] }]);
  });
});

describe('minutosDeRenglon', () => {
  it('base más lo que suma cada unidad', () => {
    expect(minutosDeRenglon({ minutosBase: 30, minutosPorUnidad: 45 }, 4)).toBe(210);
    expect(minutosDeRenglon({ minutosBase: 60, minutosPorUnidad: 0 }, 99)).toBe(60);
  });
  it('nunca menos de 5', () => {
    expect(minutosDeRenglon({ minutosBase: 0, minutosPorUnidad: 45 }, 0)).toBe(5);
  });
});

describe('planearRenglones', () => {
  const horas = (d: Date) => d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });

  it('una detrás de otra, y la comida no cuenta', () => {
    const p = planearRenglones([60, 300, 60], INICIO, JORNADA_OFICINA);
    expect(p.map((x) => horas(x.fechaInicio))).toEqual(['10:00', '11:00', '17:00']);
    expect(horas(p[1].fechaEntrega)).toBe('17:00');
    expect(p.every((x) => x.periodo === null)).toBe(true);
  });

  it('lo que no cabe hoy pasa a mañana a la hora de entrada', () => {
    const p = planearRenglones([420, 60], INICIO, JORNADA_OFICINA);
    expect(horas(p[0].fechaEntrega)).toBe('18:00');
    expect(p[1].fechaInicio.toISOString()).toBe('2026-11-11T16:00:00.000Z');
  });

  it('una larga se reparte en días, con su periodo', () => {
    const [una] = planearRenglones([1000], INICIO, JORNADA_OFICINA);
    expect(una.periodo).toEqual({ inicio: '2026-11-10', fin: '2026-11-12' });
  });

  it('se salta el fin de semana', () => {
    // Viernes 13-11 a las 17:50.
    const viernes = new Date('2026-11-13T23:50:00Z');
    const [una] = planearRenglones([60], viernes, JORNADA_OFICINA);
    expect(una.fechaInicio.toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
});

describe('recetaDesdeActividad', () => {
  it('guarda lo que se repite y no al cliente, las personas ni las fechas', () => {
    const r = recetaDesdeActividad({
      titulo: 'Cableado sucursal Centro',
      coreKind: 'tarea',
      ticketTypeCustom: 'Cableado y canalización',
      tiempoEstimadoMin: 180,
      evidencePhotoRequired: 6,
      indicaciones: 'Llevar escalera',
      evidenceFields: [{ nombre: 'Rack', momentos: ['ANTES', 'DESPUES'] }],
      toolRequirements: [{ descripcion: 'Escalera', cantidad: 1 }],
    });
    expect(r).toEqual({
      unidad: null,
      cantidadPorOmision: 1,
      renglones: [
        {
          titulo: 'Cableado sucursal Centro',
          coreKind: 'tarea',
          tipo: 'Cableado y canalización',
          minutosBase: 180,
          minutosPorUnidad: 0,
          fotos: 6,
          indicaciones: 'Llevar escalera',
          puntos: [{ nombre: 'Rack', momentos: ['ANTES', 'DESPUES'] }],
          herramientas: [{ descripcion: 'Escalera', cantidad: 1 }],
        },
      ],
    });
  });
});

describe('formatosIniciales', () => {
  it('son válidos y pasan la limpieza sin cambiar', () => {
    for (const f of formatosIniciales()) expect(normalizarReceta(f.receta)).toEqual(f.receta);
  });

  it('sus minutos son los de la tabla aprobada', () => {
    const [cctv] = formatosIniciales();
    const montaje = cctv.receta.renglones.find((r) => r.titulo === 'Montaje de cámaras')!;
    expect(minutosDeRenglon(montaje, 4)).toBe(30 + 45 * 4);
  });
});

describe('con los datos que manda el formato, el alta no vuelve a preguntar ni pide motivo', () => {
  it('respeta el tiempo y la entrega y no marca error', () => {
    const { cambios, error } = completarTiempos(
      {
        titulo: 'Montaje de cámaras',
        creadoPorId: 1,
        responsableId: 2,
        tiempoEstimadoMin: 210,
        tiempoEstandarMin: 210,
        estandarDesglose: [{ concepto: 'Formato', minutos: 210 }],
        fechaInicio: INICIO.toISOString(),
        fechaEntregaEsperada: '2026-11-10T19:30:00.000Z',
        fechaMaxima: '2026-11-10T19:30:00.000Z',
      } as never,
      { lectura: {}, ahora: INICIO },
    );
    expect(error).toBeUndefined();
    expect(cambios).toMatchObject({ tiempoEstimadoMin: 210, tiempoEstandarMin: 210 });
    expect(cambios.estandarDesglose).toEqual([{ concepto: 'Formato', minutos: 210 }]);
  });
});
