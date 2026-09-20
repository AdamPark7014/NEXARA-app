import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { crearReporte, EXCEL_COLORES, aDiaExcel, aFechaExcel, etiquetaGenerica } from './reporte-excel.js';
import {
  COLUMNAS_ACTIVIDADES,
  COLUMNAS_ASISTENCIA_HIBRIDA,
  COLUMNAS_EVIDENCIAS,
  COLUMNAS_KPIS_DIAS,
  COLUMNAS_KPIS_PERSONAS,
  COLUMNAS_VEHICULOS,
  COLUMNAS_VIATICOS,
  REPORTES_POR_ENTIDAD,
} from './reportes.js';

/**
 * El tema Excel se prueba abriendo el archivo que produce, no mirando el código: se
 * escribe el libro, se vuelve a leer con ExcelJS y se comprueba encabezado, congelado,
 * autofiltro, formatos, fórmulas de totales, anchos e impresión.
 *
 * Con `EXCEL_MUESTRAS_DIR` apuntando a una carpeta, además deja ahí una muestra de cada
 * reporte para abrirla a mano.
 */

const MUESTRAS = process.env.EXCEL_MUESTRAS_DIR;

async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

function guardarMuestra(nombre: string, buffer: Buffer): void {
  if (!MUESTRAS) return;
  fs.mkdirSync(MUESTRAS, { recursive: true });
  fs.writeFileSync(path.join(MUESTRAS, nombre), buffer);
}

/** Fila de encabezado: la primera con el relleno teal. */
function filaEncabezado(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r += 1) {
    const fill = ws.getRow(r).getCell(1).fill as ExcelJS.FillPattern | undefined;
    if (fill?.fgColor?.argb === EXCEL_COLORES.teal && ws.getRow(r).getCell(1).value) return r;
  }
  throw new Error('no se encontró la fila de encabezado');
}

const GENERADO_EN = new Date('2026-09-19T15:30:00.000Z');

