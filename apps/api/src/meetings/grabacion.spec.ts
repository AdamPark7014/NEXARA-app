import { carpetaGrabacion, msValidos, nombreParte, partirTexto, resumirPartes } from './grabacion';
import { prioridadActividad } from './acuerdo-actividad';
import { extensionAudio, limpiarTextoWhisper } from '../ai/voz/transcriptor';
import { isPrivateUploadPath } from '../common/security/uploads-access';

describe('grabación de reuniones', () => {
  it('guarda el audio pendiente en una carpeta privada, con 4 dígitos por parte', () => {
    expect(nombreParte(3, 'webm')).toBe('parte-0003.webm');
    expect(carpetaGrabacion(1, 42)).toBe('grabaciones-reuniones/1/42');
    expect(isPrivateUploadPath('/grabaciones-reuniones/1/42/parte-0001.webm')).toBe(true);
    expect(isPrivateUploadPath('/Grabaciones-Reuniones%2F1%2F42%2Fparte-0001.txt')).toBe(true);
    expect(isPrivateUploadPath('/news/foto.jpg')).toBe(false);
  });

  it('acepta solo milisegundos enteros dentro del rango', () => {
    expect(msValidos('60000', 120_000)).toBe(60_000);
    expect(msValidos(59999.6, 120_000)).toBe(60_000);
    expect(msValidos(undefined, 1)).toBeNull();
    expect(msValidos('', 1)).toBeNull();
    expect(msValidos(-5, 100)).toBeNull();
    expect(msValidos(500, 100)).toBeNull();
    expect(msValidos('abc', 100)).toBeNull();
  });

  it('parte el texto pegado en tramos sin cortar frases', () => {
    const frase = 'Luis va mañana a Bodegas Luna a cambiar el disco del DVR.';
    const partes = partirTexto(Array.from({ length: 200 }, () => frase).join(' '), 100);
    expect(partes.length).toBeGreaterThan(10);
    for (const p of partes) {
      expect(p.endsWith('DVR.')).toBe(true);
      expect(p.split(/\s+/).length).toBeLessThanOrEqual(100);
    }
    expect(partirTexto('Una sola línea corta')).toEqual(['Una sola línea corta']);
  });

  it('resume las partes: cuenta por estado, tiempo grabado y la última recibida', () => {
    expect(
      resumirPartes([
        { parte: 1, estado: 'LISTA', duracionMs: 60_000, palabras: 120 },
        { parte: 2, estado: 'PENDIENTE', duracionMs: 60_000, palabras: 0 },
        { parte: 4, estado: 'ERROR', duracionMs: 30_000, palabras: 0 },
      ]),
    ).toEqual({ total: 3, listas: 1, pendientes: 1, conError: 1, ultima: 4, duracionMs: 150_000, palabras: 120 });
  });

  it('la prioridad del acuerdo pasa a la actividad', () => {
    expect(prioridadActividad('alta')).toBe('Alta');
    expect(prioridadActividad('Baja')).toBe('Baja');
    expect(prioridadActividad(undefined)).toBe('Media');
    expect(prioridadActividad('urgente')).toBe('Media');
  });
});

describe('transcriptor propio', () => {
  it('quita marcas de silencio y música', () => {
    expect(limpiarTextoWhisper(' [BLANK_AUDIO]  Hola   equipo [Música] (inaudible) listo ')).toBe('Hola equipo listo');
    expect(limpiarTextoWhisper('Cerramos. Subtítulos realizados por la comunidad de Amara.org')).toBe('Cerramos.');
  });

  it('acepta solo formatos de audio de los navegadores', () => {
    expect(extensionAudio('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionAudio('audio/mp4')).toBe('m4a');
    expect(extensionAudio('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensionAudio('text/html')).toBeNull();
    expect(extensionAudio(undefined)).toBeNull();
  });
});
