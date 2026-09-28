/**
 * «Tu día»: el resumen que el CEO necesita antes de abrir nada.
 *
 * Christian solo revisa y aprueba. Hoy los avisos le llegan sueltos (cada evidencia, cada «creado»);
 * este módulo junta lo que de verdad espera algo de él en una sola lista corta: qué aprobar, qué
 * cobrar, qué compras se atrasaron, qué cotizaciones vencen, qué actividades no salen y si toca
 * revisar la nómina. Solo aparece lo que no es cero.
 *
 * Módulo puro (sin Nest ni Prisma): recibe los conteos y devuelve el texto y la prioridad.
 */
export type DatosCeo = {
  porAprobar: {
    cantidad: number;
    /** Solo pesos; las solicitudes en otra moneda se cuentan pero no se suman. */
    monto: number;
    masAntiguaDias: number;
    masGrandes: Array<{ titulo: string; monto: number | null; moneda: string }>;
  };
  cobranza: { vencidas: number; monto: number; diasMasAtrasada: number };
  comprasAtrasadas: number;
  cotizaciones: { porVencer: number; monto: number; dias: number };
  operacion: { actividadesAtrasadas: number; porValidar: number };
  nomina: {
    /** Periodo que cerró hace poco y espera revisión (solo si quien lee ve «Pagos a personal»). */
    listaParaRevisar: { etiqueta: string; desde: string; hasta: string } | null;
    proximoCorte: { corte: string; dias: number; etiqueta: string } | null;
  } | null;
};

export type ItemResumen = {
  clave: 'aprobaciones' | 'cobranza' | 'compras' | 'cotizaciones' | 'operacion' | 'nomina';
  texto: string;
  /** Ruta de Core donde se resuelve. */
  url: string;
  tono: 'alerta' | 'atencion' | 'info';
};

export type ResumenCeo = {
  /** Día de trabajo (AAAA-MM-DD, hora de México) al que corresponde. */
  fecha: string;
  /** `true` si no hay nada que requiera atención: no se manda aviso. */
  vacio: boolean;
  prioridad: 'alta' | 'normal';
  titulo: string;
  mensaje: string;
  items: ItemResumen[];
};

/** Días desde los que algo «lleva demasiado»: aprobaciones y cobranza. */
export const DIAS_APROBACION_LENTA = 3;
export const DIAS_COBRANZA_GRAVE = 30;

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const dinero = (n: number): string => MXN.format(Math.round(n));
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;
const dias = (n: number): string => (n === 1 ? '1 día' : `${n} días`);

