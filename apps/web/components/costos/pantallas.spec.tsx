/**
 * Costos: las pantallas pintan lo que manda la API, ligar funciona y se deshace, y quien no debe ver
 * sueldos no los ve.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HorasSinProyecto from "@/app/(panels)/erp/costos/page";
import CostosPorProyecto from "@/app/(panels)/erp/costos/por-proyecto/page";
import TarifasDeCosto from "@/app/(panels)/erp/costos/tarifas/page";
import SeccionCostos from "@/app/(panels)/erp/proyectos/_componentes/SeccionCostos";
import { normalizeLegacyPath } from "@/lib/legacy-path-remap";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/erp/costos",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 9, nombre: "Coordina", email: "c@nexara.com.mx", token: "jwt", permissions: [], isSuperAdmin: false },
    token: "jwt",
    isContextReady: true,
  }),
}));

type Ruta = { metodo?: string; incluye: string; status?: number; body: unknown };
let rutas: Ruta[] = [];
const llamadas: Array<{ url: string; metodo: string; body: unknown }> = [];

function servir(...r: Ruta[]) {
  rutas = r;
}

beforeEach(() => {
  llamadas.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = (init?.method ?? "GET").toUpperCase();
      llamadas.push({ url: String(url), metodo, body: init?.body ? JSON.parse(String(init.body)) : null });
      const r = rutas.find((x) => String(url).includes(x.incluye) && (x.metodo ?? "GET") === metodo);
      if (!r) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }),
  );
});

const ACCESO_LIGA = { incluye: "/costos/acceso", body: { veTodo: false, puedeLigar: true } };
const ACCESO_TODO = { incluye: "/costos/acceso", body: { veTodo: true, puedeLigar: true } };
const SIN_ACCESO = { incluye: "/costos/acceso", body: { veTodo: false, puedeLigar: false } };

const BANDEJA = {
  periodo: "todo",
  resumen: { horasTotal: 100, horasLigadas: 20, horasPorLigar: 80, actividades: 2, pctLigado: 20, conSugerencia: 1 },
  iaDisponible: true,
  filas: [
    {
      activityId: 50,
      folio: "A-50",
      titulo: "Colocar cámaras en acceso principal",
      coreKind: "tarea",
      cliente: "Bodegas Luna",
      horas: 38,
      personas: 2,
      dias: 3,
      sugerencia: { tipo: "PROYECTO", id: 9, nombre: "CCTV Bodega Norte", motivo: "Es del mismo cliente", fuente: "REGLA" },
    },
    {
      activityId: 51,
      folio: "A-51",
      titulo: "Apoyo en sitio",
      coreKind: "tarea",
      cliente: null,
      horas: 8,
      personas: 1,
      dias: 1,
      sugerencia: null,
    },
  ],
  candidatos: [
    { tipo: "PROYECTO", id: 9, nombre: "CCTV Bodega Norte", cliente: "Bodegas Luna" },
    { tipo: "COTIZACION", id: 42, nombre: "NEX-0042 · Acceso", cliente: "Colegio Andes" },
  ],
};

describe("Horas sin proyecto", () => {
  it("dice cuando la lista no trae todas las actividades", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", body: { ...BANDEJA, resumen: { ...BANDEJA.resumen, actividades: 295 } } });
    render(<HorasSinProyecto />);
    expect(await screen.findByText(/Se ven las 2 actividades con más horas de 295/)).toBeInTheDocument();
  });

  it("pinta las horas y aceptar liga con lo sugerido", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", body: BANDEJA });
    const user = userEvent.setup();
    render(<HorasSinProyecto />);

    expect(await screen.findByText("Colocar cámaras en acceso principal")).toBeInTheDocument();
    expect(screen.getByText("80 h")).toBeInTheDocument();
    expect(screen.getByText("Es del mismo cliente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aceptar" }));
    await waitFor(() =>
      expect(llamadas.find((l) => l.metodo === "POST" && l.url.includes("/por-ligar/50"))?.body).toEqual({ tipo: "PROYECTO", id: 9 }),
    );
    expect(await screen.findByText("Ligado")).toBeInTheDocument();
    // 80 h por ligar menos las 38 h de esa actividad.
    expect(screen.getByText("42 h")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === "DELETE" && l.url.includes("/por-ligar/50"))).toBe(true));
    expect(await screen.findByText("80 h")).toBeInTheDocument();
  });

  it("sin sugerencia se elige de la lista, y también se puede marcar interno", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", body: BANDEJA });
    const user = userEvent.setup();
    render(<HorasSinProyecto />);
    await screen.findByText("Apoyo en sitio");

    await user.click(screen.getByRole("button", { name: "Elegir" }));
    await user.type(screen.getByLabelText("Buscar proyecto o cotización"), "andes");
    expect(screen.queryByRole("button", { name: /CCTV Bodega Norte/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /NEX-0042/ }));
    await waitFor(() =>
      expect(llamadas.find((l) => l.metodo === "POST" && l.url.includes("/por-ligar/51"))?.body).toEqual({ tipo: "COTIZACION", id: 42 }),
    );
  });

  it("no enseña dinero", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", body: BANDEJA });
    const { container } = render(<HorasSinProyecto />);
    await screen.findByText("Apoyo en sitio");
    expect(container.textContent).not.toMatch(/\$/);
  });

  it("sugerir con IA avisa cuántas revisó y vuelve a cargar", async () => {
    servir(
      ACCESO_LIGA,
      { incluye: "/costos/por-ligar?", body: BANDEJA },
      { metodo: "POST", incluye: "/costos/por-ligar/sugerir", body: { consultadas: 5, sugeridas: 3, iaDisponible: true } },
    );
    const user = userEvent.setup();
    render(<HorasSinProyecto />);
    await user.click(await screen.findByRole("button", { name: "Sugerir con IA" }));
    expect(await screen.findByText(/revisó 5 actividades y sugirió 3/)).toBeInTheDocument();
  });

  it("sin IA no ofrece el botón", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", body: { ...BANDEJA, iaDisponible: false } });
    render(<HorasSinProyecto />);
    await screen.findByText("Apoyo en sitio");
    expect(screen.queryByRole("button", { name: "Sugerir con IA" })).not.toBeInTheDocument();
  });

  it("quien no coordina ve un aviso y no se pide la bandeja", async () => {
    servir(SIN_ACCESO);
    render(<HorasSinProyecto />);
    expect(await screen.findByText(/dirección, contabilidad y coordinación/)).toBeInTheDocument();
    expect(llamadas.some((l) => l.url.includes("/por-ligar"))).toBe(false);
  });

  it("dice el error del servidor", async () => {
    servir(ACCESO_LIGA, { incluye: "/costos/por-ligar?", status: 500, body: { message: "Se cayó la base" } });
    render(<HorasSinProyecto />);
    expect(await screen.findByText("Se cayó la base")).toBeInTheDocument();
  });
});

const TARIFAS = {
  anio: 2026,
  parametros: {
    anio: 2026,
    ps: 0.25,
    psValidado: false,
    otrosDias: 3,
    aguinaldoDias: 15,
    primaVacacional: 0.25,
    kh: 0.03,
    ks: 0.01,
    indirectoPct: null,
    tasaInteres: null,
    notas: null,
    guardado: false,
    actualizadoEn: null,
  },
  factor: { tp: 383, tl: 239, tpTl: 1.6025, fsr: 2.0031, diasHabiles: 261, festivosEnDiaHabil: 7, vacacionesDias: 12 },
  categorias: [
    { id: 1, clave: "INSTALADOR", nombre: "Instalador", tipo: "DIRECTO", activo: true, sueldoSemanalRef: null, personas: 1, costoHora: 125.19, origenTarifa: "PROMEDIO" },
  ],
  personas: [
    { userId: 7, nombre: "Persona Siete", puesto: "Técnico Instalador", categoriaId: 1, categoriaAsignada: false, psPropio: null, sueldoSemanal: 3500, vacacionesDias: 12, fsr: 2.0031, costoHora: 125.19, sinSueldo: false },
    { userId: 8, nombre: "Persona Ocho", puesto: "Técnico", categoriaId: null, categoriaAsignada: false, psPropio: null, sueldoSemanal: 0, vacacionesDias: 12, fsr: 2.0031, costoHora: 0, sinSueldo: true },
  ],
  equipos: [
    {
      id: 3,
      tipo: "VEHICULO",
      nombre: "Camioneta",
      unidad: "KM",
      valor: 480000,
      vidaUnidades: 200000,
      unidadesAnio: 30000,
      tarifa: { d: 1.62, im: 1.224, sm: 0.408, mn: 0.972, co: 2.7222, lb: 0.12, n: 0.24, otros: 0, fijos: 4.224, consumos: 3.0822, total: 7.31 },
    },
  ],
  vehiculos: [{ id: 1, nombre: "Camioneta", placas: "ABC" }],
  herramientas: [],
  avisos: { psSinValidar: true, personasSinSueldo: 1, personasSinCategoria: 1, vehiculosSinFicha: 0 },
};

describe("Tarifas de costo", () => {
  it("pinta el factor, las tarifas y avisa que son provisionales", async () => {
    servir(ACCESO_TODO, { incluye: "/costos/tarifas", body: TARIFAS });
    render(<TarifasDeCosto />);
    expect(await screen.findByText("383 ÷ 239")).toBeInTheDocument();
    expect(screen.getAllByText("2.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Cifras provisionales/)).toBeInTheDocument();
    expect(screen.getByText(/1 persona no tiene/)).toBeInTheDocument();
    expect(screen.getAllByText("$125.19").length).toBeGreaterThan(0);
    expect(screen.getByText(/\$7\.31 \/ km/)).toBeInTheDocument();
    expect(screen.getByText("Sin capturar", { selector: "td" })).toBeInTheDocument();
  });

  it("guardar manda porcentajes como fracción", async () => {
    servir(
      ACCESO_TODO,
      { incluye: "/costos/tarifas", body: TARIFAS },
      { metodo: "PUT", incluye: "/costos/parametros/", body: TARIFAS.parametros },
    );
    const user = userEvent.setup();
    render(<TarifasDeCosto />);
    const ps = await screen.findByLabelText(/Cuotas IMSS e Infonavit/);
    await user.clear(ps);
    await user.type(ps, "28.5");
    await user.click(screen.getByLabelText(/ya las confirmó la contadora/));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      const put = llamadas.find((l) => l.metodo === "PUT");
      expect(put?.body).toMatchObject({ ps: 0.285, psValidado: true, kh: 0.03 });
    });
  });

  it("recalcular dice lo que pasó", async () => {
    servir(
      ACCESO_TODO,
      { incluye: "/costos/tarifas", body: TARIFAS },
      { metodo: "POST", incluye: "/costos/recalcular", body: { creados: 3, actualizados: 2, borrados: 1, total: 40 } },
    );
    const user = userEvent.setup();
    render(<TarifasDeCosto />);
    await user.click(await screen.findByRole("button", { name: "Recalcular el libro" }));
    expect(await screen.findByText(/40 renglones \(3 nuevos, 2 cambiados, 1 quitados\)/)).toBeInTheDocument();
  });

  it("quien no es CEO ni contadora no pide tarifas ni ve sueldos", async () => {
    servir(ACCESO_LIGA);
    const { container } = render(<TarifasDeCosto />);
    expect(await screen.findByText(/dirección y contabilidad/)).toBeInTheDocument();
    expect(llamadas.some((l) => l.url.includes("/costos/tarifas"))).toBe(false);
    expect(container.textContent).not.toMatch(/\$/);
  });
});

describe("Por proyecto", () => {
  const LISTA = {
    proyectos: [
      {
        id: 9,
        titulo: "CCTV Bodega Norte",
        estado: "ACTIVE",
        cliente: "Bodegas Luna",
        cotizacion: "NEX-0042",
        venta: 275000,
        costo: 224600,
        real: { MATERIAL: 146300, MANO_OBRA: 52100, VEHICULO: 6900, HERRAMIENTA: 2100, VIATICO_GASTO: 9200, SUBCONTRATO: 8000 },
        margen: { importe: 18956, pct: 6.9 },
      },
    ],
    cotizacionesSinProyecto: [
      { id: 42, folio: "NEX-0042", nombre: "Control de acceso", clienteId: 7, costo: 1500, real: {} },
    ],
    manoDeObra: { horas: 100, importe: 10000, horasSinLigar: 80, importeSinLigar: 8000, horasInternas: 5, importeInterno: 500 },
  };

  it("pinta proyectos y ofrece crear el proyecto de la cotización ganada", async () => {
    servir(ACCESO_TODO, { incluye: "/costos/proyectos", body: LISTA });
    render(<CostosPorProyecto />);
    const fila = (await screen.findByText("CCTV Bodega Norte")).closest("tr")!;
    expect(within(fila).getByText("6.9 %")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CCTV Bodega Norte" })).toHaveAttribute("href", "/erp/proyectos/9?tab=costos");
    expect(screen.getByRole("link", { name: /crear proyecto/ })).toHaveAttribute(
      "href",
      "/erp/proyectos/nuevo?cotizacionId=42&clienteId=7",
    );
  });

  it("ninguna pestaña de Costos la desvía el mapa de rutas heredadas", async () => {
    servir(ACCESO_TODO, { incluye: "/costos/proyectos", body: LISTA });
    render(<CostosPorProyecto />);
    await screen.findByText("CCTV Bodega Norte");
    for (const nombre of ["Horas sin proyecto", "Por proyecto", "Tarifas de costo"]) {
      const href = screen.getByRole("link", { name: nombre }).getAttribute("href")!;
      expect(normalizeLegacyPath(href)).toBe(href);
    }
  });

  it("solo CEO y contadora", async () => {
    servir(ACCESO_LIGA);
    render(<CostosPorProyecto />);
    expect(await screen.findByText(/dirección y contabilidad/)).toBeInTheDocument();
    expect(llamadas.some((l) => l.url.includes("/costos/proyectos"))).toBe(false);
  });
});

describe("Pestaña Costos del proyecto", () => {
  const PROYECTO = { id: 9, resumen: { avance: { porcentaje: 92 } } } as never;
  const DETALLE = {
    proyecto: { id: 9, titulo: "CCTV", cotizacion: "NEX-0042", cotizacionId: 42 },
    venta: 275000,
    rubros: [
      { rubro: "MATERIAL", etiqueta: "Equipos y material", cotizado: 142000, real: 146300 },
      { rubro: "MANO_OBRA", etiqueta: "Mano de obra", cotizado: 38400, real: 52100 },
    ],
    directo: { cotizado: 180400, real: 198400 },
    indirecto: { pct: 0.14, cotizado: 25256, real: 27776 },
    margen: { cotizado: { importe: 69344, pct: 25.2 }, hoy: { importe: 48824, pct: 17.8 } },
    manoDeObra: { horas: 416, categorias: [{ categoria: "Instalador", horas: 312, importe: 39060 }] },
    avisos: {
      sinCotizacion: false,
      sinVenta: false,
      partidasSinCosto: 2,
      partidas: 10,
      indirectoSinCapturar: false,
      sesionesSinSueldo: 1,
      sesionesRecortadas: 3,
      salidasSinCosto: 0,
      psSinValidar: true,
    },
    acceso: { detalle: true },
  };

  it("pinta cotizado contra real, el porcentaje y los avisos", async () => {
    servir({ incluye: "/costos/proyectos/9", body: DETALLE });
    render(<SeccionCostos proyecto={PROYECTO} token="jwt" />);
    expect(await screen.findByText("Equipos y material")).toBeInTheDocument();
    expect(screen.getByText("136")).toBeInTheDocument();
    expect(screen.getByText("25.2 %")).toBeInTheDocument();
    expect(screen.getByText("17.8 %")).toBeInTheDocument();
    expect(screen.getByText("92 %")).toBeInTheDocument();
    expect(screen.getByText(/Instalador · 312 h/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 10 partidas no traen costo/)).toBeInTheDocument();
    expect(screen.getByText(/1 sesión vale cero/)).toBeInTheDocument();
    expect(screen.getByText(/3 relojes los cerró el sistema: cuentan a lo mucho una jornada/)).toBeInTheDocument();
  });

  it("los avisos concuerdan cuando es uno solo", async () => {
    const avisos = { ...DETALLE.avisos, partidasSinCosto: 1, sesionesRecortadas: 1, salidasSinCosto: 1 };
    servir({ incluye: "/costos/proyectos/9", body: { ...DETALLE, avisos } });
    render(<SeccionCostos proyecto={PROYECTO} token="jwt" />);
    expect(await screen.findByText(/1 de 10 partidas no trae costo/)).toBeInTheDocument();
    expect(screen.getByText(/1 reloj lo cerró el sistema: cuenta a lo mucho una jornada/)).toBeInTheDocument();
    expect(screen.getByText(/1 salida de almacén no trae costo: vale cero/)).toBeInTheDocument();
  });

  it("sin detalle no enseña el importe por categoría", async () => {
    servir({ incluye: "/costos/proyectos/9", body: { ...DETALLE, manoDeObra: { horas: 416, categorias: null }, acceso: { detalle: false } } });
    render(<SeccionCostos proyecto={PROYECTO} token="jwt" />);
    expect(await screen.findByText(/es de dirección y contabilidad/)).toBeInTheDocument();
    expect(screen.queryByText(/Instalador/)).not.toBeInTheDocument();
  });

  it("si la API dice que no, lo dice sin tronar", async () => {
    servir({ incluye: "/costos/proyectos/9", status: 403, body: { message: "No disponible para tu perfil" } });
    render(<SeccionCostos proyecto={PROYECTO} token="jwt" />);
    expect(await screen.findByText("No disponible para tu perfil")).toBeInTheDocument();
  });
});
