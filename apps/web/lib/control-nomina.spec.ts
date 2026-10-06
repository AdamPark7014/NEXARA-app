import { describe, expect, it } from "vitest";
import {
  COLOR_LUGAR,
  FILTROS_VACIOS,
  areasDe,
  descuentosPendientes,
  diasDeSemana,
  enlaceAprobarExtras,
  esFinDeSemana,
  esIsoValido,
  etiquetaEstado,
  etiquetaSemana,
  filtrarFilas,
  formatoHoras,
  formatoMinutos,
  formatoMoneda,
  formulaPagoPorHora,
  hayFiltros,
  lineasFormula,
  lunesDe,
  montosVisibles,
  normalizarControl,
  normalizarEstado,
  resumenCierre,
  resumenControl,
  semanaPasada,
  sumaONull,
  sumarDias,
  textoConfirmacionCierre,
  textoResultadoCierre,
  tonoDeLugar,
  totalesPorDia,
  type DiaControl,
  type FilaControl,
} from "./control-nomina";

const LUNES = "2026-09-28";
const DIAS = diasDeSemana(LUNES);

const dia = (fecha: string, over: Partial<DiaControl> = {}): DiaControl => ({
  fecha,
  entrada: "10:00",
  salida: "18:00",
  horas: 8,
  lugar: "Oficina",
  lugarOrigen: "auto",
  falta: false,
  ...over,
});

/** Semana normal: L–V en oficina 8 h, fin de semana en descanso. */
const semanaNormal = (): DiaControl[] =>
  DIAS.map((d, i) =>
    i < 5 ? dia(d.fecha) : dia(d.fecha, { entrada: null, salida: null, horas: 0, lugar: "Descanso" }),
  );

const fila = (over: Partial<FilaControl> = {}): FilaControl => ({
  userId: 1,
  nombre: "ANA LÓPEZ",
  area: "Operación",
  dias: semanaNormal(),
  horasTotales: 40,
  sueldo: 4000,
  pagoPorHora: 100,
  divisorHoras: 40,
  viaticos: 120,
  viaticosDetalle: [{ id: 1, concepto: "Comida", monto: 120, estatus: "APROBADO" }],
  extrasMonto: 300,
  extrasMinutosAprobados: 90,
  extrasMinutosPendientes: 0,
  sueldoPeriodo: 4000,
  descuentos: [],
  descuentosTotal: 0,
  subtotal: 4420,
  total: 4420,
  notaFila: null,
  ...over,
});

describe("fechas de la semana (lunes → domingo)", () => {
  it("lleva cualquier día a su lunes, incluido el domingo", () => {
    expect(lunesDe("2026-10-05")).toBe("2026-10-05"); // lunes
    expect(lunesDe("2026-10-04")).toBe("2026-09-28"); // domingo
    expect(lunesDe("2026-10-01")).toBe("2026-09-28"); // jueves
    expect(lunesDe(new Date(2026, 9, 7, 23, 30))).toBe("2026-10-05");
  });

  it("semana pasada y suma de días cruzan meses y años", () => {
    expect(semanaPasada(new Date(2026, 9, 5, 9))).toBe("2026-09-28");
    expect(sumarDias("2026-09-28", 6)).toBe("2026-10-04");
    expect(sumarDias("2025-12-29", 7)).toBe("2026-01-05");
  });

  it("etiqueta la semana como se lee en el encabezado", () => {
    expect(etiquetaSemana("2026-09-28")).toBe("28 sep – 4 oct 2026");
    expect(etiquetaSemana("2026-10-05")).toBe("5 – 11 oct 2026");
    expect(etiquetaSemana("2025-12-29")).toBe("29 dic 2025 – 4 ene 2026");
  });

  it("arma los siete días con nombre y número como su Excel", () => {
    expect(DIAS).toHaveLength(7);
    expect(DIAS[0]).toEqual({ fecha: "2026-09-28", nombre: "LUNES", numero: "28" });
    expect(DIAS[3]).toEqual({ fecha: "2026-10-01", nombre: "JUEVES", numero: "01" });
    expect(DIAS[6].nombre).toBe("DOMINGO");
  });

  it("distingue fin de semana y valida fechas", () => {
    expect(esFinDeSemana("2026-10-03")).toBe(true);
    expect(esFinDeSemana("2026-10-04")).toBe(true);
    expect(esFinDeSemana("2026-10-02")).toBe(false);
    expect(esIsoValido("2026-02-30")).toBe(false);
    expect(esIsoValido("2026-10-05")).toBe(true);
    expect(esIsoValido("05/10/2026")).toBe(false);
  });
});

