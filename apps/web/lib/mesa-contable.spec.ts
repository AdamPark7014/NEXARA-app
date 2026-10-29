import { describe, expect, it } from "vitest";
import {
  MENOS,
  alturasMargen,
  avisoTimbrado,
  balanceVacio,
  botonPorFacturar,
  cabeceraPeriodo,
  cifra,
  cifraPoliza,
  descripcionMargen,
  diasEntre,
  diasTexto,
  dinero,
  dineroConSigno,
  dineroCorto,
  esAgrupadorValido,
  esArchivoXml,
  esBorrador,
  esUuid,
  etiquetaEstadoFactura,
  etiquetaIva,
  etiquetaMes,
  fechaCorta,
  fechaMedia,
  filtrarPorFacturar,
  formaBloqueada,
  formaParaMetodo,
  haceDias,
  indice,
  mesActual,
  mesLargo,
  motivoNoTimbrar,
  moverMes,
  opcionesCon,
  FORMAS_PAGO,
  pasoPeriodo,
  pintaCelda,
  plural,
  porcentaje,
  preparableEnLote,
  primerNombre,
  puntaje,
  queryPagosGastos,
  resultadosVacios,
  rutaBalanzaXml,
  semaforoDeHabiles,
  textoOrigenConceptos,
  textoSugerencia,
  tintaSemaforo,
  tituloCierre,
  tonoVariacion,
  totalSeccion,
  variacion,
  type PorFacturarItem,
  type RevisionFactura,
} from "./mesa-contable";

function item(p: Partial<PorFacturarItem> = {}): PorFacturarItem {
  return {
    clave: "SERVICIO:412",
    origen: "SERVICIO",
    origenId: 412,
    cliente: { id: 7, nombre: "Colegio Montebello", rfc: "CMO0903155K2" },
    folio: "AN-0412",
    folioHref: "/erp/actividades/412",
    concepto: "Mantenimiento preventivo CCTV, 16 cámaras",
    detalle: null,
    listoDesde: "2026-10-23",
    diasEsperando: 6,
    diasHabiles: 4,
    semaforo: "tarde",
    importe: 18560,
    menos: null,
    pendientes: [],
    nota: null,
    accion: "PREPARAR",
    facturaBorradorId: null,
    ...p,
  };
}

describe("moneda es-MX", () => {
  it("pinta pesos con centavos y menos tipográfico", () => {
    expect(dinero(18560)).toBe("$18,560.00");
    expect(dinero(-1240)).toBe(`${MENOS}$1,240.00`);
    expect(dinero(0)).toBe("$0.00");
    expect(dinero(-0.001)).toBe("$0.00");
    expect(dinero(null)).toBe("$0.00");
    expect(dinero(Number.NaN)).toBe("$0.00");
  });

  it("la cifra de tarjeta va sin centavos", () => {
    expect(dineroCorto(216320)).toBe("$216,320");
    expect(dineroCorto(412300.6)).toBe("$412,301");
    expect(dineroCorto(-9340)).toBe(`${MENOS}$9,340`);
  });

  it("el importe de pagos y gastos lleva signo: entra + y sale −", () => {
    expect(dineroConSigno(25000)).toBe("+$25,000.00");
    expect(dineroConSigno(-2500)).toBe(`${MENOS}$2,500.00`);
    expect(dineroConSigno(0)).toBe("$0.00");
  });

  it("las cifras de estados y pólizas van sin $ y el cero de póliza es raya", () => {
    expect(cifra(268400)).toBe("268,400.00");
    expect(cifra(-28000)).toBe(`${MENOS}28,000.00`);
    expect(cifraPoliza(0)).toBe("—");
    expect(cifraPoliza(18560)).toBe("18,560.00");
  });
});

describe("porcentajes e índices", () => {
  it("porcentaje con un decimal y espacio antes del signo", () => {
    expect(porcentaje(65.1)).toBe("65.1 %");
    expect(porcentaje(50)).toBe("50.0 %");
    expect(porcentaje(null)).toBe("—");
    expect(porcentaje(-3.64)).toBe(`${MENOS}3.6 %`);
  });

  it("variación con signo, y el cero sin signo", () => {
    expect(variacion(15.7)).toBe("+15.7 %");
    expect(variacion(-3.6)).toBe(`${MENOS}3.6 %`);
    expect(variacion(0)).toBe("0.0 %");
    expect(variacion(0.04)).toBe("0.0 %");
    expect(variacion(null)).toBe("—");
  });

  it("índice con dos decimales", () => {
    expect(indice(2.2712)).toBe("2.27");
    expect(indice(null)).toBe("—");
  });
});

