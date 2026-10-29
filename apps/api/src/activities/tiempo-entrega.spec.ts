import { calcularEstandar, reglaDe } from '../ai/estandar/tabla-estandar.js';
import {
  cantidadDelTitulo,
  completarTiempos,
  entregaCalculada,
  estandarDeLectura,
  jornadaDeHorario,
  JORNADA_OFICINA,
  parametrosCambiados,
  tipoDelTitulo,
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
    expect(sinCantidad.supuestos[0]).toBe('el título no dice cuántas partidas: se cuenta 1');

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

  it('la jornada es la de quien ejecuta: la cuadrilla come de 13 a 14 y sale a las 17', () => {
    const cuadrilla = jornadaDeHorario({ entrada: '08:00', salida: '17:00' });
    expect(cuadrilla).toEqual({ entrada: '08:00', salida: '17:00', comidaDesde: '13:00', comidaHasta: '14:00' });
    // La oficina sale igual con la regla (10:00 + 5 h = 15:00) y sin horario manda la oficina.
    expect(jornadaDeHorario({ entrada: '10:00', salida: '18:00' })).toEqual(JORNADA_OFICINA);
    expect(jornadaDeHorario({ entrada: null, salida: null })).toEqual(JORNADA_OFICINA);
    expect(jornadaDeHorario(null)).toEqual(JORNADA_OFICINA);
    // Sin salida escrita: 8 h más la comida.
    expect(jornadaDeHorario({ entrada: '07:30', salida: null }).salida).toBe('16:30');
    // Quien entra a las 10:00 o después come de 15 a 16 (la ventana fija de asistencia).
    expect(jornadaDeHorario({ entrada: '11:00', salida: '19:00' })).toMatchObject({ comidaDesde: '15:00', comidaHasta: '16:00' });
    expect(jornadaDeHorario({ entrada: '09:00', salida: '18:00' })).toMatchObject({ comidaDesde: '14:00', comidaHasta: '15:00' });

    // No pasa de las 17:00 (antes daba 18:00).
    expect(hora(entregaCalculada(cdmx('15:00'), 180, cuadrilla))).toBe('17:00');
    // Cruza su comida (13–14), no la de la oficina.
    expect(hora(entregaCalculada(cdmx('12:30'), 60, cuadrilla))).toBe('14:30');
    expect(hora(entregaCalculada(cdmx('14:30'), 60, cuadrilla))).toBe('15:30');

    const { cambios } = completarTiempos(
      { coreKind: 'tarea', ticketTypeCustom: 'Apoyo', titulo: 'Peinado de rack', creadoPorId: 1, responsableId: 7, fechaInicio: cdmx('15:30').toISOString() },
      { lectura: {}, tipicoMin: 240, jornada: cuadrilla, ahora: cdmx('09:00') },
    );
    expect(hora(cambios.fechaEntregaEsperada!)).toBe('17:00');
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

  describe('modelo medido contra el tiempo real (29-10)', () => {
    it('lo que ya tomó el mismo título manda (2+ veces), salvo la duración de una junta', () => {
      const historial = { minutos: 432, veces: 6, propio: true };
      const apoyo = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación', titulo: 'Apoyo Biblioteca Tlaxcala' }, {}, { historial });
      expect(apoyo.totalMin).toBe(430);
      expect(apoyo.desglose[0].concepto).toBe('Lo que ha tomado este mismo título (mediana de 6 veces, tuyas)');
      // Una sola vez no basta.
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, { cantidad: 2 }, { historial: { ...historial, veces: 1 } }).totalMin).toBe(40);
      // La junta dura lo que dice la agenda.
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Junta' }, {}, { duracionAgendaMin: 60, historial }).totalMin).toBe(60);
    });

    it('sin cantidad en el título, la mediana real del tipo en vez de «1 unidad»', () => {
      const r = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, {}, { tipicoMin: 182 });
      expect(r.totalMin).toBe(180);
      expect(r.desglose).toEqual([{ concepto: 'Reporte / documentación: tiempo típico', minutos: 180 }]);
      expect(r.supuestos).toEqual(['el título no dice cuántos reportes: tiempo típico del tipo']);
      // Con cantidad manda la tabla; sin mediana del tipo, 1 unidad como antes.
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, { cantidad: 2 }, { tipicoMin: 182 }).totalMin).toBe(40);
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación' }, {}).totalMin).toBe(20);
    });

    it('infraestructura sin cantidad (obra, instalación, cableado): una jornada en obra de 8 h', () => {
      const obra = estandarDeLectura({ coreKind: 'obra' }, {}, { tipicoMin: 182 });
      expect(obra.totalMin).toBe(480);
      // La jornada no lleva la base de 30 min de la obra.
      expect(obra.desglose).toEqual([{ concepto: '1 jornada en sitio × 480 min', minutos: 480 }]);
      expect(obra.unidades).toEqual({ clave: 'jornadas', cantidad: 1 });
      expect(obra.supuestos).toEqual(['el título no dice cuántos dispositivos: una jornada en obra']);
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Instalación' }, {}).totalMin).toBe(480);
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización' }, {}).totalMin).toBe(480);
      // Con cantidad, por pieza como siempre.
      expect(estandarDeLectura({ coreKind: 'obra' }, { cantidad: 3 }).totalMin).toBe(165);
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Instalación' }, { cantidad: 2 }).totalMin).toBe(120);
      // Lo que ya tomó el mismo título manda sobre la jornada.
      expect(estandarDeLectura({ coreKind: 'obra', titulo: 'Tubería nave 2' }, {}, { historial: { minutos: 300, veces: 3, propio: false } }).totalMin).toBe(300);
      // La cuadrilla entra a las 8: la jornada en obra entrega a las 17:00.
      const cuadrilla = jornadaDeHorario({ entrada: '08:00', salida: '17:00' });
      expect(hora(entregaCalculada(cdmx('08:00'), 480, cuadrilla))).toBe('17:00');
      // Lo administrativo no cambia, ni lo comercial con palabras de obra.
      expect(estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Trámite' }, {}).totalMin).toBe(90);
      expect(tipoDelTitulo({ coreKind: 'comercial', ticketTypeCustom: 'COMERCIAL', titulo: 'Cotizar tubería y charola' })).toBeNull();
    });

    it('si el título dice otro trabajo se calcula como ese tipo (sin cambiar el elegido)', () => {
      expect(tipoDelTitulo({ coreKind: 'tarea', ticketTypeCustom: 'Preparación de equipo', titulo: 'Montado de tubería y charola' })).toEqual({
        coreKind: 'tarea',
        ticketTypeCustom: 'Cableado y canalización',
      });
      const r = estandarDeLectura({ coreKind: 'tarea', ticketTypeCustom: 'Preparación de equipo', titulo: 'Montado de tubería y charola' }, { cantidad: 4 });
      // 4 nodos × 45, no los 15 min de «Preparación de equipo».
      expect(r.totalMin).toBe(180);
      expect(r.supuestos[0]).toBe('el título es de cableado y canalización: se calcula como tal');
      expect(tipoDelTitulo({ coreKind: 'servicio', ticketType: 'CORRECTIVO', titulo: 'Revisar cableado del DVR' })).toBeNull();
      expect(tipoDelTitulo({ coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización', titulo: 'Cableado de 4 nodos' })).toBeNull();
    });

    it('la autoasignación usa el historial del título cuando lo hay', () => {
      const { cambios } = completarTiempos(
        { coreKind: 'tarea', ticketTypeCustom: 'Reporte / documentación', titulo: 'Apoyo Biblioteca Tlaxcala', creadoPorId: 7, responsableId: 7, fechaInicio: cdmx('10:00').toISOString() },
        { lectura: {}, historial: { minutos: 420, veces: 5, propio: true }, ahora: cdmx('09:00') },
      );
      expect(cambios).toMatchObject({ tiempoEstimadoMin: 420, tiempoEstandarMin: 420 });
      // 10:00 + 7 h con la comida: pasa de las 18:00, se topa en la salida.
      expect(hora(cambios.fechaEntregaEsperada!)).toBe('18:00');
    });
  });
});
