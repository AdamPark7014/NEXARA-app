import {
  CODIGOS_EVIDENCIA,
  MENSAJE_ACTIVIDAD_APROBADA,
  MENSAJE_ACTIVIDAD_CANCELADA,
  MENSAJE_ACTIVIDAD_NO_CUMPLIDA,
  MENSAJE_EVIDENCIA_APROBADA,
  MENSAJE_EVIDENCIA_EN_REVISION,
  MENSAJE_FOTO_EN_REVISION,
  PASOS_EVIDENCIA,
  mensajePasoIncorrecto,
  rechazoFotoEntradaYaGuardada,
  rechazoPasoIncorrecto,
  siguientePaso,
} from './evidencia-mensajes';

const ESTADOS = [...PASOS_EVIDENCIA, 'COMPLETED'] as const;

/** Todos los textos que la persona puede llegar a leer, con todas sus combinaciones. */
function todosLosTextos(): string[] {
  const textos = [
    MENSAJE_EVIDENCIA_EN_REVISION,
    MENSAJE_FOTO_EN_REVISION,
    MENSAJE_EVIDENCIA_APROBADA,
    MENSAJE_ACTIVIDAD_APROBADA,
    MENSAJE_ACTIVIDAD_CANCELADA,
    MENSAJE_ACTIVIDAD_NO_CUMPLIDA,
  ];
  for (const estado of ESTADOS) {
    textos.push(rechazoFotoEntradaYaGuardada(estado).message);
    for (const paso of PASOS_EVIDENCIA) {
      if (paso !== estado) textos.push(mensajePasoIncorrecto(paso, estado));
    }
  }
  return textos;
}

describe('mensajes de rechazo de evidencias', () => {
  it('cada texto termina en punto, cabe en 200 caracteres y no usa palabras del sistema', () => {
    for (const texto of todosLosTextos()) {
      expect(texto.endsWith('.')).toBe(true);
      expect(texto.length).toBeLessThanOrEqual(200);
      expect(texto).not.toMatch(/estatus|paso correcto|payload|endpoint|sesión de trabajo|undefined|null/i);
    }
  });

  it('cada texto dice qué hacer después o que no hace falta hacer nada', () => {
    const ACCION =
      /Pídele|Sigue con|Primero |avísale|regresa a ese paso|no hace falta|ya está en revisión|te la devuelve|ya quedó guardada|Abre la actividad/;
    for (const texto of todosLosTextos()) {
      expect(texto).toMatch(ACCION);
    }
  });

  it('siguientePaso tiene texto para cada punto de la captura y no inventa pasos', () => {
    expect(siguientePaso('EVIDENCE_PHOTOS')).toBe('Sigue con las fotos de evidencia.');
    expect(siguientePaso('SERVICE_SHEET_PDF')).toBe('Sigue con la hoja de servicio.');
    expect(siguientePaso('SERVICE_SHEET_DATA')).toBe('Sigue con el formulario.');
    expect(siguientePaso('EXIT_PHOTO')).toBe('Sigue con la foto de salida.');
    expect(siguientePaso('COMPLETED')).toBe('Tu evidencia ya está en revisión.');
    for (const raro of [null, undefined, '', 'OTRO']) {
      expect(siguientePaso(raro)).toBe('Abre la actividad otra vez para ver en qué paso vas.');
    }
  });

  it('paso mandado antes de tiempo: dice qué falta primero', () => {
    expect(mensajePasoIncorrecto('EVIDENCE_PHOTOS', 'ENTRY_PHOTO')).toBe(
      'Todavía no toca este paso. Primero toma la foto de entrada.',
    );
    expect(mensajePasoIncorrecto('EXIT_PHOTO', 'SERVICE_SHEET_DATA')).toBe(
      'Todavía no toca este paso. Primero llena el formulario.',
    );
  });

  it('paso que ya se había enviado: dice en cuál va y cómo corregir', () => {
    expect(mensajePasoIncorrecto('EVIDENCE_PHOTOS', 'SERVICE_SHEET_DATA')).toBe(
      'Este paso ya se envió. Sigue con el formulario. Si te faltó algo, regresa a ese paso y vuelve a mandarlo.',
    );
    expect(mensajePasoIncorrecto('EXIT_PHOTO', 'COMPLETED')).toBe(
      'Este paso ya se envió. Tu evidencia ya está en revisión.',
    );
  });

  it('un estado que no se reconoce no rompe ni inventa', () => {
    expect(mensajePasoIncorrecto('EXIT_PHOTO', undefined)).toBe(
      'Todavía no toca este paso. Abre la actividad otra vez para ver en qué paso vas.',
    );
  });

  it('la foto de entrada repetida manda al paso en que va la persona', () => {
    expect(rechazoFotoEntradaYaGuardada('EVIDENCE_PHOTOS')).toEqual({
      message: 'Tu foto de entrada ya quedó guardada. Sigue con las fotos de evidencia.',
      code: CODIGOS_EVIDENCIA.FOTO_ENTRADA_YA_GUARDADA,
    });
    expect(rechazoFotoEntradaYaGuardada('COMPLETED').message).toBe(
      'Tu foto de entrada ya quedó guardada. Tu evidencia ya está en revisión.',
    );
    expect(rechazoFotoEntradaYaGuardada('ENTRY_PHOTO').message).toBe('Tu foto de entrada ya quedó guardada.');
  });

  it('los rechazos llevan su código estable', () => {
    expect(rechazoPasoIncorrecto('EXIT_PHOTO', 'ENTRY_PHOTO').code).toBe('PASO_INCORRECTO');
    expect(new Set(Object.values(CODIGOS_EVIDENCIA)).size).toBe(Object.keys(CODIGOS_EVIDENCIA).length);
  });
});
