import { describe, expect, it } from "vitest";
import {
  conUnSoloActual,
  diasDesde,
  faltaDeProyecto,
  medioProbableDeAceptacion,
  motivoDePerdida,
  pasosDeFacturaYCobro,
  salioEnPalabras,
  siguientePasoDeProyecto,
} from "./hilo-negocio";

const AHORA = new Date("2026-11-08T12:00:00Z");

const PROYECTO = {
  status: "PLANNED",
  endDate: null,
  cotizacion: { id: 7 },
  scopeItems: Array.from({ length: 12 }),
  activities: [],
  members: [{}],
  requirements: [],
  factura: null,
};

describe("cómo salió", () => {
  it("lo dice como se diría", () => {
    expect(salioEnPalabras("WHATSAPP", "2026-11-02T12:00:00Z", AHORA)).toBe("Salió por WhatsApp hace 6 días.");
    expect(salioEnPalabras("CORREO_CORE", "2026-11-07T12:00:00Z", AHORA)).toBe("Salió por correo ayer.");
    expect(salioEnPalabras("EN_PERSONA", "2026-11-08T08:00:00Z", AHORA)).toBe("Se entregó en persona hoy.");
  });

  it("sin medio o sin fecha, solo lo que se sabe", () => {
    expect(salioEnPalabras("OTRO", "2026-11-02T12:00:00Z", AHORA)).toBe("Salió hace 6 días.");
    expect(salioEnPalabras(null, null, AHORA)).toBe("Salió.");
  });

  it("una fecha rota no inventa días", () => {
    expect(diasDesde("no es fecha", AHORA)).toBeNull();
  });
});

describe("cómo aceptó", () => {
  it("si firmó el enlace, eso manda", () => {
    expect(medioProbableDeAceptacion("WHATSAPP", "2026-11-02T12:00:00Z")).toBe("FIRMA");
  });

  it("si no, suele contestar por donde se le mandó", () => {
    expect(medioProbableDeAceptacion("WHATSAPP", null)).toBe("WHATSAPP");
    expect(medioProbableDeAceptacion("CORREO_EXTERNO", null)).toBe("CORREO");
    expect(medioProbableDeAceptacion("OTRO", null)).toBeNull();
  });
});

describe("por qué se perdió", () => {
  it("guarda el motivo y la nota, si hay", () => {
    expect(motivoDePerdida("Por precio", "  ")).toBe("Por precio");
    expect(motivoDePerdida("Por precio", "Otro ofreció 12 % menos")).toBe("Por precio. Otro ofreció 12 % menos");
  });
});

describe("factura y cobro", () => {
  it("sin ganar, todavía no le toca a nadie", () => {
    const [f, c] = pasosDeFacturaYCobro(null, null, false);
    expect(f).toMatchObject({ hint: "Pendiente", state: "pending" });
    expect(c).toMatchObject({ hint: "Pendiente", state: "pending" });
  });

  it("ganada, ya está en Por facturar", () => {
    expect(pasosDeFacturaYCobro(null, null, true)[0]!.hint).toBe("En Por facturar");
  });

  it("facturada enseña su folio y liga a la factura", () => {
    const [f, c] = pasosDeFacturaYCobro({ estado: "FACTURADA", id: 9, folio: "A-12" }, { estado: "PENDIENTE" }, true);
    expect(f).toMatchObject({ hint: "A-12", state: "done", href: "/erp/invoicing/9" });
    expect(c!.hint).toBe("Por cobrar");
  });

  it("el cobro: parcial no está hecho, pagada sí", () => {
    const factura = { estado: "FACTURADA" as const, id: 9, folio: "A-12" };
    expect(pasosDeFacturaYCobro(factura, { estado: "PARCIAL" }, true)[1]).toMatchObject({ hint: "Cobro parcial", state: "pending" });
    expect(pasosDeFacturaYCobro(factura, { estado: "PAGADA" }, true)[1]).toMatchObject({ hint: "Pagada", state: "done" });
  });
});

describe("un solo paso en curso", () => {
  it("es el primero que falta", () => {
    const r = conUnSoloActual([{ state: "done" }, { state: "pending" }, { state: "current" }, { state: "done" }] as const as never);
    expect((r as Array<{ state: string }>).map((p) => p.state)).toEqual(["done", "current", "pending", "done"]);
  });
});

describe("siguiente paso del proyecto", () => {
  it("recién nacido: programar, y dice cuántas partidas ya trae", () => {
    expect(siguientePasoDeProyecto(PROYECTO)).toEqual({
      titulo: "Siguiente paso: programar el trabajo",
      texto: "Las 12 partidas ya están en el alcance. Falta decidir quién hace qué y cuándo.",
      accion: "actividad",
    });
  });

  it("sin cotización no presume partidas", () => {
    expect(siguientePasoDeProyecto({ ...PROYECTO, cotizacion: null })!.texto).toBe("Falta decidir quién hace qué y cuándo.");
  });

  it("programado pero sin arrancar: arrancar", () => {
    expect(siguientePasoDeProyecto({ ...PROYECTO, activities: [{}, {}] })).toMatchObject({
      titulo: "Siguiente paso: arrancar",
      texto: "Ya hay 2 actividades programadas. Márcalo cuando empiece el trabajo.",
      accion: null,
    });
  });

  it("en curso y con actividades no estorba", () => {
    expect(siguientePasoDeProyecto({ ...PROYECTO, status: "ACTIVE", activities: [{}] })).toBeNull();
  });

  it("entregado y sin factura: facturar", () => {
    expect(siguientePasoDeProyecto({ ...PROYECTO, status: "COMPLETED" })!.accion).toBe("facturar");
    expect(siguientePasoDeProyecto({ ...PROYECTO, status: "COMPLETED", factura: { estado: "FACTURADA", id: 1, folio: null } })).toBeNull();
  });

  it("cancelado no pide nada", () => {
    expect(siguientePasoDeProyecto({ ...PROYECTO, status: "CANCELLED" })).toBeNull();
    expect(faltaDeProyecto({ ...PROYECTO, status: "CANCELLED" })).toEqual([]);
  });
});

describe("lo que falta", () => {
  it("fecha, equipo y requerimientos", () => {
    expect(faltaDeProyecto(PROYECTO).map((f) => f.etiqueta)).toEqual(["Fecha de entrega", "Equipo de trabajo", "Requerimientos del sitio"]);
  });

  it("lo capturado deja de faltar", () => {
    expect(faltaDeProyecto({ ...PROYECTO, endDate: "2026-12-01", members: [{}, {}], requirements: [{}] })).toEqual([]);
  });
});
