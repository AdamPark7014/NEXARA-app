import { describe, expect, it } from "vitest";
import { documentoVacio, partidaNueva } from "@/lib/cotizacion-documento";
import type { CotizacionDetalle, OpcionPropuesta, PartidaPropuesta } from "@/lib/cotizaciones-api";
import {
  conMargen,
  documentoConPropuesta,
  documentoCopiadoDe,
  elegirOpcion,
  filasDePropuesta,
  importeDeFila,
  partidasDeFilas,
  resumenDeFilas,
} from "./cotizar-ia";

const opcion = (cambios: Partial<OpcionPropuesta> = {}): OpcionPropuesta => ({
  fuente: "catalogo",
  name: "Cámara domo Dahua",
  description: null,
  brand: "Dahua",
  model: "D1",
  unit: "Pieza",
  unitCost: 500,
  unitPrice: 0,
  grupo: "EQUIPOS",
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: 4,
  productCtId: 9,
  ...cambios,
});

const partida = (cambios: Partial<PartidaPropuesta> = {}): PartidaPropuesta => ({
  fuente: "libre",
  name: "Cámara domo",
  description: null,
  brand: null,
  model: null,
  unitCost: null,
  unitPrice: 0,
  grupo: null,
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: null,
  productCtId: null,
  pedido: "Cámara domo",
  cantidad: 14,
  unidad: "Pieza",
  seguridad: "media",
  alternativas: [],
  ...cambios,
});

describe("filasDePropuesta", () => {
  it("el margen va a lo del mayorista y a lo que no tiene precio; lo ya cotizado conserva el suyo", () => {
    const [mayorista, libre, usada, servicio] = filasDePropuesta(
      [
        partida({ fuente: "catalogo", unitCost: 700, unitPrice: 840 }),
        partida(),
        partida({ fuente: "usada", unitCost: 100, unitPrice: 130 }),
        partida({ name: "Instalación de cámara", unidad: "Servicio" }),
      ],
      20,
    );
    expect(mayorista!.marginPercent).toBe(20);
    expect(libre!.marginPercent).toBe(20);
    expect(usada!.marginPercent).toBeNull();
    expect(servicio!.marginPercent).toBeNull();
  });

  it("lo que suele ir con esto no entra sin marcarlo", () => {
    const filas = filasDePropuesta([partida({ unitPrice: 100, fuente: "usada" })], 20, false);
    expect(filas[0]!.incluida).toBe(false);
    expect(resumenDeFilas(filas)).toEqual({ subtotal: 0, sinPrecio: 0, partidas: 0 });
    expect(partidasDeFilas(filas)).toEqual([]);
  });
});

describe("conMargen", () => {
  it("recalcula solo lo que depende del margen", () => {
    const filas = filasDePropuesta(
      [partida({ fuente: "catalogo", unitCost: 1000, unitPrice: 1200 }), partida({ fuente: "usada", unitCost: 100, unitPrice: 130 }), partida()],
      20,
    );
    const [mayorista, usada, libre] = conMargen(filas, 10);
    expect(mayorista).toMatchObject({ unitPrice: 1100, marginPercent: 10 });
    expect(usada).toMatchObject({ unitPrice: 130, marginPercent: null });
    expect(libre).toMatchObject({ unitPrice: 0, marginPercent: 10 });
  });
});

describe("un precio escrito a mano", () => {
  it("no lo pisa el margen y el costo se conserva", () => {
    const [fila] = filasDePropuesta([partida({ fuente: "catalogo", unitCost: 1000, unitPrice: 1200 })], 20);
    const manual = { ...fila!, unitPrice: 1500, marginPercent: null, precioManual: true };
    expect(conMargen([manual], 10)[0]).toMatchObject({ unitPrice: 1500, unitCost: 1000, marginPercent: null });
  });
});

describe("elegirOpcion", () => {
  const filas = filasDePropuesta(
    [partida({ alternativas: [opcion(), opcion({ fuente: "usada", name: "Domo ya cotizada", unitCost: 300, unitPrice: 420, unit: "Lote" }), opcion({ fuente: "paquete", name: "Domo del paquete", unitCost: null, unitPrice: 606.91 })] })],
    20,
  );

  it("del mayorista: costo con el margen de la tarjeta", () => {
    expect(elegirOpcion(filas[0]!, 0, 20)).toMatchObject({ name: "Cámara domo Dahua", model: "D1", unitCost: 500, unitPrice: 600, marginPercent: 20, opcionElegida: 0, fuente: "catalogo" });
  });

  it("ya cotizada: su precio, sin margen", () => {
    expect(elegirOpcion(filas[0]!, 1, 20)).toMatchObject({ unitPrice: 420, unitCost: 300, marginPercent: null, unidad: "Lote", fuente: "usada" });
  });

  it("paquete: su precio de referencia", () => {
    expect(elegirOpcion(filas[0]!, 2, 20)).toMatchObject({ unitPrice: 606.91, marginPercent: null, fuente: "paquete" });
  });

  it("la unidad dicha se respeta y la cantidad no cambia", () => {
    const enMetros = filasDePropuesta([partida({ unidad: "Metro", cantidad: 120, alternativas: [opcion({ unit: "Pieza" })] })], 20);
    expect(elegirOpcion(enMetros[0]!, 0, 20)).toMatchObject({ unidad: "Metro", cantidad: 120 });
  });

  it("una opción que no existe no toca la fila", () => {
    expect(elegirOpcion(filas[0]!, 9, 20)).toBe(filas[0]);
  });
});