describe("fechas y días", () => {
  it("fecha corta sin depender de la zona horaria", () => {
    expect(fechaCorta("2026-10-21")).toBe("21 oct");
    expect(fechaCorta("2026-01-05")).toBe("5 ene");
    expect(fechaCorta("2026-10-21T00:00:00.000Z")).toBe("21 oct");
    expect(fechaCorta("")).toBe("—");
    expect(fechaMedia("2026-11-28")).toBe("28 nov 2026");
  });

  it("«hace N días», «ayer» y «hoy»", () => {
    expect(haceDias(8)).toBe("hace 8 días");
    expect(haceDias(1)).toBe("ayer");
    expect(haceDias(0)).toBe("hoy");
    expect(diasTexto(1)).toBe("1 día");
    expect(diasTexto(8)).toBe("8 días");
  });

  it("días naturales entre emisión y vencimiento", () => {
    expect(diasEntre("2026-10-29", "2026-11-28")).toBe(30);
    expect(diasEntre("2026-10-29", null)).toBeNull();
  });

  it("plural", () => {
    expect(plural(1, "concepto")).toBe("1 concepto");
    expect(plural(12, "concepto")).toBe("12 conceptos");
    expect(plural(2, "cancelación en trámite", "cancelaciones en trámite")).toBe("2 cancelaciones en trámite");
  });
});

describe("selector de mes y periodo", () => {
  it("mueve meses cruzando el año", () => {
    expect(moverMes("2026-10", -1)).toBe("2026-09");
    expect(moverMes("2026-01", -1)).toBe("2025-12");
    expect(moverMes("2026-12", 1)).toBe("2027-01");
    expect(moverMes("2026-10", -12)).toBe("2025-10");
  });

  it("etiqueta y mes en curso", () => {
    expect(etiquetaMes("2026-10")).toBe("Octubre 2026");
    expect(mesActual(new Date(2026, 9, 29))).toBe("2026-10");
    expect(mesLargo("jul")).toBe("julio");
    expect(mesLargo("sep.")).toBe("septiembre");
    expect(pasoPeriodo("trimestre")).toBe(3);
    expect(pasoPeriodo("anio")).toBe(12);
    expect(cabeceraPeriodo("Octubre 2026")).toBe("Octubre");
    expect(cabeceraPeriodo("septiembre")).toBe("Septiembre");
  });

  it("la balanza XML pide mes y año sueltos", () => {
    expect(rutaBalanzaXml("2026-10")).toBe("accounting/accounts/compliance/balanza-xml?month=10&year=2026");
  });

  it("query de pagos y gastos", () => {
    expect(queryPagosGastos({ mes: "2026-10", tipo: "TODO", soloPendientes: true })).toBe("mes=2026-10&tipo=TODO&soloPendientes=1");
    expect(queryPagosGastos({ mes: "2026-10", tipo: "VIATICO", soloPendientes: false })).toBe("mes=2026-10&tipo=VIATICO");
  });
});

describe("semáforo de «Por facturar»", () => {
  it("meta de 2 días hábiles: ≤1 ok, 2 atención, >2 tarde", () => {
    expect(semaforoDeHabiles(0)).toBe("ok");
    expect(semaforoDeHabiles(1)).toBe("ok");
    expect(semaforoDeHabiles(2)).toBe("atencion");
    expect(semaforoDeHabiles(3)).toBe("tarde");
    expect(semaforoDeHabiles(null)).toBe("ok");
  });

  it("tinta: tarde rojo, atención ámbar, a tiempo gris", () => {
    expect(tintaSemaforo("tarde")).toBe("danger");
    expect(tintaSemaforo("atencion")).toBe("warning");
    expect(tintaSemaforo("ok")).toBe("muted");
  });
});

