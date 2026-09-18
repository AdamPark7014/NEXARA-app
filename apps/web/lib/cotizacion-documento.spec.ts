import { describe, expect, it } from "vitest";
import {
  bloquesDesdeApi,
  bloquesParaApi,
  cambiosEntre,
  documentoDesdeDetalle,
  documentoVacio,
  escribirObjetivo,
  escribirTerminos,
  faltaParaEnviar,
  faltaParaGuardar,
  itemsDesdeTextos,
  leerObjetivo,
  mover,
  nuevoBloque,
  partidaNueva,
  partidasParaApi,
  payloadDeDocumento,
  sumarDias,
  totalesDePartidas,
} from "./cotizacion-documento";
import { formatoFecha, type CotizacionDetalle } from "./cotizaciones-api";

/** Mismos casos que `apps/api/src/cotizaciones/alcance-y-objetivo.spec.ts`: web y PDF leen igual. */
describe("objetivo como texto", () => {
  const partes = {
    intro: "Este proyecto permitirá contar con un sistema más confiable.\n\nSegundo párrafo.",
    beneficios: ["Mayor cobertura con 15 nuevas cámaras.", "Monitoreo remoto."],
    cierre: "Como resultado, el cliente dispondrá de mayor cobertura.",
  };

  it("ida y vuelta", () => {
    expect(leerObjetivo(escribirObjetivo(partes))).toEqual(partes);
  });

  it("guarda el texto con las marcas que lee la API", () => {
    expect(escribirObjetivo(partes)).toBe(
      `${partes.intro}\n\nBeneficios:\n1. ${partes.beneficios[0]}\n2. ${partes.beneficios[1]}\n\nCierre:\n${partes.cierre}`,
    );
  });

  it("un cierre sin beneficios no se vuelve introducción", () => {
    expect(leerObjetivo(escribirObjetivo({ intro: "Intro.", beneficios: [], cierre: "Cierre." }))).toEqual({
      intro: "Intro.",
      beneficios: [],
      cierre: "Cierre.",
    });
  });

  it("lee un objetivo viejo en texto libre como introducción", () => {
    expect(leerObjetivo("Dejar el patio cubierto.")).toEqual({ intro: "Dejar el patio cubierto.", beneficios: [], cierre: "" });
  });

  it("lee lo pegado del documento modelo (lista numerada sin marcas)", () => {
    const pegado = "Intro.\n\nEntre los principales beneficios se encuentran:\n1. Uno\n   que sigue.\n2) Dos.\n\nCierre final.";
    expect(leerObjetivo(pegado)).toEqual({ intro: "Intro.", beneficios: ["Uno que sigue.", "Dos."], cierre: "Cierre final." });
  });
});

describe("subsecciones de alcance", () => {
  it("del editor a la API: sin viñetas vacías ni bloques vacíos", () => {
    const bloques = [
      nuevoBloque({ clave: "libre-1", titulo: " Mantenimiento ", texto: "Actividades:", vinetas: ["Recableado.", "  ", "Balunes."] }),
      nuevoBloque({ clave: "libre-2" }),
    ];
    expect(bloquesParaApi(bloques)).toEqual([
      { clave: "libre-1", titulo: "Mantenimiento", texto: "Actividades:", vinetas: ["Recableado.", "Balunes."] },
    ]);
  });

  it("de la API al editor: acepta bloques viejos y conserva los parámetros del paquete", () => {
    const bloques = bloquesDesdeApi([
      { clave: "paquete:camara-bala-instalada", titulo: "Cámara bala", texto: "8 cámaras", parametros: { cantidad: 8 } },
      { titulo: "Exclusiones", vinetas: "Obra civil\nPermisos" },
      null,
    ]);
    expect(bloques).toHaveLength(2);
    expect(bloques[0]!.parametros).toEqual({ cantidad: 8 });
    expect(bloques[1]!.clave).toBe("libre-2");
    expect(bloques[1]!.vinetas.map((v) => v.texto)).toEqual(["Obra civil", "Permisos"]);
    // Ida y vuelta.
    expect(bloquesParaApi(bloques)[0]).toEqual({
      clave: "paquete:camara-bala-instalada",
      titulo: "Cámara bala",
      texto: "8 cámaras",
      vinetas: [],
      parametros: { cantidad: 8 },
    });
  });

  it("mover no muta y respeta los límites", () => {
    const lista = ["a", "b", "c"];
    expect(mover(lista, 0, 2)).toEqual(["b", "c", "a"]);
    expect(mover(lista, 0, -1)).toBe(lista);
    expect(lista).toEqual(["a", "b", "c"]);
  });
});

describe("partidas y totales", () => {
  it("IVA por renglón y total con dos decimales", () => {
    const t = totalesDePartidas([
      partidaNueva({ name: "Cámara bala", qty: 8, unitPrice: 592.42, grupo: "EQUIPOS" }),
      partidaNueva({ name: "Instalación", qty: 15, unitPrice: 1000, grupo: "MANO_DE_OBRA" }),
      partidaNueva({ name: "", qty: 3, unitPrice: 999 }),
    ]);
    expect(t.subtotal).toBe(19739.36);
    expect(t.iva).toBe(3158.3);
    expect(t.total).toBe(22897.66);
    expect(t.porGrupo.MANO_DE_OBRA).toBe(15000);
  });

  it("a la API no van renglones vacíos, ni la clave local, y la cantidad es al menos 1", () => {
    const [p, ...resto] = partidasParaApi([
      partidaNueva({ name: " Poste 3 m ", qty: Number.NaN, unitPrice: 2661.58, unit: "" }),
      partidaNueva({ name: "   " }),
    ]);
    expect(resto).toHaveLength(0);
    expect(p).toMatchObject({ name: "Poste 3 m", qty: 1, unitPrice: 2661.58, unit: "Pieza", tax: 16 });
    expect(p).not.toHaveProperty("key");
  });
});

