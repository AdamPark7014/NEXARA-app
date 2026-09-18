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

export type Terminos = {
  modalidad: Modalidad;
  titulo: string;
  lineas: string[];
};

function anticipo(pct?: number | null): number {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 50;
  return Math.round(n);
}

/** Términos y condiciones listos para imprimir en el PDF y mostrar en la web. */
export function terminosDeCotizacion(input: TerminosInput): Terminos {
  const modalidad = modalidadDeCotizacion(input);
  const pct = anticipo(input.anticipoPct);
  const resto = 100 - pct;
  const lineas: string[] = [];

  if (modalidad === 'LICITACION') {
    lineas.push(
      'Condiciones de pago: las condiciones de pago, garantías y penalizaciones se rigen por las bases de la licitación y por el contrato que de ella derive.',
      'Alcance de la propuesta: se presenta como parte del procedimiento de contratación; su vigencia es la que señalen las bases.',
      'Anticipo: no se solicita anticipo salvo que las bases lo prevean expresamente.',
      'Trabajos adicionales: cualquier trabajo fuera del catálogo de conceptos de las bases se cotiza por separado.',
    );
  } else if (modalidad === 'SUMINISTRO_INSTALACION') {
    lineas.push(
      `Forma de pago: ${pct} % de anticipo para confirmar el pedido y programar los trabajos; el ${resto} % restante contra entrega del sistema en operación.`,
      'Alcance de la cotización: el precio cotizado cubre el suministro de los equipos y materiales descritos y la mano de obra de instalación, configuración y puesta en marcha señalada en el alcance.',
      'No incluye: trabajos de obra civil, canalizaciones no identificadas durante el levantamiento, adecuaciones eléctricas distintas a las descritas, ni el servicio de Internet del cliente.',
      'Disponibilidad: la programación de los trabajos está sujeta a la disponibilidad de inventario y al acceso al sitio en los horarios acordados con el cliente.',
    );
  } else {
    lineas.push(
      `Forma de pago: ${pct} % de anticipo para confirmar el pedido y programar el suministro; el ${resto} % restante contra entrega del equipo.`,
      'Alcance de la cotización: el precio cotizado cubre únicamente el suministro del equipo descrito en esta propuesta.',
      'No incluye: servicios de instalación, configuración, puesta en marcha, capacitación, adecuaciones eléctricas o de red, ni ningún otro servicio no especificado expresamente en la cotización.',
      'Disponibilidad: la entrega está sujeta a la disponibilidad de inventario al momento de confirmar el pedido y recibir el anticipo.',
    );
  }

  const dias = Number(input.vigenciaDias);
  if (Number.isFinite(dias) && dias > 0) {
    lineas.push(`Vigencia: ${Math.round(dias)} días naturales a partir de la fecha de emisión de esta propuesta.`);
  }

  return { modalidad, titulo: 'Términos y condiciones', lineas };
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
