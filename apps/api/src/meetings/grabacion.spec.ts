import { carpetaGrabacion, nombreParte, partesDesdeArchivos, resumenGrabacion, unirTranscripcion } from './grabacion';
import { extensionAudio, limpiarTextoWhisper } from '../ai/voz/transcriptor';
import { isPrivateUploadPath } from '../common/security/uploads-access';

describe('grabación de reuniones', () => {
  it('nombra las partes con 4 dígitos en una carpeta privada', () => {
    expect(nombreParte(3, 'webm')).toBe('parte-0003.webm');
    expect(carpetaGrabacion(1, 42)).toBe('grabaciones-reuniones/1/42');
    expect(isPrivateUploadPath('/grabaciones-reuniones/1/42/parte-0001.webm')).toBe(true);
    expect(isPrivateUploadPath('/Grabaciones-Reuniones%2F1%2F42%2Fparte-0001.txt')).toBe(true);
    expect(isPrivateUploadPath('/news/foto.jpg')).toBe(false);
  });

  it('lee el estado de cada parte de los archivos', () => {
    const partes = partesDesdeArchivos([
      'parte-0002.webm',
      'parte-0001.txt',
      'parte-0001.webm',
      'parte-0003.err',
      'parte-0003.ogg',
      'notas.txt',
      'parte-0004.exe',
    ]);
    expect(partes).toEqual([
      { parte: 1, estado: 'lista' },
      { parte: 2, estado: 'pendiente' },
      { parte: 3, estado: 'error' },
    ]);
    expect(resumenGrabacion(partes)).toEqual({ total: 3, listas: 1, pendientes: 1, conError: 1, terminada: false });
    expect(resumenGrabacion([]).terminada).toBe(false);
  });

  it('une el texto en orden y sin partes vacías', () => {
    expect(
      unirTranscripcion([
        { parte: 2, texto: ' y luego Tox. ' },
        { parte: 3, texto: '' },
        { parte: 1, texto: 'Primero Banorte' },
      ]),
    ).toBe('Primero Banorte\ny luego Tox.');
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
