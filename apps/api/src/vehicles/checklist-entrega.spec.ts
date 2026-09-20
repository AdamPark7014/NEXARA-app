import {
  SLOTS_CHECKLIST,
  combustiblePctDesdeNivel,
  nivelDesdeCombustiblePct,
  leerMetaDelBody,
  mensajeErrores,
  revisarChecklist,
  VENTANA_CAPTURA_HORAS,
} from './checklist-entrega';

/**
 * El check list de entrega/recepción: 360° + tablero + kilometraje + gasolina,
 * al salir y al devolver. Las mismas reglas para las cuatro rutas que abren o
 * cierran una asignación.
 */

const AHORA = new Date('2026-09-19T18:00:00.000Z');

function fotosCompletas(): Record<string, string> {
  return Object.fromEntries(SLOTS_CHECKLIST.map((s) => [s, `/uploads/vehicles/${s}.jpg`]));
}

function metaCompleta(capturedAt = '2026-09-19T17:55:00.000Z') {
  return Object.fromEntries(
    SLOTS_CHECKLIST.map((s) => [s, { capturedAt, lat: 19.0414, lng: -98.2063 }]),
  );
}

describe('las siete fotos', () => {
  it('una salida completa pasa y deja la foto del tablero apartada', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      odometroKm: 45_120,
      combustible: '3/4',
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.fotos).toHaveLength(7);
    expect(r.datos.fotoTableroUrl).toBe('/uploads/vehicles/tablero.jpg');
    expect(r.datos.combustiblePct).toBe(75);
    expect(r.datos.odometroKm).toBe(45_120);
  });

  it('son cuatro del exterior, dos del interior y el tablero', () => {
    expect([...SLOTS_CHECKLIST]).toEqual([
      'frontal',
      'trasera',
      'lateral-izq',
      'lateral-der',
      'interior-delantera',
      'interior-trasera',
      'tablero',
    ]);
  });

  it('sin la lateral izquierda no hay 360°, y lo dice por su nombre', () => {
    const fotos = fotosCompletas();
    delete fotos['lateral-izq'];
    const r = revisarChecklist({
      fotos,
      meta: metaCompleta(),
      odometroKm: 10,
      combustible: 'F',
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('Lateral izq.');
  });

  it('sin la del tablero tampoco: es la que respalda km y gasolina', () => {
    const fotos = fotosCompletas();
    delete fotos['tablero'];
    const r = revisarChecklist({
      fotos,
      meta: metaCompleta(),
      odometroKm: 10,
      combustible: 'F',
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('Tablero');
  });

  it('junta todo lo que falta en un solo golpe', () => {
    const r = revisarChecklist({ fotos: {}, meta: {}, ahora: AHORA });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // 7 fotos + kilometraje + combustible
    expect(r.errores).toHaveLength(9);
  });
});

describe('foto en vivo, no de galería', () => {
  it('una foto sin capturedAt se rechaza pidiendo usar la cámara', () => {
    const meta = metaCompleta();
    delete (meta as Record<string, unknown>)['frontal'];
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta,
      odometroKm: 10,
      combustible: 'E',
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('cámara');
  });

  it(`una de hace más de ${VENTANA_CAPTURA_HORAS} h es de la galería aunque traiga fecha`, () => {
    const meta = metaCompleta();
    meta['trasera'] = { capturedAt: '2026-09-01T10:00:00.000Z', lat: 19, lng: -98 };
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta,
      odometroKm: 10,
      combustible: 'E',
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('vuelve a tomarla');
  });

  it('guarda dónde y cuándo se tomó cada una', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      odometroKm: 10,
      combustible: 'E',
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.fotos[0]).toEqual({
      slot: 'frontal',
      url: '/uploads/vehicles/frontal.jpg',
      capturedAt: '2026-09-19T17:55:00.000Z',
      lat: 19.0414,
      lng: -98.2063,
    });
  });

  it('sin señal el punto queda en null, pero la foto vale', () => {
    const meta = metaCompleta();
    // 0,0 es el Golfo de Guinea: es «no tengo señal», no una ubicación.
    meta['frontal'] = { capturedAt: '2026-09-19T17:55:00.000Z', lat: 0, lng: 0 };
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta,
      odometroKm: 10,
      combustible: 'E',
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.fotos[0].lat).toBeNull();
    expect(r.datos.fotos[0].lng).toBeNull();
  });
});

describe('kilometraje y gasolina', () => {
  it('el kilometraje es obligatorio', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      combustible: 'F',
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('kilometraje');
  });

  it('el nivel de gasolina también', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      odometroKm: 10,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('gasolina');
  });

  it('al devolver, el kilometraje final no puede ser menor al inicial', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      odometroKm: 45_000,
      combustible: '1/4',
      odometroInicio: 45_120,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(mensajeErrores(r.errores)).toContain('45120');
  });

  it('el mismo kilometraje sí: pudo no moverse', () => {
    const r = revisarChecklist({
      fotos: fotosCompletas(),
      meta: metaCompleta(),
      odometroKm: 45_120,
      combustible: '1/4',
      odometroInicio: 45_120,
      ahora: AHORA,
    });
    expect(r.ok).toBe(true);
  });

  it('la aguja se lee E, ¼, ½, ¾, F', () => {
    expect(combustiblePctDesdeNivel('E')).toBe(0);
    expect(combustiblePctDesdeNivel('1/4')).toBe(25);
    expect(combustiblePctDesdeNivel('1/2')).toBe(50);
    expect(combustiblePctDesdeNivel('3/4')).toBe(75);
    expect(combustiblePctDesdeNivel('F')).toBe(100);
  });

  it('un porcentaje directo también vale; uno imposible no', () => {
    expect(combustiblePctDesdeNivel(40)).toBe(40);
    expect(combustiblePctDesdeNivel('40%')).toBe(40);
    expect(combustiblePctDesdeNivel(140)).toBeNull();
    expect(combustiblePctDesdeNivel(-1)).toBeNull();
    expect(combustiblePctDesdeNivel('lleno')).toBeNull();
  });

  it('y se vuelve a pintar como aguja', () => {
    expect(nivelDesdeCombustiblePct(40)).toBe('1/2');
    expect(nivelDesdeCombustiblePct(0)).toBe('E');
    expect(nivelDesdeCombustiblePct(95)).toBe('F');
    expect(nivelDesdeCombustiblePct(null)).toBeNull();
  });
});

describe('metadatos que llegan en el multipart', () => {
  it('como un JSON único en el campo meta', () => {
    const meta = leerMetaDelBody({
      meta: JSON.stringify({ frontal: { capturedAt: 'x', lat: 1, lng: 2 } }),
    });
    expect(meta['frontal']).toEqual({ capturedAt: 'x', lat: 1, lng: 2 });
  });

  it('o suelto por slot, que es lo cómodo desde Android', () => {
    const meta = leerMetaDelBody({
      'meta-tablero': JSON.stringify({ capturedAt: 'y', lat: 3, lng: 4 }),
    });
    expect(meta['tablero']).toEqual({ capturedAt: 'y', lat: 3, lng: 4 });
  });

  it('un slot inventado se ignora', () => {
    const meta = leerMetaDelBody({ meta: JSON.stringify({ cofre: { capturedAt: 'x' } }) });
    expect(meta['cofre']).toBeUndefined();
  });

  it('un JSON roto no revienta: la foto quedará sin metadatos y se rechazará', () => {
    expect(() => leerMetaDelBody({ meta: '{no es json' })).not.toThrow();
    expect(leerMetaDelBody({ meta: '{no es json' })).toEqual({});
  });
});
