import {
  calculaActividad,
  enRango,
  kpisDePersona,
  minutosAsistidos,
  minutosPlanDeHoras,
  normalizaPrioridad,
  tiemposReales,
} from './pizarra-kpi';

const T = (hhmm: string) => new Date(`2026-09-17T${hhmm}:00.000Z`);
const ahora = T('18:00');

describe('normalizaPrioridad', () => {
  it('acepta los textos viejos y el vacío', () => {
    expect(normalizaPrioridad('Alta')).toBe('ALTA');
    expect(normalizaPrioridad('urgente')).toBe('ALTA');
    expect(normalizaPrioridad('P1')).toBe('ALTA');
    expect(normalizaPrioridad('Crítica')).toBe('ALTA');
    expect(normalizaPrioridad('Media')).toBe('MEDIA');
    expect(normalizaPrioridad('Normal')).toBe('MEDIA');
    expect(normalizaPrioridad('baja')).toBe('BAJA');
    expect(normalizaPrioridad(null)).toBe('MEDIA');
    expect(normalizaPrioridad('   ')).toBe('MEDIA');
    expect(normalizaPrioridad('lo que sea')).toBe('MEDIA');
    expect(normalizaPrioridad('muy urgente, por favor')).toBe('ALTA');
  });
});

describe('tiemposReales', () => {
  it('sin columnas de la sección B usa las fotos de evidencia', () => {
    expect(
      tiemposReales({ entryPhotoUploadedAt: T('09:10'), exitPhotoUploadedAt: T('11:30') }),
    ).toEqual({ inicio: T('09:10'), fin: T('11:30') });
  });

  it('prefiere inicioRealAt/finRealAt cuando ya existen', () => {
    expect(
      tiemposReales({
        inicioRealAt: T('09:00'),
        finRealAt: T('10:00'),
        entryPhotoUploadedAt: T('09:10'),
        exitPhotoUploadedAt: T('11:30'),
      }),
    ).toEqual({ inicio: T('09:00'), fin: T('10:00') });
  });

  it('cae en completedAt y, si está cerrada, en fechaFinalizacion', () => {
    expect(tiemposReales({ entryPhotoUploadedAt: T('09:00'), evidenciaCompletedAt: T('12:00') }).fin)
      .toEqual(T('12:00'));
    expect(
      tiemposReales({
        entryPhotoUploadedAt: T('09:00'),
        fechaFinalizacion: T('13:00'),
        cerrada: true,
      }).fin,
    ).toEqual(T('13:00'));
    expect(
      tiemposReales({ entryPhotoUploadedAt: T('09:00'), fechaFinalizacion: T('13:00') }).fin,
    ).toBeNull();
  });

  it('ignora un fin anterior al inicio (datos viejos)', () => {
    expect(
      tiemposReales({ entryPhotoUploadedAt: T('12:00'), exitPhotoUploadedAt: T('09:00') }).fin,
    ).toBeNull();
  });
});

describe('calculaActividad', () => {
  it('rojo si venció la fecha máxima', () => {
    const r = calculaActividad(
      { prioridad: 'Baja', fechaMaxima: T('17:00'), inicio: T('09:00') },
      ahora,
    );
    expect(r.vencida).toBe(true);
    expect(r.semaforo).toBe('rojo');
  });

  it('rojo si es ALTA y no ha iniciado', () => {
    expect(calculaActividad({ prioridad: 'Alta', estatus: 'Pendiente' }, ahora).semaforo).toBe('rojo');
  });

  it('rojo si excedió el tiempo planeado', () => {
    const r = calculaActividad(
      { prioridad: 'Baja', minutosPlan: 60, inicio: T('16:00'), estatus: 'En Proceso' },
      ahora,
    );
    expect(r.minutosReales).toBe(120);
    expect(r.excedida).toBe(true);
    expect(r.semaforo).toBe('rojo');
  });

  it('amarillo si es MEDIA sin iniciar, o en curso con más del 80 % del plan', () => {
    expect(calculaActividad({ prioridad: 'Media', estatus: 'Pendiente' }, ahora).semaforo).toBe(
      'amarillo',
    );
    const enCurso = calculaActividad(
      { prioridad: 'Baja', minutosPlan: 120, inicio: T('16:15'), estatus: 'En Proceso' },
      ahora,
    );
    expect(enCurso.minutosReales).toBe(105);
    expect(enCurso.semaforo).toBe('amarillo');
  });

  it('verde: BAJA sin iniciar y en curso con plan de sobra', () => {
    expect(calculaActividad({ prioridad: 'Baja', estatus: 'Pendiente' }, ahora).semaforo).toBe('verde');
    expect(
      calculaActividad(
        { prioridad: 'Alta', minutosPlan: 480, inicio: T('17:00'), estatus: 'En Proceso' },
        ahora,
      ).semaforo,
    ).toBe('verde');
  });

  it('terminada a tiempo no se pone roja por el paso del tiempo', () => {
    const r = calculaActividad(
      {
        prioridad: 'Alta',
        estatus: 'Finalizada',
        terminada: true,
        fechaMaxima: T('12:00'),
        inicio: T('09:00'),
        fin: T('11:00'),
      },
      ahora,
    );
    expect(r.aTiempo).toBe(true);
    expect(r.semaforo).toBe('verde');
    expect(r.minutosReales).toBe(120);
  });

  it('terminada tarde queda roja y fuera de «a tiempo»', () => {
    const r = calculaActividad(
      { estatus: 'Finalizada', terminada: true, fechaMaxima: T('10:00'), inicio: T('09:00'), fin: T('11:00') },
      ahora,
    );
    expect(r.aTiempo).toBe(false);
    expect(r.semaforo).toBe('rojo');
  });

  it('una cancelada no pinta semáforo', () => {
    expect(
      calculaActividad({ prioridad: 'Alta', estatus: 'Cancelada', cancelada: true }, ahora).semaforo,
    ).toBe('verde');
  });

  it('minutosPlanDeHoras convierte horasPlan y descarta basura', () => {
    expect(minutosPlanDeHoras(1.5)).toBe(90);
    expect(minutosPlanDeHoras(0)).toBeNull();
    expect(minutosPlanDeHoras(null)).toBeNull();
  });
});