describe("formato de horas y montos", () => {
  it("horas en decimal con dos cifras, como el Excel", () => {
    expect(formatoHoras(8)).toBe("8.00");
    expect(formatoHoras(7.966)).toBe("7.97");
    expect(formatoHoras(10.666)).toBe("10.67");
    expect(formatoHoras(0)).toBe("0.00");
    expect(formatoHoras(-0.001)).toBe("0.00");
    expect(formatoHoras(null)).toBe("—");
    expect(formatoHoras(Number.NaN)).toBe("—");
  });

  it("minutos a horas con unidad", () => {
    expect(formatoMinutos(90)).toBe("1.50 h");
    expect(formatoMinutos(0)).toBe("0.00 h");
    expect(formatoMinutos(null)).toBe("—");
  });

  it("pesos mexicanos y raya cuando la API oculta el monto", () => {
    expect(formatoMoneda(509.5)).toBe("$509.50");
    expect(formatoMoneda(12345.678)).toBe("$12,345.68");
    expect(formatoMoneda(null)).toBe("—");
  });

  it("suma ignorando nulos; todo nulo = oculto", () => {
    expect(sumaONull([120, null, 83, 509.5])).toBe(712.5);
    expect(sumaONull([null, null])).toBeNull();
    expect(sumaONull([])).toBeNull();
    expect(sumaONull([0.1, 0.2])).toBe(0.3);
  });
});

