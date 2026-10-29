/**
 * «Pagos y gastos»: de cada peso que entra o sale, si tiene su CFDI, su movimiento de banco y su
 * póliza. Aquí viven las reglas; el servicio solo junta los datos.
 */

export type OrigenPagoGasto = 'VIATICO' | 'GASTO' | 'NOMINA' | 'PAGO' | 'RECEPCION';
export const ORIGENES_PAGO_GASTO: OrigenPagoGasto[] = ['VIATICO', 'GASTO', 'NOMINA', 'PAGO', 'RECEPCION'];

export type TipoPagoGasto = 'COBRO' | 'PROVEEDOR' | 'VIATICO' | 'GASTO' | 'NOMINA';
export const TIPOS_PAGO_GASTO: TipoPagoGasto[] = ['COBRO', 'PROVEEDOR', 'VIATICO', 'GASTO', 'NOMINA'];

export type EstadoCeldaClave = 'ok' | 'parcial' | 'falta' | 'no_aplica' | 'espera' | 'sugerencia';

export interface EstadoCelda {
  estado: EstadoCeldaClave;
  texto: string;
  accion: string | null;
}

export interface SugerenciaBanco {
  bankTransactionId: number;
  score: number;
  fecha: string;
  importe: number;
  descripcion: string;
}

export interface PagoGastoItem {
  clave: string;
  origen: OrigenPagoGasto;
  origenId: number;
  fecha: string;
  tipo: TipoPagoGasto;
  tipoEtiqueta: string;
  titulo: string;
  subtitulo: string | null;
  folio: { texto: string; href: string | null } | null;
  importe: number;
  cfdi: EstadoCelda;
  banco: EstadoCelda & { sugerencia: SugerenciaBanco | null };
  poliza: EstadoCelda & { journalEntryId: number | null };
  pendiente: boolean;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function diaCorto(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES_CORTOS[m - 1] ?? ''}`;
}

/** CFDI de un movimiento según cuánto de su importe respaldan los XML ligados. */
export function estadoCfdiCubierto(importe: number, cubierto: number, nCfdi: number, accion: string): EstadoCelda {
  const monto = Math.abs(importe);
  if (nCfdi === 0 || cubierto <= 0) return { estado: 'falta', texto: 'Sin CFDI', accion };
  if (cubierto + 0.01 < monto) {
    return { estado: 'parcial', texto: `${nCfdi} CFDI · faltan $${(monto - cubierto).toFixed(2)}`, accion };
  }
  return { estado: 'ok', texto: nCfdi === 1 ? '1 CFDI' : `${nCfdi} CFDI`, accion: null };
}

export function estadoBancoLigado(fecha: string | null, texto: string | null): EstadoCelda {
  return { estado: 'ok', texto: texto ?? (fecha ? `Banco ${diaCorto(fecha)}` : 'Conciliado'), accion: null };
}

export function estadoPoliza(numero: string | null, pendienteTexto = 'Por registrar'): EstadoCelda {
  return numero ? { estado: 'ok', texto: numero, accion: null } : { estado: 'falta', texto: pendienteTexto, accion: 'REGISTRAR' };
}

/**
 * Qué tan probable es que un movimiento de banco sea este pago o gasto. Importe al centavo es
 * requisito; luego pesa la cercanía de la fecha y que el nombre de la contraparte aparezca.
 */
export function puntuarSugerencia(
  mov: { importe: number; fecha: string; nombre?: string | null },
  txn: { amount: number; isDebit: boolean; fecha: string; descripcion: string; contraparte?: string | null },
): number {
  const sale = mov.importe < 0;
  if (txn.isDebit !== sale) return 0;
  if (Math.abs(Math.abs(mov.importe) - Math.abs(txn.amount)) > 0.01) return 0;
  const dias = Math.abs(new Date(`${mov.fecha}T00:00:00Z`).getTime() - new Date(`${txn.fecha}T00:00:00Z`).getTime()) / 86_400_000;
  if (dias > 7) return 0;
  let score = 70 + Math.max(0, 25 - Math.round(dias) * 4);
  const nombre = String(mov.nombre ?? '').trim().toLowerCase();
  const texto = `${txn.descripcion} ${txn.contraparte ?? ''}`.toLowerCase();
  if (nombre && nombre.split(/\s+/).some((p) => p.length > 3 && texto.includes(p))) score += 5;
  return Math.min(99, score);
}

export function mejorSugerencia<T extends SugerenciaBanco>(candidatas: T[]): T | null {
  return candidatas.filter((c) => c.score > 0).sort((a, b) => b.score - a.score)[0] ?? null;
}

export function esPendiente(item: Pick<PagoGastoItem, 'cfdi' | 'banco' | 'poliza'>): boolean {
  const abierto = (e: EstadoCeldaClave) => e === 'falta' || e === 'parcial' || e === 'sugerencia';
  return abierto(item.cfdi.estado) || abierto(item.banco.estado) || abierto(item.poliza.estado);
}

/** Cuenta de gasto según la categoría que capturó quien hizo el gasto. */
export function cuentaDeGasto(categoria: string | null | undefined): string {
  const c = String(categoria ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/gasolin|combustib|diesel/.test(c)) return '601.10';
  if (/papeler|util/.test(c)) return '601.03';
  if (/telefon|internet|celular/.test(c)) return '601.04';
  if (/manten|refacc|reparac/.test(c)) return '601.09';
  if (/software|suscrip|licenc/.test(c)) return '601.13';
  if (/comida|aliment|hosped|hotel|viat|casetas|peaje|transporte/.test(c)) return '601.02';
  return '601.01';
}

/** «2026-10» → límites del mes y su nombre. */
export function rangoMes(mes: string | undefined, hoy: string): { mes: string; etiqueta: string; from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? '').trim());
  const [y, mm] = m ? [Number(m[1]), Number(m[2])] : hoy.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    mes: `${y}-${pad(mm)}`,
    etiqueta: `${nombres[mm - 1]} ${y}`,
    from: `${y}-${pad(mm)}-01`,
    to: `${y}-${pad(mm)}-${pad(ultimo)}`,
  };
}
