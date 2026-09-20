import { describe, expect, it, vi, beforeAll } from "vitest";
import ExcelJS from "exceljs";

const descargas: Array<{ blob: Blob; nombre: string }> = [];

vi.mock("./file-download", () => ({
  triggerBlobDownload: vi.fn(async (blob: Blob, nombre: string) => {
    descargas.push({ blob, nombre });
  }),
}));

import { exportToExcel, type ExcelColumn } from "./export-excel";

/**
 * El exportador del cliente se prueba abriendo el archivo que descarga.
 *
 * Lo usan ~60 pantallas con la firma vieja `(rows, columns, filename, título)`, así que
 * aquí se comprueban las dos cosas: que ese contrato sigue funcionando y que el archivo
 * sale con el mismo tema corporativo que produce la API.
 */

type Fila = {
  folio: string;
  cliente: string;
  estatus: string;
  emitida: string | Date;
  total: number;
  avance: number;
  minutos: number;
  urgente: boolean;
};

const filas: Fila[] = [
  {
    folio: "AN-0001",
    cliente: "Comercializadora del Valle",
    estatus: "EN_PROCESO",
    emitida: "2026-09-01",
    total: 12500.5,
    avance: 72,
    minutos: 155,
    urgente: true,
  },
  {
    folio: "AN-0002",
    cliente: "Grupo Industrial Puebla",
    estatus: "FINALIZADA",
    // Como llega del API una columna `@db.Date`.
    emitida: new Date("2026-09-05T00:00:00.000Z"),
    total: 3400,
    avance: 100,
    minutos: 90,
    urgente: false,
  },
];

const columnas: ExcelColumn<Fila>[] = [
  { key: "folio", label: "Folio" },
  { key: "cliente", label: "Cliente" },
  { key: "estatus", label: "Estatus", etiquetas: { EN_PROCESO: "En proceso" } },
  { key: "emitida", label: "Emitida", tipo: "fecha" },
  { key: "total", label: "Total", tipo: "dinero", total: "suma" },
  { key: "avance", label: "Avance", tipo: "porcentaje" },
  { key: "minutos", label: "Duración", tipo: "duracion", total: "suma" },
  { key: "urgente", label: "Urgente", tipo: "booleano" },
];

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

/** `exportToExcel` es fire-and-forget: se espera a que el mock reciba el archivo. */
async function esperarLibro(): Promise<ExcelJS.Workbook> {
  for (let i = 0; i < 300 && descargas.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
  if (!descargas.length) throw new Error("no se disparó la descarga");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await aBuffer(descargas[0].blob));
  return wb;
}

