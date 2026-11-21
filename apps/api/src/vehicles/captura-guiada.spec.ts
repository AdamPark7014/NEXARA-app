import {
  CAMPO_VIDEO_VUELTA,
  FOTOS_GUIADAS,
  PASOS_CAPTURA,
  SLOTS_GUIADA,
  SLOTS_VUELTA,
  SLOT_KM_GASOLINA,
  esCapturaGuiada,
  leerLecturaIa,
  leerMetaGuiada,
  revisarCapturaGuiada,
  type EntradaGuiada,
} from './captura-guiada';

/**
 * Captura guiada de 5 pasos: vuelta en video (8 cuadros), asientos traseros, asientos delanteros,
 * tablero completo y acercamiento a km y gasolina. Todo en vivo; la persona confirma lo que leyó la IA.
 */

const AHORA = new Date('2026-11-21T18:00:00.000Z');
const EN_VIVO = { capturedAt: '2026-11-21T17:58:00.000Z', lat: 19.04, lng: -98.2 };

function completa(extra: Partial<EntradaGuiada> = {}): EntradaGuiada {
  const fotos: Record<string, string> = Object.fromEntries(SLOTS_GUIADA.map((s) => [s, `/uploads/vehicles/${s}.jpg`]));
  fotos[CAMPO_VIDEO_VUELTA] = '/uploads/vehicles/vuelta.mp4';
  const meta: EntradaGuiada['meta'] = Object.fromEntries(SLOTS_GUIADA.map((s) => [s, { ...EN_VIVO }]));
  meta[CAMPO_VIDEO_VUELTA] = { capturedAt: EN_VIVO.capturedAt, duracionSeg: 14 };
  return { fotos, meta, odometroKm: 48_215, combustible: '1/2', ahora: AHORA, ...extra };
}

describe('los 5 pasos', () => {
  it('son vuelta, asientos traseros, asientos delanteros, tablero y km-gasolina, en ese orden', () => {
    expect(PASOS_CAPTURA.map((p) => p.id)).toEqual(['vuelta', 'asientos-traseros', 'asientos-delanteros', 'tablero', SLOT_KM_GASOLINA]);
    expect(SLOTS_VUELTA).toHaveLength(8);
    expect(FOTOS_GUIADAS).toHaveLength(4);
  });
});

