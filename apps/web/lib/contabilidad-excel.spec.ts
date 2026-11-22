import { describe, expect, it, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

const descargas: Array<{ blob: Blob; nombre: string }> = [];

vi.mock("./file-download", () => ({
  triggerBlobDownload: vi.fn(async (blob: Blob, nombre: string) => {
    descargas.push({ blob, nombre });
  }),
}));

import { descargarExcelContabilidad, periodoLegible, type ColumnaExcel } from "./contabilidad-excel";

/**
 * Los Excel de la mesa contable salían de un libro propio, sin formato. Ahora pasan por el
 * tema de `export-excel.ts`; aquí se abre el archivo descargado para comprobarlo.
 */

/** El `Blob` de jsdom no trae `arrayBuffer()`; se lee con FileReader. */
function aBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

async function libro(): Promise<ExcelJS.Workbook> {
  expect(descargas).toHaveLength(1);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await aBuffer(descargas[0].blob));
  return wb;
}

/** Fila de encabezados: la primera con relleno teal y texto. */
function filaEncabezado(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r += 1) {
    const celda = ws.getRow(r).getCell(1);
    if ((celda.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb === "FF1F9E84" && celda.value) return r;
  }
  throw new Error("sin encabezado");
}

const CFDI = [
  {
    // Así llega del API una columna `@db.Date`.
    issueDate: "2026-10-05T00:00:00.000Z",
    emisorName: "Proveedor Demo de Cámaras, S.A. de C.V.",
    emisorRfc: "PDC010101AAA",
    cfdiUuid: "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
    satEstatus: "vigente",
    lista69B: null,
    totalAmount: "58000.00",
    taxAmount: 8000,
  },
  {
    issueDate: "2026-10-20T00:00:00.000Z",
    emisorName: "Servicios Demo del Centro",
    emisorRfc: "SDC030303CCC",
    cfdiUuid: "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D",
    satEstatus: "cancelado",
    lista69B: "PRESUNTO",
    totalAmount: "23,200.00",
    taxAmount: null,
  },
];

const COLUMNAS: ColumnaExcel[] = [
  { key: "issueDate", header: "Fecha", tipo: "fecha" },
  { key: "emisorName", header: "Emisor", ancho: 44, ajustar: true },
  { key: "emisorRfc", header: "RFC emisor", ancho: 16 },
  { key: "cfdiUuid", header: "UUID", ancho: 42 },
  { key: "satEstatus", header: "Estatus SAT", ancho: 14, etiquetas: { VIGENTE: "Vigente", CANCELADO: "Cancelado" } },
  { key: "lista69B", header: "Lista 69-B", ancho: 14, etiquetas: { PRESUNTO: "Presunto", DEFINITIVO: "Definitivo" } },
  { key: "totalAmount", header: "Total", tipo: "moneda" },
  { key: "taxAmount", header: "IVA", tipo: "moneda" },
];

describe("periodoLegible", () => {
  it("escribe el rango como se lee, no en ISO", () => {
    expect(periodoLegible({ desde: "2026-10-01", hasta: "2026-10-31" })).toBe("01/10/2026 al 31/10/2026");
    expect(periodoLegible({ desde: "2026-10-01", hasta: "2026-10-01" })).toBe("01/10/2026");
    expect(periodoLegible({ desde: "2026-10-01" })).toBe("Desde el 01/10/2026");
    expect(periodoLegible({ hasta: "2026-10-31" })).toBe("Hasta el 31/10/2026");
    expect(periodoLegible(null)).toBeUndefined();
    expect(periodoLegible({})).toBeUndefined();
  });
});

