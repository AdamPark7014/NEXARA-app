import { describe, expect, it } from "vitest";
import {
  borradorVacio,
  cuerpoDeAlta,
  erroresDelBorrador,
  erroresDelPaso,
  leerImporte,
  type BorradorProyecto,
} from "./proyecto-alta";

function borrador(cambios: Partial<BorradorProyecto> = {}): BorradorProyecto {
  return { ...borradorVacio("2026-09-17", "7"), title: "CCTV Plaza Norte", clienteId: "12", ...cambios };
}

describe("errores por paso", () => {
  it("datos: pide nombre y cliente", () => {
    const errores = erroresDelPaso("datos", borradorVacio("2026-09-17", "7"));
    expect(errores).toContain("Escribe el nombre del proyecto (al menos 3 letras).");
    expect(errores).toContain("Elige el cliente.");
    expect(erroresDelPaso("datos", borrador())).toEqual([]);
  });

  it("datos: los sitios son un entero", () => {
    expect(erroresDelPaso("datos", borrador({ siteCount: "2.5" }))).toHaveLength(1);
    expect(erroresDelPaso("datos", borrador({ siteCount: "4" }))).toEqual([]);
  });

  it("fechas: el fin no puede ir antes del inicio", () => {
    expect(erroresDelPaso("fechas", borrador({ startDate: "2026-09-20", endDate: "2026-09-10" }))).toEqual([
      "El fin planeado no puede ser antes del inicio.",
    ]);
    expect(erroresDelPaso("fechas", borrador({ startDate: "" }))).toContain("Pon la fecha de inicio planeada.");
  });

  it("fechas: el presupuesto acepta comas y rechaza letras", () => {
    expect(erroresDelPaso("fechas", borrador({ budget: "150,000.50" }))).toEqual([]);
    expect(erroresDelPaso("fechas", borrador({ budget: "mucho" }))).toHaveLength(1);
  });

  it("cronograma: una etapa necesita nombre de 3 letras; las vacías se ignoran", () => {
    const b = borrador({
      etapas: [
        { clave: "a", name: "Ok", plannedDate: "", responsableId: "" },
        { clave: "b", name: "", plannedDate: "", responsableId: "" },
      ],
    });
    expect(erroresDelPaso("cronograma", b)).toHaveLength(1);
  });

  it("cronograma: una etapa sin nombre pero con fecha no se pierde en silencio", () => {
    const b = borrador({ etapas: [{ clave: "a", name: "", plannedDate: "2026-10-01", responsableId: "" }] });
    expect(erroresDelPaso("cronograma", b)).toEqual(["Hay una etapa con fecha o responsable pero sin nombre."]);
  });

  it("el borrador completo junta los errores de todos los pasos", () => {
    expect(erroresDelBorrador(borrador())).toEqual([]);
    expect(erroresDelBorrador(borradorVacio("2026-09-17", "")).length).toBeGreaterThanOrEqual(3);
  });
});

describe("cuerpo del POST", () => {
  it("lee importes con separadores", () => {
    expect(leerImporte("")).toBeNull();
    expect(leerImporte("$ 1,250.5")).toBe(1250.5);
    expect(Number.isNaN(leerImporte("abc"))).toBe(true);
  });

  it("arma el alta completa y descarta renglones vacíos", () => {
    const cuerpo = cuerpoDeAlta(
      borrador({
        endDate: "2026-12-15",
        budget: "250,000",
        siteCount: "3",
        cotizacionId: "44",
        importarAlcance: true,
        etapas: [
          { clave: "1", name: " Levantamiento ", plannedDate: "2026-09-30", responsableId: "9" },
          { clave: "2", name: "  ", plannedDate: "", responsableId: "" },
        ],
        alcance: [
          { clave: "1", kind: "ENTREGABLE", titulo: "32 cámaras instaladas", detalle: "" },
          { clave: "2", kind: "EXCLUSION", titulo: "", detalle: "" },
        ],
        requerimientos: [{ clave: "1", titulo: "Anticipo recibido", responsableId: "", dueDate: "" }],
      }),
      501,
    );
    expect(cuerpo).toMatchObject({
      title: "CCTV Plaza Norte",
      clientId: 501,
      responsableId: 7,
      startDate: "2026-09-17",
      endDate: "2026-12-15",
      budgetAmount: 250000,
      currency: "MXN",
      siteCount: 3,
      cotizacionId: 44,
      importarAlcanceDeCotizacion: true,
    });
    expect(cuerpo.milestones).toEqual([
      { name: "Levantamiento", plannedDate: "2026-09-30", responsableId: 9, orden: 0 },
    ]);
    expect(cuerpo.scopeItems).toEqual([{ kind: "ENTREGABLE", titulo: "32 cámaras instaladas", orden: 0 }]);
    expect(cuerpo.requirements).toEqual([
      { titulo: "Anticipo recibido", responsableId: null, dueDate: null, orden: 0 },
    ]);
  });

  it("sin cotización no manda la bandera de importar", () => {
    const cuerpo = cuerpoDeAlta(borrador({ cotizacionId: "", importarAlcance: true }), 1);
    expect(cuerpo).not.toHaveProperty("cotizacionId");
    expect(cuerpo).not.toHaveProperty("importarAlcanceDeCotizacion");
  });

  it("el equipo no repite al responsable ni a nadie dos veces", () => {
    const cuerpo = cuerpoDeAlta(
      borrador({
        equipo: [
          { clave: "a", userId: "7", role: "INGENIERO", notas: "" },
          { clave: "b", userId: "8", role: "INSTALADOR", notas: " turno noche " },
          { clave: "c", userId: "8", role: "APOYO", notas: "" },
          { clave: "d", userId: "", role: "APOYO", notas: "" },
        ],
      }),
      1,
    );
    expect(cuerpo.members).toEqual([{ userId: 8, role: "INSTALADOR", notas: "turno noche" }]);
  });
});
