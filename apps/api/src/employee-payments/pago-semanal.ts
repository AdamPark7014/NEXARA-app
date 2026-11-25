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

export function comoSeCalculoRenglones(p: {
  horasOrdinarias: number;
  tarifaHora: number;
  horasExtra: number;
  factorExtra: number;
  bonoProductividad: number;
  descuentos: number;
  ajusteManual: number;
  ajusteMotivo?: string | null;
  ajusteAutor?: string | null;
}): RenglonComoSeCalculo[] {
  const renglones: RenglonComoSeCalculo[] = [];
  const ordinarias = redondear2(p.horasOrdinarias * p.tarifaHora);
  renglones.push({
    clave: 'ordinarias',
    titulo: 'Horas ordinarias',
    monto: ordinarias,
    detalle: `${p.horasOrdinarias} h × $${p.tarifaHora}/h`,
  });
  const extra = redondear2(p.horasExtra * p.tarifaHora * p.factorExtra);
  if (p.horasExtra > 0 || extra !== 0) {
    renglones.push({
      clave: 'extra',
      titulo: 'Horas extra',
      monto: extra,
      detalle: `${p.horasExtra} h × $${p.tarifaHora}/h × factor ${p.factorExtra}`,
    });
  }
  if (p.bonoProductividad) {
    renglones.push({
      clave: 'bono',
      titulo: 'Bono de productividad',
      monto: redondear2(p.bonoProductividad),
      detalle: 'Según parámetros de productividad vigentes al cerrar',
    });
  }
  if (p.descuentos) {
    renglones.push({
      clave: 'descuentos',
      titulo: 'Descuentos',
      monto: -Math.abs(redondear2(p.descuentos)),
      detalle: 'Descuentos de la semana',
    });
  }
  if (p.ajusteManual) {
    const quien = (p.ajusteAutor ?? '').trim();
    const motivo = (p.ajusteMotivo ?? '').trim();
    renglones.push({
      clave: 'ajuste',
      titulo: 'Ajuste manual',
      monto: redondear2(p.ajusteManual),
      detalle: [motivo || 'Ajuste', quien ? `por ${quien}` : null].filter(Boolean).join(' · '),
    });
  }
  return renglones;
}

/** Foto de parámetros al cerrar la semana (no muta el historial vigente). */
export function snapshotParametrosAlCerrar(
  params: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const src = params && typeof params === 'object' ? params : {};
  const pick = (k: string) => (k in src ? src[k] : undefined);
  return {
    vigenteDesde: pick('vigenteDesde') ?? null,
    rangoNormalInicio: pick('rangoNormalInicio') ?? '10:00',
    rangoNormalFin: pick('rangoNormalFin') ?? '18:00',
    graciaMin: pick('graciaMin') ?? 15,
    pesoPuntualidad: pick('pesoPuntualidad') ?? 0.3,
    pesoAprovechamiento: pick('pesoAprovechamiento') ?? 0.4,
    pesoEficiencia: pick('pesoEficiencia') ?? 0.3,
    topeBonoPct: pick('topeBonoPct') ?? 100,
    factorExtra: pick('factorExtra') ?? 2,
    topeExtraSemanaMin: pick('topeExtraSemanaMin') ?? 540,
    cerradoAt: new Date().toISOString(),
  };
}