describe("descargarExcelContabilidad · mismo tema que los demás reportes", () => {
  beforeEach(() => {
    descargas.length = 0;
    // Sin logo: en jsdom no hay servidor que sirva /logo-nexara.png.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
  });

  it("el buzón SAT sale con banda, fecha de verdad, estatus legibles y totales con fórmula", async () => {
    await descargarExcelContabilidad({
      nombreArchivo: "buzon-sat-recibidos.xlsx",
      tituloHoja: "Buzón SAT",
      titulo: "Buzón SAT · Recibidos",
      rango: { desde: "2026-10-01", hasta: "2026-10-31" },
      columnas: COLUMNAS,
      filas: CFDI,
      columnasConTotal: [6, 7],
      generadoPor: "Persona Demo",
    });
    expect(descargas[0].nombre).toBe("buzon-sat-recibidos.xlsx");
    const wb = await libro();
    const ws = wb.getWorksheet("Buzón SAT")!;
    const h = filaEncabezado(ws);

    const banda: string[] = [];
    for (let r = 1; r < h; r += 1) banda.push(String(ws.getRow(r).getCell(1).value ?? ""));
    expect(banda).toContain("Buzón SAT · Recibidos");
    expect(banda.some((t) => t.startsWith("01/10/2026 al 31/10/2026"))).toBe(true);
    expect(banda.some((t) => t.startsWith("Generado por Persona Demo"))).toBe(true);
    // Ni «Rango: 2026-10-01 – …» ni fechas ISO.
    expect(banda.join(" ")).not.toMatch(/Rango:|\d{4}-\d{2}-\d{2}/);

    expect(COLUMNAS.map((_, i) => ws.getRow(h).getCell(i + 1).value)).toEqual(COLUMNAS.map((c) => c.header));

    const fecha = ws.getRow(h + 1).getCell(1);
    expect(fecha.value).toEqual(new Date(Date.UTC(2026, 9, 5)));
    expect(fecha.numFmt).toBe("dd/mm/yyyy");

    expect(ws.getRow(h + 1).getCell(5).value).toBe("Vigente");
    expect(ws.getRow(h + 2).getCell(5).value).toBe("Cancelado");
    expect(ws.getRow(h + 2).getCell(6).value).toBe("Presunto");

    // Importes como número aunque lleguen como texto, con o sin comas.
    expect(ws.getRow(h + 1).getCell(7).value).toBe(58000);
    expect(ws.getRow(h + 2).getCell(7).value).toBe(23200);
    expect(ws.getRow(h + 1).getCell(7).numFmt).toBe('"$" #,##0.00');
    // Un IVA que no viene queda vacío, no en cero.
    expect(ws.getRow(h + 2).getCell(8).value).toBeNull();

    const total = ws.getRow(h + 3);
    expect(total.getCell(1).value).toBe("Total");
    expect((total.getCell(7).value as ExcelJS.CellFormulaValue).formula).toBe(`SUM(G${h + 1}:G${h + 2})`);
    expect((total.getCell(8).value as ExcelJS.CellFormulaValue).formula).toBe(`SUM(H${h + 1}:H${h + 2})`);

    // Ocho columnas: horizontal y ajustado al ancho, para que no se parta en dos hojas.
    expect(ws.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1 });
    expect(ws.pageSetup.printTitlesRow).toBe(`${h}:${h}`);
  });

  it("por contabilizar ajusta la explicación larga y traduce la confianza", async () => {
    const explicacion =
      "Mismo proveedor y concepto que las tres facturas anteriores: equipo para venta, se propone la cuenta de costo.";
    await descargarExcelContabilidad({
      nombreArchivo: "por-contabilizar",
      tituloHoja: "Por contabilizar",
      columnas: [
        { key: "emisor", header: "Emisor", ancho: 40, ajustar: true },
        { key: "cuenta", header: "Cuenta", ancho: 14 },
        { key: "confianza", header: "Confianza", ancho: 12, etiquetas: { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" } },
        { key: "explicacion", header: "Explicación", ancho: 64, ajustar: true },
        { key: "total", header: "Total", tipo: "moneda" },
      ],
      filas: [{ emisor: "Proveedor Demo", cuenta: "501.01", confianza: "alta", explicacion, total: 58000 }],
      columnasConTotal: [4],
    });
    const wb = await libro();
    const ws = wb.getWorksheet("Por contabilizar")!;
    const h = filaEncabezado(ws);
    expect(ws.getRow(2).getCell(1).value).toBe("Por contabilizar");
    expect(ws.getRow(h + 1).getCell(3).value).toBe("Alta");
    // La cuenta contable es texto: «501.01» no debe volverse el número 501.01.
    expect(ws.getRow(h + 1).getCell(2).value).toBe("501.01");
    expect(ws.getRow(h + 1).getCell(4).alignment).toMatchObject({ wrapText: true });
    expect(ws.getRow(h + 1).height).toBeGreaterThan(17);
    expect((ws.getRow(h + 2).getCell(5).value as ExcelJS.CellFormulaValue).formula).toBe(`SUM(E${h + 1}:E${h + 1})`);
  });

  it("sin filas avisa en la hoja en vez de dejarla en blanco", async () => {
    await descargarExcelContabilidad({ nombreArchivo: "cfdi-emitidos", tituloHoja: "Buzón SAT", columnas: COLUMNAS, filas: [] });
    const wb = await libro();
    const textos: string[] = [];
    wb.worksheets[0].eachRow((f) => textos.push(String(f.getCell(1).value ?? "")));
    expect(textos).toContain("Sin registros para los filtros aplicados");
  });
});
