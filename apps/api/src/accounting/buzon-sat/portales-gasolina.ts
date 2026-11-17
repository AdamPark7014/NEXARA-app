/**
 * Portales de autofactura conocidos (gasolineras MX). La contadora copia los datos el mismo día.
 */
export type PortalGasolina = {
  clave: string;
  nombre: string;
  url: string;
  /** RFCs o fragmentos de nombre comercial que lo activan. */
  coincide: (comercio: string | null | undefined, rfc: string | null | undefined) => boolean;
  recordatorio: string;
};

const portals: PortalGasolina[] = [
  {
    clave: 'pemex',
    nombre: 'PEMEX Facturación',
    url: 'https://facturaelectronica.pemex.com/',
    coincide: (c, rfc) => /pemex|franquicia/i.test(c ?? '') || (rfc ?? '').startsWith('PME'),
    recordatorio: 'Gasolina: factura el mismo día del ticket.',
  },
  {
    clave: 'bp',
    nombre: 'BP Factura',
    url: 'https://www.facturacion.bp.com.mx/',
    coincide: (c) => /\bbp\b/i.test(c ?? ''),
    recordatorio: 'Gasolina: factura el mismo día del ticket.',
  },
  {
    clave: 'shell',
    nombre: 'Shell Facturación',
    url: 'https://www.facturacion.shell.com.mx/',
    coincide: (c) => /shell/i.test(c ?? ''),
    recordatorio: 'Gasolina: factura el mismo día del ticket.',
  },
  {
    clave: 'mobil',
    nombre: 'Mobil Factura',
    url: 'https://factura.mobil.com.mx/',
    coincide: (c) => /mobil/i.test(c ?? ''),
    recordatorio: 'Gasolina: factura el mismo día del ticket.',
  },
  {
    clave: 'g500',
    nombre: 'G500 Facturación',
    url: 'https://facturacion.g500.com.mx/',
    coincide: (c) => /g\s*500|g500/i.test(c ?? ''),
    recordatorio: 'Gasolina: factura el mismo día del ticket.',
  },
];

export function portalDeGasolinera(
  comercio: string | null | undefined,
  rfc: string | null | undefined,
): PortalGasolina | null {
  return portals.find((p) => p.coincide(comercio, rfc)) ?? null;
}

export function listarPortalesGasolina(): Omit<PortalGasolina, 'coincide'>[] {
  return portals.map(({ clave, nombre, url, recordatorio }) => ({ clave, nombre, url, recordatorio }));
}
