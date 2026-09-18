/**
 * Folio de cotización en Core (contrato 17-09, sección D).
 *
 * Decisión de Adam: todos los encargados de área cotizan, así que el folio dice **de quién es** y
 * **cuántas lleva**:
 *
 *   `NEX-{NOMENCLATURA}-{contador de 4 dígitos de esa persona}` → `NEX-LJ75100126-0007`
 *
 * La nomenclatura es `User.employeeNumber` cuando cumple `^[A-Z]{2}\d{8}$`. Cuando no está completa
 * se rellena **igual que la nomenclatura de RH**: 2 iniciales del nombre (nombre(s) primero, sin
 * acentos) + los 8 dígitos que se puedan calcular (año/mes de nacimiento desde la CURP o el perfil;
 * año/mes de ingreso) y **ceros donde falte el dato** — Christian Eduardo Del Pozo → `CE00000000`.
 * Nunca se inventan datos: lo que no se sabe va en cero, no en un valor plausible.
 *
 * El segmento (COMERCIAL/OBRA/LICITACION/SERVICIO) **no** va en el folio: es un campo y un filtro.
 *
 * Al enviar se agregan las siglas de quienes intervinieron además de quien la hizo, en orden
 * (`NEX-LJ75100126-0007-JA.CE`), y cada versión enviada después agrega `-R2`, `-R3`.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { fechaNacimientoDeCurp, inicialesNomenclatura } from '../rrhh/nomenclatura.js';

/** Formato oficial de la nomenclatura de RH: 2 letras + 8 dígitos. */
export const FORMATO_NOMENCLATURA = /^[A-Z]{2}\d{8}$/;

export const PREFIJO_FOLIO = 'NEX';

export type DatosNomenclatura = {
  nombre: string;
  /** `User.employeeNumber` tal cual lo cargó RH. */
  employeeNumber?: string | null;
  curp?: string | null;
  fechaNacimiento?: Date | null;
  fechaIngreso?: Date | null;
};

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

function anioMes(fecha: Date | null | undefined): string | null {
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  return dosDigitos(fecha.getUTCFullYear() % 100) + dosDigitos(fecha.getUTCMonth() + 1);
}

/**
 * Dos letras para el folio.
 *
 * Con dos o más palabras son las iniciales de las dos primeras (`Luis Joel …` → `LJ`); con una sola
 * palabra se toman sus dos primeras letras, que siguen siendo dato real de la persona.
 */
