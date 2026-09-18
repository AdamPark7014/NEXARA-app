/**
 * Términos y condiciones de la propuesta, **según el segmento y lo que realmente se cobra**.
 *
 * La cotización que sirvió de modelo (`Primera cotizacion .pdf`) cobra 15 servicios de
 * «Instalación de cámara de seguridad puesta a punto» y, tres centímetros más abajo, declara:
 * «El precio cotizado cubre únicamente el suministro del equipo… No se incluyen servicios de
 * instalación…». Es la misma hoja negando lo que factura: si el cliente lo lee al pie de la letra,
 * la instalación cobrada no está contratada.
 *
 * Aquí los términos dejan de ser un párrafo fijo: la modalidad sale del segmento y de si la
 * cotización incluye mano de obra (partidas de servicio/instalación). Con instalación cobrada,
 * los términos dicen que la instalación está incluida.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export const SEGMENTOS = ['COMERCIAL', 'OBRA', 'LICITACION', 'SERVICIO'] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const ETIQUETA_SEGMENTO: Record<Segmento, string> = {
  COMERCIAL: 'Comercial',
  OBRA: 'Obra',
  LICITACION: 'Licitación',
  SERVICIO: 'Servicio',
};

export type Modalidad = 'SUMINISTRO' | 'SUMINISTRO_INSTALACION' | 'LICITACION';

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  SUMINISTRO: 'Solo suministro',
  SUMINISTRO_INSTALACION: 'Suministro e instalación',
  LICITACION: 'Licitación',
};

export function normalizarSegmento(valor: unknown): Segmento {
  const raw = String(valor ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if ((SEGMENTOS as readonly string[]).includes(raw)) return raw as Segmento;
  if (raw === 'LICITACION' || raw === 'LICITACIONES') return 'LICITACION';
  return 'COMERCIAL';
}

/**
 * Modalidad real de la propuesta.
 *
 * Licitación manda sobre todo lo demás (las condiciones las fijan las bases). Obra y Servicio son
 * por definición suministro e instalación. Comercial depende de si se está cobrando mano de obra.
 */
export function modalidadDeCotizacion(input: {
  segmento: unknown;
  incluyeInstalacion: boolean;
}): Modalidad {
  const segmento = normalizarSegmento(input.segmento);
  if (segmento === 'LICITACION') return 'LICITACION';
  if (segmento === 'OBRA' || segmento === 'SERVICIO') return 'SUMINISTRO_INSTALACION';
  return input.incluyeInstalacion ? 'SUMINISTRO_INSTALACION' : 'SUMINISTRO';
}

export type TerminosInput = {
  segmento: unknown;
  /** Hay partidas de mano de obra / instalación en la cotización. */
  incluyeInstalacion: boolean;
  /** Porcentaje de anticipo (50 por omisión, como en la propuesta modelo). */
  anticipoPct?: number | null;
  /** Días de vigencia, si se conocen (se calculan de `validUntil`). */
  vigenciaDias?: number | null;
};

/**
 * Los términos por partes, como en la propuesta modelo: forma de pago, alcance de la cotización,
 * qué no incluye y disponibilidad (más otras condiciones y la vigencia).
 *
 * Cada parte tiene un texto por omisión que sale del segmento, de si se cobra instalación y del
 * anticipo; quien cotiza puede reescribir cualquiera. Lo reescrito se guarda en `Cotizacion.note`
 * (ver `escribirTerminosPersonalizados`) y **solo** lo reescrito: lo que no se tocó sigue al
 * segmento y al anticipo aunque cambien después.
 */
export const CLAVES_TERMINO = ['pago', 'alcance', 'noIncluye', 'disponibilidad', 'otras'] as const;
export type ClaveTermino = (typeof CLAVES_TERMINO)[number];

