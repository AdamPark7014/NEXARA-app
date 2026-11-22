import { renglonesEncimados, renglonesPorHoja, textoPorHoja } from './texto-de-pdf';
import { generatePurchaseOrderPdf, type PurchaseOrderPdfPayload } from '../../procurement/purchase-order-pdf';
import * as ordenDeCompra from '../../procurement/purchase-order-pdf';
import { PdfGeneratorService } from '../../ventas/pdf-generator.service';
import { ActivityEvidenceService } from '../../activities/evidence/activity-evidence.service';

/**
 * Los tres documentos que no usan la plantilla común de reportes y traen su propio dibujo: la orden
 * de compra, la cotización que sale de una oportunidad de Ventas y el reporte de evidencias de una
 * persona. Aquí se cuida lo que se ve al imprimirlos: que nada se encime, que nada se salga de la
 * hoja y que un documento largo pase de hoja como debe.
 */

const ANCHO_A4 = 595.28;
const ALTO_A4 = 841.89;

/** Todo el texto del documento en una línea, para buscar frases sin depender de los saltos de renglón. */
const textoDe = (pdf: Buffer) => textoPorHoja(pdf).join(' ').replace(/\s+/g, ' ');
const veces = (texto: string, frase: string) => texto.split(frase).length - 1;

/**
 * Renglones que terminan más allá del margen derecho. El ancho se estima corto a propósito (0.4 del
 * tamaño de letra por carácter; una letra real mide más), así que lo que aparece aquí se sale seguro.
 */
const fueraDelMargen = (pdf: Buffer, margen: number): string[] =>
  renglonesPorHoja(pdf).flatMap((hoja, i) =>
    hoja
      .filter((r) => r.texto.trim() && r.x + 0.4 * r.tam * r.texto.trim().length > ANCHO_A4 - margen)
      .map((r) => `hoja ${i + 1}: «${r.texto.trim()}»`),
  );

/** El renglón cuyo texto contiene la frase, en la hoja dada. */
const renglonCon = (pdf: Buffer, frase: string, hoja = 0) => {
  const r = renglonesPorHoja(pdf)[hoja]?.find((x) => x.texto.includes(frase));
  if (!r) throw new Error(`No se imprimió «${frase}» en la hoja ${hoja + 1}`);
  return r;
};

const PRODUCTOS = [
  'Cámara domo IP 4 MP con infrarrojo de 30 m y audio integrado',
  'Grabador de red de 16 canales con salida HDMI 4K',
  'Disco duro de videovigilancia de 8 TB',
  'Cable UTP categoría 6 exterior, bobina de 305 m',
  'Conector RJ45 blindado',
  'Gabinete de pared de 9 unidades',
  'Switch PoE de 16 puertos administrable',
  'Fuente de respaldo de 1500 VA',
  'Canaleta ranurada 40 x 40 mm',
];
const CANTIDADES = [12, 1, 2, 3, 100, 1, 1, 1, 20];
const PRECIOS = [1850.5, 7400, 3890, 2950, 9.5, 2100, 5200, 3100, 85];

// ─── Orden de compra ────────────────────────────────────────────────────────

const partidasDeOrden = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    description: PRODUCTOS[i % 9]!,
    sku: `SKU-${1000 + i}`,
    unit: 'PZA',
    quantity: CANTIDADES[i % 9]!,
    unitPrice: PRECIOS[i % 9]!,
    taxRate: 16,
    lineTotal: CANTIDADES[i % 9]! * PRECIOS[i % 9]!,
  }));

