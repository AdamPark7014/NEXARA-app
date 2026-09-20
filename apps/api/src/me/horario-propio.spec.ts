import {
  DIAS_LABORABLES,
  JORNADA_ORDINARIA_MIN,
  calculaKpisPersona,
  horaValida,
  horarioDePersona,
  horarioDePlantilla,
  retardoDeEntrada,
} from './kpis-equipo.js';

/**
 * El horario propio de cada persona.
 *
 * La promesa es que mientras nadie escriba nada, nada cambia: la tabla nace vacía y el
 * cálculo sigue siendo el de siempre (oficina 09:00, campo 08:00, 15 min de gracia, L–V,
 * 8 h netas). Escribir un campo cambia ese campo y nada más.
 */

const mx = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-06:00`);

describe('sin horario propio manda la plantilla', () => {
  it('oficina sigue entrando a las nueve, L–V, con quince minutos de gracia', () => {
    const h = horarioDePersona('office_hours', null);
    expect(h).toEqual(horarioDePlantilla('office_hours'));
    expect(h.entrada).toBe('09:00');
    expect(h.graciaMin).toBe(15);
    expect(h.jornadaOrdinariaMin).toBe(JORNADA_ORDINARIA_MIN);
    expect(h.diasLaborables).toEqual(DIAS_LABORABLES);
    expect(h.personalizado).toBe(false);
  });

  it('campo entra a las ocho', () => {
    expect(horarioDePersona('contractor', null).entrada).toBe('08:00');
  });

  it('dirección (24/7) no tiene hora a la que llegar tarde', () => {
    const h = horarioDePersona('always_on', null);
    expect(h.entrada).toBeNull();
    expect(h.jornadaOrdinariaMin).toBeNull();
    expect(h.diasLaborables).toEqual([]);
  });

  it('una fila vacía tampoco cambia nada de fondo', () => {
    const h = horarioDePersona('office_hours', {});
    expect(h.entrada).toBe('09:00');
    expect(h.graciaMin).toBe(15);
    expect(h.diasLaborables).toEqual(DIAS_LABORABLES);
  });
});

describe('cada campo se decide por separado', () => {
  it('cambiar solo la hora de entrada no decide su jornada ni sus días', () => {
    const h = horarioDePersona('office_hours', { horaEntrada: '07:30' });
    expect(h.entrada).toBe('07:30');
    expect(h.graciaMin).toBe(15);
    expect(h.jornadaOrdinariaMin).toBe(JORNADA_ORDINARIA_MIN);
    expect(h.diasLaborables).toEqual(DIAS_LABORABLES);
    expect(h.personalizado).toBe(true);
  });

  it('quien trabaja de martes a sábado se mide de martes a sábado', () => {
    const h = horarioDePersona('contractor', { dias: [2, 3, 4, 5, 6] });
    expect(h.diasLaborables).toEqual([2, 3, 4, 5, 6]);
  });

  it('una jornada de seis horas convierte en extra lo que pase de seis', () => {
    const h = horarioDePersona('office_hours', { jornadaOrdinariaMin: 360 });
    expect(h.jornadaOrdinariaMin).toBe(360);
  });

  it('una hora de entrada escrita sí le da retardo a quien su plantilla no se lo daba', () => {
    // Es justo para eso: poner la hora es decir «a esta persona sí se le mide».
    const sinHorario = horarioDePersona('always_on', null);
    const conHorario = horarioDePersona('always_on', { horaEntrada: '10:00' });
    const llegada = mx('2026-09-16', '10:40');

    expect(retardoDeEntrada(llegada, sinHorario).retardo).toBe(false);
    const r = retardoDeEntrada(llegada, conHorario);
    expect(r.retardo).toBe(true);
    expect(r.minutosTarde).toBe(40);
  });

  it('una hora mal escrita no se acepta ni tira el cálculo: se queda la de la plantilla', () => {
    expect(horaValida('25:00')).toBeNull();
    expect(horaValida('9:00')).toBeNull();
    expect(horaValida('09:00')).toBe('09:00');
    expect(horarioDePersona('office_hours', { horaEntrada: 'a las nueve' }).entrada).toBe('09:00');
  });

  it('valores imposibles se ignoran en vez de producir números absurdos', () => {
    const h = horarioDePersona('office_hours', { graciaMin: -10, jornadaOrdinariaMin: 0, dias: [9, -1] });
    expect(h.graciaMin).toBe(15);
    expect(h.jornadaOrdinariaMin).toBe(JORNADA_ORDINARIA_MIN);
    expect(h.diasLaborables).toEqual(DIAS_LABORABLES);
  });
});

describe('el horario propio se nota en las horas del periodo', () => {
  const jornada = (dia: string, entra: string, sale: string) => [
    { tipo: 'entrada', at: mx(dia, entra) },
    { tipo: 'salida', at: mx(dia, sale) },
  ];

  it('un sábado es día normal para quien trabaja en sábado, y todo extra para quien no', () => {
    // Sábado 19-09-2026, ocho horas corridas sin comida registrada.
    const base = {
      desde: '2026-09-19',
      hasta: '2026-09-19',
      ahora: mx('2026-09-21', '10:00'),
      checadas: jornada('2026-09-19', '08:00', '16:00') as any,
      comidas: [],
      actividades: [],
    };

    const lunesAViernes = calculaKpisPersona({ ...base, horario: horarioDePersona('contractor', null) });
    // No es día laborable suyo: todo lo trabajado es tiempo extra.
    expect(lunesAViernes.totales.minutosExtra).toBe(480);

    const martesASabado = calculaKpisPersona({
      ...base,
      horario: horarioDePersona('contractor', { dias: [2, 3, 4, 5, 6] }),
    });
    // Sí es su día: ocho horas son su jornada, no hay extra.
    expect(martesASabado.totales.minutosExtra).toBe(0);
    expect(martesASabado.totales.minutosLaborados).toBe(480);
  });
});