/** Títulos con los que se guardan en `note` y se imprimen (fuera de licitación). */
export const TITULO_TERMINO: Record<ClaveTermino | 'vigencia', string> = {
  pago: 'Forma de pago',
  alcance: 'Alcance de la cotización',
  noIncluye: 'No incluye',
  disponibilidad: 'Disponibilidad',
  otras: 'Otras condiciones',
  vigencia: 'Vigencia',
};

/** En licitación las partes se llaman como en las bases, y el anticipo va antes de los trabajos adicionales. */
const TITULO_LICITACION: Record<ClaveTermino, string> = {
  pago: 'Condiciones de pago',
  alcance: 'Alcance de la propuesta',
  noIncluye: 'Trabajos adicionales',
  disponibilidad: 'Anticipo',
  otras: 'Otras condiciones',
};
const ORDEN_LICITACION: ClaveTermino[] = ['pago', 'alcance', 'disponibilidad', 'noIncluye', 'otras'];

export type ParteTermino = {
  clave: ClaveTermino | 'vigencia';
  titulo: string;
  texto: string;
  /** Lo escribió quien cotiza (no es el texto del segmento). */
  personalizado: boolean;
};

export type Terminos = {
  modalidad: Modalidad;
  titulo: string;
  /** Una línea por parte, «Título: texto»: el PDF imprime el título como etiqueta en negritas. */
  lineas: string[];
  partes: ParteTermino[];
};

function anticipo(pct?: number | null): number {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 50;
  return Math.round(n);
}

/** Textos por omisión de cada parte según la modalidad. `otras` va vacío. */
export function terminosPorOmision(input: TerminosInput): Record<ClaveTermino, string> {
  const modalidad = modalidadDeCotizacion(input);
  const pct = anticipo(input.anticipoPct);
  const resto = 100 - pct;

  if (modalidad === 'LICITACION') {
    return {
      pago: 'Las condiciones de pago, garantías y penalizaciones se rigen por las bases de la licitación y por el contrato que de ella derive.',
      alcance: 'Se presenta como parte del procedimiento de contratación; su vigencia es la que señalen las bases.',
      noIncluye: 'Cualquier trabajo fuera del catálogo de conceptos de las bases se cotiza por separado.',
      disponibilidad: 'No se solicita anticipo salvo que las bases lo prevean expresamente.',
      otras: '',
    };
  }
  if (modalidad === 'SUMINISTRO_INSTALACION') {
    return {
      pago: `${pct} % de anticipo para confirmar el pedido y programar los trabajos; el ${resto} % restante contra entrega del sistema en operación.`,
      alcance:
        'El precio cotizado cubre el suministro de los equipos y materiales descritos y la mano de obra de instalación, configuración y puesta en marcha señalada en el alcance.',
      noIncluye:
        'Trabajos de obra civil, canalizaciones no identificadas durante el levantamiento, adecuaciones eléctricas distintas a las descritas, ni el servicio de Internet del cliente.',
      disponibilidad:
        'La programación de los trabajos está sujeta a la disponibilidad de inventario y al acceso al sitio en los horarios acordados con el cliente.',
      otras: '',
    };
  }
  return {
    pago: `${pct} % de anticipo para confirmar el pedido y programar el suministro; el ${resto} % restante contra entrega del equipo.`,
    alcance: 'El precio cotizado cubre únicamente el suministro del equipo descrito en esta propuesta.',
    noIncluye:
      'Servicios de instalación, configuración, puesta en marcha, capacitación, adecuaciones eléctricas o de red, ni ningún otro servicio no especificado expresamente en la cotización.',
    disponibilidad:
      'La entrega está sujeta a la disponibilidad de inventario al momento de confirmar el pedido y recibir el anticipo.',
    otras: '',
  };
}