describe('revisarCapturaGuiada', () => {
  it('con todo en vivo pasa y normaliza km, gasolina, video y la foto del tablero', () => {
    const r = revisarCapturaGuiada(completa());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.version).toBe(2);
    expect(r.datos.odometroKm).toBe(48_215);
    expect(r.datos.combustiblePct).toBe(50);
    expect(r.datos.videoUrl).toBe('/uploads/vehicles/vuelta.mp4');
    expect(r.datos.duracionVideoSeg).toBe(14);
    expect(r.datos.fotos).toHaveLength(12);
    // El respaldo de los números es el acercamiento, no el tablero completo.
    expect(r.datos.fotoTableroUrl).toBe('/uploads/vehicles/km-gasolina.jpg');
    expect(r.datos.lectura.corregido).toBe(false);
  });

  it('sin video, o con un video de galería, no pasa', () => {
    const sinVideo = completa();
    delete sinVideo.fotos[CAMPO_VIDEO_VUELTA];
    expect(revisarCapturaGuiada(sinVideo).ok).toBe(false);

    const galeria = completa();
    galeria.meta![CAMPO_VIDEO_VUELTA] = { duracionSeg: 14 };
    const r = revisarCapturaGuiada(galeria);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.map((e) => e.campo)).toContain(CAMPO_VIDEO_VUELTA);
  });

  it('una vuelta de 5 s o de 40 s no cuenta; 9 y 21 s sí (un segundo de gracia)', () => {
    for (const [dur, ok] of [[5, false], [40, false], [9, true], [21, true]] as const) {
      const e = completa();
      e.meta![CAMPO_VIDEO_VUELTA] = { capturedAt: EN_VIVO.capturedAt, duracionSeg: dur };
      expect(revisarCapturaGuiada(e).ok).toBe(ok);
    }
  });

  it('dice todos los cuadros y fotos que faltan de una vez', () => {
    const e = completa();
    delete e.fotos['vuelta-3'];
    delete e.fotos['asientos-traseros'];
    const r = revisarCapturaGuiada(e);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.map((x) => x.campo)).toEqual(expect.arrayContaining(['vuelta-3', 'asientos-traseros']));
      expect(r.errores.find((x) => x.campo === 'vuelta-3')?.mensaje).toMatch(/Lado derecho/);
    }
  });

  it('una foto vieja (más de 12 h) o sin hora de captura no cuenta', () => {
    const vieja = completa();
    vieja.meta!['tablero'] = { capturedAt: '2026-11-20T01:00:00.000Z' };
    expect(revisarCapturaGuiada(vieja).ok).toBe(false);

    const sinHora = completa();
    sinHora.meta!['km-gasolina'] = {};
    expect(revisarCapturaGuiada(sinHora).ok).toBe(false);
  });

  it('pide confirmar km y gasolina, y en la devolución el km no retrocede', () => {
    expect(revisarCapturaGuiada(completa({ odometroKm: '' })).ok).toBe(false);
    expect(revisarCapturaGuiada(completa({ combustible: undefined })).ok).toBe(false);
    const r = revisarCapturaGuiada(completa({ odometroKm: 48_000, odometroInicio: 48_100 }));
    expect(r.ok).toBe(false);
  });

  it('guarda lo que leyó la IA y marca si la persona lo corrigió', () => {
    const igual = revisarCapturaGuiada(completa({ lecturaIa: '{"odometroKm":48215,"combustiblePct":50}' }));
    expect(igual.ok && igual.datos.lectura).toEqual({
      ia: { odometroKm: 48_215, combustiblePct: 50 },
      confirmado: { odometroKm: 48_215, combustiblePct: 50 },
      corregido: false,
    });
    const corregida = revisarCapturaGuiada(completa({ lecturaIa: { odometroKm: 43_215, combustiblePct: 50 } }));
    expect(corregida.ok && corregida.datos.lectura.corregido).toBe(true);
  });
});

describe('esCapturaGuiada', () => {
  it('reconoce la guiada por la versión o por sus slots; el checklist viejo no', () => {
    expect(esCapturaGuiada({}, { capturaVersion: '2' })).toBe(true);
    expect(esCapturaGuiada({ 'vuelta-1': 'a.jpg' })).toBe(true);
    expect(esCapturaGuiada({ [SLOT_KM_GASOLINA]: 'a.jpg' })).toBe(true);
    expect(esCapturaGuiada({ frontal: 'a.jpg', tablero: 'b.jpg' })).toBe(false);
  });
});

describe('leerMetaGuiada', () => {
  it('acepta un campo meta con JSON y meta-<slot> sueltos; ignora slots que no son de la captura', () => {
    const meta = leerMetaGuiada({
      meta: JSON.stringify({ 'vuelta-1': EN_VIVO, frontal: EN_VIVO }),
      'meta-video-vuelta': JSON.stringify({ capturedAt: EN_VIVO.capturedAt, duracionSeg: 15 }),
      'meta-tablero': '{roto',
    });
    expect(meta['vuelta-1']).toEqual(EN_VIVO);
    expect(meta[CAMPO_VIDEO_VUELTA]).toEqual({ capturedAt: EN_VIVO.capturedAt, duracionSeg: 15 });
    expect(meta['frontal' as string]).toBeUndefined();
    expect(meta['tablero']).toBeUndefined();
  });
});

describe('leerLecturaIa', () => {
  it('limpia lo que mandó la app y descarta basura', () => {
    expect(leerLecturaIa({ odometroKm: 1200.4, combustible: '3/4' })).toEqual({ odometroKm: 1200, combustiblePct: 75 });
    expect(leerLecturaIa('no es json')).toBeNull();
    expect(leerLecturaIa({ odometroKm: -5 })).toBeNull();
    expect(leerLecturaIa('')).toBeNull();
  });
});
