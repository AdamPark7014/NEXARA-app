/** Shared Core evidence step helpers (mirror of API evidence-flow.helpers). */

export type CoreActivityKind = 'tarea' | 'proyecto' | 'obra' | 'servicio' | 'comercial';

export type EvidenceStep =
  | 'ENTRY_PHOTO'
  | 'EVIDENCE_PHOTOS'
  | 'SERVICE_SHEET_PDF'
  | 'SERVICE_SHEET_DATA'
  | 'EXIT_PHOTO'
  | 'COMPLETED';

export function requiresServiceSheetPdf(coreKind?: string | null): boolean {
  return (coreKind || '').toLowerCase() === 'servicio';
}

export function evidenceStepsForKind(coreKind?: string | null): EvidenceStep[] {
  if (requiresServiceSheetPdf(coreKind)) {
    return [
      'ENTRY_PHOTO',
      'EVIDENCE_PHOTOS',
      'SERVICE_SHEET_PDF',
      'SERVICE_SHEET_DATA',
      'EXIT_PHOTO',
      'COMPLETED',
    ];
  }
  return ['ENTRY_PHOTO', 'EVIDENCE_PHOTOS', 'SERVICE_SHEET_DATA', 'EXIT_PHOTO', 'COMPLETED'];
}

export function esActividadComercial(coreKind?: string | null): boolean {
  return (coreKind || '').trim().toLowerCase() === 'comercial';
}

/** Textos del primer paso y del último, tal como los lee quien ejecuta. */
export type TextosDeInicioYCierre = {
  inicio: {
    /** Título del paso («Paso 1: …»). */
    paso: string;
    /** Nombre suelto: título de la cámara, encabezados y avisos. */
    nombre: string;
    /** En el indicador de pasos, donde no cabe más. */
    corto: string;
    descripcion: string;
    boton: string;
    vistaPrevia: string;
    sinGps: string;
    guardado: string;
  };
  cierre: {
    paso: string;
    nombre: string;
    corto: string;
    descripcion: string;
    boton: string;
    vistaPrevia: string;
    sinGps: string;
    /** «Siguiente: …» al terminar el paso anterior. */
    siguiente: string;
    /** Cuando la regla de «mismo lugar» no aplica a esta actividad. */
    sinMismoLugar: string;
  };
  /** A quien recibe la actividad de otro compañero: su inicio y su cierre son propios. */
  relevo: string;
};

/**
 * Cómo se llaman el inicio y el cierre según el tipo de actividad.
 *
 * Lo comercial no es trabajo «en sitio» (Adam, 02-10): ahí no hay entrada ni salida, hay
 * «Inicio de actividad» y «Conclusión de actividad». La foto y el GPS son los mismos; solo
 * cambia cómo se le dice a la persona. Los demás tipos conservan su texto de siempre.
 */