describe("términos reescritos", () => {
  it("solo se guarda lo que se reescribió, con su título", () => {
    expect(escribirTerminos({ noIncluye: "Obra civil.", pago: "" })).toBe("No incluye:\nObra civil.");
    expect(escribirTerminos({})).toBe("");
  });
});

describe("documento y autoguardado", () => {
  const detalle = {
    id: 7,
    folio: "NEX-LJ75100126-0007",
    quoteNumber: "NEX-LJ75100126-0007",
    estado: "BORRADOR",
    estadoEtiqueta: "Borrador",
    bloqueada: false,
    segmento: "OBRA",
    segmentoEtiqueta: "Obra",
    revision: 1,
    issueDate: "2026-09-18T00:00:00.000Z",
    validUntil: "2026-10-03T00:00:00.000Z",
    clientName: "Plaza Norte",
    clientEmail: "compras@plazanorte.mx",
    projectName: "CCTV",
    scope: "Intro del alcance",
    objetivo: "Intro.\n\nBeneficios:\n1. Uno",
    alcanceBloques: [{ clave: "libre-1", titulo: "A", texto: "t", vinetas: ["v"] }],
    depositPercent: 60,
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    incluyeInstalacion: false,
    terminos: {
      modalidad: "SUMINISTRO_INSTALACION",
      titulo: "Términos y condiciones",
      lineas: [],
      partes: [
        { clave: "pago", titulo: "Forma de pago", texto: "60 %", personalizado: false },
        { clave: "noIncluye", titulo: "No incluye", texto: "Obra civil.", personalizado: true },
      ],
    },
    grupos: [],
    totalesPorGrupo: { EQUIPOS: 0, MATERIALES: 0, MANO_DE_OBRA: 0 },
    items: [{ id: 1, name: "Cámara", qty: 2, unitPrice: 100, unit: "Pieza", tax: 16 }],
    participantes: [],
    actividades: [],
  } as unknown as CotizacionDetalle;

  it("del detalle al documento y de vuelta al payload, sin cambios fantasma", () => {
    const doc = documentoDesdeDetalle(detalle);
    expect(doc.issueDate).toBe("2026-09-18");
    expect(doc.objetivo.beneficios.map((b) => b.texto)).toEqual(["Uno"]);
    expect(doc.terminos).toEqual({ noIncluye: "Obra civil." });
    const payload = payloadDeDocumento(doc);
    expect(payload.note).toBe("No incluye:\nObra civil.");
    expect(payload.scope).toBe("Intro del alcance");
    // El mismo documento no genera cambios: abrir una cotización no la guarda.
    expect(cambiosEntre(payload, payloadDeDocumento(documentoDesdeDetalle(detalle)))).toEqual({});
  });

  it("solo viaja lo que cambió", () => {
    const doc = documentoDesdeDetalle(detalle);
    const antes = payloadDeDocumento(doc);
    const despues = payloadDeDocumento({
      ...doc,
      objetivo: { ...doc.objetivo, beneficios: [...doc.objetivo.beneficios, ...itemsDesdeTextos(["Dos"])] },
    });
    expect(Object.keys(cambiosEntre(antes, despues))).toEqual(["objetivo"]);
  });

  it("un correo a medio escribir o una fecha vacía no se mandan (la API los rechazaría)", () => {
    const doc = { ...documentoVacio("COMERCIAL", new Date(2026, 8, 18)), clientName: "Hotel", clientEmail: "compras@", validUntil: "" };
    const payload = payloadDeDocumento(doc);
    expect(payload).not.toHaveProperty("clientEmail");
    expect(payload).not.toHaveProperty("validUntil");
    expect(payload.issueDate).toBe("2026-09-18");
  });

  it("una nueva nace con 15 días de validez y se guarda en cuanto hay cliente", () => {
    const doc = documentoVacio("COMERCIAL", new Date(2026, 8, 18));
    expect(doc.validUntil).toBe("2026-10-03");
    expect(faltaParaGuardar(doc)).toMatch(/cliente/);
    expect(faltaParaGuardar({ ...doc, clientName: "Hotel Centro" })).toBeNull();
    expect(faltaParaEnviar({ ...doc, clientName: "Hotel Centro" })).toEqual(["al menos una partida en 04 Cotización"]);
  });

  it("suma días sin tropezar con el cambio de mes", () => {
    expect(sumarDias("2026-09-25", 15)).toBe("2026-10-10");
  });

  it("una fecha de emisión (medianoche UTC) se lee en su día, no el anterior", () => {
    expect(formatoFecha("2026-09-18T00:00:00.000Z")).toMatch(/^18 /);
    expect(formatoFecha("2026-09-18")).toMatch(/^18 /);
    expect(formatoFecha(null)).toBe("—");
  });
});