describe("lugar del día", () => {
  it("reconoce cada lugar sin importar mayúsculas ni acentos", () => {
    expect(tonoDeLugar("Oficina")).toBe("oficina");
    expect(tonoDeLugar("Foráneo")).toBe("foraneo");
    expect(tonoDeLugar("FORANEO")).toBe("foraneo");
    expect(tonoDeLugar("Descanso")).toBe("descanso");
    expect(tonoDeLugar("Guardia")).toBe("guardia");
    expect(tonoDeLugar("Falta")).toBe("falta");
    expect(tonoDeLugar("Falta injustificada")).toBe("falta");
    expect(tonoDeLugar("Falta justificada")).toBe("justificada");
    expect(tonoDeLugar("Vacaciones/Permiso")).toBe("vacaciones");
    expect(tonoDeLugar("Permiso")).toBe("vacaciones");
    expect(tonoDeLugar("Bodega")).toBe("otro");
    expect(tonoDeLugar(null)).toBe("vacio");
    expect(tonoDeLugar("  ")).toBe("vacio");
  });

  it("cada lugar tiene su color con tokens del sistema; la falta es amarilla", () => {
    const fondos = new Set(Object.values(COLOR_LUGAR).map((c) => c.fondo));
    expect(fondos.size).toBe(Object.keys(COLOR_LUGAR).length);
    expect(COLOR_LUGAR.oficina.fondo).toContain("--ui-brand");
    expect(COLOR_LUGAR.foraneo.texto).toContain("--ui-");
    expect(COLOR_LUGAR.falta.fondo).toContain("#facc15");
    // Mezclado con la superficie: sigue siendo suave en claro y en oscuro.
    expect(COLOR_LUGAR.falta.fondo).toContain("var(--ui-surface)");
    for (const c of Object.values(COLOR_LUGAR)) {
      expect(c.texto).toMatch(/var\(--ui-/);
    }
  });
});

describe("estado de la semana", () => {
  it("normaliza lo que mande la API", () => {
    expect(normalizarEstado("CERRADO")).toBe("cerrado");
    expect(normalizarEstado("cerrada")).toBe("cerrado");
    expect(normalizarEstado("Revisado")).toBe("revisado");
    expect(normalizarEstado("BORRADOR")).toBe("borrador");
    expect(normalizarEstado(undefined)).toBe("borrador");
  });

  it("dice quién la cerró y cuándo, en hora de México", () => {
    const e = etiquetaEstado({
      inicio: LUNES,
      fin: "2026-10-04",
      estado: "cerrado",
      cerradaPor: { id: 7, nombre: "Christian" },
      cerradaAt: "2026-10-05T20:20:00.000Z",
    });
    expect(e.label).toBe("Cerrada");
    expect(e.tone).toBe("success");
    expect(e.detalle).toContain("por Christian");
    expect(e.detalle).toContain("5 oct 2026");
    expect(e.detalle).toContain("14:20");
  });

  it("borrador reabierto muestra el motivo", () => {
    const e = etiquetaEstado({
      inicio: LUNES,
      fin: "2026-10-04",
      estado: "borrador",
      reabiertaPor: "Adam",
      motivoReapertura: "faltó un viático",
    });
    expect(e.label).toBe("Borrador");
    expect(e.detalle).toContain("Reabierta por Adam");
    expect(e.detalle).toContain("«faltó un viático»");
  });

  it("montos visibles: el permiso manda; si no viene, lo dicen los nulos", () => {
    expect(montosVisibles({ filas: [fila()] })).toBe(true);
    expect(montosVisibles({ filas: [fila({ sueldo: null, total: null, subtotal: null })] })).toBe(false);
    expect(montosVisibles({ filas: [fila()], permisos: { verMontos: false } })).toBe(false);
    expect(montosVisibles({ filas: [] })).toBe(true);
  });
});

describe("normalizarControl", () => {
  it("rellena lo que falte y convierte números en texto", () => {
    const d = normalizarControl(
      {
        semana: { inicio: LUNES, estado: "BORRADOR" },
        filas: [
          {
            userId: "5",
            nombre: "Beto",
            sueldo: "4000.50",
            total: null,
            dias: [{ fecha: "2026-09-28T00:00:00.000Z", entrada: "10:00", salida: "", horas: "7.5", lugar: "Oficina", lugarOrigen: "manual", falta: 0 }],
            descuentos: [{ id: 9, concepto: "Falta lunes", monto: 571.43, sugerido: true }],
          },
        ],
        formula: { pagoPorHora: "sueldo ÷ horas", raro: 3 },
      },
      LUNES,
    );
    expect(d.semana.fin).toBe("2026-10-04");
    expect(d.dias).toHaveLength(7);
    const f = d.filas[0];
    expect(f.userId).toBe(5);
    expect(f.sueldo).toBe(4000.5);
    expect(f.total).toBeNull();
    expect(f.viaticosDetalle).toEqual([]);
    expect(f.dias[0]).toMatchObject({ fecha: "2026-09-28", salida: null, horas: 7.5, lugarOrigen: "manual", falta: false });
    expect(f.descuentos[0]).toMatchObject({ sugerido: true, aceptado: undefined });
    expect(d.formula).toEqual({ pagoPorHora: "sueldo ÷ horas" });
  });

  it("aguanta una respuesta vacía", () => {
    const d = normalizarControl(null, LUNES);
    expect(d.semana).toMatchObject({ inicio: LUNES, fin: "2026-10-04", estado: "borrador" });
    expect(d.filas).toEqual([]);
    expect(d.dias).toHaveLength(7);
  });
});

describe("filtros", () => {
  const ana = fila();
  const beto = fila({
    userId: 2,
    nombre: "Beto Ruiz",
    area: "Administrativo",
    dias: semanaNormal().map((d, i) => (i === 1 ? dia(d.fecha, { entrada: null, salida: null, horas: 0, lugar: "Falta", falta: true }) : d)),
  });
  const caro = fila({
    userId: 3,
    nombre: "Carolina Pérez",
    dias: semanaNormal().map((d, i) => (i < 5 ? { ...d, lugar: "Foráneo" } : d)),
  });
  const filas = [ana, beto, caro];

  it("busca sin acentos ni mayúsculas", () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, q: "perez" }).map((f) => f.userId)).toEqual([3]);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, q: "lopez" }).map((f) => f.userId)).toEqual([1]);
  });

  it("filtra por área, faltas y foráneos", () => {
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, area: "Administrativo" }).map((f) => f.userId)).toEqual([2]);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, soloFaltas: true }).map((f) => f.userId)).toEqual([2]);
    expect(filtrarFilas(filas, { ...FILTROS_VACIOS, soloForaneos: true }).map((f) => f.userId)).toEqual([3]);
    expect(filtrarFilas(filas, FILTROS_VACIOS)).toHaveLength(3);
  });

  it("lista las áreas en orden y sabe si hay filtros", () => {
    expect(areasDe([...filas, fila({ userId: 4, area: null })])).toEqual(["Administrativo", "Operación"]);
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, q: "  " })).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, soloFaltas: true })).toBe(true);
  });
});

