import {
  MENSAJE_UBICACION_SIMULADA,
  MOTIVO_VALIDACION,
  combinarValidacion,
  distanciaMetros,
  evaluarUbicacion,
  horaCierreAutomatico,
  motivoCorreccionValido,
  puedeVerGpsDireccion,
  resolverHoraChecada,
  sitioOficina,
} from './asistencia-confiable.js';

/**
 * De estas reglas sale la nómina y también la confianza: un teléfono con la
 * hora corrida o un GPS falso son los dos trucos baratos para fabricar una
 * entrada puntual desde la cama. Aquí se fija que el servidor no se los crea.
 */

const OFICINA = sitioOficina({} as NodeJS.ProcessEnv);
const AHORA = new Date('2026-09-17T15:00:00Z'); // 09:00 de México

describe('la hora la pone el servidor', () => {
  it('sin nada del teléfono, la del servidor y sin marca', () => {
    const r = resolverHoraChecada({ ahora: AHORA });
    expect(r.at).toEqual(AHORA);
    expect(r.validacion).toBe('OK');
    expect(r.motivo).toBeNull();
  });

  it('una hora de teléfono razonable NO reemplaza a la del servidor', () => {
    const r = resolverHoraChecada({ ahora: AHORA, capturedAt: '2026-09-17T15:01:00Z' });
    expect(r.at).toEqual(AHORA);
    expect(r.clientCapturedAt?.toISOString()).toBe('2026-09-17T15:01:00.000Z');
    expect(r.validacion).toBe('OK');
  });

  it('un teléfono adelantado media hora queda REVISAR con la hora del servidor', () => {
    // El truco: atrasar el reloj para que la entrada salga puntual.
    const r = resolverHoraChecada({ ahora: AHORA, capturedAt: '2026-09-17T14:20:00Z' });
    expect(r.at).toEqual(AHORA);
    expect(r.validacion).toBe('REVISAR');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.horaTelefono);
  });

  it('sin conexión y dentro de las 12 h, se respeta la hora de captura', () => {
    const r = resolverHoraChecada({
      ahora: AHORA,
      offline: true,
      capturedAt: '2026-09-17T13:55:00Z',
    });
    expect(r.at.toISOString()).toBe('2026-09-17T13:55:00.000Z');
    expect(r.validacion).toBe('PENDIENTE');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.sinConexion);
  });

  it('sin conexión, hasta 2 min adelantada sigue valiendo', () => {
    const r = resolverHoraChecada({
      ahora: AHORA,
      offline: true,
      capturedAt: '2026-09-17T15:01:30Z',
    });
    expect(r.at.toISOString()).toBe('2026-09-17T15:01:30.000Z');
    expect(r.validacion).toBe('PENDIENTE');
  });

  it('sin conexión pero de hace dos días: hora del servidor y a revisar', () => {
    const r = resolverHoraChecada({
      ahora: AHORA,
      offline: true,
      capturedAt: '2026-09-15T15:00:00Z',
    });
    expect(r.at).toEqual(AHORA);
    expect(r.validacion).toBe('REVISAR');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.horaTelefono);
  });

  it('sin conexión y sin hora de captura: servidor y PENDIENTE', () => {
    const r = resolverHoraChecada({ ahora: AHORA, offline: true });
    expect(r.at).toEqual(AHORA);
    expect(r.validacion).toBe('PENDIENTE');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.sinConexion);
  });

  it('una fecha de captura basura no rompe ni marca nada', () => {
    const r = resolverHoraChecada({ ahora: AHORA, capturedAt: 'no-es-fecha' });
    expect(r.at).toEqual(AHORA);
    expect(r.clientCapturedAt).toBeNull();
    expect(r.validacion).toBe('OK');
  });
});