export function inicialesParaFolio(nombre: string): string {
  const iniciales = inicialesNomenclatura(nombre);
  if (iniciales.length >= 2) return iniciales.slice(0, 2);

  const letras = (nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  if (letras.length >= 2) return letras.slice(0, 2);
  // Sin nombre no hay dato que usar; `XX` marca el hueco sin inventar a nadie.
  return (letras + 'XX').slice(0, 2);
}

/**
 * Nomenclatura con la que se emite el folio.
 *
 * Si RH ya le dio clave válida a la persona, esa es. Si no, se arma con lo que haya y ceros donde
 * falte, para que el folio exista siempre y se corrija solo cuando RH complete el expediente.
 */
export function nomenclaturaParaFolio(datos: DatosNomenclatura): string {
  const registrada = (datos.employeeNumber || '').trim().toUpperCase();
  if (FORMATO_NOMENCLATURA.test(registrada)) return registrada;

  const nacimiento = anioMes(datos.fechaNacimiento ?? fechaNacimientoDeCurp(datos.curp)) ?? '0000';
  const ingreso = anioMes(datos.fechaIngreso) ?? '0000';
  return inicialesParaFolio(datos.nombre) + nacimiento + ingreso;
}

/** ¿La clave es la oficial de RH o un relleno con ceros? */
export function nomenclaturaCompleta(nomenclatura: string): boolean {
  return FORMATO_NOMENCLATURA.test(nomenclatura) && !/0{8}$/.test(nomenclatura);
}

/** Siglas de una persona para la cadena del folio: las 2 primeras letras de su nomenclatura. */
export function siglasDeNomenclatura(nomenclatura: string): string {
  return (nomenclatura || '').trim().toUpperCase().slice(0, 2);
}

/** Contador de 4 dígitos; si alguien pasa de 9 999 cotizaciones el folio crece, no se trunca. */
export function consecutivoFolio(consecutivo: number): string {
  const n = Math.max(1, Math.trunc(consecutivo));
  return String(n).padStart(4, '0');
}

/** `NEX-LJ75100126-0007` — el folio que se fija al crear. */
export function folioBase(nomenclatura: string, consecutivo: number): string {
  return `${PREFIJO_FOLIO}-${nomenclatura.trim().toUpperCase()}-${consecutivoFolio(consecutivo)}`;
}

/**
 * Cadena de quién intervino, en orden de participación y sin repetir.
 *
 * Quien hizo la cotización ya está en el folio (su nomenclatura), así que no se repite en la cadena.
 */
export function cadenaParticipantes(
  siglasAutor: string,
  siglasEnOrden: Array<string | null | undefined>,
): string {
  const autor = siglasDeNomenclatura(siglasAutor || '');
  const vistas = new Set<string>();
  const cadena: string[] = [];

  for (const raw of siglasEnOrden) {
    const siglas = siglasDeNomenclatura(raw || '');
    if (siglas.length !== 2) continue;
    if (siglas === autor) continue;
    if (vistas.has(siglas)) continue;
    vistas.add(siglas);
    cadena.push(siglas);
  }

  return cadena.join('.');
}

export type FolioEnviadoInput = {
  /** Folio fijado al crear (`NEX-LJ75100126-0007`). */
  base: string;
  /** Nomenclatura (o siglas) de quien la elaboró. */
  siglasAutor: string;
  /** Siglas del resto de participantes, en el orden en que intervinieron. */
  participantes: Array<string | null | undefined>;
  /** 1 = primer envío; 2 en adelante agregan `-R2`, `-R3`, … */
  revision?: number;
};

/**
 * Folio con el que sale la cotización al cliente.
 *
 * `NEX-LJ75100126-0007-JA.CE-R2`: base + cadena de participantes + revisión enviada.
 */
export function folioEnviado(input: FolioEnviadoInput): string {
  const cadena = cadenaParticipantes(input.siglasAutor, input.participantes);
  const revision = Math.max(1, Math.trunc(input.revision ?? 1));
  return (
    input.base.trim().toUpperCase() +
    (cadena ? `-${cadena}` : '') +
    (revision > 1 ? `-R${revision}` : '')
  );
}

/** Folio base de uno ya enviado (quita cadena de participantes y revisión). */
export function folioSinCadena(folio: string): string {
  const match = (folio || '').trim().toUpperCase().match(/^(NEX-[A-Z]{2}\d{8}-\d{4,})/);
  return match ? match[1]! : (folio || '').trim().toUpperCase();
}

/** ¿El folio sigue la nomenclatura (`NEX-LJ75100126-0007…`) o es de los viejos (`NXR-2026-763366`)? */
export function tieneNomenclatura(folio: string | null | undefined): boolean {
  return /^NEX-[A-Z]{2}\d{8}-\d{4,}(?:-[A-Z]{2}(?:\.[A-Z]{2})*)?(?:-R\d+)?$/.test(
    String(folio ?? '').trim().toUpperCase(),
  );
}

export type CotizacionParaRefolio = {
  status: unknown;
  quoteNumber: string;
  folioNomenclatura?: string | null;
  sentAt?: Date | string | null;
  folioEnviado?: string | null;
  createdById?: number | null;
  deletedAt?: Date | string | null;
};

/**
 * ¿A este borrador se le puede (y se le debe) dar folio con nomenclatura?
 *
 * Solo borradores que **nunca salieron**: un folio que ya vio el cliente no se cambia, aunque sea de
 * los viejos. Y solo si hay autor, porque el folio es de esa persona.
 */
export function necesitaRefolio(quote: CotizacionParaRefolio): boolean {
  if (quote.deletedAt) return false;
  const estado = String(quote.status ?? '').trim().toUpperCase();
  if (estado !== 'DRAFT' && estado !== 'BORRADOR') return false;
  if (quote.sentAt || quote.folioEnviado) return false;
  if (!quote.createdById) return false;
  return !(quote.folioNomenclatura && tieneNomenclatura(quote.quoteNumber));
}