describe("totales", () => {
  const conFalta = fila({
    userId: 2,
    horasTotales: 32,
    dias: semanaNormal().map((d, i) =>
      i === 0
        ? dia(d.fecha, { entrada: null, salida: null, horas: 0, lugar: "Falta", falta: true })
        : i === 1
          ? dia(d.fecha, { entrada: null, salida: null, horas: 0, lugar: "Falta justificada", falta: true })
          : d,
    ),
    viaticos: 0,
    extrasMonto: 0,
    extrasMinutosAprobados: 0,
    extrasMinutosPendientes: 120,
    descuentos: [
      { id: 1, concepto: "Falta lunes", monto: 571.43, sugerido: true },
      { id: 2, concepto: "Préstamo", monto: 200, sugerido: false },
    ],
    descuentosTotal: 200,
    subtotal: 3428.57,
    total: 3228.57,
  });

  it("suma lo visible y cuenta faltas justificadas aparte", () => {
    const r = resumenControl([fila(), conFalta]);
    expect(r.personas).toBe(2);
    expect(r.horas).toBe(72);
    expect(r.total).toBe(7648.57);
    expect(r.viaticos).toBe(120);
    expect(r.extras).toBe(300);
    expect(r.descuentos).toBe(200);
    expect(r.faltas).toBe(2);
    expect(r.faltasInjustificadas).toBe(1);
    expect(r.personasConFalta).toBe(1);
    expect(r.extrasMinutosPendientes).toBe(120);
    expect(r.descuentosSugeridosPendientes).toBe(1);
  });

  it("montos ocultos dan totales nulos, pero las horas sí se suman", () => {
    const oculta = fila({ sueldo: null, sueldoPeriodo: null, viaticos: null, extrasMonto: null, subtotal: null, descuentosTotal: null, total: null });
    const r = resumenControl([oculta, { ...oculta, userId: 9 }]);
    expect(r.total).toBeNull();
    expect(r.viaticos).toBeNull();
    expect(r.horas).toBe(80);
  });

  it("horas por día para el renglón de totales", () => {
    const t = totalesPorDia([fila(), conFalta], DIAS);
    expect(t.horas).toEqual([8, 8, 16, 16, 16, 0, 0]);
    expect(t.faltas).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(t.total).toBe(64);
  });

  it("un sugerido solo deja de estar pendiente cuando se acepta", () => {
    expect(descuentosPendientes(conFalta).map((d) => d.id)).toEqual([1]);
    const aceptado = { ...conFalta, descuentos: [{ ...conFalta.descuentos[0], aceptado: true }] };
    expect(descuentosPendientes(aceptado)).toEqual([]);
  });
});