describe('sitios permitidos', () => {
  const sucursal = { nombre: 'Plaza Dorada', latitude: 19.03, longitude: -98.23 };

  it('checar en la oficina no marca nada', () => {
    const r = evaluarUbicacion({
      coords: { latitude: OFICINA.latitude, longitude: OFICINA.longitude },
      accuracyM: 12,
      sitios: [OFICINA],
    });
    expect(r.fueraDeSitio).toBe(false);
    expect(r.validacion).toBe('OK');
    expect(r.sitioNombre).toBe('Oficina');
    expect(r.distanciaSitioM).toBe(0);
  });

  it('a 200 m de la oficina sigue dentro (radio 300 m)', () => {
    const r = evaluarUbicacion({
      coords: { latitude: OFICINA.latitude + 0.0018, longitude: OFICINA.longitude },
      accuracyM: 10,
      sitios: [OFICINA],
    });
    expect(r.fueraDeSitio).toBe(false);
    expect(r.distanciaSitioM).toBeLessThan(300);
  });

  it('desde casa, a kilómetros, queda fuera de sitio con la distancia al más cercano', () => {
    const r = evaluarUbicacion({
      coords: { latitude: 19.15, longitude: -98.35 },
      accuracyM: 10,
      sitios: [OFICINA, sucursal],
    });
    expect(r.fueraDeSitio).toBe(true);
    expect(r.sitioNombre).toBe('Oficina');
    expect(r.distanciaSitioM).toBeGreaterThan(1000);
  });

  it('la sucursal de su actividad del día también es un sitio válido', () => {
    const r = evaluarUbicacion({
      coords: { latitude: sucursal.latitude, longitude: sucursal.longitude },
      accuracyM: 20,
      sitios: [OFICINA, sucursal],
    });
    expect(r.fueraDeSitio).toBe(false);
    expect(r.sitioNombre).toBe('Plaza Dorada');
  });

  it('sin ubicación se acepta, pero a revisar', () => {
    const r = evaluarUbicacion({ coords: null, sitios: [OFICINA] });
    expect(r.validacion).toBe('REVISAR');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.sinUbicacion);
    expect(r.fueraDeSitio).toBe(false);
    expect(r.distanciaSitioM).toBeNull();
  });

  it('una precisión peor que 200 m no sirve para decir dónde estuvo', () => {
    const r = evaluarUbicacion({
      coords: { latitude: OFICINA.latitude, longitude: OFICINA.longitude },
      accuracyM: 350,
      sitios: [OFICINA],
    });
    expect(r.validacion).toBe('REVISAR');
    expect(r.motivo).toBe(MOTIVO_VALIDACION.ubicacionImprecisa);
    // Y aun así se dice dónde cayó el punto.
    expect(r.sitioNombre).toBe('Oficina');
  });

  it('200 m clavados todavía pasan', () => {
    const r = evaluarUbicacion({
      coords: { latitude: OFICINA.latitude, longitude: OFICINA.longitude },
      accuracyM: 200,
      sitios: [OFICINA],
    });
    expect(r.validacion).toBe('OK');
  });

  it('sin sitios conocidos no se acusa a nadie de estar fuera', () => {
    const r = evaluarUbicacion({
      coords: { latitude: 19.1, longitude: -98.3 },
      accuracyM: 10,
      sitios: [],
    });
    expect(r.fueraDeSitio).toBe(false);
    expect(r.distanciaSitioM).toBeNull();
  });

  it('la distancia entre dos puntos conocidos es la real (±1 %)', () => {
    // Zócalo de Puebla → oficina: ~4,4 km.
    const m = distanciaMetros({ latitude: 19.0433, longitude: -98.1983 }, OFICINA);
    expect(m).toBeGreaterThan(8000);
    expect(m).toBeLessThan(9500);
  });
});

describe('cierre automático de la salida olvidada', () => {
  it('entrada de la mañana: nueve horas después', () => {
    const entrada = new Date('2026-09-17T15:00:00Z'); // 09:00 mx
    expect(horaCierreAutomatico(entrada).toISOString()).toBe('2026-09-18T00:00:00.000Z'); // 18:00 mx
  });

  it('entrada de la tarde: el tope son las 23:30 de México, no entrada + 9 h', () => {
    const entrada = new Date('2026-09-18T01:00:00Z'); // 19:00 mx del 17
    // 23:30 mx del 17 = 05:30 UTC del 18.
    expect(horaCierreAutomatico(entrada).toISOString()).toBe('2026-09-18T05:30:00.000Z');
  });

  it('una entrada pasadas las 23:30 no cierra antes de empezar', () => {
    const entrada = new Date('2026-09-18T05:50:00Z'); // 23:50 mx
    expect(horaCierreAutomatico(entrada).getTime()).toBeGreaterThanOrEqual(entrada.getTime());
  });
});

describe('GPS solo dirección', () => {
  it('Christian ve el mapa del equipo', () => {
    expect(puedeVerGpsDireccion({ email: 'gerencia@nexara.com.mx' })).toBe(true);
  });

  it('Claudia, que prueba sus permisos, también', () => {
    expect(puedeVerGpsDireccion({ email: 'Claudia.Bernal@nexara.com.mx' })).toBe(true);
  });

  it('un coordinador con gps.manage NO', () => {
    expect(puedeVerGpsDireccion({ email: 'coordinador@nexara.com.mx' })).toBe(false);
  });

  it('sin usuario tampoco', () => {
    expect(puedeVerGpsDireccion(null)).toBe(false);
    expect(puedeVerGpsDireccion({ email: null })).toBe(false);
  });
});

describe('detalles del contrato que los clientes ya escribieron', () => {
  it('el mensaje del 422 de ubicación simulada es el acordado', () => {
    expect(MENSAJE_UBICACION_SIMULADA).toBe(
      'Detectamos una ubicación simulada. Desactiva cualquier app de GPS falso para checar.',
    );
  });

  it('REVISAR pesa más que PENDIENTE y PENDIENTE más que OK', () => {
    expect(combinarValidacion('PENDIENTE', 'REVISAR')).toBe('REVISAR');
    expect(combinarValidacion('OK', 'PENDIENTE')).toBe('PENDIENTE');
    expect(combinarValidacion('OK', 'OK')).toBe('OK');
  });

  it('un motivo de corrección de menos de 10 caracteres no vale', () => {
    expect(motivoCorreccionValido('error')).toBe(false);
    expect(motivoCorreccionValido('   nueve   ')).toBe(false);
    expect(motivoCorreccionValido('Olvidó checar al entrar a planta')).toBe(true);
  });
});
