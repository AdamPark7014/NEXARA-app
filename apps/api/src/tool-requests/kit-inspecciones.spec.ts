import {
  DIAS_REVISION_DANADO,
  DIAS_REVISION_OBSERVADO,
  MAX_FOTOS_INSPECCION,
  estadoProgramacion,
  normalizarCadencia,
  normalizarEstadoInspeccion,
  normalizarFotosInspeccion,
  proximaInspeccion,
} from './kit-inspecciones.js';

const HOY = new Date('2026-09-19T12:00:00.000Z');
const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe('normalizarEstadoInspeccion', () => {
  it('acepta los tres estados, con o sin acento', () => {
    expect(normalizarEstadoInspeccion('ok')).toBe('OK');
    expect(normalizarEstadoInspeccion('observado')).toBe('OBSERVADO');
    expect(normalizarEstadoInspeccion('dañado')).toBe('DANADO');
    expect(normalizarEstadoInspeccion('DANADO')).toBe('DANADO');
  });

  it('cualquier otra cosa es null', () => {
    expect(normalizarEstadoInspeccion('roto')).toBeNull();
    expect(normalizarEstadoInspeccion(null)).toBeNull();
  });
});

describe('normalizarCadencia', () => {
  it('cero o vacío es «sin revisión periódica»', () => {
    expect(normalizarCadencia(0)).toBeNull();
    expect(normalizarCadencia('')).toBeNull();
    expect(normalizarCadencia(null)).toBeNull();
    expect(normalizarCadencia(-30)).toBeNull();
  });

  it('recorta a dos años y trunca decimales', () => {
    expect(normalizarCadencia(30.7)).toBe(30);
    expect(normalizarCadencia(5000)).toBe(730);
  });
});

describe('proximaInspeccion', () => {
  it('suma la cadencia cuando el kit quedó bien', () => {
    const proxima = proximaInspeccion(HOY, 90, 'OK')!;
    expect(diasEntre(HOY, proxima)).toBeCloseTo(90, 0);
  });

  it('un kit observado se vuelve a mirar antes', () => {
    const proxima = proximaInspeccion(HOY, 90, 'OBSERVADO')!;
    expect(diasEntre(HOY, proxima)).toBeCloseTo(DIAS_REVISION_OBSERVADO, 0);
  });

  it('uno dañado, antes todavía', () => {
    const proxima = proximaInspeccion(HOY, 90, 'DANADO')!;
    expect(diasEntre(HOY, proxima)).toBeCloseTo(DIAS_REVISION_DANADO, 0);
  });

  it('nunca alarga la cadencia: con ciclo corto manda el ciclo', () => {
    const proxima = proximaInspeccion(HOY, 3, 'OBSERVADO')!;
    expect(diasEntre(HOY, proxima)).toBeCloseTo(3, 0);
  });

  it('sin cadencia no hay próxima', () => {
    expect(proximaInspeccion(HOY, null)).toBeNull();
    expect(proximaInspeccion(HOY, 0)).toBeNull();
  });

  it('la próxima cae a medianoche: es un día, no una hora', () => {
    const proxima = proximaInspeccion(HOY, 30)!;
    expect(proxima.getHours()).toBe(0);
    expect(proxima.getMinutes()).toBe(0);
  });
});

describe('estadoProgramacion', () => {
  it('sin fecha no hay nada pendiente', () => {
    expect(estadoProgramacion(null, HOY)).toEqual({
      vencida: false,
      diasDeAtraso: 0,
      diasParaLaProxima: null,
      porVencer: false,
    });
  });

  it('pasada la fecha está vencida y cuenta el atraso', () => {
    const res = estadoProgramacion(new Date(HOY.getTime() - 5 * 86_400_000), HOY);
    expect(res.vencida).toBe(true);
    expect(res.diasDeAtraso).toBe(5);
  });

  it('dentro de la semana avisa que está por vencer', () => {
    const res = estadoProgramacion(new Date(HOY.getTime() + 3 * 86_400_000), HOY);
    expect(res).toMatchObject({ vencida: false, porVencer: true, diasParaLaProxima: 3 });
  });

  it('más lejos, no molesta', () => {
    expect(estadoProgramacion(new Date(HOY.getTime() + 40 * 86_400_000), HOY).porVencer).toBe(false);
  });
});

describe('normalizarFotosInspeccion', () => {
  it('acepta cadenas y objetos con metadatos', () => {
    const res = normalizarFotosInspeccion([
      '/uploads/kits/a.jpg',
      { url: '/uploads/kits/b.jpg', lat: 19.04, lng: -98.2, capturedAt: '2026-09-19T12:00:00.000Z' },
    ]);
    expect(res).toEqual([
      { url: '/uploads/kits/a.jpg' },
      {
        url: '/uploads/kits/b.jpg',
        lat: 19.04,
        lng: -98.2,
        capturedAt: '2026-09-19T12:00:00.000Z',
      },
    ]);
  });

  it('descarta base64: eso no se subió', () => {
    expect(normalizarFotosInspeccion(['data:image/png;base64,AAAA'])).toEqual([]);
  });

  it('descarta coordenadas imposibles', () => {
    const [foto] = normalizarFotosInspeccion([{ url: '/a.jpg', lat: 999, lng: -98.2 }]);
    expect(foto).toEqual({ url: '/a.jpg', lng: -98.2 });
  });

  it('corta en el tope', () => {
    const muchas = Array.from({ length: MAX_FOTOS_INSPECCION + 5 }, (_, i) => `/uploads/${i}.jpg`);
    expect(normalizarFotosInspeccion(muchas)).toHaveLength(MAX_FOTOS_INSPECCION);
  });

  it('lo que no es lista no rompe nada', () => {
    expect(normalizarFotosInspeccion(undefined)).toEqual([]);
    expect(normalizarFotosInspeccion('x')).toEqual([]);
  });
});
