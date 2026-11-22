import { textoPorHoja } from './texto-de-pdf';
import { generateSalesOrderPdf } from '../../ventas/sales-order-pdf';
import { generateSalesReportPdf } from '../../ventas/sales-report-pdf';
import { generateProcurementDashboardPdf } from '../../procurement/procurement-dashboard-pdf';
import { generateGoodsReceiptPdf } from '../../procurement/goods-receipt-pdf';
import { generateViaticsReportPdf } from '../../viaticos/viatics-report-pdf';
import { generateActivitiesReportPdf } from '../../activities/activities-report-pdf';
import { generateStockMovementsPdf, generateStockMovementSlipPdf } from '../../warehouse/stock-movement-pdf';
import { generateContractPdf } from '../../maintenance-contracts/maintenance-contract-pdf';
import { generateClientReportPdf } from '../../service-clients/client-report-pdf';
import { generateServiceSheetPdf } from '../../service-sheets/service-sheet-pdf';

/** Todo el texto del documento en una línea, para buscar frases sin depender de los saltos de renglón. */
const textoDe = (pdf: Buffer) => textoPorHoja(pdf).join(' ').replace(/\s+/g, ' ');
const veces = (texto: string, frase: string) => texto.split(frase).length - 1;

describe('orden de venta', () => {
  it('ya no se guarda vacía: espera a que el documento termine de escribirse', async () => {
    const pdf = await generateSalesOrderPdf({
      orderId: 'OV-2026-0031',
      orderDate: new Date('2026-11-22T01:30:00.000Z'),
      projectName: 'Videovigilancia Hotel Demo',
      clientName: 'Persona de Ejemplo',
      clientEmail: 'compras@example.com',
      budget: 402000,
      costProducts: 221000,
      costViaticos: 12500,
      costOperativo: 48000,
      margin: 120500,
    });
    expect(pdf.length).toBeGreaterThan(20_000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    const texto = textoDe(pdf);
    expect(texto).toContain('OV-2026-0031');
    // 01:30 UTC del 22 es todavía el 21 en México.
    expect(texto).toContain('Fecha: 21/11/2026');
    expect(texto).toContain('Margen libre');
  });
});

describe('reportes de compras', () => {
  it('el tablero imprime los estatus con el nombre de la pantalla, no el valor interno', async () => {
    const pdf = await generateProcurementDashboardPdf({
      fromDate: '2026-11-01',
      toDate: '2026-11-21',
      pendingRequisitions: 1,
      activePurchaseOrders: 2,
      overdueDeliveries: 0,
      totalSpend: 142050.75,
      topSuppliers: [{ supplierName: 'Distribuidora Demo', evaluationCount: 3, avgScore: 4.6 }],
      requisitions: [
        { id: 31, title: 'Cable UTP', description: null, priority: 'URGENT', createdAt: new Date('2026-11-19T01:30:00.000Z'), status: 'SUBMITTED' },
      ],
      orders: [
        { id: 104, supplierName: 'Distribuidora Demo', orderDate: new Date('2026-11-10T00:00:00.000Z'), expectedDate: null, totalAmount: 118400, status: 'PARTIALLY_RECEIVED' },
        { id: 105, supplierName: 'Cables Ejemplo', orderDate: new Date('2026-11-15T00:00:00.000Z'), expectedDate: null, totalAmount: 23650.75, status: 'DRAFT' },
      ],
    } as never);
    const texto = textoDe(pdf);
    expect(texto).toContain('Órdenes de compra');
    expect(texto).toContain('Recibida en parte');
    expect(texto).toContain('Por aprobar');
    expect(texto).toContain('Urgente');
    expect(texto).toContain('Calificación');
    expect(texto).toContain('Periodo: 01/11/2026 al 21/11/2026');
    // La fecha de la orden es un día de calendario; la de la requisición, un instante de las 7:30 p. m. del 18.
    expect(texto).toContain('10/11/2026');
    expect(texto).toContain('18/11/2026');
    for (const crudo of ['Sent', 'Draft', 'Partially', 'Submitted', 'Urgent ', 'Ordenes', 'evaluacion']) {
      expect(texto).not.toContain(crudo);
    }
  });

  it('la recepción ya no habla de «landed cost»', async () => {
    const pdf = await generateGoodsReceiptPdf({
      receiptNumber: 'REC-2026-0042',
      receiptDate: '2026-11-20',
      companyName: 'Empresa Demo',
      freightCost: 850,
      insuranceCost: 0,
      customsCost: 0,
      otherLandedCost: 120,
      items: [{ sku: 'CAM-IP-4MP', description: 'Cámara IP', quantityReceived: 12, quantityRejected: 2, landedCostAllocated: 60 }],
    });
    const texto = textoDe(pdf);
    expect(texto).toContain('Costo adicional');
    expect(texto).toContain('Rechazado');
    expect(texto.toLowerCase()).not.toContain('landed');
  });
});

describe('reporte comercial', () => {
  it('etapas y estados de proyecto en español', async () => {
    const pdf = await generateSalesReportPdf({
      generatedAt: new Date('2026-11-21T15:00:00.000Z'),
      rangeLabel: '01/11/2026 al 21/11/2026',
      totals: { leads: 3, opportunities: 2, won: 1, lost: 0, pipelineValue: 500000, expectedValue: 200000, projects: 1, totalMargin: 80000, quotes: 2, clients: 2 },
      byStage: [{ stage: 'NEGOTIATION', count: 1, value: 300000 }],
      byLeadSource: [{ source: 'Sitio web', count: 3 }],
      marginByStatus: [{ status: 'IN_PROGRESS', margin: 80000 }],
      topOpportunities: [{ title: 'Control de acceso', value: 300000, stage: 'PROPOSAL', probability: 60 }],
    });
    const texto = textoDe(pdf);
    expect(texto).toContain('Negociación');
    expect(texto).toContain('Cotización');
    expect(texto).toContain('En curso');
    for (const crudo of ['NEGOTIATION', 'PROPOSAL', 'IN_PROGRESS', 'Top oportunidades']) {
      expect(texto).not.toContain(crudo);
    }
  });
});

describe('reportes de viáticos y de actividades', () => {
  const viaticos = (filas: number) =>
    generateViaticsReportPdf({
      title: 'Control de viáticos',
      periodLabel: '01/11/2026 al 21/11/2026',
      generatedAt: '21 nov 2026, 06:30 p.m.',
      preparedBy: 'Persona Demo',
      currency: 'MXN',
      totalSolicitado: 18650,
      totalAprobado: 15200,
      totalPagado: 9800,
      byProject: [{ name: 'Proyecto demo', total: 9800, count: 4 }],
      byPerson: [{ name: 'Persona Demo', total: 9800, count: 4 }],
      byCategory: [{ name: 'COMBUSTIBLE', total: 6200, count: 5 }],
      rows: Array.from({ length: filas }, (_, i) => ({
        id: 200 + i,
        fecha: '10/11/2026',
        solicitante: 'Persona Demo',
        proyecto: 'Proyecto demo',
        categoria: 'ALIMENTACION',
        monto: 850,
        estatus: 'Aprobado_Coordinador',
        contabilidadRef: '',
        motivo: 'Traslado a sitio',
      })),
    });

  it('categoría y estatus como en pantalla', async () => {
    const texto = textoDe(await viaticos(2));
    expect(texto).toContain('Combustible');
    expect(texto).toContain('Alimentación');
    expect(texto).toContain('Aprobado por');
    expect(texto).not.toContain('Aprobado_Coordinador');
    expect(texto).not.toContain('ALIMENTACION');
    expect(texto).not.toContain('Página');
  });

  it('con varias hojas, cada una lleva su pie y su número', async () => {
    const hojas = textoPorHoja(await viaticos(60));
    expect(hojas.length).toBeGreaterThan(2);
    hojas.forEach((hoja, i) => {
      const texto = hoja.replace(/\s+/g, ' ');
      expect(texto).toContain('NEXARA · Control de viáticos');
      expect(texto).toContain(`Página ${i + 1} de ${hojas.length}`);
    });
    // La última hoja trae contenido, no solo el pie.
    expect(hojas[hojas.length - 1]).toContain('Resumen financiero');
  });

  it('el reporte de actividades junta el mismo estatus escrito de dos formas y no abre una hoja en blanco', async () => {
    const pdf = await generateActivitiesReportPdf({
      title: 'Reporte de actividades',
      periodLabel: '15/11/2026 al 21/11/2026',
      generatedAt: '21 nov 2026, 06:30 p.m.',
      total: 6,
      abiertas: 0,
      enProceso: 6,
      finalizadas: 0,
      byStatus: [
        { name: 'En Proceso', count: 4 },
        { name: 'EN_PROCESO', count: 2 },
      ],
      byPriority: [{ name: 'Alta', count: 6 }],
      rows: [
        { an: 'AN-1200', fecha: '15/11/2026', titulo: 'Mantenimiento de cámaras', cliente: 'Hotel Demo', responsable: 'Persona Demo', estatus: 'En Proceso', prioridad: 'Alta' },
      ],
    });
    const hojas = textoPorHoja(pdf);
    expect(hojas).toHaveLength(1);
    const texto = textoDe(pdf);
    expect(texto).toContain('Detalle de actividades');
    expect(texto).not.toContain('EN_PROCESO');
    expect(texto).not.toContain('En Proceso');
    expect(texto).not.toMatch(/\bOT\b/);
  });
});

describe('documentos de almacén', () => {
  const movimiento = {
    movementNumber: 'MOV-2026-0301',
    type: 'DISPATCH',
    typeLabel: 'Salida',
    sku: 'CAM-IP-4MP',
    productName: 'Cámara IP',
    fromWarehouse: 'Almacén central',
    toWarehouse: null,
    quantity: 3,
    balanceLabel: '39 pzas',
    reference: 'AN-1203',
    totalCost: 4350,
    // 7:30 de la tarde del 20 de noviembre en México.
    createdAt: '2026-11-21T01:30:00.000Z',
    createdByName: 'Persona Demo',
  };

  it('la hora del movimiento es la de la empresa', async () => {
    const pdf = await generateStockMovementsPdf({
      title: 'Movimientos de almacén',
      companyName: 'Empresa Demo',
      generatedAt: '2026-11-21T02:00:00.000Z',
      rows: [movimiento, { ...movimiento, movementNumber: 'MOV-2026-0302', type: 'TRANSFER', typeLabel: 'Traspaso', toWarehouse: 'Camioneta 3' }],
    });
    const texto = textoDe(pdf);
    expect(texto).toContain('20 nov 2026');
    expect(texto).toContain('07:30');
    expect(texto).toContain('Generado: 20 nov 2026, 08:00');
    expect(texto).not.toContain('01:30');
    // Un traspaso dice de dónde a dónde con un signo que la fuente sí tiene.
    expect(texto).toContain('›');
    expect(texto).not.toContain('→');
  });

  it('el comprobante trae dónde firman quien entrega y quien recibe', async () => {
    const pdf = await generateStockMovementSlipPdf({ ...movimiento, companyName: 'Empresa Demo', notes: 'Sale para instalación.' });
    const texto = textoDe(pdf);
    expect(texto).toContain('Entrega');
    expect(texto).toContain('Recibe');
    expect(texto).toContain('Nombre y firma');
    expect(textoPorHoja(pdf)).toHaveLength(1);
  });
});

describe('documentos de servicio', () => {
  it('el contrato imprime estatus y visitas en español y la vigencia completa', async () => {
    const pdf = await generateContractPdf({
      contractNumber: 'CM-2026-0007',
      title: 'Mantenimiento preventivo',
      startDate: '2026-12-01T00:00:00.000Z',
      endDate: '2027-11-30T00:00:00.000Z',
      frequencyMonths: 3,
      status: 'ACTIVE',
      clientName: 'Hotel Demo',
      monthlyAmount: 6500,
      visits: [
        { scheduledDate: '2026-12-10T00:00:00.000Z', description: 'Primera visita', status: 'SCHEDULED' },
        { scheduledDate: '2026-09-10T00:00:00.000Z', description: null, status: 'COMPLETED' },
      ],
    });
    const texto = textoDe(pdf);
    expect(texto).toContain('Estatus: Vigente');
    expect(texto).toContain('Programada');
    expect(texto).toContain('Realizada');
    expect(texto).toContain('Vigencia');
    expect(texto).toContain('01 de diciembre de 2026 al 30 de');
    for (const crudo of ['ACTIVE', 'SCHEDULED', 'COMPLETED']) expect(texto).not.toContain(crudo);
  });

  it('el reporte al cliente no deja una sección de evidencias vacía ni repite títulos', async () => {
    const pdf = await generateClientReportPdf({
      clientName: 'Hotel Demo',
      generatedAt: new Date('2026-11-21T18:30:00.000Z'),
      totalTickets: 1,
      closedTickets: 0,
      activities: [
        { anNumber: 'AN-1201', titulo: 'Cámara sin imagen', estatus: 'En Proceso', prioridad: 'Media', ticketType: 'CORRECTIVO', branchName: 'Sucursal Centro', startedAt: new Date('2026-11-20T15:05:00.000Z'), responsableName: 'Persona Demo' },
      ],
    });
    const texto = textoDe(pdf);
    expect(texto).toContain('Folio');
    expect(texto).toContain('Correctivo');
    expect(texto).toContain('Aún en atención');
    expect(texto).not.toContain('Evidencias por ticket');
    expect(texto).not.toContain('CORRECTIVO');
    expect(veces(texto, 'Detalle completo por ticket')).toBe(1);
  });

  it('la hoja de servicio no repite el título de una sección al saltar de hoja', async () => {
    const pdf = await generateServiceSheetPdf({
      anNumber: 'AN-1203',
      clientName: 'Hotel Demo',
      ticketType: 'CORRECTIVO',
      workSummary: 'Se reemplazó la cámara del acceso principal.',
      // Suficientes equipos para que «Observaciones» caiga en la hoja siguiente.
      equipmentList: Array.from({ length: 24 }, (_, i) => ({ name: `Cámara ${i + 1}`, model: 'BL-4MP', serial: `SN-${1000 + i}`, action: 'Limpieza' })),
      observations: 'Revisar el cableado del estacionamiento.',
      signedName: 'Persona de Ejemplo',
      survey: { engineerIdentified: true, friendlyAttention: true, solutionSatisfied: false, notes: 'Llegaron una hora tarde.' },
    });
    const hojas = textoPorHoja(pdf);
    expect(hojas.length).toBeGreaterThan(1);
    const texto = textoDe(pdf);
    expect(texto).toContain('Tipo: Correctivo');
    // «Observaciones adicionales» es un renglón de la encuesta, no el título de la sección.
    const sinRenglonDeEncuesta = texto.replace('Observaciones adicionales', '');
    for (const titulo of ['Observaciones', 'Firma digital', 'Encuesta de calidad']) {
      expect([titulo, veces(sinRenglonDeEncuesta, titulo)]).toEqual([titulo, 1]);
    }
    hojas.forEach((hoja, i) => expect(hoja.replace(/\s+/g, ' ')).toContain(`Página ${i + 1} de ${hojas.length}`));
  });
});