describe("cerrar la semana", () => {
  const filas = [
    fila({ userId: 1, total: 4420 }),
    fila({ userId: 2, total: 1000.5, extrasMinutosPendientes: 60 }),
    fila({ userId: 3, total: 0 }),
    fila({ userId: 4, total: null, sueldo: null }),
    fila({ userId: 5, total: 900, pagoId: 77 }),
    fila({ userId: 6, total: 50, descuentos: [{ id: 1, concepto: "Falta", monto: 10, sugerido: true }] }),
  ];

  it("cuenta los pagos que se crearán, sin duplicar los ya generados", () => {
    expect(resumenCierre(filas)).toEqual({
      pagos: 3,
      total: 5470.5,
      sinMonto: 2,
      yaGenerados: 1,
      extrasMinutosPendientes: 60,
      descuentosSinAceptar: 1,
    });
  });

  it("la confirmación dice cuántos pagos y el total", () => {
    const t = textoConfirmacionCierre(resumenCierre(filas), "28 sep – 4 oct 2026");
    expect(t).toContain("Se crearán 3 pagos en Borrador");
    expect(t).toContain("$5,470.50");
    expect(t).toContain("1 persona ya tiene pago de esta semana");
    expect(t).toContain("2 personas sin monto");
    expect(t).toContain("1.00 h extra pendientes");
    expect(t).toContain("1 descuento sugerido sin aceptar");
    expect(t).toContain("ya no se podrá editar");
  });

  it("avisa cuando no se crea ningún pago", () => {
    const t = textoConfirmacionCierre(resumenCierre([fila({ total: 0 })]), "5 – 11 oct 2026");
    expect(t).toContain("No se creará ningún pago");
  });

  it("resultado del cierre con lo que respondió la API", () => {
    const previsto = resumenCierre(filas);
    expect(textoResultadoCierre({ creados: 2, existentes: 1 }, previsto)).toBe(
      "Semana cerrada. Se crearon 2 pagos en Borrador. 1 ya existía y no se duplicó.",
    );
    expect(textoResultadoCierre(null, previsto)).toBe("Semana cerrada. Se crearon 3 pagos en Borrador.");
    expect(textoResultadoCierre({ creados: 0 }, previsto)).toBe("Semana cerrada. No se creó ningún pago nuevo.");
  });
});

describe("textos de apoyo", () => {
  it("fórmula del pago por hora para el tooltip", () => {
    expect(formulaPagoPorHora({ sueldo: 4000, pagoPorHora: 100, divisorHoras: 40 })).toBe(
      "Sueldo semanal $4,000.00 ÷ 40.00 h (horas semanales de su horario) = $100.00 por hora.",
    );
    expect(formulaPagoPorHora({ sueldo: 4800, pagoPorHora: 100, divisorHoras: null })).toContain("jornada legal de 48 h");
    expect(formulaPagoPorHora({ sueldo: null, pagoPorHora: null, divisorHoras: 40 })).toBe(
      "Sin sueldo semanal registrado: no hay pago por hora.",
    );
  });

  it("«Cómo se calcula» en el orden de la tabla, con etiquetas legibles", () => {
    const l = lineasFormula({ total: "subtotal − descuentos", pagoPorHora: "sueldo ÷ horas", horasExtra: "× 2", subtotal: "sueldo + viáticos + extras" });
    expect(l.map((x) => x.clave)).toEqual(["pagoPorHora", "subtotal", "total", "horasExtra"]);
    expect(l[0].etiqueta).toBe("Pago por hora");
    expect(l[3].etiqueta).toBe("Horas extra");
    expect(lineasFormula(["una", "", "dos"])).toEqual([
      { clave: "0", etiqueta: null, texto: "una" },
      { clave: "1", etiqueta: null, texto: "dos" },
    ]);
  });

  it("enlace a aprobar extras en KPIs del equipo con el rango de la semana", () => {
    expect(enlaceAprobarExtras(12, "2026-09-28", "2026-10-04")).toBe(
      "/erp/asistencias/indicadores/12?desde=2026-09-28&hasta=2026-10-04",
    );
  });
});
