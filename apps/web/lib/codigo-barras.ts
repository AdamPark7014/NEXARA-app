/**
 * Códigos de barras de producto en la web: qué simbología leyó el lector y si el dígito
 * verificador cuadra, para avisar antes de mandar nada al servidor.
 *
 * Es copia de `apps/api/src/warehouse/codigo-barras.ts` (no hay paquete compartido
 * entre la web y la API). El servidor vuelve a validar; si cambias una, cambia la otra.
 */

export type TipoCodigo = 'UPC_A' | 'EAN_13' | 'EAN_8' | 'GTIN_14' | 'INTERNO';

export const LARGO_MAXIMO_CODIGO = 64;
export const LARGO_MINIMO_CODIGO = 3;

export type CodigoClasificado = {
  /** Lo leído, sin espacios ni caracteres de control. */
  codigo: string;
  tipo: TipoCodigo;
  /**
   * Parece UPC/EAN (12 o 13 dígitos) pero el dígito verificador no cuadra: casi
   * siempre es un código tecleado a mano con un número cambiado.
   */
  sospechoso: boolean;
};

/**
 * Quita lo que mete el lector alrededor del código: espacios, tabuladores, saltos de
 * línea y el prefijo `]C1`/`]E0` (identificador AIM) que algunos lectores anteponen.
 */
export function limpiarCodigo(valor: unknown): string {
  return String(valor ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/^\][A-Za-z][0-9A-Za-z]/, '')
    .trim();
}

/**
 * Dígito verificador GTIN (UPC-A, EAN-8, EAN-13, GTIN-14) del cuerpo sin verificador.
 * Los pesos 3-1 se cuentan desde la derecha, por eso sirve igual para todos los largos.
 */
export function digitoVerificadorGtin(cuerpo: string): number {
  if (!/^\d+$/.test(cuerpo)) {
    throw new Error('El cuerpo de un GTIN solo lleva dígitos');
  }
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const digito = cuerpo.charCodeAt(cuerpo.length - 1 - i) - 48;
    suma += digito * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

const LARGOS_GTIN = new Set([8, 12, 13, 14]);

/** ¿Son 8, 12, 13 o 14 dígitos con el verificador correcto? */
export function esGtinValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || !LARGOS_GTIN.has(codigo.length)) return false;
  const cuerpo = codigo.slice(0, -1);
  return digitoVerificadorGtin(cuerpo) === Number(codigo[codigo.length - 1]);
}

export function clasificarCodigo(valor: unknown): CodigoClasificado {
  const codigo = limpiarCodigo(valor);
  if (esGtinValido(codigo)) {
    const tipo: TipoCodigo =
      codigo.length === 12
        ? 'UPC_A'
        : codigo.length === 13
          ? 'EAN_13'
          : codigo.length === 8
            ? 'EAN_8'
            : 'GTIN_14';
    return { codigo, tipo, sospechoso: false };
  }
  // 8 dígitos sin verificador válido puede ser un UPC-E legítimo: no se marca.
  const sospechoso = /^\d+$/.test(codigo) && (codigo.length === 12 || codigo.length === 13);
  return { codigo, tipo: 'INTERNO', sospechoso };
}

/** Motivo por el que un código no se puede guardar, o `null` si está bien. */
export function motivoCodigoInvalido(valor: unknown): string | null {
  const { codigo, sospechoso } = clasificarCodigo(valor);
  if (!codigo) return 'Escanea o escribe un código de barras';
  if (codigo.length < LARGO_MINIMO_CODIGO) {
    return `El código es demasiado corto (mínimo ${LARGO_MINIMO_CODIGO} caracteres)`;
  }
  if (codigo.length > LARGO_MAXIMO_CODIGO) {
    return `El código es demasiado largo (máximo ${LARGO_MAXIMO_CODIGO} caracteres)`;
  }
  // Fuera de ASCII imprimible no hay lector que lo devuelva igual dos veces.
  if (!/^[\x20-\x7e]+$/.test(codigo)) {
    return 'El código trae caracteres que un lector no puede leer';
  }
  if (sospechoso) {
    return 'Parece un UPC/EAN pero el dígito verificador no cuadra. Vuelve a escanearlo.';
  }
  return null;
}

/**
 * Las formas en que el mismo artículo puede estar guardado. Un UPC-A es un EAN-13 con
 * un cero delante: según el lector (o quién lo capturó) llega de una forma u otra, y
 * las dos tienen que encontrar el mismo producto.
 */
export function variantesDeBusqueda(valor: unknown): string[] {
  const { codigo, tipo } = clasificarCodigo(valor);
  if (!codigo) return [];
  const variantes = new Set<string>([codigo]);
  if (tipo === 'UPC_A') {
    variantes.add(`0${codigo}`);
  } else if (tipo === 'EAN_13' && codigo.startsWith('0')) {
    variantes.add(codigo.slice(1));
  } else if (tipo === 'GTIN_14' && codigo.startsWith('0')) {
    // Indicador 0 = la misma pieza; del 1 al 8 es una caja y no equivale.
    const ean13 = codigo.slice(1);
    variantes.add(ean13);
    if (ean13.startsWith('0')) variantes.add(ean13.slice(1));
  }
  return [...variantes];
}

/** ¿Vale la pena preguntarle al catálogo internacional? Solo por GTIN de 12 a 14 dígitos. */
export function esConsultableInternacional(valor: unknown): boolean {
  const { tipo } = clasificarCodigo(valor);
  return tipo === 'UPC_A' || tipo === 'EAN_13' || tipo === 'GTIN_14';
}

const NOMBRES_DE_TIPO: Record<TipoCodigo, string> = {
  UPC_A: 'UPC-A',
  EAN_13: 'EAN-13',
  EAN_8: 'EAN-8',
  GTIN_14: 'GTIN-14',
  INTERNO: 'Código propio',
};

/** Cómo se le dice a la persona qué leyó el lector. */
export function nombreDeTipoCodigo(tipo: TipoCodigo): string {
  return NOMBRES_DE_TIPO[tipo];
}