const orden = (cambios: Partial<PurchaseOrderPdfPayload> = {}): PurchaseOrderPdfPayload => {
  const items = cambios.items ?? partidasDeOrden(9);
  const subtotal = items.reduce((s, p) => s + p.lineTotal, 0);
  return {
    poNumber: 'PO-000128',
    status: 'CONFIRMED',
    orderDate: '2026-11-21',
    expectedDate: '2026-11-28',
    currency: 'MXN',
    paymentTerms: 'Crédito a 30 días',
    shippingAddress: 'Av. Demostración 123, Col. Centro, Puebla, Pue., C.P. 72000',
    notes: 'Entregar en horario de oficina. Favor de incluir factura y números de serie en la remisión.',
    subtotal,
    taxAmount: subtotal * 0.16,
    totalAmount: subtotal * 1.16,
    company: {
      legalName: 'Empresa Demo, S.A. de C.V.',
      tradeName: 'Empresa Demo',
      rfc: 'EDE010101AAA',
      fiscalAddress: 'Av. Demostración 123, Puebla, Pue.',
      fiscalPostalCode: '72000',
      contactEmail: 'compras@example.com',
      contactPhone: '222 000 0000',
      websiteUrl: 'https://example.com',
    },
    vendor: { name: 'Proveedor Demo, S.A. de C.V.', rfc: 'PDE020202BBB', creditoDias: 30, leadTimeDias: 5, esMayorista: true },
    createdByName: 'Persona Demo',
    approvedByName: 'Persona Demo Dos',
    approvedAt: '2026-11-21',
    requisitionNumber: 'REQ-000077',
    items,
    ...cambios,
  };
};

