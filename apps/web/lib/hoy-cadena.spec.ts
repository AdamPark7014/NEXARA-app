import { describe, expect, it } from "vitest";
import { pasosDeLaCadena, siguientePasoDelNegocio, type CadenaNegocio } from "./hoy-cadena";

/** Las cifras reales del 02-11: todo en borrador y un proyecto que no viene de una cotización. */
const HOY: CadenaNegocio = {
  cotizaciones: { total: 56, borradores: 56, vigentesPorEnviar: 29, enviadas: 0, porDecidir: 0, ganadas: 0, ganadasSinProyecto: 0 },
  proyectos: 1,
  facturas: 0,
  cobrado: 0,
  actividades: { total: 378, conProyecto: 1, porValidar: 38, enProceso: 2, finalizadas: 305 },
};

describe("la cadena del negocio", () => {
  it("dice dónde se detiene: en el primer cero", () => {
    const pasos = pasosDeLaCadena(HOY);
    expect(pasos.map((p) => [p.etiqueta, p.valor, p.estado])).toEqual([
      ["Cotizaciones", "56", "lleno"],
      ["Enviadas", "0", "aqui"],
      ["Ganadas", "0", "vacio"],
      ["Proyectos", "1", "lleno"],
      ["Facturas", "0", "vacio"],
      ["Cobrado", "$0", "vacio"],
    ]);
    expect(pasos[0]!.nota).toBe("56 en borrador");
    expect(pasos[1]!.nota).toBe("Aquí se detiene");
    expect(pasos[3]!.nota).toBe("Y 1 de 378 actividades ligada");
  });

  it("sin cotizaciones se detiene en la primera, sin decir que se detuvo", () => {
    const pasos = pasosDeLaCadena({ ...HOY, cotizaciones: { ...HOY.cotizaciones, total: 0, borradores: 0 } });
    expect(pasos[0]).toMatchObject({ estado: "aqui", nota: "Todavía ninguna" });
    expect(pasos[1]!.estado).toBe("vacio");
  });

  it("con todo lleno no marca ninguno", () => {
    const pasos = pasosDeLaCadena({
      ...HOY,
      cotizaciones: { ...HOY.cotizaciones, enviadas: 9, ganadas: 4, ganadasSinProyecto: 1, porDecidir: 2 },
      facturas: 3,
      cobrado: 120000,
    });
    expect(pasos.every((p) => p.estado === "lleno")).toBe(true);
    expect(pasos[1]!.nota).toBe("2 por decidir");
    expect(pasos[2]!.nota).toBe("1 sin proyecto");
    expect(pasos[5]!.valor).toBe("$120,000");
  });

  it("varias actividades ligadas se dicen en plural", () => {
    const pasos = pasosDeLaCadena({ ...HOY, actividades: { ...HOY.actividades, conProyecto: 12 } });
    expect(pasos[3]!.nota).toBe("Y 12 de 378 actividades ligadas");
  });
});

describe("el siguiente paso", () => {
  it("hoy: marcar las que ya salieron", () => {
    expect(siguientePasoDelNegocio(HOY)).toEqual({
      titulo: "Siguiente paso: marcar las que ya salieron",
      texto: "29 cotizaciones vigentes siguen en borrador. Cuando se envíen y se ganen, aquí empieza a verse el dinero.",
      accion: { etiqueta: "Ver cotizaciones", href: "/erp/cotizaciones?estado=BORRADOR" },
    });
  });

  it("una enviada sin respuesta pesa más que los borradores", () => {
    const paso = siguientePasoDelNegocio({ ...HOY, cotizaciones: { ...HOY.cotizaciones, enviadas: 1, porDecidir: 1 } });
    expect(paso).toMatchObject({
      texto: "1 cotización enviada espera saber si se ganó o se perdió.",
      accion: { etiqueta: "Revisar", href: "/erp/cotizaciones?estado=ENVIADA" },
    });
  });

  it("una ganada sin proyecto pesa más que todo", () => {
    const paso = siguientePasoDelNegocio({
      ...HOY,
      cotizaciones: { ...HOY.cotizaciones, enviadas: 3, porDecidir: 2, ganadas: 1, ganadasSinProyecto: 1 },
    });
    expect(paso).toMatchObject({
      texto: "1 cotización ganada todavía no tiene proyecto.",
      accion: { etiqueta: "Crear proyecto", href: "/erp/cotizaciones?estado=APROBADA&sinProyecto=1" },
    });
  });

  it("con dinero entrando, los borradores ya no son el siguiente paso", () => {
    expect(siguientePasoDelNegocio({ ...HOY, cobrado: 5000, facturas: 1 })).toBeNull();
  });

  it("sin nada pendiente no enseña la franja", () => {
    expect(siguientePasoDelNegocio({ ...HOY, cotizaciones: { ...HOY.cotizaciones, vigentesPorEnviar: 0 } })).toBeNull();
  });
});