function claveDeTitulo(titulo: string): ClaveTermino | null {
  const limpio = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  for (const clave of CLAVES_TERMINO) {
    const esperado = TITULO_TERMINO[clave]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (limpio === esperado) return clave;
  }
  if (limpio === 'no se incluye' || limpio === 'exclusiones' || limpio === 'trabajos adicionales') return 'noIncluye';
  if (limpio === 'alcance' || limpio === 'alcance de la propuesta') return 'alcance';
  if (limpio === 'pago' || limpio === 'condiciones de pago') return 'pago';
  if (limpio === 'anticipo') return 'disponibilidad';
  return null;
}

/**
 * Lee los términos reescritos (`Cotizacion.note`).
 *
 * Formato: «Título:» en su renglón (o «Título: texto») y el texto debajo. Lo que no está bajo un
 * título conocido —una nota vieja del CRM— se toma como «Otras condiciones»: se imprime, no se pierde.
 */
export function leerTerminosPersonalizados(texto: string | null | undefined): Partial<Record<ClaveTermino, string>> {
  const salida: Partial<Record<ClaveTermino, string[]>> = {};
  let actual: ClaveTermino = 'otras';
  for (const linea of String(texto ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const encabezado = linea.match(/^\s*([^:]{2,40}):\s*(.*)$/);
    const clave = encabezado ? claveDeTitulo(encabezado[1]!) : null;
    if (clave) {
      actual = clave;
      salida[actual] = salida[actual] ?? [];
      if (encabezado![2]!.trim()) salida[actual]!.push(encabezado![2]!);
      continue;
    }
    (salida[actual] = salida[actual] ?? []).push(linea);
  }
  const limpio: Partial<Record<ClaveTermino, string>> = {};
  for (const clave of CLAVES_TERMINO) {
    const valor = (salida[clave] ?? []).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (valor) limpio[clave] = valor;
  }
  return limpio;
}

/** Lo contrario de `leerTerminosPersonalizados`. Sin nada reescrito, cadena vacía. */
export function escribirTerminosPersonalizados(partes: Partial<Record<ClaveTermino, string | null | undefined>>): string {
  return CLAVES_TERMINO.map((clave) => {
    const texto = String(partes[clave] ?? '').replace(/\r\n?/g, '\n').trim();
    return texto ? `${TITULO_TERMINO[clave]}:\n${texto}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

/** Términos y condiciones listos para imprimir en el PDF y mostrar en la web. */
export function terminosDeCotizacion(
  input: TerminosInput & {
    /** Lo reescrito por quien cotiza (`Cotizacion.note`). */
    personalizados?: string | null;
  },
): Terminos {
  const modalidad = modalidadDeCotizacion(input);
  const omision = terminosPorOmision(input);
  const propios = leerTerminosPersonalizados(input.personalizados);

  const licitacion = modalidad === 'LICITACION';
  const partes: ParteTermino[] = [];
  for (const clave of licitacion ? ORDEN_LICITACION : CLAVES_TERMINO) {
    const texto = (propios[clave] ?? omision[clave]).trim();
    if (!texto) continue;
    partes.push({
      clave,
      titulo: licitacion ? TITULO_LICITACION[clave] : TITULO_TERMINO[clave],
      texto,
      personalizado: propios[clave] != null && propios[clave] !== omision[clave],
    });
  }

  const dias = Number(input.vigenciaDias);
  if (Number.isFinite(dias) && dias > 0) {
    partes.push({
      clave: 'vigencia',
      titulo: TITULO_TERMINO.vigencia,
      texto: `${Math.round(dias)} días naturales a partir de la fecha de emisión de esta propuesta.`,
      personalizado: false,
    });
  }

  return {
    modalidad,
    titulo: 'Términos y condiciones',
    lineas: partes.map((p) => `${p.titulo}: ${p.texto}`),
    partes,
  };
}

/** Días entre emisión y vencimiento (para la línea de vigencia). */
export function diasDeVigencia(issueDate?: Date | string | null, validUntil?: Date | string | null): number | null {
  if (!issueDate || !validUntil) return null;
  const desde = new Date(issueDate);
  const hasta = new Date(validUntil);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return null;
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
  return dias > 0 ? dias : null;
}