describe('orden de compra', () => {
  it('la tabla de partidas cabe en el ancho útil de la hoja', () => {
    const { TABLE_COLS, ANCHO_UTIL_OC } = ordenDeCompra as unknown as { TABLE_COLS: Array<{ width: number }>; ANCHO_UTIL_OC: number };
    // 3 pt de aire a cada lado de la banda.
    expect(TABLE_COLS.reduce((suma, col) => suma + col.width, 0)).toBeLessThanOrEqual(ANCHO_UTIL_OC - 6);
  });

  it('«Importe» y sus cantidades ya no se salen de la banda hacia el margen', async () => {
    const pdf = await generatePurchaseOrderPdf(orden());
    expect(fueraDelMargen(pdf, 44)).toEqual([]);
    expect(textoDe(pdf)).toContain('Importe');
  });

  it('una orden de nueve partidas cabe en una hoja: las firmas no se van solas a la segunda', async () => {
    const pdf = await generatePurchaseOrderPdf(orden());
    expect(textoPorHoja(pdf)).toHaveLength(1);
    expect(textoDe(pdf)).toContain('Acuse del proveedor');
  });

  it('dice «Tiempo de entrega», en singular cuando es un día', async () => {
    const cinco = textoDe(await generatePurchaseOrderPdf(orden()));
    expect(cinco).toContain('Tiempo de entrega: 5 días');
    expect(cinco).not.toContain('Lead time');
    const uno = textoDe(
      await generatePurchaseOrderPdf(orden({ vendor: { name: 'Proveedor Demo', leadTimeDias: 1 } })),
    );
    expect(uno).toContain('Tiempo de entrega: 1 día');
    expect(uno).not.toContain('1 días');
  });

  it('una razón social larga se imprime completa y no se encima con lo que va debajo', async () => {
    const proveedor = 'Distribuidora Nacional de Sistemas de Seguridad y Telecomunicaciones del Centro, S.A. de C.V.';
    const empresa = 'Empresa Demo de Integración de Seguridad Electrónica, Redes y Telecomunicaciones del Centro, S.A. de C.V.';
    const pdf = await generatePurchaseOrderPdf(
      orden({
        vendor: { name: proveedor, rfc: 'PDE020202BBB', creditoDias: 30, leadTimeDias: 5, esMayorista: true },
        company: {
          legalName: empresa,
          tradeName: 'Empresa Demo',
          rfc: 'EDE010101AAA',
          fiscalAddress: 'Av. Demostración 123, Puebla, Pue.',
          fiscalPostalCode: '72000',
          contactEmail: 'compras@example.com',
          contactPhone: '222 000 0000',
          websiteUrl: 'https://example.com',
        },
      }),
    );
    const texto = textoDe(pdf);
    // Cada tarjeta mide su texto con la letra con la que lo pinta: antes medía en regular de 8 y pintaba
    // en negrita de 9, y el último renglón del nombre quedaba fuera.
    expect(veces(texto, 'del Centro, S.A. de C.V.')).toBeGreaterThanOrEqual(3);
    expect(renglonesEncimados(pdf)).toEqual([]);
  });

  it('la franja de condiciones crece con lo que lleva: un texto largo no se sale de ella', async () => {
    const pdf = await generatePurchaseOrderPdf(
      orden({ paymentTerms: '50 % de anticipo con la orden, 30 % contra entrega en sitio y 20 % a 30 días de la factura' }),
    );
    expect(textoDe(pdf)).toContain('20 % a 30 días de la factura');
    // El título de la tabla queda debajo del último renglón de la franja, con aire.
    const ultimo = renglonCon(pdf, 'factura');
    const titulo = renglonCon(pdf, 'Detalle de partidas');
    expect(ultimo.y - titulo.y).toBeGreaterThanOrEqual(20);
  });

  it('una cantidad de millones se imprime entera en su renglón: no se parte ni pierde centavos', async () => {
    const items = partidasDeOrden(3);
    items[0] = { ...items[0]!, quantity: 12500, unitPrice: 9876.54, lineTotal: 123456750 };
    items[1] = { ...items[1]!, quantity: 1, unitPrice: 12345678.9, lineTotal: 12345678.9 };
    const pdf = await generatePurchaseOrderPdf(orden({ items }));
    const renglones = renglonesPorHoja(pdf)[0]!.map((r) => r.texto.trim());
    // Cada cantidad es un solo renglón del documento: PDFKit partía en dos lo que no cabía en la columna
    // y el recorte de la celda escondía el final («$12,345,678.9»).
    for (const monto of ['$123,456,750.00', '$12,345,678.90', '$9,876.54', '12,500']) expect(renglones).toContain(monto);
    expect(fueraDelMargen(pdf, 44)).toEqual([]);
  });

  it('«Enviar a» lleva a quién se entrega y la dirección corrida, no un pedazo por renglón', async () => {
    const pdf = await generatePurchaseOrderPdf(orden());
    const renglones = renglonesPorHoja(pdf)[0]!.map((r) => r.texto.trim());
    // Antes la dirección se partía en cada coma y «Pue.» quedaba solo en un renglón.
    expect(renglones).not.toContain('Pue.');
    expect(renglones).not.toContain('Puebla');
    const texto = textoDe(pdf);
    expect(texto).toMatch(/ENVIAR A Empresa Demo Av\. Demostración 123, Col\. Centro/);
    expect(texto).toContain('C.P. 72000');
  });

  it('las notas de varios renglones se imprimen completas: antes se perdía el último', async () => {
    const notas =
      'Entregar en horario de oficina. Favor de incluir factura y números de serie en la remisión. No se reciben entregas ' +
      'parciales sin aviso previo de 24 horas al responsable de almacén. El material dañado se devuelve con cargo al proveedor.';
    const texto = textoDe(await generatePurchaseOrderPdf(orden({ notes: notas })));
    expect(texto).toContain('se devuelve con cargo al proveedor.');
  });

  it('«Incoterms» solo aparece cuando la orden lo trae', async () => {
    const nacional = textoDe(await generatePurchaseOrderPdf(orden()));
    expect(nacional.toUpperCase()).not.toContain('INCOTERMS');
    expect(nacional.toUpperCase()).toContain('FECHA DE ENTREGA');
    const importada = textoDe(await generatePurchaseOrderPdf(orden({ notes: 'Entrega DAP en almacén Puebla.' })));
    expect(importada.toUpperCase()).toContain('INCOTERMS');
    expect(importada).toContain('DAP');
  });
});

// ─── Cotización de Ventas ───────────────────────────────────────────────────

const SECCIONES = {
  showClientInfo: true,
  showProjectScope: true,
  showItemsTable: true,
  showTotals: true,
  showTerms: true,
  showNotes: true,
  showPreparedBy: true,
  showValidity: true,
  showPaymentTerms: true,
  showFooterBrand: true,
};

type Partida = Record<string, unknown>;

