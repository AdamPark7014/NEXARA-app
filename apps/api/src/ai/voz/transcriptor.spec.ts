import { esIngles, limpiarTextoWhisper, promptTranscriptor, quitarBucles } from './transcriptor';

/** Casos reales de la junta de Adam del 23-10-2026 (whisper small, voz lejana de sala). */
describe('limpieza del texto de whisper', () => {
  it('quita el bucle de una frase repetida y deja una vez', () => {
    const linea = 'Y también, la empresa que está en el sector de la comunidad.';
    expect(limpiarTextoWhisper(Array(5).fill(linea).join('\n'))).toBe(linea);
    expect(quitarBucles('es el que se llama Sacred y es el que se llama Sacred y es el que se llama Sacred y es el que se llama Sacred')).toBe(
      'es el que se llama Sacred y es el que se llama Sacred',
    );
    expect(quitarBucles('de de de de la casa')).toBe('de la casa');
    expect(quitarBucles('sí, sí, ya lo vi')).toBe('sí, sí, ya lo vi'); // dos veces es normal al hablar
  });

  it('corta la misma idea repetida con variaciones', () => {
    const texto = [
      'Y, como es el caso de la persona que tiene la información, es la que se llama el "Solvingo".',
      'Y, en general, la persona que está en el caso de la persona que tiene la información, es el que se llama el "Solvingo".',
      'El que se llama el "Solvingo" es el que se llama el "Solvingo", que es un "Solvingo".',
      'Y, en general, es el que se llama el "Solvingo" que se llama el "Solvingo".',
    ].join('\n');
    const limpio = limpiarTextoWhisper(texto);
    expect(limpio.split('\n')).toHaveLength(2);
  });

  it('quita lo que whisper inventa sobre silencio', () => {
    expect(limpiarTextoWhisper('Si, nos vemos en el próximo vídeo. ¡Hasta la próxima!')).toBe('');
    expect(limpiarTextoWhisper('[Noticias]')).toBe('');
    expect(limpiarTextoWhisper('Gracias.')).toBe('');
    expect(limpiarTextoWhisper(' [BLANK_AUDIO]  Hola   equipo [Música] (inaudible) listo ')).toBe('Hola equipo listo');
    expect(limpiarTextoWhisper('Cerramos. Subtítulos realizados por la comunidad de Amara.org')).toBe('Cerramos.');
    expect(limpiarTextoWhisper('No olvides suscribirte al canal. Mañana revisamos el NVR.')).toBe('Mañana revisamos el NVR.');
    // En una junta, «nos vemos el lunes» y «gracias» con más contexto sí son lo dicho.
    expect(limpiarTextoWhisper('Gracias, Luis. Nos vemos el lunes.')).toBe('Gracias, Luis. Nos vemos el lunes.');
  });

  it('quita oraciones en otro idioma y deja las de español', () => {
    expect(limpiarTextoWhisper('Aquí está, por ejemplo, en el perfil. one of copies in Vegas to the release of the program.')).toBe(
      'Aquí está, por ejemplo, en el perfil.',
    );
    expect(esIngles('the release of the program is on the table')).toBe(true);
    expect(esIngles('Instalamos el NVR de Hikvision con el switch PoE')).toBe(false);
    expect(esIngles('Okay, sí')).toBe(false);
  });

  it('conserva signos de apertura, líneas distintas y quita líneas repetidas seguidas', () => {
    expect(limpiarTextoWhisper('¿Crees que sí?\n-¿Cómo?\n-¿Cómo?\nTe aviento el link.')).toBe('¿Crees que sí?\n-¿Cómo?\nTe aviento el link.');
  });
});

describe('prompt de whisper', () => {
  it('vocabulario, nombres de la empresa y el final de la parte anterior, sin pasarse del límite', () => {
    const p = promptTranscriptor({}, { nombres: ['Carolina', 'Roberto', 'Grupo Tox'], anterior: 'uno dos tres '.repeat(40) + 'y la caja ya graba' });
    expect(p.startsWith('Junta de trabajo de NEXARA')).toBe(true);
    expect(p).toContain('Carolina, Roberto, Grupo Tox.');
    expect(p.endsWith('y la caja ya graba')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(700);
    expect(promptTranscriptor({ TRANSCRIPTOR_PROMPT: 'Otra cosa.' })).toBe('Otra cosa.');
    expect(promptTranscriptor({})).not.toContain('undefined');
  });
});