describe("botón de cada renglón", () => {
  it("PREPARAR prepara, también sin precio (el borrador nace con el concepto en $0)", () => {
    expect(botonPorFacturar(item())).toEqual({ tipo: "preparar", texto: "Preparar CFDI", primario: true });
    expect(botonPorFacturar(item({ importe: null })).tipo).toBe("preparar");
  });

  it("ABRIR_BORRADOR abre el borrador existente", () => {
    expect(botonPorFacturar(item({ accion: "ABRIR_BORRADOR", facturaBorradorId: 232 }))).toMatchObject({
      tipo: "abrir",
      texto: "Abrir borrador",
      href: "/erp/contabilidad/por-facturar/232",
    });
    // Sin id no hay a dónde ir: se vuelve a preparar (la API devuelve el que ya existe).
    expect(botonPorFacturar(item({ accion: "ABRIR_BORRADOR", facturaBorradorId: null })).tipo).toBe("preparar");
  });

  it("COMPLEMENTO emite el complemento", () => {
    expect(botonPorFacturar(item({ accion: "COMPLEMENTO", origen: "COMPLEMENTO" }))).toMatchObject({ tipo: "complemento", texto: "Emitir complemento" });
  });

  it("COMPLETAR_CLIENTE va a la fuente o, si no hay, a la ficha del cliente", () => {
    expect(botonPorFacturar(item({ accion: "COMPLETAR_CLIENTE" }))).toMatchObject({ tipo: "enlace", href: "/erp/actividades/412", primario: false });
    expect(botonPorFacturar(item({ accion: "COMPLETAR_CLIENTE", folioHref: null }))).toMatchObject({ href: "/erp/clientes/7" });
    expect(
      botonPorFacturar(item({ accion: "COMPLETAR_CLIENTE", folioHref: null, cliente: { id: null, nombre: "X", rfc: null } })),
    ).toMatchObject({ href: null });
  });

  it("CAPTURAR_PRECIO (ya no lo manda la API) sigue siendo un enlace a la fuente", () => {
    expect(botonPorFacturar(item({ accion: "CAPTURAR_PRECIO" }))).toMatchObject({ tipo: "enlace", texto: "Capturar precio" });
  });

  it("en lote solo se prepara lo que tiene borrador o se prepara con un clic", () => {
    expect(preparableEnLote(item())).toBe(true);
    expect(preparableEnLote(item({ accion: "ABRIR_BORRADOR", facturaBorradorId: 3 }))).toBe(true);
    expect(preparableEnLote(item({ accion: "COMPLEMENTO" }))).toBe(false);
    expect(preparableEnLote(item({ accion: "COMPLETAR_CLIENTE" }))).toBe(false);
  });
});

describe("búsqueda local de la bandeja", () => {
  const items = [
    item(),
    item({ clave: "PEDIDO:32", origen: "PEDIDO", folio: "PED-0032", cliente: { id: 8, nombre: "Clínica San Ángel", rfc: "CSA180412AB3" } }),
  ];

  it("filtra por origen", () => {
    expect(filtrarPorFacturar(items, "PEDIDO", "").map((i) => i.folio)).toEqual(["PED-0032"]);
    expect(filtrarPorFacturar(items, "TODO", "")).toHaveLength(2);
  });

  it("busca por cliente sin acentos, por RFC y por folio", () => {
    expect(filtrarPorFacturar(items, "TODO", "clinica").map((i) => i.folio)).toEqual(["PED-0032"]);
    expect(filtrarPorFacturar(items, "TODO", "cmo0903").map((i) => i.folio)).toEqual(["AN-0412"]);
    expect(filtrarPorFacturar(items, "TODO", "an-0412")).toHaveLength(1);
    expect(filtrarPorFacturar(items, "SERVICIO", "clinica")).toHaveLength(0);
  });
});

describe("aviso de timbrado", () => {
  it("sin PAC: aviso azul con el mensaje del servidor o el del mockup", () => {
    expect(avisoTimbrado({ conectado: false, proveedor: "", mensaje: null })).toMatchObject({
      tono: "info",
      titulo: "El timbrado todavía no está conectado.",
    });
    expect(avisoTimbrado({ conectado: false, proveedor: "", mensaje: "Falta el CSD." })?.texto).toBe("Falta el CSD.");
  });

  it("con el proveedor de prueba: aviso ámbar", () => {
    expect(avisoTimbrado({ conectado: true, proveedor: "mock", mensaje: null })).toMatchObject({
      tono: "warning",
      titulo: "Timbrado de prueba: el UUID no es real.",
    });
  });

  it("con PAC real no hay aviso", () => {
    expect(avisoTimbrado({ conectado: true, proveedor: "facturama", mensaje: null })).toBeNull();
    expect(avisoTimbrado(null)).toBeNull();
  });
});

