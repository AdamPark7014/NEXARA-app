import { instanteEnFechaLocal, resumenJornada } from './resumen-jornada';

describe('resumenJornada', () => {
  const tz = 'America/Mexico_City';

  it('10-18 puntual', () => {
    const fecha = '2026-11-20';
    const entrada = instanteEnFechaLocal(fecha, '10:00', tz);
    const salida = instanteEnFechaLocal(fecha, '18:00', tz);
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '18:00', graciaMin: 15 },
      entradaReal: entrada,
      salidaReal: salida,
      tz,
    });
    expect(r.retardoMin).toBe(0);
    expect(r.minutosLaborados).toBe(480);
    expect(r.minutosOrdinarios).toBe(480);
    expect(r.minutosExtra).toBe(0);
    expect(r.abierta).toBe(false);
  });

  it('10:20-18 retardo 20', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '18:00', graciaMin: 15 },
      entradaReal: instanteEnFechaLocal(fecha, '10:20', tz),
      salidaReal: instanteEnFechaLocal(fecha, '18:00', tz),
      tz,
    });
    expect(r.retardoMin).toBe(20);
    expect(r.minutosLaborados).toBe(460);
  });

  it('citado 6-12 llego 6:20: retardo 20, ~3h40 extra, 2h ordinarias', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '06:00', horaSalida: '12:00', graciaMin: 0 },
      entradaReal: instanteEnFechaLocal(fecha, '06:20', tz),
      salidaReal: instanteEnFechaLocal(fecha, '12:00', tz),
      tz,
    });
    expect(r.retardoMin).toBe(20);
    expect(r.minutosLaborados).toBe(340);
    expect(r.minutosOrdinarios).toBe(120); // 10-12
    expect(r.minutosExtra).toBe(220); // 6:20-10:00
  });

  it('nocturno 22:00-06:00 cruzando medianoche', () => {
    const fecha = '2026-11-20';
    const entrada = instanteEnFechaLocal(fecha, '22:00', tz);
    const salida = instanteEnFechaLocal('2026-11-21', '06:00', tz);
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '22:00', horaSalida: '06:00', graciaMin: 15 },
      entradaReal: entrada,
      salidaReal: salida,
      tz,
    });
    expect(r.minutosLaborados).toBe(480);
    expect(r.minutosOrdinarios).toBe(0);
    expect(r.minutosExtra).toBe(480);
    expect(r.minutosNocturnos).toBeGreaterThan(0);
  });

  it('extendido a las 20:00', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '20:00', graciaMin: 15 },
      entradaReal: instanteEnFechaLocal(fecha, '10:00', tz),
      salidaReal: instanteEnFechaLocal(fecha, '20:00', tz),
      tz,
    });
    expect(r.minutosLaborados).toBe(600);
    expect(r.minutosOrdinarios).toBe(480);
    expect(r.minutosExtra).toBe(120);
  });

  it('recortado a las 15:00 con salida anticipada', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '15:00', graciaMin: 15 },
      entradaReal: instanteEnFechaLocal(fecha, '10:00', tz),
      salidaReal: instanteEnFechaLocal(fecha, '15:00', tz),
      tz,
    });
    expect(r.minutosLaborados).toBe(300);
    expect(r.minutosOrdinarios).toBe(300);
    expect(r.salidaAnticipadaMin).toBe(0); // salio a la citada recortada
  });

  it('no checo salida: abierta y sin minutos pagables', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '18:00', graciaMin: 15 },
      entradaReal: instanteEnFechaLocal(fecha, '10:00', tz),
      salidaReal: null,
      tz,
    });
    expect(r.abierta).toBe(true);
    expect(r.minutosLaborados).toBe(0);
  });

  it('capas planeado/real/pagable presentes', () => {
    const fecha = '2026-11-20';
    const r = resumenJornada({
      horario: { fecha, horaEntrada: '10:00', horaSalida: '18:00' },
      entradaReal: instanteEnFechaLocal(fecha, '10:00', tz),
      salidaReal: instanteEnFechaLocal(fecha, '18:00', tz),
      tz,
    });
    expect(r.capas.planeado.entrada).toBe('10:00');
    expect(r.capas.real.entrada).toBeTruthy();
    expect(r.capas.pagable.laborados).toBe(480);
  });
});