describe('minutosAsistidos', () => {
  it('usa la salida cuando existe (el bug viejo contaba hasta ahora)', () => {
    expect(minutosAsistidos([{ entrada: T('09:00'), salida: T('14:00') }], [], ahora)).toBe(300);
  });

  it('sin salida cuenta hasta ahora, con tope de 9 h', () => {
    expect(minutosAsistidos([{ entrada: T('17:00'), salida: null }], [], ahora)).toBe(60);
    expect(minutosAsistidos([{ entrada: T('06:00'), salida: null }], [], ahora)).toBe(540);
  });

  it('descuenta la comida, y una hora si no registró el regreso', () => {
    expect(
      minutosAsistidos(
        [{ entrada: T('09:00'), salida: T('18:00') }],
        [{ inicio: T('15:00'), fin: T('15:45') }],
        ahora,
      ),
    ).toBe(540 - 45);
    expect(
      minutosAsistidos(
        [{ entrada: T('09:00'), salida: T('18:00') }],
        [{ inicio: T('15:00'), fin: null }],
        ahora,
      ),
    ).toBe(540 - 60);
  });

  it('suma varios días del rango y devuelve null sin jornadas', () => {
    expect(
      minutosAsistidos(
        [
          { entrada: T('09:00'), salida: T('13:00') },
          { entrada: T('14:00'), salida: T('16:00') },
        ],
        [],
        ahora,
      ),
    ).toBe(360);
    expect(minutosAsistidos([], [], ahora)).toBeNull();
  });
});

describe('kpisDePersona', () => {
  const base = { prioridad: 'Media', estatus: 'En Proceso' } as const;

  it('cuenta cerradas, a tiempo, eficiencia y productividad', () => {
    const acts = [
      // Plan 120, real 60: terminó a tiempo y en la mitad del plan.
      calculaActividad(
        { ...base, terminada: true, minutosPlan: 120, fechaMaxima: T('12:00'), inicio: T('09:00'), fin: T('10:00') },
        ahora,
      ),
      // Plan 60, real 120: terminó tarde.
      calculaActividad(
        { ...base, terminada: true, minutosPlan: 60, fechaMaxima: T('12:00'), inicio: T('11:00'), fin: T('13:00') },
        ahora,
      ),
      // En curso: entra en minutos en actividad, no en cerradas.
      calculaActividad({ ...base, minutosPlan: 60, inicio: T('17:30') }, ahora),
    ];
    const k = kpisDePersona(acts, 480);
    expect(k.asignadas).toBe(3);
    expect(k.cerradas).toBe(2);
    expect(k.aTiempo).toBe(1);
    expect(k.aTiempoPct).toBe(50);
    expect(k.minutosPlan).toBe(240);
    expect(k.minutosReales).toBe(210);
    // (120 + 60) / (60 + 120) = 100 %
    expect(k.eficienciaPct).toBe(100);
    expect(k.minutosEnActividad).toBe(210);
    expect(k.productividadPct).toBe(44);
    expect(k.minutosAsistidos).toBe(480);
  });

  it('no cuenta canceladas ni aquellas de las que la retiraron, y sí los rechazos', () => {
    const acts = [
      calculaActividad({ ...base, terminada: true, inicio: T('09:00'), fin: T('10:00') }, ahora),
      calculaActividad({ ...base, cancelada: true, estatus: 'Cancelada' }, ahora),
      calculaActividad({ ...base, retirado: true, inicio: T('09:00') }, ahora),
      calculaActividad({ ...base, rechazadaAt: T('09:30') }, ahora),
    ];
    const k = kpisDePersona(acts, null);
    expect(k.asignadas).toBe(2);
    expect(k.cerradas).toBe(1);
    expect(k.rechazadas).toBe(1);
    expect(k.productividadPct).toBeNull();
    expect(k.minutosAsistidos).toBeNull();
  });

  it('sin nada cerrado los porcentajes quedan en null (no en cero)', () => {
    const k = kpisDePersona([calculaActividad({ ...base, estatus: 'Pendiente' }, ahora)], 0);
    expect(k.aTiempoPct).toBeNull();
    expect(k.eficienciaPct).toBeNull();
    expect(k.productividadPct).toBeNull();
  });
});

describe('enRango', () => {
  it('mira si alguna fecha cae dentro (extremos incluidos)', () => {
    expect(enRango([null, T('10:00')], T('09:00'), T('18:00'))).toBe(true);
    expect(enRango([T('09:00')], T('09:00'), T('18:00'))).toBe(true);
    expect(enRango([T('08:59')], T('09:00'), T('18:00'))).toBe(false);
    expect(enRango([null, undefined], T('09:00'), T('18:00'))).toBe(false);
  });
});
