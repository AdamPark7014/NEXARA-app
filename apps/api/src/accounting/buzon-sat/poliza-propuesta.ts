/**
 * Propuesta de póliza para un CFDI recibido (funciones puras).
 * Nada entra a JournalEntry sin aceptar en el servicio.
 */
import { CUENTAS, cents, type RenglonPoliza } from '../mesa-contable/polizas-mesa.js';

export type ConfianzaPoliza = 'alta' | 'media' | 'baja';

export type LigaDetectada = {
  tipo: 'ticket' | 'orden_compra' | 'recepcion' | 'actividad';
  id: number;
  etiqueta: string;
};

export type PropuestaPoliza = {
  renglones: RenglonPoliza[];
  cuentaGastoCodigo: string;
  confianza: ConfianzaPoliza;
  explicacion: string;
  ligas: LigaDetectada[];
};

export function proponerPolizaRecibido(input: {
  total: number;
  iva: number;
  ivaRetenido?: number;
  isrRetenido?: number;
  cuentaGastoCodigo?: string | null;
  cuentaDesdeHistorial?: boolean;
  sugerenciaIa?: { codigo: string; porque: string } | null;
  ligas?: LigaDetectada[];
}): PropuestaPoliza {
  const total = cents(input.total);
  const iva = cents(input.iva);
  const ivaRet = cents(input.ivaRetenido ?? 0);
  const isrRet = cents(input.isrRetenido ?? 0);
  const base = cents(total - iva + ivaRet + isrRet);

  let cuenta = input.cuentaGastoCodigo?.trim() || '';
  let confianza: ConfianzaPoliza = 'baja';
  let explicacion = 'Sin historial: revisa la cuenta de gasto.';

  if (cuenta && input.cuentaDesdeHistorial) {
    confianza = 'alta';
    explicacion = `Cuenta aprendida de pólizas anteriores de este proveedor (${cuenta}).`;
  } else if (input.sugerenciaIa?.codigo) {
    cuenta = input.sugerenciaIa.codigo;
    confianza = 'media';
    explicacion = input.sugerenciaIa.porque || `Sugerencia IA: ${cuenta}.`;
  } else if (!cuenta) {
    cuenta = CUENTAS.gastosAdministracion;
    explicacion = `Sin historial ni IA: se propone ${cuenta} (gastos de administración).`;
  }

  const ligas = input.ligas ?? [];
  if (ligas.length) {
    explicacion = `${explicacion} Ligado: ${ligas.map((l) => l.etiqueta).join('; ')}.`;
    if (confianza === 'baja') confianza = 'media';
  }

  const renglones: RenglonPoliza[] = [
    { codigo: cuenta, debe: base, haber: 0, etiqueta: 'Gasto / costo' },
  ];
  if (iva > 0) {
    renglones.push({
      codigo: CUENTAS.ivaAcreditablePagado,
      debe: iva,
      haber: 0,
      etiqueta: 'IVA acreditable',
    });
  }
  const haberProveedor = cents(base + iva - ivaRet - isrRet);
  renglones.push({
    codigo: CUENTAS.proveedores,
    debe: 0,
    haber: haberProveedor,
    etiqueta: 'Proveedor por pagar',
  });
  if (ivaRet > 0) {
    renglones.push({
      codigo: CUENTAS.retencionesAFavor,
      debe: 0,
      haber: ivaRet,
      etiqueta: 'IVA retenido',
    });
  }
  if (isrRet > 0) {
    renglones.push({
      codigo: CUENTAS.retencionesAFavor,
      debe: 0,
      haber: isrRet,
      etiqueta: 'ISR retenido',
    });
  }

  return {
    renglones,
    cuentaGastoCodigo: cuenta,
    confianza,
    explicacion,
    ligas,
  };
}