const partidasDeCotizacion = (n: number): Partida[] =>
  Array.from({ length: n }, (_, i) => ({
    description: PRODUCTOS[i % 9],
    brand: 'Marca Demo',
    model: `MOD-${1000 + i}`,
    unit: 'PZA',
    quantity: CANTIDADES[i % 9],
    unitPrice: PRECIOS[i % 9],
    discount: i % 4 === 0 ? 5 : 0,
    tax: 16,
    ieps: 0,
    retention: 0,
    lineTotal: CANTIDADES[i % 9]! * PRECIOS[i % 9]!,
    warrantyMonths: i % 3 === 0 ? 12 : undefined,
    notes: i % 5 === 0 ? 'Incluye instalación y configuración en sitio' : undefined,
  }));

const cotizacion = (cambios: Record<string, unknown> = {}) => {
  const items = (cambios.items as Partida[] | undefined) ?? partidasDeCotizacion(6);
  const subtotal = items.reduce((s, p) => s + Number(p.lineTotal), 0);
  return {
    quoteNumber: 'COT-0012',
    date: '21 de noviembre de 2026',
    validity: '21 de diciembre de 2026',
    currency: 'MXN',
    companyName: 'Empresa Demo, S.A. de C.V.',
    companyAddress: 'Av. Demostración 123, Puebla, Pue.',
    companyEmail: 'ventas@example.com',
    companyPhone: '222 000 0000',
    companyRfc: 'EDE010101AAA',
    companyWebsite: 'example.com',
    clientName: 'Cliente Demo',
    clientCompany: 'Cliente Demo, S.A. de C.V.',
    clientRfc: 'CDE030303CCC',
    clientAddress: 'Calle Ejemplo 45, Ciudad de México',
    clientEmail: 'contacto@example.com',
    clientPhone: '55 0000 0000',
    projectName: 'Renovación de videovigilancia en sucursal centro',
    scope: 'Suministro e instalación de 12 cámaras, grabador y cableado estructurado, con puesta en marcha y capacitación.',
    paymentTerms: '50 % de anticipo y 50 % contra entrega',
    depositPercent: 50,
    deliveryTime: '10 días hábiles',
    preparedBy: 'Persona Demo',
    notes: 'Precios sujetos a cambio sin previo aviso después de la vigencia.',
    items,
    subtotal,
    discountTotal: 0,
    taxTotal: subtotal * 0.16,
    iepsTotal: 0,
    retentionTotal: 0,
    total: subtotal * 1.16,
    primaryColor: '#1F6BBA',
    footerText: undefined as string | undefined,
    ...cambios,
  };
};

const pdfDeCotizacion = (datos: ReturnType<typeof cotizacion>): Promise<Buffer> =>
  (Object.create(PdfGeneratorService.prototype) as { _buildPdf(d: unknown, s: unknown): Promise<Buffer> })._buildPdf(datos, SECCIONES);

