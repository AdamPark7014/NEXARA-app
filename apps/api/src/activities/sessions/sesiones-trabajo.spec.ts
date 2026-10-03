import {
  MENSAJE_TOPE_12H,
  TOPE_SESION_MIN,
  cruzarTramos,
  errorDeHorasPlan,
  errorDeMinutosPlan,
  estadoDeTrabajo,
  finEfectivo,
  minutosDeSesiones,
  minutosDeTramosMs,
  minutosTrabajados,
  motivoDePausa,
  sesionVencida,
  topeDeSesion,
  tramosTrabajados,
  type SesionTrabajo,
} from './sesiones-trabajo';

/**
 * «Ninguna actividad puede durar más de 12 horas… deben reiniciarlas a diario, de lo
 * contrario los KPI toman productividad irreal».
 *
 * Hora de México (UTC−6, sin horario de verano). Las pruebas escriben horas de México a
 * propósito: el contenedor corre en UTC y el «final del día» se movía a las 18:00.
 */
const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`);
const sesion = (inicio: Date, fin: Date | null, extra: Partial<SesionTrabajo> = {}): SesionTrabajo => ({
  startedAt: inicio,
  endedAt: fin,
  ...extra,
});

describe('tope de una sesión', () => {
  it('12 horas cuando caben en su día', () => {
    expect(topeDeSesion(M('15', '08:00'))).toEqual({ at: M('15', '20:00'), motivo: 'TOPE_12H' });
  });

  it('el final de su día (hora de México) cuando las 12 horas pasarían de medianoche', () => {
    const tope = topeDeSesion(M('15', '16:00'));
    expect(tope.motivo).toBe('CORTE_DIA');
    expect(tope.at.getTime()).toBe(M('16', '00:00').getTime() - 1);
  });

  it('una sesión de las 19:00 de México no se corta a las 18:00 por correr el servidor en UTC', () => {
    // 19:00 mx del 15 = 01:00 UTC del 16. Su día acaba a las 23:59:59.999 de México.
    const tope = topeDeSesion(M('15', '19:00'));
    expect(tope.at.getTime()).toBe(M('16', '00:00').getTime() - 1);
  });
});

describe('minutos de una sesión', () => {
  it('cerrada: lo que duró', () => {
    expect(minutosDeSesiones([sesion(M('15', '09:00'), M('15', '11:30'))], M('15', '20:00'))).toBe(150);
  });

  it('corriendo: cuenta hasta ahora', () => {
    expect(minutosDeSesiones([sesion(M('15', '09:00'), null)], M('15', '10:15'))).toBe(75);
  });

  it('corriendo desde hace días: nunca más de 12 horas', () => {
    expect(minutosDeSesiones([sesion(M('14', '08:00'), null)], M('18', '13:00'))).toBe(TOPE_SESION_MIN);
  });

  it('corriendo desde ayer en la tarde: se queda en el final de ese día', () => {
    // 17:00 → 23:59:59.999 = 6 h 59 min completos.
    expect(minutosDeSesiones([sesion(M('14', '17:00'), null)], M('15', '09:00'))).toBe(419);
  });

  it('un cierre guardado después del tope tampoco lo rebasa', () => {
    expect(finEfectivo(sesion(M('14', '08:00'), M('16', '18:00')), M('18', '13:00'))).toEqual(M('14', '20:00'));
  });

  it('una persona = la suma de sus sesiones (el fin de semana en medio no cuenta)', () => {
    const sesiones = [
      sesion(M('11', '09:00'), M('11', '18:00')), // viernes, 9 h
      sesion(M('14', '09:00'), M('14', '13:00')), // lunes, 4 h
    ];
    expect(minutosDeSesiones(sesiones, M('14', '20:00'))).toBe(13 * 60);
  });

  it('dos sesiones encimadas (doble toque) no suman dos veces el mismo minuto', () => {
    const sesiones = [sesion(M('15', '09:00'), M('15', '11:00')), sesion(M('15', '10:00'), M('15', '12:00'))];
    expect(minutosDeSesiones(sesiones, M('15', '20:00'))).toBe(180);
  });
});

describe('sesión vencida (cierre perezoso)', () => {
  it('todavía corre: nada que cerrar', () => {
    expect(sesionVencida(sesion(M('15', '09:00'), null), M('15', '12:00'))).toBeNull();
  });

  it('pasó sus 12 horas: se cierra ahí, con TOPE_12H', () => {
    expect(sesionVencida(sesion(M('15', '08:00'), null), M('15', '20:30'))).toEqual({
      at: M('15', '20:00'),
      motivo: 'TOPE_12H',
    });
  });

  it('terminó su día: se cierra al final del día, con CORTE_DIA', () => {
    const corte = sesionVencida(sesion(M('15', '18:00'), null), M('16', '08:00'));
    expect(corte?.motivo).toBe('CORTE_DIA');
    expect(corte?.at.getTime()).toBe(M('16', '00:00').getTime() - 1);
  });

  it('una sesión ya cerrada no se toca', () => {
    expect(sesionVencida(sesion(M('14', '08:00'), M('14', '09:00')), M('18', '13:00'))).toBeNull();
  });
});

describe('tiempo trabajado: sesiones, o el intervalo de antes con tope', () => {
  const ahora = M('18', '13:00');

  it('sin inicio todavía no hay tiempo (null, no cero)', () => {
    expect(minutosTrabajados({ inicio: null, fin: null, ahora })).toBeNull();
  });

  it('con sesiones manda su suma, no «fin menos inicio»', () => {
    // Iniciada el lunes y entregada el jueves: de corrido serían 3 días y 4 horas.
    const sesiones = [sesion(M('14', '09:00'), M('14', '12:00')), sesion(M('17', '10:00'), M('17', '13:00'))];
    expect(minutosTrabajados({ inicio: M('14', '09:00'), fin: M('17', '13:00'), sesiones, ahora })).toBe(360);
  });

  it('dato de antes de la regla, ya terminado: su intervalo, pero nunca más de 12 horas', () => {
    expect(minutosTrabajados({ inicio: M('14', '09:00'), fin: M('14', '11:00'), ahora })).toBe(120);
    expect(minutosTrabajados({ inicio: M('14', '09:00'), fin: M('17', '13:00'), ahora })).toBe(TOPE_SESION_MIN);
  });

  it('dato de antes de la regla, aún abierto: como una sesión que empezó en su inicio', () => {
    expect(minutosTrabajados({ inicio: M('18', '10:00'), fin: null, ahora })).toBe(180);
    expect(minutosTrabajados({ inicio: M('14', '09:00'), fin: null, ahora })).toBe(TOPE_SESION_MIN);
  });

  it('los tramos sirven para cruzarlos con la jornada', () => {
    const tramos = tramosTrabajados({
      inicio: M('15', '08:00'),
      fin: null,
      sesiones: [sesion(M('15', '08:00'), M('15', '20:00'))],
      ahora,
    });
    const jornada = [{ inicio: M('15', '09:00').getTime(), fin: M('15', '18:00').getTime() }];
    expect(minutosDeTramosMs(cruzarTramos(tramos, jornada))).toBe(540);
  });
});

describe('estado: corre, en pausa o ninguna', () => {
  const ahora = M('15', '13:00');

  it('sin iniciar no está en pausa', () => {
    expect(estadoDeTrabajo({ inicio: null, fin: null, sesiones: [], ahora })).toMatchObject({
      enCurso: false,
      enPausa: false,
    });
  });

  it('con una sesión abierta su reloj corre', () => {
    const e = estadoDeTrabajo({ inicio: M('15', '09:00'), fin: null, sesiones: [sesion(M('15', '09:00'), null)], ahora });
    expect(e).toMatchObject({ enCurso: true, enPausa: false, sesionAbiertaDesde: M('15', '09:00') });
  });

  it('pausada por su jefe: dice quién y por qué', () => {
    const e = estadoDeTrabajo({
      inicio: M('15', '09:00'),
      fin: null,
      sesiones: [
        sesion(M('15', '09:00'), M('15', '11:00'), {
          endReason: 'PAUSA',
          endedById: 1,
          endedBy: { id: 1, nombre: 'Christian' },
          nota: 'Atiende primero la falla del cliente',
        }),
      ],
      ahora,
    });
    expect(e).toMatchObject({
      enCurso: false,
      enPausa: true,
      pausaTipo: 'PAUSA',
      pausadaAt: M('15', '11:00'),
      pausadaPor: { id: 1, nombre: 'Christian' },
      motivoPausa: 'Atiende primero la falla del cliente',
    });
  });

  it('detenida por su salida del día: en pausa, sin «pausada por»', () => {
    const e = estadoDeTrabajo({
      inicio: M('14', '09:00'),
      fin: null,
      sesiones: [sesion(M('14', '09:00'), M('14', '18:00'), { endReason: 'SALIDA' })],
      ahora,
    });
    expect(e).toMatchObject({ enPausa: true, pausaTipo: 'SALIDA', pausadaPor: null, motivoPausa: null });
  });

  it('abierta en la base desde ayer: ya no corre aunque el cierre perezoso no haya pasado', () => {
    const e = estadoDeTrabajo({ inicio: M('14', '18:00'), fin: null, sesiones: [sesion(M('14', '18:00'), null)], ahora });
    expect(e).toMatchObject({ enCurso: false, enPausa: true, pausaTipo: 'CORTE_DIA' });
  });

  it('entregada (foto de salida) o cerrada: ni corre ni está en pausa', () => {
    const sesiones = [sesion(M('15', '09:00'), M('15', '11:00'), { endReason: 'FIN' })];
    expect(estadoDeTrabajo({ inicio: M('15', '09:00'), fin: M('15', '11:00'), sesiones, ahora }).enPausa).toBe(false);
    expect(
      estadoDeTrabajo({ inicio: M('15', '09:00'), fin: null, sesiones, ahora, terminada: true }).enPausa,
    ).toBe(false);
  });

  it('iniciada antes de la regla (sin sesiones) y de otro día: toca reanudarla', () => {
    expect(estadoDeTrabajo({ inicio: M('10', '09:00'), fin: null, sesiones: [], ahora })).toMatchObject({
      enCurso: false,
      enPausa: true,
      pausaTipo: 'TOPE_12H',
    });
    // La de hoy sigue corriendo como siempre.
    expect(estadoDeTrabajo({ inicio: M('15', '10:00'), fin: null, sesiones: [], ahora }).enCurso).toBe(true);
  });
});

describe('tiempo estimado: máximo 12 horas', () => {
  it('más de 12 horas se rechaza con el motivo', () => {
    expect(errorDeHorasPlan(12.5)).toBe(MENSAJE_TOPE_12H);
    expect(errorDeHorasPlan('24')).toBe(MENSAJE_TOPE_12H);
    expect(errorDeMinutosPlan(721)).toBe(MENSAJE_TOPE_12H);
  });

  it('12 horas exactas y menos pasan', () => {
    expect(errorDeHorasPlan(12)).toBeNull();
    expect(errorDeHorasPlan(0.5)).toBeNull();
    expect(errorDeMinutosPlan(720)).toBeNull();
  });

  it('vacío sigue siendo «sin estimado» (las apps instaladas no siempre lo mandan)', () => {
    expect(errorDeHorasPlan(null)).toBeNull();
    expect(errorDeHorasPlan(undefined)).toBeNull();
    expect(errorDeHorasPlan('')).toBeNull();
    expect(errorDeHorasPlan(0)).toBeNull();
  });

  it('algo que no es número no pasa', () => {
    expect(errorDeHorasPlan('mucho')).toMatch(/no es válido/);
  });
});

describe('motivo de pausa', () => {
  it('menos de 10 caracteres no alcanza', () => {
    expect(motivoDePausa('urgente')).toBeNull();
    expect(motivoDePausa('   ')).toBeNull();
    expect(motivoDePausa(undefined)).toBeNull();
  });

  it('se limpia y se recorta a 500', () => {
    expect(motivoDePausa('  Salió una falla en el cliente  ')).toBe('Salió una falla en el cliente');
    expect(motivoDePausa('x'.repeat(900))).toHaveLength(500);
  });
});