describe("regla SAT de método y forma de pago", () => {
  it("PPD fija la forma en 99", () => {
    expect(formaParaMetodo("PPD", "03")).toBe("99");
    expect(formaParaMetodo("PPD", null)).toBe("99");
    expect(formaBloqueada("PPD")).toBe(true);
  });

  it("PUE no admite 99: se deja vacía para que se elija", () => {
    expect(formaParaMetodo("PUE", "99")).toBeNull();
    expect(formaParaMetodo("PUE", "03")).toBe("03");
    expect(formaBloqueada("PUE")).toBe(false);
  });

  it("conserva un valor guardado que no está en el catálogo", () => {
    expect(opcionesCon(FORMAS_PAGO, "05").at(-1)).toEqual({ valor: "05", texto: "05" });
    expect(opcionesCon(FORMAS_PAGO, "03")).toBe(FORMAS_PAGO);
  });
});

describe("motivo para no timbrar", () => {
  const base: Pick<RevisionFactura, "puedeTimbrar" | "revisiones" | "timbrado"> = {
    puedeTimbrar: false,
    revisiones: [],
    timbrado: { conectado: true, proveedor: "facturama", mensaje: null },
  };

  it("se puede: sin motivo", () => {
    expect(motivoNoTimbrar({ ...base, puedeTimbrar: true })).toBeNull();
  });

  it("un error: lo dice tal cual", () => {
    expect(
      motivoNoTimbrar({ ...base, revisiones: [{ clave: "precio", nivel: "error", texto: "Hay conceptos sin precio", detalle: null }] }),
    ).toBe("Antes de timbrar: Hay conceptos sin precio.");
  });

  it("varios errores: los cuenta", () => {
    const e = { nivel: "error" as const, detalle: null };
    expect(
      motivoNoTimbrar({ ...base, revisiones: [{ clave: "a", texto: "A", ...e }, { clave: "b", texto: "B", ...e }] }),
    ).toMatch(/2 cosas por corregir/);
  });

  it("sin errores y sin PAC: el mensaje del timbrado", () => {
    expect(motivoNoTimbrar({ ...base, timbrado: { conectado: false, proveedor: "", mensaje: "Sin PAC" } })).toBe("Sin PAC");
    expect(motivoNoTimbrar({ ...base, timbrado: { conectado: false, proveedor: "", mensaje: null } })).toBe(
      "El timbrado todavía no está conectado.",
    );
  });
});

describe("etiquetas de la factura", () => {
  it("estado", () => {
    expect(etiquetaEstadoFactura("DRAFT")).toBe("Borrador");
    expect(etiquetaEstadoFactura("CANCEL_PENDING")).toBe("Cancelación pendiente");
    expect(etiquetaEstadoFactura(null)).toBe("Borrador");
    expect(esBorrador("DRAFT")).toBe(true);
    expect(esBorrador("STAMPED")).toBe(false);
  });

  it("IVA con tasa única o mixta", () => {
    expect(etiquetaIva([{ ivaPct: 16 }, { ivaPct: 16 }])).toBe("IVA trasladado 16 %");
    expect(etiquetaIva([{ ivaPct: 16 }, { ivaPct: 0 }])).toBe("IVA trasladado");
  });

  it("subtítulo de conceptos según el origen", () => {
    expect(textoOrigenConceptos("SERVICIO")).toBe("Vienen de la cotización aprobada; claves SAT de su catálogo");
    expect(textoOrigenConceptos(null)).toBe("Claves SAT de su catálogo");
  });
});