describe('cotización de Ventas', () => {
  it('con treinta partidas pasa de hoja como debe: antes salían 85 hojas con un renglón cada una', async () => {
    const pdf = await pdfDeCotizacion(cotizacion({ items: partidasDeCotizacion(30) }));
    const hojas = textoPorHoja(pdf);
    expect(hojas.length).toBeGreaterThanOrEqual(2);
    expect(hojas.length).toBeLessThanOrEqual(3);
    const texto = textoDe(pdf);
    // Cada partida sale una vez, y el total, una sola vez al final.
    for (let i = 0; i < 30; i += 1) expect(veces(texto, `MOD-${1000 + i}`)).toBe(1);
    expect(veces(texto, 'TOTAL $')).toBe(1);
    // Cada hoja lleva su número y, si tiene partidas, el encabezado de la tabla.
    hojas.forEach((hoja, i) => {
      expect(hoja.replace(/\s+/g, ' ')).toContain(`Página ${i + 1} de ${hojas.length}`);
      if (/MOD-\d{4}/.test(hoja)) expect(hoja).toContain('DESCRIPCIÓN');
    });
    expect(renglonesEncimados(pdf)).toEqual([]);
    expect(fueraDelMargen(pdf, 40)).toEqual([]);
  });

  it('nada se imprime sobre el pie ni debajo de él', async () => {
    const pdf = await pdfDeCotizacion(cotizacion({ items: partidasDeCotizacion(30) }));
    renglonesPorHoja(pdf).forEach((hoja) => {
      const pie = hoja.find((r) => r.texto.includes('Página'));
      expect(pie).toBeDefined();
      // Lo demás queda arriba del pie (la coordenada crece hacia arriba) y dentro de la hoja.
      for (const r of hoja) {
        if (!r.texto.trim() || Math.abs(r.y - pie!.y) < 12) continue;
        expect(r.y).toBeGreaterThan(pie!.y + 12);
        expect(r.y).toBeLessThan(ALTO_A4);
      }
    });
  });

  it('una descripción larga, con garantía y nota, se lee completa y no pisa el renglón de abajo', async () => {
    const larga =
      'Cámara bala IP de 8 MP con lente motorizado de 2.8 a 12 mm, infrarrojo inteligente de 60 m, analítica de cruce de línea, ' +
      'detección de personas y vehículos, ranura para memoria de 256 GB, protección IP67 e IK10 y alimentación PoE; incluye ' +
      'caja de conexiones, base de montaje en poste y configuración en el grabador existente del sitio';
    const items = partidasDeCotizacion(4);
    items[1] = { ...items[1], description: larga, warrantyMonths: 24, notes: 'Requiere plataforma elevadora para el montaje', deliveryTime: '3 semanas' };
    const pdf = await pdfDeCotizacion(cotizacion({ items }));
    const texto = textoDe(pdf);
    expect(texto).toContain('grabador existente del sitio');
    expect(texto).toContain('Garantía: 24 meses');
    expect(texto).toContain('Entrega: 3 semanas');
    expect(texto).toContain('Requiere plataforma elevadora para el montaje');
    expect(renglonesEncimados(pdf)).toEqual([]);
    expect(textoPorHoja(pdf)).toHaveLength(1);
  });

  it('los datos largos de la empresa y del cliente bajan de renglón sin encimarse ni meterse bajo el recuadro del folio', async () => {
    const pdf = await pdfDeCotizacion(
      cotizacion({
        companyName: 'Empresa Demo de Integración de Seguridad Electrónica y Redes, S.A. de C.V.',
        companyAddress: 'Avenida de la Demostración Poniente 1234, interior 5, colonia Centro Histórico, Puebla, Puebla, C.P. 72000',
        clientCompany: 'Cliente Demo Operadora de Centros Comerciales y Desarrollos Inmobiliarios del Sureste, S.A.P.I. de C.V.',
        clientAddress: 'Boulevard del Ejemplo Norte 4567, torre B, piso 12, colonia Las Demostraciones, alcaldía Ejemplo, Ciudad de México, C.P. 01000',
      }),
    );
    const texto = textoDe(pdf);
    expect(texto).toContain('C.P. 72000');
    expect(texto).toContain('C.P. 01000');
    expect(renglonesEncimados(pdf)).toEqual([]);
    // El recuadro del folio empieza en x = 365: lo que arranca a su izquierda en la banda termina antes.
    const banda = renglonesPorHoja(pdf)[0]!.filter((r) => r.y > ALTO_A4 - 93 && r.x < 355 && r.texto.trim());
    for (const r of banda) expect(r.x + 0.4 * r.tam * r.texto.trim().length).toBeLessThanOrEqual(355);
  });

  it('una cantidad de millones se imprime entera en su renglón, y el encabezado de la tabla, completo', async () => {
    const items = partidasDeCotizacion(3);
    items[0] = { ...items[0], quantity: 1250, unitPrice: 9876.54, lineTotal: 12345675 };
    items[1] = { ...items[1], quantity: 1, unitPrice: 1234567.89, lineTotal: 1234567.89 };
    const pdf = await pdfDeCotizacion(cotizacion({ items, subtotal: 123456789.12, taxTotal: 19753086.26, total: 143209875.38 }));
    const renglones = renglonesPorHoja(pdf)[0]!.map((r) => r.texto.trim());
    for (const dato of ['$12,345,675.00', '$1,234,567.89', '$9,876.54', '1,250', '$123,456,789.12 MXN', '$143,209,875.38 MXN', 'MARCA / MODELO', 'PRECIO UNIT.']) {
      expect(renglones).toContain(dato);
    }
    expect(fueraDelMargen(pdf, 40)).toEqual([]);
  });

  it('el IVA lleva su tasa solo cuando todas las partidas comparten la misma', async () => {
    expect(textoDe(await pdfDeCotizacion(cotizacion()))).toContain('IVA 16 %');
    const mixtas = partidasDeCotizacion(4).map((p, i) => ({ ...p, tax: i === 0 ? 8 : 16 }));
    const texto = textoDe(await pdfDeCotizacion(cotizacion({ items: mixtas })));
    expect(texto).not.toContain('IVA 16');
    expect(texto).toMatch(/\bIVA \$/);
  });

  it('un pie de plantilla muy largo no abre hojas de más', async () => {
    const pie = 'Empresa Demo agradece su preferencia. '.repeat(18).trim();
    const pdf = await pdfDeCotizacion(cotizacion({ footerText: pie }));
    expect(textoPorHoja(pdf)).toHaveLength(1);
    expect(textoDe(pdf)).toContain('Página 1 de 1');
  });

  it('la orden de venta se llama así también en el pie', async () => {
    const texto = textoDe(await pdfDeCotizacion(cotizacion({ quoteNumber: 'ORD-45', validity: undefined })));
    expect(texto).toContain('ORDEN DE VENTA');
    expect(texto).toContain('Orden de venta ORD-45');
    expect(texto).not.toContain('Propuesta comercial');
  });
});

