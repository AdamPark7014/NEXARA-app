import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cambiosEntre,
  documentoDesdeDetalle,
  partidaNueva,
  partidasDesdeApi,
  partidasParaApi,
  payloadDeDocumento,
} from "./cotizacion-documento";
import type { CotizacionDetalle, PartidaCotizacion } from "./cotizaciones-api";

/**
 * Guardar rehace todas las partidas en la API: borra y vuelve a crear, y lo que el editor no devuelva
 * se pierde. Así se iban la liga con CT, el IEPS, la retención y las notas en cuanto se tocaba una partida.
 */
const ocultos = {
  productId: 9,
  scope: "Interior",
  sku: "SKU-1",
  partNumber: "PN-1",
  batchReference: "L-1",
  supplierId: 4,
  supplierSku: "CT-77",
  productCtId: 77,
  supplierCode: "CT",
  supplierWarehouseCode: "14A",
  stockSnapshot: 12,
  leadTimeDays: 3,
  scoreReason: "precio",
  optimizationMode: "costo",
  ieps: 8,
  retention: 4,
  warrantyMonths: 12,
  deliveryTime: "2 semanas",
  countryOrigin: "China",
  notes: "Va con soporte",
};

const guardada = {
  id: 11,
  cotizacionId: 50,
  createdAt: "2026-10-01T12:00:00.000Z",
  lineTotal: 4459.68,
  name: "Cámara IP",
  unit: "Pieza",
  qty: 3,
  unitPrice: 1204,
  unitCost: 1000,
  marginPercent: 20.4,
  discount: 5,
  tax: 16,
  ...ocultos,
} as unknown as PartidaCotizacion;

const detalle = {
  id: 50,
  segmento: "OBRA",
  clientName: "Hotel",
  items: [guardada],
  terminos: { partes: [] },
} as unknown as CotizacionDetalle;

/** Columnas de `CotizacionItem`, sin las relaciones, con un valor de su tipo. */
function filaConTodasLasColumnas(): Record<string, unknown> {
  const esquema = readFileSync(resolve(__dirname, "../../api/prisma/schema.prisma"), "utf8");
  const bloque = esquema.match(/model CotizacionItem \{([\s\S]*?)\r?\n\}/)?.[1];
  if (!bloque) throw new Error("No encontré `model CotizacionItem` en schema.prisma");
  const valor: Record<string, unknown> = { Int: 7, Decimal: 7, String: "x", DateTime: "2026-10-01T12:00:00.000Z" };
  const columnas = bloque
    .split(/\r?\n/)
    .map((linea) => linea.trim().match(/^(\w+)\s+(\w+)/))
    .filter((m): m is RegExpMatchArray => Boolean(m && m[2] && m[2] in valor));
  return Object.fromEntries(columnas.map((m) => [m[1], valor[m[2]!]]));
}

describe("lo que el editor no enseña de una partida", () => {
  it("sobrevive al autoguardado cuando se edita la partida", () => {
    const doc = documentoDesdeDetalle(detalle);
    const editado = { ...doc, partidas: doc.partidas.map((p) => ({ ...p, qty: 5 })) };
    expect(payloadDeDocumento(editado).items?.[0]).toMatchObject({ ...ocultos, qty: 5, unitCost: 1000, marginPercent: 20.4 });
  });

  it("también al leerla ya guardada, y no se queda fuera ninguna columna del esquema", () => {
    // Una columna nueva tiene que llegar de vuelta a la API, o guardar la borra sin avisar.
    const fila = filaConTodasLasColumnas();
    expect(Object.keys(fila)).toEqual(expect.arrayContaining(["productCtId", "ieps", "retention", "unitCost"]));
    const [salida] = partidasParaApi(partidasDesdeApi([fila as unknown as PartidaCotizacion]));
    const lasEscribeLaBase = ["id", "cotizacionId", "lineTotal", "createdAt"];
    expect(Object.keys(fila).filter((c) => !lasEscribeLaBase.includes(c) && !(c in salida!))).toEqual([]);
  });

  it("lo que escribe la base no viaja de regreso", () => {
    const item = payloadDeDocumento(documentoDesdeDetalle(detalle)).items?.[0];
    for (const campo of ["id", "cotizacionId", "createdAt", "lineTotal"]) expect(item).not.toHaveProperty(campo);
  });

  it("abrir una cotización no la guarda", () => {
    const base = payloadDeDocumento(documentoDesdeDetalle(detalle));
    expect(cambiosEntre(base, payloadDeDocumento(documentoDesdeDetalle(detalle)))).toEqual({});
  });

  it("donde no hay esos datos no se inventan: partida nueva o de plantilla", () => {
    const nueva = partidasParaApi([partidaNueva({ name: "Poste" })])[0];
    const dePlantilla = partidasParaApi(partidasDesdeApi([{ name: "Poste", qty: 1, unitPrice: 10 }]))[0];
    for (const campo of Object.keys(ocultos)) {
      expect(nueva).not.toHaveProperty(campo);
      expect(dePlantilla).not.toHaveProperty(campo);
    }
  });
});