describe("pagos y gastos", () => {
  it("UUID del SAT", () => {
    expect(esUuid("6F9C1E2A-1B2C-4D5E-8F90-1A2B3C4D9C1E")).toBe(true);
    expect(esUuid(" 6f9c1e2a-1b2c-4d5e-8f90-1a2b3c4d9c1e ")).toBe(true);
    expect(esUuid("6F9C1E2A1B2C4D5E8F901A2B3C4D9C1E")).toBe(false);
    expect(esUuid("")).toBe(false);
  });

  it("archivo XML", () => {
    expect(esArchivoXml({ name: "factura.XML" })).toBe(true);
    expect(esArchivoXml({ name: "cfdi", type: "text/xml" })).toBe(true);
    expect(esArchivoXml({ name: "ticket.pdf", type: "application/pdf" })).toBe(false);
  });

  it("cada estado de celda tiene su pintura", () => {
    expect(pintaCelda("ok")).toBe("ok");
    expect(pintaCelda("falta")).toBe("aviso");
    expect(pintaCelda("parcial")).toBe("aviso");
    expect(pintaCelda("sugerencia")).toBe("sugerencia");
    expect(pintaCelda("no_aplica")).toBe("gris");
    expect(pintaCelda("espera")).toBe("gris");
  });

  it("texto de la sugerencia del banco", () => {
    expect(textoSugerencia({ texto: "", sugerencia: { score: 0.96 } })).toBe("Sugerencia 96 %");
    expect(textoSugerencia({ texto: "", sugerencia: { score: 88 } })).toBe("Sugerencia 88 %");
    expect(textoSugerencia({ texto: "Sugerencia 96 %", sugerencia: null })).toBe("Sugerencia 96 %");
    expect(puntaje(0.955)).toBe(96);
  });

  it("primer nombre del responsable", () => {
    expect(primerNombre("Iván Ramírez")).toBe("Iván");
    expect(primerNombre(null)).toBe("");
  });
});

describe("estados financieros", () => {
  it("variación: ingresos y utilidades suben verde; gastos solo rojo si suben 20 % o más", () => {
    expect(tonoVariacion("ingresos", 15.7)).toBe("positivo");
    expect(tonoVariacion("ingresos", -3.6)).toBe("negativo");
    expect(tonoVariacion("gastos", 22.6)).toBe("negativo");
    expect(tonoVariacion("gastos", 14)).toBe("neutro");
    expect(tonoVariacion("costos", 12.3)).toBe("neutro");
    expect(tonoVariacion("financieros", 46.2)).toBe("neutro");
    expect(tonoVariacion("gastos", 22.3, true)).toBe("positivo");
    expect(tonoVariacion("ingresos", 0)).toBe("neutro");
    expect(tonoVariacion("ingresos", null)).toBe("neutro");
  });

  it("barras del margen neto relativas al mayor", () => {
    expect(alturasMargen([{ pct: 11.2 }, { pct: 12.9 }, { pct: 14.3 }, { pct: 15.8 }])).toEqual([71, 82, 91, 100]);
    expect(alturasMargen([{ pct: -4 }, { pct: null }, { pct: 10 }])).toEqual([0, 0, 100]);
    expect(alturasMargen([{ pct: null }])).toEqual([0]);
  });

  it("descripción accesible del margen", () => {
    expect(descripcionMargen([{ mes: "jul", pct: 11.2 }, { mes: "oct", pct: 15.8 }])).toBe("Margen neto: julio 11.2 %, octubre 15.8 %");
    expect(descripcionMargen([])).toBe("Margen neto: sin datos");
  });

  it("título del cierre", () => {
    expect(tituloCierre("Octubre 2026", "mes")).toBe("Antes de cerrar octubre");
    expect(tituloCierre("4.º trimestre 2026", "trimestre")).toBe("Antes de cerrar el periodo");
  });

  it("código agrupador del SAT", () => {
    expect(esAgrupadorValido("601.84")).toBe(true);
    expect(esAgrupadorValido("701")).toBe(true);
    expect(esAgrupadorValido("102.01.01")).toBe(true);
    expect(esAgrupadorValido("60.1")).toBe(false);
    expect(esAgrupadorValido("abc")).toBe(false);
  });

  it("vacíos", () => {
    expect(resultadosVacios({ secciones: [{ clave: "ingresos", titulo: "Ingresos", filas: [], total: null }] })).toBe(true);
    const bloque = { total: 0, secciones: [] };
    expect(balanceVacio({ activo: bloque, pasivo: bloque, capital: bloque })).toBe(true);
  });

  it("total de sección", () => {
    expect(totalSeccion("Circulante")).toBe("Total circulante");
    expect(totalSeccion("No circulante")).toBe("Total no circulante");
  });
});