// ─── Reporte de evidencias ──────────────────────────────────────────────────

const TITULOS = [
  'Instalación de cámaras día 1: 10 cámaras en planta baja, canalización y pruebas de enlace con el centro de monitoreo',
  'Mantenimiento preventivo de control de acceso',
  'Revisión de enlace y reemplazo de fuente',
  'Levantamiento para cotización de red',
];

const evidencia = (i: number, estado: string, fotos = 0) => ({
  id: i,
  activityId: 100 + i,
  reviewStatus: estado,
  completedAt: new Date(`2026-11-${10 + i}T22:30:00.000Z`),
  updatedAt: new Date(`2026-11-${10 + i}T22:30:00.000Z`),
  createdAt: new Date(`2026-11-${10 + i}T15:00:00.000Z`),
  entryPhotoUrl: fotos ? `/uploads/activities/demo/entrada-${i}.jpg` : null,
  exitPhotoUrl: fotos ? `/uploads/activities/demo/salida-${i}.jpg` : null,
  serviceSheetPdfUrl: null,
  evidencePhotos: Array.from({ length: Math.max(0, fotos - 2) }, (_, n) => `/uploads/activities/demo/foto-${i}-${n}.jpg`),
  reviewNotes: null,
  activity: {
    anNumber: `AN-00${40 + i}`,
    titulo: TITULOS[(i - 1) % 4],
    branchName: 'Sucursal Demo',
    branchCity: 'Puebla',
    branchState: 'Puebla',
    estatus: 'Finalizada',
    prioridad: 'MEDIA',
    responsable: { nombre: 'Persona Demo' },
  },
});

const NOVIEMBRE = { desde: '2026-11-01', hasta: '2026-11-21' };

const reporteDeEvidencias = (filas: unknown[], periodo: { desde?: string; hasta?: string } = NOVIEMBRE) => {
  const servicio = Object.create(ActivityEvidenceService.prototype) as ActivityEvidenceService;
  (servicio as unknown as { prisma: unknown }).prisma = { activityEvidence: { findMany: async () => filas } };
  return servicio.generateOwnHistorySummaryReport(1, periodo.desde, periodo.hasta);
};

