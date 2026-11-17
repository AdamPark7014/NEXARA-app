/** Impuestos del DoctoRelacionado (complemento de pago Pagos 2.0). */

export type ImpuestosDrPago = {
  base: number;
  tasa: number | null;
  tipoFactor: 'Tasa' | 'Exento';
  importe: number;
  ivaRetenido?: number;
  isrRetenido?: number;
};

export function redondeo2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function impuestosDrDePago(
  amountPaid: number,
  ivaRatePct: number | null | undefined,
  opts?: { exento?: boolean; ivaRetRatePct?: number | null; isrRetRatePct?: number | null },
): ImpuestosDrPago {
  if (opts?.exento) {
    return { base: redondeo2(amountPaid), tasa: null, tipoFactor: 'Exento', importe: 0 };
  }
  const tasa = ivaRatePct === undefined || ivaRatePct === null ? 16 : ivaRatePct;
  const base = tasa === 0 ? redondeo2(amountPaid) : redondeo2(amountPaid / (1 + tasa / 100));
  const importe = redondeo2(amountPaid - base);
  const out: ImpuestosDrPago = { base, tasa, tipoFactor: 'Tasa', importe };
  if (opts?.ivaRetRatePct && opts.ivaRetRatePct > 0) {
    out.ivaRetenido = redondeo2((base * opts.ivaRetRatePct) / 100);
  }
  if (opts?.isrRetRatePct && opts.isrRetRatePct > 0) {
    out.isrRetenido = redondeo2((base * opts.isrRetRatePct) / 100);
  }
  return out;
}

export function xmlNodosImpuestosDr(imp: ImpuestosDrPago): string {
  const tasaAttr =
    imp.tipoFactor === 'Tasa' && imp.tasa != null
      ? ` TasaOCuotaDR="${(imp.tasa / 100).toFixed(6)}"`
      : '';
  let xml =
    `<pago20:ImpuestosDR><pago20:TrasladosDR>` +
    `<pago20:TrasladoDR BaseDR="${imp.base.toFixed(2)}" ImpuestoDR="002" TipoFactorDR="${imp.tipoFactor}"${tasaAttr} ImporteDR="${imp.importe.toFixed(2)}"/>` +
    `</pago20:TrasladosDR>`;
  const rets: string[] = [];
  if (imp.ivaRetenido && imp.ivaRetenido > 0) {
    rets.push(
      `<pago20:RetencionDR BaseDR="${imp.base.toFixed(2)}" ImpuestoDR="002" TasaOCuotaDR="0.000000" ImporteDR="${imp.ivaRetenido.toFixed(2)}"/>`,
    );
  }
  if (imp.isrRetenido && imp.isrRetenido > 0) {
    rets.push(
      `<pago20:RetencionDR BaseDR="${imp.base.toFixed(2)}" ImpuestoDR="001" TasaOCuotaDR="0.000000" ImporteDR="${imp.isrRetenido.toFixed(2)}"/>`,
    );
  }
  if (rets.length) xml += `<pago20:RetencionesDR>${rets.join('')}</pago20:RetencionesDR>`;
  xml += `</pago20:ImpuestosDR>`;
  return xml;
}