describe("exportToExcel · tema corporativo en el cliente", () => {
  let ws: ExcelJS.Worksheet;
  let info: ExcelJS.Worksheet | undefined;
  let hdr = 0;

  beforeAll(async () => {
    descargas.length = 0;
    // Sin logo: en jsdom no hay servidor que sirva /logo-nexara.png. El reporte no debe romperse.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    exportToExcel(filas, columnas, "reporte-prueba", {
      title: "Reporte de prueba",
      subtitle: "Del 01/09/2026 al 30/09/2026",
      filtros: [{ etiqueta: "Cliente", valor: "Todos" }],
      generadoPor: "Adam Pozo",
      hoja: "Prueba",
    });
    const wb = await esperarLibro();
    ws = wb.getWorksheet("Prueba")!;
    info = wb.getWorksheet("Información");
    for (let r = 1; r <= ws.rowCount; r += 1) {
      const fill = ws.getRow(r).getCell(1).fill as ExcelJS.FillPattern | undefined;
      if (fill?.fgColor?.argb === "FF1F9E84" && ws.getRow(r).getCell(1).value) {
        hdr = r;
        break;
      }
    }
  });

  it("descarga un .xlsx con el nombre pedido", () => {
    expect(descargas[0].nombre).toBe("reporte-prueba.xlsx");
    expect(descargas[0].blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("escribe la banda de título con subtítulo, filtros y quién lo generó", () => {
    const textos: string[] = [];
    for (let r = 1; r < hdr; r += 1) textos.push(String(ws.getRow(r).getCell(1).value ?? ""));
    expect(textos).toContain("Reporte de prueba");
    expect(textos.some((t) => t.startsWith("Del 01/09/2026 al 30/09/2026"))).toBe(true);
    expect(textos.some((t) => t.includes("2 registros"))).toBe(true);
    expect(textos.some((t) => t.includes("Cliente: Todos"))).toBe(true);
    expect(textos.some((t) => t.startsWith("Generado por Adam Pozo · "))).toBe(true);
  });

  it("usa el mismo encabezado teal que la API", () => {
    expect(hdr).toBeGreaterThan(1);
    columnas.forEach((c, i) => {
      const celda = ws.getRow(hdr).getCell(i + 1);
      expect(celda.value).toBe(c.label);
      expect(celda.font).toMatchObject({ bold: true, size: 10, color: { argb: "FFFFFFFF" } });
      expect((celda.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF1F9E84");
    });
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: hdr });
    expect(ws.autoFilter).toBe(`A${hdr}:H${hdr + filas.length}`);
  });

  it("aplica los formatos de número y las etiquetas en español", () => {
    const fila = ws.getRow(hdr + 1);
    expect(fila.getCell(3).value).toBe("En proceso");
    expect(fila.getCell(4).numFmt).toBe("dd/mm/yyyy");
    // Un AAAA-MM-DD no debe retroceder al día anterior por la zona horaria.
    expect((fila.getCell(4).value as Date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // Una medianoche UTC es un día de calendario: tampoco debe retroceder.
    expect((ws.getRow(hdr + 2).getCell(4).value as Date).toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
    expect(fila.getCell(5).numFmt).toBe('"$" #,##0.00');
    expect(fila.getCell(5).value).toBe(12500.5);
    expect(fila.getCell(6).numFmt).toBe("0 %");
    expect(fila.getCell(6).value).toBeCloseTo(0.72, 5);
    expect(fila.getCell(7).numFmt).toBe("[h]:mm");
    expect(fila.getCell(8).value).toBe("Sí");
    expect(ws.getRow(hdr + 2).getCell(8).value).toBe("No");
  });

  it("cierra con una fila de totales de fórmulas reales", () => {
    const totales = ws.getRow(hdr + filas.length + 1);
    expect(totales.getCell(1).value).toBe("Total");
    expect((totales.getCell(5).value as ExcelJS.CellFormulaValue).formula).toBe(
      `SUM(E${hdr + 1}:E${hdr + filas.length})`,
    );
    expect((totales.getCell(7).value as ExcelJS.CellFormulaValue).formula).toBe(
      `SUM(G${hdr + 1}:G${hdr + filas.length})`,
    );
  });

  it("deja el libro listo para imprimir y anexa la hoja «Información»", () => {
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.printTitlesRow).toBe(`${hdr}:${hdr}`);
    expect(ws.headerFooter.oddFooter).toContain("Página &P de &N");
    expect(info).toBeDefined();
    const pares = new Map<string, string>();
    info!.eachRow((f) => pares.set(String(f.getCell(1).value ?? ""), String(f.getCell(2).value ?? "")));
    expect(pares.get("Reporte")).toBe("Reporte de prueba");
    expect(pares.get("Generado por")).toBe("Adam Pozo");
    expect(pares.get("Registros")).toBe("2");
  });
});

describe("exportToExcel · contrato viejo de las pantallas", () => {
  it("acepta (rows, columns, filename, título) con `format` y sin tipos", async () => {
    descargas.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    exportToExcel(
      [{ nombre: "Luis", dias: 3 }],
      [
        { key: "nombre", label: "Ingeniero" },
        { key: "dias", label: "Días", format: (v) => `${String(v)} d` },
      ],
      "kpis-ingenieros",
      "KPIs de ingenieros",
    );
    const wb = await esperarLibro();
    const hoja = wb.worksheets[0];
    expect(descargas[0].nombre).toBe("kpis-ingenieros.xlsx");
    expect(hoja.name).toBe("KPIs de ingenieros");
    // Sin filtros ni notas no hay hoja «Información».
    expect(wb.worksheets).toHaveLength(1);
    let hdr = 0;
    for (let r = 1; r <= hoja.rowCount; r += 1) {
      // El filete teal que cierra la banda también es teal, pero va vacío.
      const celda = hoja.getRow(r).getCell(1);
      if ((celda.fill as ExcelJS.FillPattern)?.fgColor?.argb === "FF1F9E84" && celda.value) {
        hdr = r;
        break;
      }
    }
    expect(hoja.getRow(hdr).getCell(1).value).toBe("Ingeniero");
    expect(hoja.getRow(hdr + 1).getCell(2).value).toBe("3 d");
  });

  it("sin filas escribe el aviso en vez de una hoja en blanco", async () => {
    descargas.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    exportToExcel([] as Fila[], columnas, "vacio", "Reporte vacío");
    const wb = await esperarLibro();
    const hoja = wb.worksheets[0];
    const textos: string[] = [];
    hoja.eachRow((f) => textos.push(String(f.getCell(1).value ?? "")));
    expect(textos).toContain("Sin registros para los filtros aplicados");
    expect(hoja.autoFilter).toBeUndefined();
  });
});