describe('crearReporte · tema Excel corporativo', () => {
  const columnas = [
    { clave: 'folio', titulo: 'Folio' },
    { clave: 'cliente', titulo: 'Cliente' },
    { clave: 'estatus', titulo: 'Estatus', etiquetas: { EN_PROCESO: 'En proceso' } },
    { clave: 'emitida', titulo: 'Emitida', tipo: 'fecha' as const },
    { clave: 'cerrada', titulo: 'Cerrada', tipo: 'fechaHora' as const },
    { clave: 'total', titulo: 'Total', tipo: 'dinero' as const, total: 'suma' as const },
    { clave: 'avance', titulo: 'Avance', tipo: 'porcentaje' as const },
    { clave: 'minutos', titulo: 'Duración', tipo: 'duracion' as const, total: 'suma' as const },
    { clave: 'urgente', titulo: 'Urgente', tipo: 'booleano' as const },
  ];
  const filas = [
    {
      folio: 'AN-0001',
      cliente: 'Comercializadora del Valle',
      estatus: 'EN_PROCESO',
      emitida: '2026-09-01',
      cerrada: '2026-09-03T20:15:00.000Z',
      total: 12500.5,
      avance: 72,
      minutos: 155,
      urgente: true,
    },
    {
      folio: 'AN-0002',
      cliente: 'Grupo Industrial Puebla',
      estatus: 'FINALIZADA',
      // Como la devuelve Prisma para una columna `@db.Date`.
      emitida: new Date('2026-09-05T00:00:00.000Z'),
      cerrada: null,
      total: 3400,
      avance: 100,
      minutos: 90,
      urgente: false,
    },
  ];

  let wb: ExcelJS.Workbook;
  let ws: ExcelJS.Worksheet;
  let encabezado: number;

  beforeAll(async () => {
    const buffer = await crearReporte({
      titulo: 'Reporte de prueba',
      subtitulo: 'Del 01/09/2026 al 30/09/2026',
      hoja: 'Prueba',
      columnas,
      filas,
      generadoPor: 'Adam Pozo',
      generadoEn: GENERADO_EN,
      filtros: [{ etiqueta: 'Cliente', valor: 'Todos' }],
      notas: ['Muestra generada por la prueba automática.'],
    });
    guardarMuestra('00-tema-base.xlsx', buffer);
    wb = await abrir(buffer);
    ws = wb.getWorksheet('Prueba')!;
    encabezado = filaEncabezado(ws);
  });

  it('pone el logo NEXARA y la banda de título antes del encabezado', () => {
    expect(wb.model.media?.length).toBeGreaterThan(0);
    expect(ws.getImages().length).toBe(1);
    const textos = [];
    for (let r = 1; r < encabezado; r += 1) textos.push(String(ws.getRow(r).getCell(1).value ?? ''));
    expect(textos).toContain('Reporte de prueba');
    expect(textos).toContain('Del 01/09/2026 al 30/09/2026');
    expect(textos.some((t) => t.startsWith('Generado por Adam Pozo · '))).toBe(true);
    expect(textos.some((t) => t.includes('Cliente: Todos'))).toBe(true);
  });

  it('el título va a 16 pt en negrita y la línea de generación en gris pequeño', () => {
    const filaTitulo = 2;
    expect(ws.getRow(filaTitulo).getCell(1).value).toBe('Reporte de prueba');
    expect(ws.getRow(filaTitulo).getCell(1).font).toMatchObject({ size: 16, bold: true });
    const filaGenerado = encabezado - 2;
    expect(ws.getRow(filaGenerado).getCell(1).font).toMatchObject({
      size: 9,
      italic: true,
      color: { argb: EXCEL_COLORES.grisSuave },
    });
  });

  it('el encabezado es teal con texto blanco en negrita a 10 pt', () => {
    const fila = ws.getRow(encabezado);
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      expect(celda.value).toBe(c.titulo);
      expect(celda.font).toMatchObject({ bold: true, size: 10, color: { argb: 'FFFFFFFF' } });
      expect((celda.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(EXCEL_COLORES.teal);
    });
  });

  it('congela debajo del encabezado y pone autofiltro sobre los datos', () => {
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: encabezado });
    // Al releer, ExcelJS devuelve el rango como cadena: A7:I9 con 9 columnas y 2 filas.
    expect(ws.autoFilter).toBe(`A${encabezado}:I${encabezado + filas.length}`);
  });

  it('aplica los formatos de número en español', () => {
    const fila = ws.getRow(encabezado + 1);
    expect(fila.getCell(4).numFmt).toBe('dd/mm/yyyy');
    expect(fila.getCell(5).numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(fila.getCell(6).numFmt).toBe('"$" #,##0.00');
    expect(fila.getCell(6).value).toBe(12500.5);
    expect(fila.getCell(7).numFmt).toBe('0 %');
    // El porcentaje se guarda como fracción para que Excel lo trate como tal.
    expect(fila.getCell(7).value).toBeCloseTo(0.72, 5);
    expect(fila.getCell(8).numFmt).toBe('[h]:mm');
    // Con `[h]:mm` ExcelJS relee el serial como fecha: 155 min desde el epoch de Excel.
    expect((fila.getCell(8).value as Date).toISOString()).toBe('1899-12-30T02:35:00.000Z');
  });

  it('traduce las claves de enum y los booleanos', () => {
    expect(ws.getRow(encabezado + 1).getCell(3).value).toBe('En proceso');
    expect(ws.getRow(encabezado + 1).getCell(9).value).toBe('Sí');
    expect(ws.getRow(encabezado + 2).getCell(9).value).toBe('No');
    // Sin entrada en el mapa, cae al prettificador genérico.
    expect(ws.getRow(encabezado + 2).getCell(3).value).toBe('Finalizada');
  });

  it('escribe la fecha en hora de México, no en UTC', () => {
    // 2026-09-03T20:15Z son las 14:15 en México: el día no debe correrse.
    const celda = ws.getRow(encabezado + 1).getCell(5).value as Date;
    expect(celda.toISOString()).toBe('2026-09-03T14:15:00.000Z');
  });

  it('un AAAA-MM-DD se queda en su día, no retrocede al anterior', () => {
    // «2026-09-01» leído como medianoche UTC y pasado a México caía en 31/08 a las 18:00.
    const celda = ws.getRow(encabezado + 1).getCell(4).value as Date;
    expect(celda.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('una columna @db.Date (medianoche UTC) tampoco retrocede', () => {
    const celda = ws.getRow(encabezado + 2).getCell(4).value as Date;
    expect(celda.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  it('los datos llevan filete inferior y 10 pt', () => {
    const celda = ws.getRow(encabezado + 1).getCell(1);
    expect(celda.font).toMatchObject({ size: 10 });
    expect(celda.border?.bottom).toMatchObject({ style: 'hair' });
  });

  it('la fila de totales usa fórmulas SUM reales, no valores pegados', () => {
    const totales = ws.getRow(encabezado + filas.length + 1);
    expect(totales.getCell(1).value).toBe('Total');
    expect(totales.getCell(1).font?.bold).toBe(true);
    const dinero = totales.getCell(6).value as ExcelJS.CellFormulaValue;
    expect(dinero.formula).toBe(`SUM(F${encabezado + 1}:F${encabezado + filas.length})`);
    expect(totales.getCell(6).numFmt).toBe('"$" #,##0.00');
    const duracion = totales.getCell(8).value as ExcelJS.CellFormulaValue;
    expect(duracion.formula).toBe(`SUM(H${encabezado + 1}:H${encabezado + filas.length})`);
    expect(totales.getCell(8).numFmt).toBe('[h]:mm');
    expect(totales.getCell(6).border?.top).toMatchObject({ style: 'medium' });
  });

  it('calcula anchos de columna entre el mínimo y el tope', () => {
    const anchos = columnas.map((_, i) => ws.getColumn(i + 1).width ?? 0);
    expect(Math.min(...anchos)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...anchos)).toBeLessThanOrEqual(46);
    // «Comercializadora del Valle» pide más que «Folio».
    expect(ws.getColumn(2).width!).toBeGreaterThan(ws.getColumn(1).width!);
  });

  it('deja el libro listo para imprimir', () => {
    expect(ws.pageSetup.orientation).toBe('landscape'); // 9 columnas
    expect(ws.pageSetup.fitToPage).toBe(true);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.printTitlesRow).toBe(`${encabezado}:${encabezado}`);
    expect(ws.pageSetup.margins?.left).toBeCloseTo(0.4, 2);
    expect(ws.headerFooter.oddFooter).toContain('Página &P de &N');
  });

  it('añade la hoja «Información» con filtros y notas', () => {
    const info = wb.getWorksheet('Información');
    expect(info).toBeDefined();
    const pares = new Map<string, string>();
    info!.eachRow((fila) => pares.set(String(fila.getCell(1).value ?? ''), String(fila.getCell(2).value ?? '')));
    expect(pares.get('Reporte')).toBe('Reporte de prueba');
    expect(pares.get('Generado por')).toBe('Adam Pozo');
    expect(pares.get('Cliente')).toBe('Todos');
    expect(pares.get('Nota')).toBe('Muestra generada por la prueba automática.');
  });

  it('sin filas escribe un aviso en vez de una hoja vacía y no pone autofiltro', async () => {
    const buffer = await crearReporte({
      titulo: 'Reporte vacío',
      hoja: 'Vacío',
      columnas,
      filas: [],
      generadoEn: GENERADO_EN,
    });
    const libro = await abrir(buffer);
    const hoja = libro.getWorksheet('Vacío')!;
    const r = filaEncabezado(hoja);
    expect(hoja.getRow(r + 1).getCell(1).value).toBe('Sin registros para los filtros aplicados');
    expect(hoja.autoFilter).toBeUndefined();
  });

  it('recorta y desambigua los nombres de pestaña que Excel no admite', async () => {
    const buffer = await crearReporte({
      titulo: 'Nombres',
      hoja: 'Ventas/2026',
      columnas: [{ clave: 'a', titulo: 'A' }],
      filas: [{ a: 1 }],
      generadoEn: GENERADO_EN,
      hojasExtra: [
        { hoja: 'Ventas/2026', titulo: 'Otra', columnas: [{ clave: 'a', titulo: 'A' }], filas: [{ a: 2 }] },
      ],
    });
    const libro = await abrir(buffer);
    const nombres = libro.worksheets.map((w) => w.name);
    expect(nombres[0]).toBe('Ventas 2026');
    expect(nombres[1]).toBe('Ventas 2026 (2)');
    expect(nombres.every((n) => !/[:\\/?*[\]]/.test(n) && n.length <= 31)).toBe(true);
  });
});

describe('aFechaExcel', () => {
  it('desplaza el instante a la hora de pared de la empresa', () => {
    // 02:00 UTC del día 4 son las 20:00 del día 3 en México.
    expect(aFechaExcel('2026-09-04T02:00:00.000Z')!.toISOString()).toBe('2026-09-03T20:00:00.000Z');
  });

  it('deja un AAAA-MM-DD en su propio día', () => {
    expect(aFechaExcel('2026-09-01')!.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('devuelve null para lo que no es fecha', () => {
    expect(aFechaExcel('sin fecha')).toBeNull();
    expect(aFechaExcel(null)).toBeNull();
  });
});

describe('aDiaExcel · columnas @db.Date', () => {
  it('una medianoche UTC es un día de calendario, no un instante', () => {
    // Prisma devuelve así `issueDate`, `endDate`, `dueDate`… Convertirlas a hora de
    // México las mandaba al día anterior a las 18:00.
    expect(aDiaExcel(new Date('2026-09-05T00:00:00.000Z'))!.toISOString()).toBe(
      '2026-09-05T00:00:00.000Z',
    );
    expect(aDiaExcel('2026-09-05T00:00:00.000Z')!.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  it('con hora real sí convierte a hora de pared', () => {
    expect(aDiaExcel('2026-09-05T18:00:00.000Z')!.toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });
});

describe('etiquetaGenerica', () => {
  it('convierte claves de enum en texto legible', () => {
    expect(etiquetaGenerica('EN_PROCESO')).toBe('En proceso');
    expect(etiquetaGenerica('porValidar')).toBe('Por validar');
    expect(etiquetaGenerica('acs_sin_salida')).toBe('Acs sin salida');
  });
});

// ─────────────────────────────────────────── una muestra por reporte del sistema

describe('muestras de cada reporte', () => {
  const usuario = (nombre: string) => ({ id: 1, nombre, email: 'demo@nexara.mx' });

  const casos: Array<{ archivo: string; opciones: Parameters<typeof crearReporte>[0] }> = [
    {
      archivo: '01-actividades.xlsx',
      opciones: {
        titulo: 'Actividades y órdenes de trabajo',
        subtitulo: 'Todas las actividades de la empresa',
        hoja: 'Actividades',
        columnas: COLUMNAS_ACTIVIDADES,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        hojaInformacion: true,
        notas: ['Alcance: Todas las actividades de la empresa'],
        filas: [
          {
            anNumber: 'AN-2026-0417',
            titulo: 'Mantenimiento preventivo de CCTV en sucursal Angelópolis',
            coreKind: 'servicio',
            ticketType: 'PREVENTIVO',
            estatus: 'En Proceso',
            prioridad: 'ALTA',
            assignmentCharge: 'despacho',
            responsable: { nombre: 'Luis Ramírez', passwordHash: 'NO-DEBE-SALIR' },
            client: { name: 'Banco del Bajío', portalPasswordHash: 'NO-DEBE-SALIR' },
            branchName: 'Angelópolis',
            branchCity: 'Puebla',
            branchState: 'Puebla',
            fechaAsignacion: '2026-09-14T14:00:00.000Z',
            fechaEntregaEsperada: '2026-09-16T14:00:00.000Z',
            fechaInicio: '2026-09-15T15:20:00.000Z',
            fechaFinalizacion: '2026-09-15T21:05:00.000Z',
            tiempoEstimadoMin: 240,
            activityEvidences: [{ id: 1 }, { id: 2 }, { id: 3 }],
            creador: { nombre: 'Christian Ortega' },
          },
          {
            anNumber: 'AN-2026-0418',
            titulo: 'Instalación de control de acceso',
            coreKind: 'obra',
            ticketType: 'OTRO',
            ticketTypeCustom: 'Levantamiento',
            estatus: 'Finalizado',
            prioridad: 'MEDIA',
            assignmentCharge: 'ejecucion',
            responsable: { nombre: 'Ariadna Sierra' },
            client: { name: 'Grupo Industrial Puebla' },
            branchName: 'Planta San Martín',
            branchCity: 'San Martín Texmelucan',
            branchState: 'Puebla',
            fechaAsignacion: '2026-09-10T14:00:00.000Z',
            fechaEntregaEsperada: '2026-09-18T14:00:00.000Z',
            fechaInicio: '2026-09-11T14:30:00.000Z',
            fechaFinalizacion: '2026-09-17T23:40:00.000Z',
            tiempoEstimadoMin: 1440,
            activityEvidences: [{ id: 4 }],
            creador: { nombre: 'Adam Pozo' },
          },
        ],
      },
    },
    {
      archivo: '02-evidencias.xlsx',
      opciones: {
        titulo: 'Evidencias de actividades',
        subtitulo: 'Evidencias visibles según tu jerarquía',
        hoja: 'Evidencias',
        columnas: COLUMNAS_EVIDENCIAS,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        hojaInformacion: true,
        filas: [
          {
            actividad: { anNumber: 'AN-2026-0417', titulo: 'Mantenimiento preventivo de CCTV' },
            tipoEvidencia: 'Foto llegada',
            estatus: 'Pendiente',
            aprobada: false,
            user: usuario('Luis Ramírez'),
            subidoEn: '2026-09-15T15:22:00.000Z',
            aprobadoPor: null,
            revisadoEn: null,
            calificacionEficiencia: null,
            comentarios: 'Llegada al sitio, acceso por recepción.',
            observacionesRevision: null,
            latitud: 19.0289,
            longitud: -98.2265,
            archivoUrl: '/uploads/evidences/llegada-0417.jpg',
          },
          {
            actividad: { anNumber: 'AN-2026-0418', titulo: 'Instalación de control de acceso' },
            tipoEvidencia: 'PDF hoja de servicio',
            estatus: 'Aprobada',
            aprobada: true,
            user: usuario('Ariadna Sierra'),
            subidoEn: '2026-09-17T23:38:00.000Z',
            aprobadoPor: usuario('Christian Ortega'),
            revisadoEn: '2026-09-18T15:10:00.000Z',
            calificacionEficiencia: 9.5,
            comentarios: 'Hoja firmada por el gerente de planta.',
            observacionesRevision: 'Completa.',
            latitud: 19.2769,
            longitud: -98.4362,
            archivoUrl: '/uploads/evidences/hoja-0418.pdf',
          },
        ],
      },
    },
    {
      archivo: '03-vehiculos.xlsx',
      opciones: {
        titulo: 'Control de vehículos',
        subtitulo: 'Toda la flota de la empresa',
        hoja: 'Vehículos',
        columnas: COLUMNAS_VEHICULOS,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        hojaInformacion: true,
        notas: ['Alcance: Toda la flota de la empresa'],
        filas: [
          {
            vehiculo: { nombre: 'Nissan NP300 blanca', placas: 'ABC-123-A' },
            solicitante: usuario('Luis Ramírez'),
            actividad: { anNumber: 'AN-2026-0417' },
            motivoUso: 'Traslado de equipo a sucursal Angelópolis',
            estatusAprobacion: 'Aprobada',
            fechaSolicitud: '2026-09-14T16:00:00.000Z',
            fechaInicioAprobada: '2026-09-15T14:00:00.000Z',
            fechaFinAprobada: '2026-09-15T23:00:00.000Z',
            fechaInicio: '2026-09-15T14:12:00.000Z',
            fechaFin: '2026-09-15T22:40:00.000Z',
            odometroInicio: 84210,
            odometroFin: 84298,
            combustibleInicioPct: 80,
            combustibleFinPct: 45,
            entregaEstatus: 'Entregado',
            entregaAprobada: true,
            entregaRevisadoPor: usuario('Christian Ortega'),
            penalizacionMonto: 0,
            penalizacionNotas: null,
          },
          {
            vehiculo: null,
            nombreVehiculo: 'Ford Transit',
            placasVehiculo: 'XYZ-987-B',
            solicitante: usuario('Ariadna Sierra'),
            actividad: { anNumber: 'AN-2026-0418' },
            motivoUso: 'Obra en planta San Martín',
            estatusAprobacion: 'Pendiente',
            fechaSolicitud: '2026-09-17T18:00:00.000Z',
            fechaInicioAprobada: null,
            fechaFinAprobada: null,
            fechaInicio: null,
            fechaFin: null,
            odometroInicio: 120400,
            odometroFin: null,
            combustibleInicioPct: 60,
            combustibleFinPct: null,
            entregaEstatus: null,
            entregaAprobada: false,
            entregaRevisadoPor: null,
            penalizacionMonto: 350.75,
            penalizacionNotas: 'Regreso fuera de horario',
          },
        ],
      },
    },
    {
      archivo: '04-viaticos.xlsx',
      opciones: {
        titulo: 'Viáticos',
        subtitulo: 'Solicitudes y asignaciones visibles según tu rol',
        hoja: 'Viáticos',
        columnas: COLUMNAS_VIATICOS,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        hojaInformacion: true,
        filas: [
          {
            Activity: { anNumber: 'AN-2026-0417' },
            User: usuario('Luis Ramírez'),
            categoria: 'COMBUSTIBLE',
            origen: 'SOLICITUD',
            motivo: 'Carga de combustible para traslado a Angelópolis',
            montoSolicitado: 900,
            estatus: 'Aprobado_Coordinador',
            project: { name: 'CCTV Banco del Bajío 2026' },
            vehicle: { nombre: 'Nissan NP300 blanca', placas: 'ABC-123-A' },
            fechaSolicitud: '2026-09-14T16:05:00.000Z',
            contabilidadRef: 'PG-2026-0912',
            ticketEvidenciaUrl: '/uploads/viaticos/ticket-900.jpg',
          },
          {
            Activity: { anNumber: 'AN-2026-0418' },
            User: usuario('Ariadna Sierra'),
            categoria: 'ALIMENTACION',
            origen: 'ASIGNACION',
            motivo: 'Comidas de cuadrilla, tres días de obra',
            montoSolicitado: 2400.5,
            estatus: 'Pagado',
            project: { name: 'Control de acceso GIP' },
            vehicle: null,
            fechaSolicitud: '2026-09-11T15:00:00.000Z',
            contabilidadRef: 'PG-2026-0918',
            ticketEvidenciaUrl: '/uploads/viaticos/ticket-2400.pdf',
          },
        ],
      },
    },
    {
      archivo: '05-asistencia-hibrida.xlsx',
      opciones: {
        titulo: 'Asistencia híbrida · checador ERP ↔ accesos ACS',
        subtitulo: 'Día 2026-09-18',
        hoja: 'Asistencia',
        columnas: COLUMNAS_ASISTENCIA_HIBRIDA,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        filtros: [
          { etiqueta: 'Fecha', valor: '2026-09-18' },
          { etiqueta: 'Sitio', valor: 'Todos' },
          { etiqueta: 'Alcance', valor: 'Toda la empresa' },
        ],
        notas: ['Vinculados: 1 · Solo ERP: 1 · Solo ACS: 0 · Con alertas: 1'],
        filas: [
          {
            fecha: '2026-09-18',
            linkStatus: 'linked',
            flags: ['retardo'],
            expectedStart: '09:00',
            user: { nombre: 'Luis Ramírez', employeeNumber: 'NX-014', department: 'Operaciones' },
            erp: {
              checkIn: '2026-09-18T15:12:00.000Z',
              checkOut: '2026-09-19T00:05:00.000Z',
              totalMinutes: 533,
              estado: 'COMPLETO',
            },
            acs: {
              firstAt: '2026-09-18T15:09:00.000Z',
              lastAt: '2026-09-19T00:07:00.000Z',
              minutes: 538,
              passes: 6,
              denied: 0,
              firstDoor: 'Acceso principal',
            },
          },
          {
            fecha: '2026-09-18',
            linkStatus: 'erp_only',
            flags: ['checador_sin_acs', 'erp_sin_salida'],
            expectedStart: '09:00',
            user: { nombre: 'Ariadna Sierra', employeeNumber: 'NX-021', department: 'Ingeniería' },
            erp: { checkIn: '2026-09-18T14:55:00.000Z', checkOut: null, totalMinutes: 0, estado: 'PRESENTE' },
            acs: null,
          },
        ],
      },
    },
    {
      archivo: '06-kpis-equipo.xlsx',
      opciones: {
        titulo: 'KPI del equipo',
        subtitulo: 'Del 01/09/2026 al 18/09/2026',
        hoja: 'KPI por persona',
        columnas: COLUMNAS_KPIS_PERSONAS,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        filtros: [
          { etiqueta: 'Desde', valor: '2026-09-01' },
          { etiqueta: 'Hasta', valor: '2026-09-18' },
          { etiqueta: 'Alcance', valor: 'Toda la empresa' },
        ],
        notas: ['La jornada ordinaria es de 8 h netas, de lunes a viernes.'],
        filas: [
          {
            persona: { nombre: 'Luis Ramírez', puesto: 'Coordinador de servicios' },
            horario: { etiqueta: 'Oficina · entra 09:00' },
            totales: {
              diasConJornada: 13,
              diasSinChecada: 1,
              faltasJustificadas: 1,
              retardos: 2,
              minutosTarde: 37,
              uniforme: { pct: 92 },
              minutosLaborados: 6240,
              minutosProductivos: 4810,
              minutosInactivos: 1430,
              productividadPct: 77,
              minutosExtra: 320,
              jornadasSinSalida: 1,
              actividadesFueraDeJornada: 2,
            },
            motivos: ['2 retardos en el rango'],
          },
          {
            persona: { nombre: 'Ariadna Sierra', puesto: 'Ingeniera de campo' },
            horario: { etiqueta: 'Contratista · entra 08:00' },
            totales: {
              diasConJornada: 14,
              diasSinChecada: 0,
              faltasJustificadas: 0,
              retardos: 0,
              minutosTarde: 0,
              uniforme: { pct: 100 },
              minutosLaborados: 6720,
              minutosProductivos: 5900,
              minutosInactivos: 820,
              productividadPct: 88,
              minutosExtra: 145,
              jornadasSinSalida: 0,
              actividadesFueraDeJornada: 0,
            },
            motivos: [],
          },
        ],
        hojasExtra: [
          {
            hoja: 'Día por día',
            titulo: 'Detalle diario · Luis Ramírez',
            subtitulo: 'Del 01/09/2026 al 18/09/2026',
            columnas: COLUMNAS_KPIS_DIAS,
            filas: [
              {
                fecha: '2026-09-16',
                laborable: true,
                entrada: '2026-09-16T15:07:00.000Z',
                salida: '2026-09-17T00:02:00.000Z',
                retardo: true,
                minutosTarde: 7,
                uniformeOk: true,
                minutosComida: 45,
                minutosLaborados: 490,
                minutosProductivos: 380,
                minutosInactivos: 110,
                productividadPct: 78,
                minutosExtra: 25,
                sinChecada: false,
                faltaJustificada: false,
                cierreAutomatico: false,
                actividadesFueraDeJornada: 0,
              },
              {
                fecha: '2026-09-17',
                laborable: true,
                entrada: '2026-09-17T14:58:00.000Z',
                salida: null,
                retardo: false,
                minutosTarde: 0,
                uniformeOk: null,
                minutosComida: 0,
                minutosLaborados: 0,
                minutosProductivos: 0,
                minutosInactivos: 0,
                productividadPct: null,
                minutosExtra: null,
                sinChecada: false,
                faltaJustificada: false,
                cierreAutomatico: true,
                actividadesFueraDeJornada: 1,
              },
            ],
          },
        ],
      },
    },
    {
      archivo: '07-cotizaciones.xlsx',
      opciones: {
        titulo: REPORTES_POR_ENTIDAD.cotizaciones.titulo,
        subtitulo: 'Del 01/09/2026 al 30/09/2026',
        hoja: REPORTES_POR_ENTIDAD.cotizaciones.hoja,
        columnas: REPORTES_POR_ENTIDAD.cotizaciones.columnas,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        filtros: [
          { etiqueta: 'Desde', valor: '01/09/2026' },
          { etiqueta: 'Hasta', valor: '30/09/2026' },
        ],
        filas: [
          {
            folio: 'NEX-LJ75100126-0007-JA.CE-R2',
            projectName: 'CCTV y control de acceso, planta San Martín',
            clientName: 'Mariana Téllez',
            clientCompany: 'Grupo Industrial Puebla',
            status: 'SENT',
            segmento: 'OBRA',
            revision: 2,
            currency: 'MXN',
            issueDate: '2026-09-08T18:00:00.000Z',
            validUntil: '2026-10-08T18:00:00.000Z',
            subtotal: 412300,
            discountTotal: 12300,
            taxTotal: 64000,
            total: 464000,
            preparedBy: 'Christian Ortega',
            sentAt: '2026-09-08T19:12:00.000Z',
            signedByName: null,
            signedAt: null,
          },
          {
            folio: 'NEX-LJ75100126-0011-JA',
            projectName: 'Mantenimiento anual CCTV',
            clientName: 'Rodrigo Lara',
            clientCompany: 'Banco del Bajío',
            status: 'APPROVED',
            segmento: 'SERVICIO',
            revision: 1,
            currency: 'MXN',
            issueDate: '2026-09-02T18:00:00.000Z',
            validUntil: '2026-10-02T18:00:00.000Z',
            subtotal: 148000,
            discountTotal: 0,
            taxTotal: 23680,
            total: 171680,
            preparedBy: 'Adam Pozo',
            sentAt: '2026-09-02T20:00:00.000Z',
            signedByName: 'Rodrigo Lara',
            signedAt: '2026-09-05T17:31:00.000Z',
          },
        ],
      },
    },
    {
      archivo: '08-facturas.xlsx',
      opciones: {
        titulo: REPORTES_POR_ENTIDAD.invoices.titulo,
        subtitulo: 'Del 01/09/2026 al 30/09/2026',
        hoja: REPORTES_POR_ENTIDAD.invoices.hoja,
        columnas: REPORTES_POR_ENTIDAD.invoices.columnas,
        generadoPor: 'Adam Pozo',
        generadoEn: GENERADO_EN,
        filtros: [
          { etiqueta: 'Desde', valor: '01/09/2026' },
          { etiqueta: 'Hasta', valor: '30/09/2026' },
        ],
        filas: [
          {
            invoiceNumber: 'A-2026-1042',
            type: 'ACCOUNTS_RECEIVABLE',
            status: 'PAID',
            issueDate: '2026-09-05T18:00:00.000Z',
            dueDate: '2026-10-05T18:00:00.000Z',
            subtotal: 148000,
            taxAmount: 23680,
            totalAmount: 171680,
            paidAmount: 171680,
            currency: 'MXN',
            cfdiUuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
            isCancelled: false,
          },
          {
            invoiceNumber: 'A-2026-1043',
            type: 'ACCOUNTS_RECEIVABLE',
            status: 'PARTIALLY_PAID',
            issueDate: '2026-09-12T18:00:00.000Z',
            dueDate: '2026-10-12T18:00:00.000Z',
            subtotal: 400000,
            taxAmount: 64000,
            totalAmount: 464000,
            paidAmount: 200000,
            currency: 'USD',
            cfdiUuid: '0F9E8D7C-6B5A-4321-FEDC-BA0987654321',
            isCancelled: false,
          },
        ],
      },
    },
  ];

  it.each(casos.map((c) => [c.archivo, c] as const))(
    '%s se escribe y se vuelve a leer con encabezado, congelado y autofiltro',
    async (archivo, caso) => {
      const buffer = await crearReporte(caso.opciones);
      guardarMuestra(archivo, buffer);
      const libro = await abrir(buffer);
      const hoja = libro.getWorksheet(caso.opciones.hoja)!;
      expect(hoja).toBeDefined();
      const r = filaEncabezado(hoja);
      expect(hoja.views[0]).toMatchObject({ state: 'frozen', ySplit: r });
      expect(hoja.autoFilter).toBeDefined();
      expect(hoja.pageSetup.fitToWidth).toBe(1);
      expect(hoja.pageSetup.printTitlesRow).toBe(`${r}:${r}`);
      // La hoja «Información» existe si se pide, o si hay filtros o notas que registrar.
      const conInfo =
        caso.opciones.hojaInformacion ??
        Boolean(caso.opciones.filtros?.length || caso.opciones.notas?.length);
      expect(Boolean(libro.getWorksheet('Información'))).toBe(conInfo);
      // Ninguna columna repite encabezado ni sale vacía.
      const titulos = caso.opciones.columnas.map((c) => c.titulo);
      expect(new Set(titulos).size).toBe(titulos.length);
      titulos.forEach((t, i) => expect(hoja.getRow(r).getCell(i + 1).value).toBe(t));
    },
  );

  it('no filtra secretos de las relaciones a la hoja de actividades', async () => {
    const caso = casos.find((c) => c.archivo === '01-actividades.xlsx')!;
    const buffer = await crearReporte(caso.opciones);
    const plano = buffer.toString('binary');
    expect(plano).not.toContain('NO-DEBE-SALIR');
    expect(plano).not.toContain('passwordHash');
  });
});