describe('reporte de evidencias', () => {
  const cuatro = [evidencia(1, 'APPROVED'), evidencia(2, 'APPROVED'), evidencia(3, 'REJECTED'), evidencia(4, 'PENDING')];

  it('el título ya no se encima con el subtítulo y el periodo se escribe como fecha', async () => {
    const pdf = await reporteDeEvidencias(cuatro);
    expect(renglonesEncimados(pdf)).toEqual([]);
    const texto = textoDe(pdf);
    expect(texto).toContain('Periodo: 01/11/2026 al 21/11/2026');
    expect(texto).not.toContain('2026-11-01');
    expect(texto).not.toContain('2026-11-21');
  });

  it('sin fechas dice «Todos los registros», no «inicio a hoy»', async () => {
    const texto = textoDe(await reporteDeEvidencias(cuatro, {}));
    expect(texto).toContain('Periodo: Todos los registros');
    expect(texto).not.toContain('inicio a hoy');
  });

  it('el nombre largo de una actividad se imprime entero y su renglón crece', async () => {
    const pdf = await reporteDeEvidencias(cuatro);
    const texto = textoDe(pdf);
    expect(texto).toContain('pruebas de enlace con el centro de monitoreo');
    expect(texto).not.toContain('...');
    expect(renglonesEncimados(pdf)).toEqual([]);
    // 22:30 UTC son las 4:30 de la tarde en México.
    expect(texto).toContain('11/11/2026');
  });

  it('las actividades sin archivos no abren una hoja en blanco cada una', async () => {
    const pdf = await reporteDeEvidencias(cuatro);
    expect(textoPorHoja(pdf)).toHaveLength(1);
  });

  it('cada actividad con archivos lleva su hoja de detalle, con prioridad legible y número de hoja', async () => {
    const pdf = await reporteDeEvidencias([evidencia(1, 'APPROVED', 3), evidencia(2, 'REJECTED', 2), evidencia(3, 'PENDING')]);
    const hojas = textoPorHoja(pdf).map((h) => h.replace(/\s+/g, ' '));
    expect(hojas).toHaveLength(3);
    hojas.forEach((hoja, i) => expect(hoja).toContain(`Página ${i + 1} de 3`));
    expect(hojas[1]).toContain('AN-0041');
    expect(hojas[1]).toContain('Prioridad: Media');
    expect(hojas[1]).not.toContain('MEDIA');
    expect(hojas[2]).toContain('AN-0042');
    expect(renglonesEncimados(pdf)).toEqual([]);
  });

  it('caben seis archivos por hoja de detalle', async () => {
    // Ocho archivos: seis en la primera hoja de detalle y dos en su continuación.
    const pdf = await reporteDeEvidencias([evidencia(1, 'APPROVED', 8)]);
    const hojas = textoPorHoja(pdf).map((h) => h.replace(/\s+/g, ' '));
    expect(hojas).toHaveLength(3);
    expect(veces(hojas[1]!, 'Archivo no disponible')).toBe(6);
    expect(veces(hojas[2]!, 'Archivo no disponible')).toBe(2);
    expect(hojas[2]).toContain('Detalle de evidencias (continuación)');
    expect(hojas[2]).toContain('AN-0041');
  });

  it('sin actividades en el periodo lo dice en una sola hoja', async () => {
    const pdf = await reporteDeEvidencias([]);
    expect(textoPorHoja(pdf)).toHaveLength(1);
    expect(textoDe(pdf)).toContain('No hay actividades con evidencia en este periodo.');
  });
});

// ─── Tipografía ─────────────────────────────────────────────────────────────

describe('tipografía de los documentos', () => {
  it('ninguno de los tres pide Helvetica: usan Montserrat e Inter como el resto de la plataforma', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const src = path.resolve(__dirname, '../..');
    const archivos = [
      'procurement/purchase-order-pdf.ts',
      'ventas/pdf-generator.service.ts',
      'ventas/cotizacion-ventas-pdf.ts',
      'activities/evidence/activity-evidence.service.ts',
      'activities/evidence/reporte-historial-evidencias-pdf.ts',
    ];
    const conHelvetica = archivos.filter((archivo) => /['"`]Helvetica/.test(fs.readFileSync(path.join(src, archivo), 'utf8')));
    expect(conHelvetica).toEqual([]);
  });

  it('los tres embeben las fuentes corporativas', async () => {
    const documentos = [
      await generatePurchaseOrderPdf(orden()),
      await pdfDeCotizacion(cotizacion()),
      await reporteDeEvidencias([evidencia(1, 'APPROVED')]),
    ];
    for (const pdf of documentos) {
      const crudo = pdf.toString('latin1');
      expect(crudo).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter/);
      expect(crudo).toMatch(/\/BaseFont \/[A-Z]{6}\+Montserrat/);
      expect(crudo).not.toMatch(/\/BaseFont \/Helvetica/);
    }
  });
});