describe("resumen y partidas", () => {
  it("suma lo incluido y cuenta lo que no tiene precio", () => {
    const filas = filasDePropuesta([partida({ cantidad: 2, unitPrice: 100, fuente: "usada" }), partida()], 20);
    expect(importeDeFila(filas[0]!)).toBe(200);
    expect(resumenDeFilas(filas)).toEqual({ subtotal: 200, sinPrecio: 1, partidas: 2 });
  });

  it("pasa a partidas del editor con cantidad entera y sin grupos raros", () => {
    const [p] = partidasDeFilas(filasDePropuesta([partida({ cantidad: 2.4, unitPrice: 100, fuente: "usada", grupo: "OTRO", brand: "HP" })], 20));
    expect(p).toMatchObject({ name: "Cámara domo", qty: 2, unitPrice: 100, brand: "HP", grupo: null, tax: 16, unit: "Pieza" });
  });

  it("una fila sin nombre no entra", () => {
    expect(partidasDeFilas(filasDePropuesta([partida({ name: "   " })], 20))).toEqual([]);
  });
});

describe("documentoConPropuesta", () => {
  const datos = {
    cliente: { salesClientId: 5, nombre: "Materiales Pronto" },
    proyecto: "Videovigilancia en bodega",
    segmento: "COMERCIAL" as const,
    conIva: true,
    filas: filasDePropuesta([partida({ unitPrice: 100, fuente: "usada" })], 20),
  };

  it("llena cliente y proyecto, y apaga el margen general para no cobrar doble", () => {
    const doc = documentoConPropuesta(documentoVacio(), datos);
    expect(doc.marginPercent).toBe(0);
    expect(doc).toMatchObject({ salesClientId: 5, clientName: "Materiales Pronto", projectName: "Videovigilancia en bodega" });
    expect(doc.partidas).toHaveLength(1);
  });

  it("no se lleva lo que ya estaba y sí quita renglones vacíos", () => {
    const previo = { ...documentoVacio(), partidas: [partidaNueva({ name: "Ya estaba" }), partidaNueva({ name: "  " })] };
    expect(documentoConPropuesta(previo, datos).partidas.map((p) => p.name)).toEqual(["Ya estaba", "Cámara domo"]);
  });

  it("sin factura se respeta", () => {
    expect(documentoConPropuesta(documentoVacio(), { ...datos, conIva: false }).conIva).toBe(false);
  });
});

describe("documentoCopiadoDe", () => {
  const detalle = {
    id: 47,
    segmento: "COMERCIAL",
    salesClientId: 2,
    clientName: "Hotel Aurora",
    clientEmail: "compras@hotel.test",
    clientPhone: "222",
    issueDate: "2026-10-01",
    validUntil: "2026-10-16",
    items: [{ name: "Impresora", qty: 3, unitPrice: 26000, unit: "Pieza" }],
  } as unknown as CotizacionDetalle;
  const hoy = new Date("2026-11-01T18:00:00Z");

  it("copia con fechas nuevas y conserva el cliente si no se dijo otro", () => {
    const doc = documentoCopiadoDe(detalle, null, hoy);
    expect(doc).toMatchObject({ issueDate: "2026-11-01", validUntil: "2026-11-16", clientEmail: "compras@hotel.test", salesClientId: 2 });
    expect(doc.partidas[0]).toMatchObject({ name: "Impresora", qty: 3, unitPrice: 26000 });
  });

  it("con otro cliente, los datos de contacto del anterior no pasan", () => {
    const doc = documentoCopiadoDe(detalle, { salesClientId: 9, nombre: "Lácteos del Valle" }, hoy);
    expect(doc).toMatchObject({ salesClientId: 9, clientName: "Lácteos del Valle", clientEmail: "", clientPhone: "" });
  });

  it("el mismo cliente dicho de otra forma de mayúsculas conserva su contacto", () => {
    expect(documentoCopiadoDe(detalle, { salesClientId: 2, nombre: "HOTEL AURORA" }, hoy).clientEmail).toBe("compras@hotel.test");
  });
});
