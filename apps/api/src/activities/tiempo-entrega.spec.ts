import { calcularEstandar, reglaDe } from '../ai/estandar/tabla-estandar.js';
import {
  cantidadDelTitulo,
  completarTiempos,
  entregaCalculada,
  estandarDeLectura,
  parametrosCambiados,
  TRASLADO_APROX,
} from './tiempo-entrega.js';

/** Hora de CDMX (UTC-6) del 29-10-2026. */
/** Una cotización de 1 partida según la tabla vigente (las tarifas las mueve Adam). */
const COTIZACION_1 = calcularEstandar(reglaDe({ coreKind: 'comercial' })!, { cantidad: 1 }).totalMin!;
const cdmx = (hhmm: string) => new Date(`2026-10-29T${hhmm}:00-06:00`);
const hora = (d: Date | string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));

describe('tiempo y entrega de toda actividad', () => {
  it('lee la cantidad del título sin confundir horas, años ni porcentajes', () => {
    expect(cantidadDelTitulo('Instalar 4 cámaras en la nave')).toBe(4);
    expect(cantidadDelTitulo('Cotizar 50 partidas')).toBe(50);
    expect(cantidadDelTitulo('Junta a las 10:30 con 3 personas')).toBe(3);
    expect(cantidadDelTitulo('Mantenimientos 2026 Sephora')).toBeNull();
    expect(cantidadDelTitulo('Revisar 2 horas el NVR')).toBeNull();
    expect(cantidadDelTitulo('Apoyo Biblioteca Tlaxcala')).toBeNull();
  });

  it('el estándar sale de la tabla con lo leído; lo que falta se supone y se dice', () => {
    const instalacion = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Instalación' }, { cantidad: 4 });
    expect(instalacion.totalMin).toBe(30 + 4 * 45);
    expect(instalacion.unidades).toEqual({ clave: 'dispositivos', cantidad: 4 });
    expect(instalacion.supuestos).toEqual([]);

    const sinCantidad = estandarDeLectura({ coreKind: 'comercial' }, {});
    expect(sinCantidad.totalMin).toBe(COTIZACION_1);
    expect(sinCantidad.supuestos[0]).toMatch(/no dice cuántos partidas: se cuenta 1/);

    const correctivo = estandarDeLectura({ coreKind: 'servicio', ticketType: 'CORRECTIVO' }, {});
    // Complejidad estándar (120) + traslado aproximado (30 + 30).
    expect(correctivo.totalMin).toBe(120 + TRASLADO_APROX.idaMin + TRASLADO_APROX.vueltaMin);
    expect(correctivo.complejidad).toBe('ESTANDAR');
    expect(correctivo.supuestos).toEqual(['complejidad estándar', 'traslado aproximado (30 min de ida y 30 de vuelta)']);
  });

  it('sin regla, en juntas o guardias: la mediana real del tipo, la agenda o 1 h; nunca sin tiempo', () => {
    expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Apoyo' }, {}).totalMin).toBe(60);
    expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Apoyo' }, {}, { tipicoMin: 132 }).totalMin).toBe(130);
    expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Junta' }, {}, { duracionAgendaMin: 90 }).totalMin).toBe(90);
    expect(estandarDeLectura({ coreKind: null }, {}).totalMin).toBe(60);
  });

  it('la entrega es el inicio más el tiempo, cuenta la comida y no pasa de la salida', () => {
    expect(hora(entregaCalculada(cdmx('10:00'), 90))).toBe('11:30');
    // Cruza la comida de 15 a 16: una hora más.
    expect(hora(entregaCalculada(cdmx('14:30'), 60))).toBe('16:30');
    // Empieza en la comida: corre desde las 16.
    expect(hora(entregaCalculada(cdmx('15:20'), 30))).toBe('16:30');
    // No pasa de las 18.
    expect(hora(entregaCalculada(cdmx('16:00'), 300))).toBe('18:00');
    // Fuera de la jornada: el tiempo completo.
    expect(hora(entregaCalculada(cdmx('19:00'), 60))).toBe('20:00');
  });

  it('autoasignación: tiempo, estándar, complejidad, unidades y entrega fijos desde el título', () => {
    const { cambios, error } = completarTiempos(
      {
        coreKind: 'tarea',
        ticketTypeCustom: 'Instalación',
        titulo: 'Instalar 2 cámaras',
        creadoPorId: 7,
        responsableId: 7,
        // Lo que mande el cliente no cuenta.
        tiempoEstimadoMin: 600,
        tiempoEstandarMin: 600,
        complejidad: 'CRITICA',
        unidades: { clave: 'dispositivos', cantidad: 20 },
        fechaInicio: cdmx('10:00').toISOString(),
        fechaEntregaEsperada: cdmx('17:00').toISOString(),
        estandarCambiadoMotivo: 'porque sí',
      },
      { lectura: { cantidad: 2, complejidad: 'BASICA' }, ahora: cdmx('09:00') },
    );
    expect(error).toBeUndefined();
    expect(cambios).toMatchObject({
      tiempoEstimadoMin: 120,
      tiempoEstandarMin: 120,
      // La del título, no la CRITICA que mandó el cliente.
      complejidad: 'BASICA',
      complejidadSugerida: 'BASICA',
      unidades: { clave: 'dispositivos', cantidad: 2 },
      estandarCambiadoMotivo: null,
    });
    expect(hora(cambios.fechaEntregaEsperada!)).toBe('12:00');
    expect(cambios.fechaMaxima).toBe(cambios.fechaEntregaEsperada);
  });

  it('autoasignación sin inicio: la entrega cuenta desde que se crea; con periodo, la pone el periodo', () => {
    const ahora = cdmx('11:00');
    const sinInicio = completarTiempos({ coreKind: 'comercial', creadoPorId: 3, responsableId: 3 }, { lectura: {}, ahora });
    expect(new Date(sinInicio.cambios.fechaEntregaEsperada!).getTime() - ahora.getTime()).toBe(COTIZACION_1 * 60_000);
    const conPeriodo = completarTiempos(
      { coreKind: 'comercial', creadoPorId: 3, responsableId: 3, periodoInicio: '2026-10-29', periodoFin: '2026-10-31' },
      { lectura: {}, ahora },
    );
    expect(conPeriodo.cambios.fechaEntregaEsperada).toBeUndefined();
    expect(conPeriodo.cambios.tiempoEstimadoMin).toBe(COTIZACION_1);
  });

  it('asignada a otro: se respeta lo que puso quien asigna y solo se llena lo que falta', () => {
    const ahora = cdmx('09:00');
    const completa = completarTiempos(
      {
        coreKind: 'comercial',
        creadoPorId: 1,
        responsableId: 9,
        tiempoEstandarMin: 80,
        tiempoEstimadoMin: 80,
        fechaInicio: cdmx('10:00').toISOString(),
        fechaEntregaEsperada: cdmx('10:00').toISOString(),
        fechaMaxima: cdmx('10:00').toISOString(),
      },
      { lectura: {}, ahora },
    );
    expect(completa.cambios.tiempoEstimadoMin).toBe(80);
    // La del formulario (igual al inicio = fin del día) no se toca.
    expect(completa.cambios.fechaEntregaEsperada).toBeUndefined();

    const sinNada = completarTiempos(
      { coreKind: 'tarea', ticketTypeCustom: 'Entrega', creadoPorId: 1, responsableId: 9, fechaInicio: cdmx('10:00').toISOString() },
      { lectura: {}, ahora },
    );
    // Entrega: 15 en el lugar + 60 de traslado aproximado.
    expect(sinNada.cambios).toMatchObject({ tiempoEstimadoMin: 75, tiempoEstandarMin: 75 });
    expect(hora(sinNada.cambios.fechaEntregaEsperada!)).toBe('11:15');

    // Con tiempo propio y sin estándar del cliente: el tiempo se respeta y el estándar se calcula.
    const conTiempo = completarTiempos(
      { coreKind: 'tarea', ticketTypeCustom: 'Entrega', creadoPorId: 1, responsableId: 9, tiempoEstimadoMin: 30 },
      { lectura: {}, ahora },
    );
    expect(conTiempo.error).toBeUndefined();
    expect(conTiempo.cambios).toMatchObject({ tiempoEstimadoMin: 30, tiempoEstandarMin: 75 });

    // Solo una de las dos fechas: se copia a la otra.
    const soloMaxima = completarTiempos(
      { coreKind: 'comercial', creadoPorId: 1, responsableId: 9, tiempoEstimadoMin: 30, fechaMaxima: cdmx('13:00').toISOString() },
      { lectura: {}, ahora },
    );
    expect(soloMaxima.cambios.fechaEntregaEsperada).toBe(cdmx('13:00').toISOString());
  });

  it('quien conocía el estándar y puso otro tiempo tiene que decir por qué', () => {
    const base = { coreKind: 'comercial', creadoPorId: 1, responsableId: 9, tiempoEstandarMin: 80, tiempoEstimadoMin: 120 };
    expect(completarTiempos(base, { lectura: {}, ahora: cdmx('09:00') }).error).toMatch(/escribe por qué/);
    expect(completarTiempos({ ...base, estandarCambiadoMotivo: 'Son partidas especiales' }, { lectura: {}, ahora: cdmx('09:00') }).error).toBeUndefined();
  });

  it('solo cuentan como cambio los parámetros que llegan distintos a lo guardado', () => {
    const prev = {
      tiempoEstimadoMin: 60,
      fechaEntregaEsperada: new Date('2026-10-29T18:00:00Z'),
      unidades: { clave: 'partidas', cantidad: 3 },
      complejidad: null,
    };
    expect(parametrosCambiados(prev, { tiempoEstimadoMin: 60, fechaEntregaEsperada: '2026-10-29T18:00:00.000Z', titulo: 'otro' })).toEqual([]);
    expect(parametrosCambiados(prev, { unidades: { clave: 'partidas', cantidad: 3 }, complejidad: undefined })).toEqual([]);
    expect(parametrosCambiados(prev, { tiempoEstimadoMin: 90, fechaEntregaEsperada: '2026-10-29T20:00:00.000Z' })).toEqual([
      'tiempoEstimadoMin',
      'fechaEntregaEsperada',
    ]);
  });
});