export function textosDeInicioYCierre(coreKind?: string | null): TextosDeInicioYCierre {
  if (esActividadComercial(coreKind)) {
    return {
      inicio: {
        paso: 'Paso 1: Inicio de actividad',
        nombre: 'Inicio de actividad',
        corto: 'Inicio',
        descripcion:
          'Toma la foto con la que inicias la actividad. Se guardará automáticamente con tu ubicación.',
        boton: 'Iniciar',
        vistaPrevia: 'Tu foto de inicio de actividad',
        sinGps: 'El inicio de actividad necesita tu ubicación GPS.',
        guardado: 'Inicio de actividad guardado.',
      },
      cierre: {
        paso: 'Paso 5: Conclusión de actividad',
        nombre: 'Conclusión de actividad',
        corto: 'Conclusión',
        descripcion:
          'Toma la foto con la que concluyes la actividad. Se capturará automáticamente tu ubicación GPS — es obligatoria para cerrar la actividad.',
        boton: 'Concluir',
        vistaPrevia: 'Tu foto de conclusión de actividad',
        sinGps: 'La conclusión de actividad necesita tu ubicación GPS.',
        siguiente: 'Conclusión de actividad',
        sinMismoLugar: 'La conclusión de una actividad comercial no tiene que registrarse donde la iniciaste.',
      },
      relevo: 'Continúa desde aquí con tu propio inicio y tu propia conclusión de actividad.',
    };
  }
  return {
    inicio: {
      paso: 'Paso 1: Foto de Entrada',
      nombre: 'Foto de entrada',
      corto: 'Entrada',
      descripcion: 'Toma una foto de entrada. Se guardará automáticamente con tu ubicación.',
      boton: 'Entrada',
      vistaPrevia: 'Tu foto de entrada',
      sinGps: 'La foto de entrada necesita tu ubicación GPS.',
      guardado: 'Foto de entrada guardada.',
    },
    cierre: {
      paso: 'Paso 5: Foto de Salida',
      nombre: 'Foto de salida',
      corto: 'Salida',
      descripcion:
        'Toma la foto de salida en el sitio. Se capturará automáticamente tu ubicación GPS — es obligatoria para cerrar la actividad.',
      boton: 'Salida',
      vistaPrevia: 'Tu foto de salida',
      sinGps: 'La foto de salida necesita tu ubicación GPS.',
      siguiente: 'Toma foto de salida',
      sinMismoLugar: 'En este tipo de actividad la foto de salida no tiene que coincidir con el punto de inicio.',
    },
    relevo: 'Continúa desde aquí con tu propia foto de entrada y de salida.',
  };
}

export function evidenceProgressPct(
  status: string | null | undefined,
  coreKind?: string | null,
): number {
  const steps: EvidenceStep[] = evidenceStepsForKind(coreKind).filter((s) => s !== 'COMPLETED');
  if (!status || status === 'ENTRY_PHOTO') return 0;
  if (status === 'COMPLETED') return 100;
  const idx = steps.indexOf(status as EvidenceStep);
  if (idx < 0) return 0;
  return Math.round((idx / steps.length) * 100);
}

export function isPdfUrl(url: string): boolean {
  const u = (url || '').trim().toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?') || u.startsWith('data:application/pdf');
}

export type DigitalFormFields = Record<string, string>;

export function emptyDigitalForm(coreKind?: string | null): DigitalFormFields {
  const k = (coreKind || 'tarea').toLowerCase();
  if (k === 'servicio') {
    return { sucursal: '', gerenteEncargado: '', queSeHizo: '', observaciones: '' };
  }
  if (k === 'proyecto' || k === 'obra') {
    return { lugar: '', encargadoSitio: '', queSeHizo: '', observaciones: '' };
  }
  if (k === 'comercial') {
    return { queHiciste: '', clienteOProyecto: '' };
  }
  return { queHiciste: '' };
}

export function digitalFormLabels(coreKind?: string | null): { key: string; label: string }[] {
  const k = (coreKind || 'tarea').toLowerCase();
  if (k === 'servicio') {
    return [
      { key: 'sucursal', label: 'Sucursal' },
      { key: 'gerenteEncargado', label: 'Gerente / encargado' },
      { key: 'queSeHizo', label: 'Qué se hizo' },
      { key: 'observaciones', label: 'Observaciones' },
    ];
  }
  if (k === 'proyecto' || k === 'obra') {
    return [
      { key: 'lugar', label: 'Lugar' },
      { key: 'encargadoSitio', label: 'Encargado en sitio' },
      { key: 'queSeHizo', label: 'Qué se hizo' },
      { key: 'observaciones', label: 'Observaciones' },
    ];
  }
  if (k === 'comercial') {
    return [
      { key: 'queHiciste', label: 'Qué hiciste' },
      { key: 'clienteOProyecto', label: 'Cliente o proyecto' },
    ];
  }
  return [{ key: 'queHiciste', label: 'Qué hiciste' }];
}

/**
 * Huella del formulario ya guardado: dos lecturas con el mismo contenido dan la misma clave
 * aunque sean objetos distintos (y aunque las llaves vengan en otro orden).
 */
export function claveDeFormulario(guardado?: Record<string, unknown> | null): string {
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return '';
  return JSON.stringify(
    Object.keys(guardado)
      .sort()
      .map((k) => [k, guardado[k]]),
  );
}
