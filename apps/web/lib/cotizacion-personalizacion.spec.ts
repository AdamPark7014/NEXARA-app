import { describe, expect, it } from "vitest";
import {
  columnasDeTabla,
  conCondicionesSugeridas,
  diasDeVigencia,
  opcionesDesdeApi,
  opcionesParaApi,
  opcionesPorOmision,
  resumenOpciones,
} from "./cotizacion-personalizacion";
import {
  cambiosEntre,
  documentoDesdePlantilla,
  documentoVacio,
  payloadDeDocumento,
  terminosPropiosDeNota,
} from "./cotizacion-documento";
import type { ContenidoPlantilla } from "./cotizaciones-api";

describe("opciones de personalización", () => {
  it("sin nada guardado: lo de siempre", () => {
    expect(opcionesDesdeApi(null)).toEqual(opcionesPorOmision());
    expect(opcionesDesdeApi(undefined).columnas).toEqual({ marcaModelo: false, imagen: false, descuento: false, precioUnitario: true });
    expect(resumenOpciones(opcionesPorOmision(), "MXN")).toBe("Todas las secciones · MXN");
  });

  it("toma lo guardado y completa lo que falte", () => {
    const o = opcionesDesdeApi({ secciones: { planos: false }, columnas: { imagen: true }, autorizo: { nombre: "Christian", userId: 3 } });
    expect(o.secciones).toEqual({ objetivo: true, alcance: true, planos: false, terminos: true, firma: true });
    expect(o.columnas.imagen).toBe(true);
    expect(o.autorizo).toEqual({ nombre: "Christian", userId: 3 });
    expect(resumenOpciones({ ...o, columnas: { ...o.columnas, precioUnitario: false } }, "USD")).toBe(
      "Sin planos · tabla con imagen del producto · a precio alzado · USD · firma Elaboró y Autorizó",
    );
  });

  it("al guardar: carta y firmas vacías no viajan, los textos van recortados", () => {
    const o = opcionesParaApi({
      ...opcionesPorOmision(),
      carta: { dirigidaA: "  ", mensaje: "" },
      autorizo: { nombre: "   " },
      elaboro: { nombre: " Jorge Méndez ", cargo: " " },
      condiciones: { formaPago: " Transferencia ", tiempoEntrega: "", garantia: "1 año " },
    });
    expect(o.carta).toBeNull();
    expect(o.autorizo).toBeNull();
    expect(o.elaboro).toEqual({ nombre: "Jorge Méndez" });
    expect(o.condiciones).toEqual({ formaPago: "Transferencia", tiempoEntrega: "", garantia: "1 año" });
  });

  it("las condiciones del segmento solo llenan lo que está vacío", () => {
    const o = conCondicionesSugeridas(
      { ...opcionesPorOmision(), condiciones: { formaPago: "Cheque", tiempoEntrega: "", garantia: "" } },
      { formaPago: "Transferencia", tiempoEntrega: "5 días", garantia: "Fabricante" },
    );
    expect(o.condiciones).toEqual({ formaPago: "Cheque", tiempoEntrega: "5 días", garantia: "Fabricante" });
  });

  it("columnas de la tabla según lo que se enciende (el total siempre penúltimo)", () => {
    expect(columnasDeTabla(opcionesPorOmision().columnas).split(" ").filter((c) => c.endsWith("px"))).toHaveLength(6);
    const todas = columnasDeTabla({ marcaModelo: true, descuento: true, imagen: true, precioUnitario: true });
    expect(todas).toContain("84px 92px 60px 44px 112px 32px");
  });

  it("vigencia en días", () => {
    expect(diasDeVigencia("2026-09-18", "2026-10-03")).toBe(15);
    expect(diasDeVigencia("2026-09-18", "")).toBeNull();
  });
});

describe("el documento con personalización", () => {
  it("el payload lleva moneda y opciones, y no cambia si nadie las toca", () => {
    const doc = documentoVacio("OBRA", new Date("2026-09-18T12:00:00"));
    const antes = payloadDeDocumento(doc);
    expect(antes.currency).toBe("MXN");
    expect(antes.opciones).toEqual(opcionesPorOmision());
    expect(cambiosEntre(antes, payloadDeDocumento({ ...doc }))).toEqual({});
    const despues = payloadDeDocumento({ ...doc, moneda: "USD", opciones: { ...doc.opciones, secciones: { ...doc.opciones.secciones, planos: false } } });
    expect(Object.keys(cambiosEntre(antes, despues)).sort()).toEqual(["currency", "opciones"]);
  });

  it("nueva desde plantilla: textos, partidas y opciones de la plantilla; el cliente se queda", () => {
    const contenido: ContenidoPlantilla = {
      segmento: "OBRA",
      projectName: "CCTV obra",
      scope: "Entrada.",
      objetivo: "Intro del objetivo.\n\nBeneficios:\n1. Más cobertura.\n\nCierre:\nCierre.",
      alcanceBloques: [{ clave: "plantilla:mantenimiento", titulo: "Mantenimiento", texto: "Texto", vinetas: ["Uno"] }],
      note: "No incluye:\nObra civil.\n\nOtras condiciones:\nPrecios en USD.",
      depositPercent: 60,
      currency: "USD",
      opciones: { ...opcionesPorOmision(), columnas: { marcaModelo: true, imagen: false, descuento: false, precioUnitario: true } },
      items: [{ name: "Cámara", unit: "Pieza", qty: 3, unitPrice: 800, brand: "Hikvision" }],
    };
    const actual = { ...documentoVacio(), clientName: "Plaza Norte" };
    const doc = documentoDesdePlantilla(contenido, actual, { formaPago: "Transferencia", tiempoEntrega: "", garantia: "" });
    expect(doc.clientName).toBe("Plaza Norte");
    expect(doc.segmento).toBe("OBRA");
    expect(doc.projectName).toBe("CCTV obra");
    expect(doc.objetivo.beneficios.map((b) => b.texto)).toEqual(["Más cobertura."]);
    expect(doc.bloques[0]?.titulo).toBe("Mantenimiento");
    expect(doc.partidas[0]).toMatchObject({ name: "Cámara", qty: 3, unitPrice: 800, brand: "Hikvision" });
    expect(doc.terminos).toEqual({ noIncluye: "Obra civil.", otras: "Precios en USD." });
    expect(doc.moneda).toBe("USD");
    expect(doc.depositPercent).toBe(60);
    expect(doc.opciones.columnas.marcaModelo).toBe(true);
    expect(doc.opciones.condiciones.formaPago).toBe("Transferencia");
  });

  it("lee los términos reescritos de una nota", () => {
    expect(terminosPropiosDeNota("Forma de pago:\n100 % anticipado.\nSin excepciones.")).toEqual({
      pago: "100 % anticipado.\nSin excepciones.",
    });
    expect(terminosPropiosDeNota("")).toEqual({});
  });
});