export function armarResumenCeo(d: DatosCeo, fecha: string): ResumenCeo {
  const items: ItemResumen[] = [];

  if (d.porAprobar.cantidad > 0) {
    const lenta = d.porAprobar.masAntiguaDias >= DIAS_APROBACION_LENTA;
    const partes = [`${plural(d.porAprobar.cantidad, 'solicitud por aprobar', 'solicitudes por aprobar')}`];
    if (d.porAprobar.monto > 0) partes[0] += ` (${dinero(d.porAprobar.monto)})`;
    if (lenta) partes.push(`la más antigua lleva ${dias(d.porAprobar.masAntiguaDias)}`);
    items.push({ clave: 'aprobaciones', texto: partes.join(', '), url: '/erp/approvals', tono: lenta ? 'alerta' : 'atencion' });
  }

  if (d.cobranza.vencidas > 0) {
    const grave = d.cobranza.diasMasAtrasada >= DIAS_COBRANZA_GRAVE;
    items.push({
      clave: 'cobranza',
      texto:
        `${plural(d.cobranza.vencidas, 'factura vencida', 'facturas vencidas')} por cobrar (${dinero(d.cobranza.monto)})` +
        (d.cobranza.diasMasAtrasada > 0 ? `, la más atrasada lleva ${dias(d.cobranza.diasMasAtrasada)}` : ''),
      url: '/erp/invoicing',
      tono: grave ? 'alerta' : 'atencion',
    });
  }

  if (d.comprasAtrasadas > 0) {
    items.push({
      clave: 'compras',
      texto: plural(d.comprasAtrasadas, 'orden de compra atrasada', 'órdenes de compra atrasadas'),
      url: '/erp/procurement',
      tono: 'atencion',
    });
  }

  if (d.cotizaciones.porVencer > 0) {
    items.push({
      clave: 'cotizaciones',
      texto:
        `${plural(d.cotizaciones.porVencer, 'cotización vence', 'cotizaciones vencen')} en ${dias(d.cotizaciones.dias)}` +
        (d.cotizaciones.monto > 0 ? ` (${dinero(d.cotizaciones.monto)})` : ''),
      url: '/erp/cotizaciones',
      tono: 'atencion',
    });
  }

  const { actividadesAtrasadas, porValidar } = d.operacion;
  if (actividadesAtrasadas > 0 || porValidar > 0) {
    const partes: string[] = [];
    if (actividadesAtrasadas > 0) partes.push(plural(actividadesAtrasadas, 'actividad atrasada', 'actividades atrasadas'));
    if (porValidar > 0) partes.push(`${plural(porValidar, 'trabajo', 'trabajos')} por validar`);
    items.push({ clave: 'operacion', texto: partes.join(' y '), url: '/erp/pizarra', tono: 'atencion' });
  }

  if (d.nomina?.listaParaRevisar) {
    items.push({
      clave: 'nomina',
      texto: `La pre-nómina de la ${d.nomina.listaParaRevisar.etiqueta} ya cerró: revísala y autoriza los pagos`,
      url: '/erp/finance/prenomina',
      tono: 'atencion',
    });
  } else if (d.nomina?.proximoCorte && d.nomina.proximoCorte.dias <= 2) {
    const { dias: faltan, etiqueta } = d.nomina.proximoCorte;
    items.push({
      clave: 'nomina',
      texto: faltan === 0 ? `Hoy es el corte de nómina (${etiqueta})` : `El corte de nómina es en ${dias(faltan)} (${etiqueta})`,
      url: '/erp/finance/prenomina',
      tono: 'info',
    });
  }

  if (items.length === 0) {
    return {
      fecha,
      vacio: true,
      prioridad: 'normal',
      titulo: 'Todo al día',
      mensaje: 'No hay nada que requiera tu atención hoy.',
      items,
    };
  }

  // Título corto con lo más importante (hasta tres): «3 por aprobar · 2 facturas vencidas · 1 OC atrasada».
  const corto: Record<ItemResumen['clave'], string | null> = {
    aprobaciones: `${d.porAprobar.cantidad} por aprobar`,
    cobranza: plural(d.cobranza.vencidas, 'factura vencida', 'facturas vencidas'),
    compras: `${d.comprasAtrasadas} ${d.comprasAtrasadas === 1 ? 'OC atrasada' : 'OC atrasadas'}`,
    cotizaciones: `${d.cotizaciones.porVencer} ${d.cotizaciones.porVencer === 1 ? 'cotización por vencer' : 'cotizaciones por vencer'}`,
    operacion: null,
    nomina: d.nomina?.listaParaRevisar ? 'pre-nómina lista' : null,
  };
  const titular = items
    .map((i) => corto[i.clave])
    .filter((t): t is string => Boolean(t))
    .slice(0, 3);
  const titulo = titular.length ? `Tu día: ${titular.join(' · ')}` : 'Tu día: hay pendientes en operación';

  const mensaje = items.map((i) => i.texto).join(' · ');
  return {
    fecha,
    vacio: false,
    prioridad: items.some((i) => i.tono === 'alerta') ? 'alta' : 'normal',
    titulo,
    mensaje: mensaje.length > 400 ? `${mensaje.slice(0, 397)}…` : mensaje,
    items,
  };
}

/** Datos en cero: punto de partida para armar el resumen y para las pruebas. */
export function datosCeoVacios(): DatosCeo {
  return {
    porAprobar: { cantidad: 0, monto: 0, masAntiguaDias: 0, masGrandes: [] },
    cobranza: { vencidas: 0, monto: 0, diasMasAtrasada: 0 },
    comprasAtrasadas: 0,
    cotizaciones: { porVencer: 0, monto: 0, dias: 3 },
    operacion: { actividadesAtrasadas: 0, porValidar: 0 },
    nomina: null,
  };
}
