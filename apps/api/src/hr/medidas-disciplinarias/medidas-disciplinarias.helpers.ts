import { BadRequestException } from '@nestjs/common';

export type TipoMedida =
  | 'AMONESTACION_VERBAL'
  | 'AMONESTACION_ESCRITA'
  | 'ACTA_ADMINISTRATIVA'
  | 'SUSPENSION';

export type EstadoMedida = 'BORRADOR' | 'NOTIFICADA' | 'FIRMADA' | 'CERRADA' | 'ANULADA';

export const TIPOS_MEDIDA: TipoMedida[] = [
  'AMONESTACION_VERBAL',
  'AMONESTACION_ESCRITA',
  'ACTA_ADMINISTRATIVA',
  'SUSPENSION',
];

export const ESTADOS_MEDIDA: EstadoMedida[] = [
  'BORRADOR',
  'NOTIFICADA',
  'FIRMADA',
  'CERRADA',
  'ANULADA',
];

const ETIQUETA_TIPO: Record<TipoMedida, string> = {
  AMONESTACION_VERBAL: 'Amonestación verbal',
  AMONESTACION_ESCRITA: 'Amonestación escrita',
  ACTA_ADMINISTRATIVA: 'Acta administrativa',
  SUSPENSION: 'Suspensión sin goce (hasta 8 días)',
};

const ETIQUETA_ESTADO: Record<EstadoMedida, string> = {
  BORRADOR: 'Borrador',
  NOTIFICADA: 'Notificada',
  FIRMADA: 'Firmada',
  CERRADA: 'Cerrada',
  ANULADA: 'Anulada',
};

/** Art. 110 LFT — descuentos permitidos; nunca como castigo. */
const DESCUENTOS_ART110 = new Set([
  'deuda_empresa',
  'anticipo',
  'perdida_averia',
  'pension',
  'infonavit',
  'fonacot',
  'multa_transito_vehiculo',
]);

export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo as TipoMedida] ?? tipo;
}

export function etiquetaEstado(estado: string): string {
  return ETIQUETA_ESTADO[estado as EstadoMedida] ?? estado;
}

export function validarSuspensionDias(dias: number): void {
  if (!Number.isInteger(dias) || dias < 1 || dias > 8) {
    throw new BadRequestException(
      'La suspensión sin goce solo puede ser de 1 a 8 días (art. 423 fr. X LFT).',
    );
  }
}

export function validarCreacion(input: {
  tipo: string;
  hechos?: string;
  testigos?: string;
  descargo?: string;
  diasSuspension?: number | null;
  reglamentoInteriorCargado?: boolean;
}): { tipo: TipoMedida; diasSuspension: number | null; avisoReglamento: string | null } {
  const tipoRaw = String(input.tipo ?? '')
    .trim()
    .toUpperCase();
  if (/MULTA|FINE|SANCION_ECONOMICA|SANCIÓN_ECONÓMICA/.test(tipoRaw)) {
    throw new BadRequestException(
      'Las multas al trabajador están prohibidas (art. 107 LFT). Usa amonestación, acta o suspensión.',
    );
  }
  if (!TIPOS_MEDIDA.includes(tipoRaw as TipoMedida)) {
    throw new BadRequestException('Tipo de medida no reconocido.');
  }
  const tipo = tipoRaw as TipoMedida;
  const hechos = String(input.hechos ?? '').trim();
  if (hechos.length < 10) {
    throw new BadRequestException('Describe los hechos (mínimo 10 caracteres).');
  }

  if (tipo === 'ACTA_ADMINISTRATIVA') {
    if (input.testigos === undefined || input.testigos === null) {
      throw new BadRequestException('El acta administrativa requiere el campo de testigos.');
    }
    if (input.descargo === undefined || input.descargo === null) {
      throw new BadRequestException(
        'El acta administrativa debe dejar espacio para el descargo del trabajador (puede ir vacío por ahora).',
      );
    }
  }

  let diasSuspension: number | null = null;
  let avisoReglamento: string | null = null;
  if (tipo === 'SUSPENSION') {
    const dias = Number(input.diasSuspension);
    validarSuspensionDias(dias);
    diasSuspension = dias;
    if (!input.reglamentoInteriorCargado) {
      avisoReglamento =
        'No hay reglamento interior cargado: la suspensión solo procede si el reglamento lo prevé (art. 423 fr. X LFT).';
    }
  }

  return { tipo, diasSuspension, avisoReglamento };
}

export function tipoDescuentoArt110Permitido(clave: string): boolean {
  return DESCUENTOS_ART110.has(String(clave ?? '').trim().toLowerCase());
}
