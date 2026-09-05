import { mainStreamPlayable } from './integra-media.service';

/**
 * Por qué existe esta prueba.
 *
 * El muro y Foco consumían los dos el mismo canal secundario, medido en
 * Oficinas a **640×360**. En un mosaico de 3×3 eso está bien —cada celda mide
 * unos 600 px—, pero al abrir una cámara a pantalla completa se amplían 640 px
 * a 1920 y se ve pixelada. La respuesta obvia es servir el principal, que es
 * 1920×1080.
 *
 * La respuesta obvia estaba mal. Las 13 cámaras de vigilancia tienen el
 * principal en **H.265**, que MSE no decodifica: el cuadro se quedaría negro
 * girando para siempre, que es peor que pixelado. Ya había un comentario en el
 * código avisándolo, de una medición anterior.
 *
 * Así que la subida de calidad se decide por códec, y eso es exactamente el
 * tipo de condición que se rompe en silencio cuando alguien cambia una cámara.
 */
describe('mainStreamPlayable · cuándo se puede subir a alta calidad', () => {
  it('bloquea H.265 en todas sus grafías, que es lo que hay en el parque', () => {
    // El sync guarda "H.265" con punto; otros firmwares dicen HEVC.
    for (const codec of ['H.265', 'H265', 'h.265', 'HEVC', 'hevc', 'H.265+']) {
      expect(mainStreamPlayable(codec)).toBe(false);
    }
  });

  it('permite H.264, que es lo que el navegador sí decodifica', () => {
    for (const codec of ['H.264', 'H264', 'h.264', 'H.264+']) {
      expect(mainStreamPlayable(codec)).toBe(true);
    }
  });

  it('ante un códec desconocido intenta, en vez de negar', () => {
    // El espejo puede no haberlo guardado aún. Vale más intentarlo y que el
    // reproductor caiga a respaldo que negarle alta calidad a un equipo que sí
    // puede: lo único que se bloquea es lo que sabemos que no funciona.
    expect(mainStreamPlayable(null)).toBe(true);
    expect(mainStreamPlayable(undefined)).toBe(true);
    expect(mainStreamPlayable('')).toBe(true);
    expect(mainStreamPlayable('MJPEG')).toBe(true);
  });

  it('las cuatro terminales de puerta sí pueden: van en H.264 a 1280x720', () => {
    // Medido: .160 a .163 devuelven H.264 1280x720 en su canal principal.
    expect(mainStreamPlayable('H.264')).toBe(true);
  });

  it('las trece cámaras de vigilancia no pueden mientras sigan en H.265', () => {
    // Medido el 2026-09-05 contra integra_cameras: 13 filas, todas
    // 1920x1080 H.265. Cuando alguien las pase a H.264 esta comprobación las
    // deja pasar sola, sin tocar una línea de código.
    expect(mainStreamPlayable('H.265')).toBe(false);
  });
});
