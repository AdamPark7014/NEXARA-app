/**
 * Borrador de factura emitida armado por IA: todo editable; nada se timbra aquí.
 */
export type CampoIa<T> = { valor: T; fuente: string; confianza: 'alta' | 'media' | 'baja'; tocado?: boolean };

export type ConceptoBorrador = {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  claveProdServ: string;
  claveUnidad: string;
  ivaTasa: number;
  atipico?: boolean;
  notaCantidad?: string;
  fuente: string;
};

export type BorradorFacturaIa = {
  cliente: {
    id: number | null;
    nombre: string;
    rfc: string | null;
    regimen: string | null;
    cp: string | null;
    altaPropuesta: boolean;
    fuente: string;
    confianza: 'alta' | 'media' | 'baja';
  };
  usoCfdi: CampoIa<string>;
  formaPago: CampoIa<string>;
  metodoPago: CampoIa<string>;
  conceptos: ConceptoBorrador[];
  notas: string | null;
};

const ATIPICO_RATIO = 20;

export function marcarCantidadesAtipicas(conceptos: ConceptoBorrador[]): ConceptoBorrador[] {
  if (conceptos.length < 2) return conceptos;
  const cantidades = conceptos.map((c) => c.cantidad).filter((n) => n > 0);
  const mediana = [...cantidades].sort((a, b) => a - b)[Math.floor(cantidades.length / 2)] || 1;
  return conceptos.map((c) => {
    if (c.cantidad >= mediana * ATIPICO_RATIO) {
      return {
        ...c,
        atipico: true,
        notaCantidad: `${c.descripcion} — ${c.cantidad.toLocaleString('es-MX')} piezas`,
        descripcion: c.notaCantidad || `${c.descripcion} — ${c.cantidad.toLocaleString('es-MX')} piezas`,
      };
    }
    return c;
  });
}

export function limpiarBorrador(raw: Partial<BorradorFacturaIa> | null | undefined): BorradorFacturaIa {
  const conceptos = marcarCantidadesAtipicas(
    (raw?.conceptos ?? []).map((c) => ({
      descripcion: String(c.descripcion ?? '').slice(0, 300),
      cantidad: Number(c.cantidad) || 1,
      unidad: String(c.unidad ?? 'Pieza').slice(0, 50),
      precioUnitario: Number(c.precioUnitario) || 0,
      claveProdServ: String(c.claveProdServ ?? '80101500').slice(0, 10),
      claveUnidad: String(c.claveUnidad ?? 'H87').slice(0, 5),
      ivaTasa: Number(c.ivaTasa) || 16,
      fuente: String(c.fuente ?? 'ia'),
      atipico: Boolean(c.atipico),
      notaCantidad: c.notaCantidad,
    })),
  );
  return {
    cliente: {
      id: raw?.cliente?.id ?? null,
      nombre: String(raw?.cliente?.nombre ?? '').slice(0, 220),
      rfc: raw?.cliente?.rfc ?? null,
      regimen: raw?.cliente?.regimen ?? null,
      cp: raw?.cliente?.cp ?? null,
      altaPropuesta: Boolean(raw?.cliente?.altaPropuesta),
      fuente: String(raw?.cliente?.fuente ?? 'ia'),
      confianza: raw?.cliente?.confianza ?? 'media',
    },
    usoCfdi: raw?.usoCfdi ?? { valor: 'G03', fuente: 'ia', confianza: 'media' },
    formaPago: raw?.formaPago ?? { valor: '99', fuente: 'ia', confianza: 'media' },
    metodoPago: raw?.metodoPago ?? { valor: 'PUE', fuente: 'ia', confianza: 'media' },
    conceptos,
    notas: raw?.notas ?? null,
  };
}
