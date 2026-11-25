/**
 * Pago semanal editable: sugerido + ajustes (movimientos) + registros de pago (CEO).
 * Capas: lo sugerido (cálculo), lo ajustado (movimientos), lo pagado (parcialidades).
 */

export type FormaPagoNomina = 'transferencia' | 'efectivo' | 'otro';

export const FORMAS_PAGO_NOMINA: readonly FormaPagoNomina[] = ['transferencia', 'efectivo', 'otro'];

export type RenglonComoSeCalculo = {
  clave: string;
  titulo: string;
  monto: number;
  detalle: string;
};

export type MovimientoPago = {
  tipo: 'sugerido' | 'ajuste' | 'pago';
  monto: number;
  motivo?: string | null;
  autorId?: number | null;
  autorNombre?: string | null;
  at?: string | null;
  forma?: FormaPagoNomina | null;
};

export type SaldoPagoSemanal = {
  sugerido: number;
  ajustes: number;
  pagado: number;
  /** sugerido + ajustes */
  final: number;
  /** final − pagado */
  saldo: number;
};

function redondear2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function saldoPagoSemanal(p: {
  sugerido: number;
  ajustes: readonly number[];
  pagos: readonly number[];
}): SaldoPagoSemanal {
  const ajustes = redondear2(p.ajustes.reduce((s, x) => s + (Number(x) || 0), 0));
  const pagado = redondear2(p.pagos.reduce((s, x) => s + (Number(x) || 0), 0));
  const sugerido = redondear2(p.sugerido);
  const final = redondear2(sugerido + ajustes);
  return { sugerido, ajustes, pagado, final, saldo: redondear2(final - pagado) };
}

export function validarAjustePago(p: {
  monto: number;
  motivo?: string | null;
  semanaCerrada?: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (p.semanaCerrada) {
    return { ok: false, error: 'La semana cerrada no se edita: reábrela con motivo' };
  }
  if (!Number.isFinite(p.monto) || p.monto === 0) {
    return { ok: false, error: 'El ajuste debe ser distinto de cero' };
  }
  if ((p.motivo ?? '').trim().length < 5) {
    return { ok: false, error: 'El motivo del ajuste es obligatorio (al menos 5 caracteres)' };
  }
  return { ok: true };
}

export function esFormaPagoNomina(v: unknown): v is FormaPagoNomina {
  return typeof v === 'string' && (FORMAS_PAGO_NOMINA as readonly string[]).includes(v);
}

export function validarRegistroPagoCeo(p: {
  esCeo: boolean;
  monto: number;
  forma?: string | null;
  comprobanteUrl?: string | null;
}): { ok: true; forma: FormaPagoNomina } | { ok: false; error: string } {
  if (!p.esCeo) {
    return { ok: false, error: 'Solo la dirección (CEO) puede registrar el pago' };
  }
  if (!Number.isFinite(p.monto) || p.monto <= 0) {
    return { ok: false, error: 'El monto pagado debe ser mayor a cero' };
  }
  if (!esFormaPagoNomina(p.forma)) {
    return { ok: false, error: 'La forma de pago debe ser transferencia, efectivo u otro' };
  }
  // Comprobante opcional (efectivo suele ir sin él).
  void p.comprobanteUrl;
  return { ok: true, forma: p.forma };
}

export type EstadoPago = 'sin_monto' | 'por_pagar' | 'parcial' | 'pagado';

export function estadoDePago(s: SaldoPagoSemanal): EstadoPago {
  if (s.final <= 0 && s.pagado <= 0) return 'sin_monto';
  if (s.saldo <= 0) return 'pagado';
  return s.pagado > 0 ? 'parcial' : 'por_pagar';
}

/** Lo que hace falta de la fila del Control semanal para explicar su total. */
export type FilaParaExplicar = {
  sueldoPeriodo: number | null;
  sueldoPeriodoExplicacion: string;
  viaticos: number | null;
  extrasMonto: number | null;
  extrasMinutosAprobados: number;
  festivosMonto: number | null;
  festivosTrabajados: ReadonlyArray<{ nombre: string }>;
  descuentos: ReadonlyArray<{ concepto: string; monto: number; aceptado: boolean }>;
  subtotal: number | null;
  total: number | null;
};

const horasTexto = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/**
 * Renglones que suman exactamente el total del Control semanal. Si el detalle está reservado (la
 * contadora en modo «totales» no recibe subtotal), un solo renglón con el neto.
 */
export function comoSeCalculoDeFila(f: FilaParaExplicar): RenglonComoSeCalculo[] {
  if (f.subtotal == null) {
    return [{ clave: 'total', titulo: 'Total de la semana', monto: redondear2(f.total ?? 0), detalle: 'Detalle reservado a RH y dirección' }];
  }
  const out: RenglonComoSeCalculo[] = [
    { clave: 'sueldo', titulo: 'Sueldo de la semana', monto: redondear2(f.sueldoPeriodo ?? 0), detalle: f.sueldoPeriodoExplicacion },
  ];
  if (f.extrasMonto) {
    out.push({
      clave: 'extra',
      titulo: 'Horas extra autorizadas',
      monto: redondear2(f.extrasMonto),
      detalle: `${horasTexto(f.extrasMinutosAprobados)}. Las primeras 9 h al doble, las demás al triple`,
    });
  }
  if (f.festivosMonto) {
    out.push({
      clave: 'festivos',
      titulo: 'Festivo trabajado',
      monto: redondear2(f.festivosMonto),
      detalle: f.festivosTrabajados.map((x) => x.nombre).join(', '),
    });
  }
  if (f.viaticos) out.push({ clave: 'viaticos', titulo: 'Viáticos', monto: redondear2(f.viaticos), detalle: 'Los de la semana' });
  f.descuentos
    .filter((d) => d.aceptado)
    .forEach((d, i) =>
      out.push({ clave: `descuento-${i}`, titulo: d.concepto, monto: -Math.abs(redondear2(d.monto)), detalle: 'Descuento aceptado' }),
    );
  return out;
}
