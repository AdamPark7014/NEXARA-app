import {
  UMBRAL_KM_SIN_REGISTRO,
  alertaLecturaCorregida,
  kmEsperadosIdaVuelta,
  revisarKmContraUltimo,
  revisarKmRecorridos,
  ultimoRegistroKm,
} from './kilometraje';

const AHORA = new Date('2026-11-21T18:00:00.000Z');

describe('ultimoRegistroKm', () => {
  it('toma el más reciente, no el de más km', () => {
    const r = ultimoRegistroKm([
      { km: 50_000, at: '2026-11-10T10:00:00Z', origen: 'devolucion' },
      { km: 48_000, at: '2026-11-20T10:00:00Z', origen: 'carga' },
      null,
      { km: Number.NaN, at: '2026-11-21T10:00:00Z', origen: 'roto' },
    ]);
    expect(r).toMatchObject({ km: 48_000, origen: 'carga' });
  });

  it('a igual hora (o sin hora), el de más km', () => {
    expect(ultimoRegistroKm([{ km: 10, at: null, origen: 'a' }, { km: 20, at: null, origen: 'b' }])?.km).toBe(20);
    expect(ultimoRegistroKm([])).toBeNull();
  });
});

describe('revisarKmContraUltimo', () => {
  const ultimo = { km: 48_000, at: '2026-11-20T16:00:00Z', origen: 'devolucion' };

  it('sin registro previo, nada que revisar', () => {
    expect(revisarKmContraUltimo(10, null, AHORA)).toEqual({ error: null, alertas: [] });
  });

  it('retroceder más de 2 km es error, con el último registro en el mensaje', () => {
    const r = revisarKmContraUltimo(47_990, ultimo, AHORA);
    expect(r.error).toMatch(/menor al último registro/);
    expect(r.error).toMatch(/48,000/);
  });

  it('hasta 2 km atrás pasa (lectura de la aguja)', () => {
    expect(revisarKmContraUltimo(47_998, ultimo, AHORA)).toEqual({ error: null, alertas: [] });
  });

  it('un salto de más de 15 km es alerta de uso sin registro, no error', () => {
    const r = revisarKmContraUltimo(48_000 + UMBRAL_KM_SIN_REGISTRO + 5, ultimo, AHORA);
    expect(r.error).toBeNull();
    expect(r.alertas).toEqual([expect.objectContaining({ tipo: 'KM_SIN_REGISTRO', km: UMBRAL_KM_SIN_REGISTRO + 5 })]);
  });
});

describe('kmEsperadosIdaVuelta', () => {
  it('Puebla a CDMX centro: unos 270 km de ida y vuelta por carretera', () => {
    const km = kmEsperadosIdaVuelta({ lat: 19.074, lng: -98.278 }, { lat: 19.4326, lng: -99.1332 });
    expect(km).toBeGreaterThan(220);
    expect(km).toBeLessThan(320);
  });

  it('sin coordenadas, o con 0,0, no estima', () => {
    expect(kmEsperadosIdaVuelta({ lat: 19, lng: -98 }, null)).toBeNull();
    expect(kmEsperadosIdaVuelta({ lat: 19, lng: -98 }, { lat: 0, lng: 0 })).toBeNull();
    expect(kmEsperadosIdaVuelta({ latitude: 19, longitude: -98 }, { direccion: 'sin coordenadas' })).toBeNull();
  });
});

describe('revisarKmRecorridos', () => {
  it('avisa cuando recorre más de 1.5 veces (o 25 km más) de lo que pide la actividad', () => {
    expect(revisarKmRecorridos(30, 20, AHORA)).toBeNull(); // 20 + 25 = 45 de tope
    expect(revisarKmRecorridos(60, 20, AHORA)).toMatchObject({ tipo: 'KM_DE_MAS', km: 60 });
    expect(revisarKmRecorridos(400, 270, AHORA)).toBeNull(); // 270 × 1.5 = 405
    expect(revisarKmRecorridos(410, 270, AHORA)).not.toBeNull();
  });

  it('sin estimado, no opina', () => {
    expect(revisarKmRecorridos(999, null, AHORA)).toBeNull();
  });
});

describe('alertaLecturaCorregida', () => {
  it('avisa si la persona cambió el km o la gasolina que leyó la IA', () => {
    const a = alertaLecturaCorregida({ odometroKm: 48_215, combustiblePct: 50 }, { odometroKm: 43_215, combustiblePct: 50 }, AHORA);
    expect(a).toMatchObject({ tipo: 'LECTURA_CORREGIDA' });
    expect(a?.mensaje).toMatch(/48,215/);
  });

  it('un km o un cuarto de tanque de diferencia no es corrección', () => {
    expect(alertaLecturaCorregida({ odometroKm: 100, combustiblePct: 50 }, { odometroKm: 101, combustiblePct: 60 }, AHORA)).toBeNull();
    expect(alertaLecturaCorregida(null, { odometroKm: 1, combustiblePct: 1 }, AHORA)).toBeNull();
  });
});
