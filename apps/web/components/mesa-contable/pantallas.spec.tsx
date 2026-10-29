/**
 * Mesa contable: las cuatro pantallas pintan lo que manda la API (contrato 29-10-2026), dicen
 * el error del servidor tal cual y respetan las reglas que se ven (PPD → 99, aviso de
 * timbrado de prueba, motivo para no timbrar, «No se factura» con motivo).
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PorFacturarPage from "@/app/(panels)/erp/contabilidad/por-facturar/page";
import PrepararCfdiPage from "@/app/(panels)/erp/contabilidad/por-facturar/[id]/page";
import PagosYGastosPage from "@/app/(panels)/erp/contabilidad/pagos-y-gastos/page";
import EstadosFinancierosPage from "@/app/(panels)/erp/contabilidad/estados/page";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/erp/contabilidad/por-facturar" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 9, nombre: "Contadora", email: "c@nexara.com.mx", token: "jwt", permissions: [], isSuperAdmin: true },
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
  nav.push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = (init?.method ?? "GET").toUpperCase();
      llamadas.push({ url: String(url), metodo, body: init?.body ? JSON.parse(String(init.body)) : null });
      const r = rutas.find((x) => String(url).includes(x.incluye) && (x.metodo ?? "GET") === metodo);
      if (!r) return new Response(JSON.stringify({ porFacturar: 3, pagosPendientes: 2 }), { status: 200 });
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TIMBRADO_MOCK = { conectado: true, proveedor: "mock", mensaje: null };

const BANDEJA = {
  resumen: {
    importe: 216320,
    conceptos: 2,
    clientes: 2,
    masAntiguoDias: 8,
    masAntiguoHabiles: 6,
    anticipos: { conteo: 0, importe: 0 },
    complementos: { conteo: 1, importe: 25000 },
    facturadoMes: { importe: 412300, conteo: 18, cancelacionesPendientes: 1, mes: "octubre" },
  },
  conteos: { TODO: 2, SERVICIO: 1, COTIZACION: 0, ANTICIPO: 0, PEDIDO: 0, COMPLEMENTO: 1 },
  timbrado: TIMBRADO_MOCK,
  items: [
    {
      clave: "SERVICIO:398",
      origen: "SERVICIO",
      origenId: 398,
      cliente: { id: 3, nombre: "Bodegas del Valle", rfc: "BVA110830MZ4" },
      folio: "AN-0398",
      folioHref: "/erp/actividades/398",
      concepto: "Reubicación de 3 cámaras",
      detalle: "Terminada el 21 oct · Carolina M.",
      listoDesde: "2026-10-21",
      diasEsperando: 8,
      diasHabiles: 6,
      semaforo: "tarde",
      importe: null,
      menos: null,
      pendientes: [{ clave: "precio", texto: "No tiene cotización: captura el precio en el borrador" }],
      nota: null,
      accion: "PREPARAR",
      facturaBorradorId: null,
    },
    {
      clave: "COMPLEMENTO:55",
      origen: "COMPLEMENTO",
      origenId: 55,
      cliente: { id: 4, nombre: "Clínica San Ángel", rfc: "CSA180412AB3" },
      folio: "A-231",
      folioHref: null,
      concepto: "Pago del 27 oct a la factura",
      detalle: "Factura a crédito (PPD) · parcialidad 1 de 2",
      listoDesde: "2026-10-27",
      diasEsperando: 2,
      diasHabiles: 2,
      semaforo: "atencion",
      importe: 25000,
      menos: null,
      pendientes: [],
      nota: null,
      accion: "COMPLEMENTO",
      facturaBorradorId: null,
    },
  ],
};

describe("Por facturar", () => {
  it("pinta cifras, renglones, el aviso del timbrado de prueba y prepara con un clic", async () => {
    nav.pathname = "/erp/contabilidad/por-facturar";
    servir(
      { incluye: "mesa/por-facturar?origen=TODO", body: BANDEJA },
      { incluye: "mesa/por-facturar/preparar", metodo: "POST", body: { invoiceId: 232 } },
    );
    render(<PorFacturarPage />);

    expect(await screen.findByText("Bodegas del Valle")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Por facturar" })).toBeInTheDocument();
    expect(screen.getByText("Timbrado de prueba: el UUID no es real.")).toBeInTheDocument();
    expect(screen.getByText("$216,320")).toBeInTheDocument();
    expect(screen.getByText("Facturado en octubre")).toBeInTheDocument();
    expect(screen.getByText("18 CFDI · 1 cancelación en trámite")).toBeInTheDocument();
    expect(screen.getByText("sin precio")).toBeInTheDocument();
    expect(screen.getByText("hace 8 días")).toBeInTheDocument();
    expect(screen.getByText("No tiene cotización: captura el precio en el borrador")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Factura libre" })).toHaveAttribute("href", "/erp/invoicing");

    // Chips de la Mesa bajo el encabezado, con el activo marcado y su contador.
    const chips = screen.getByRole("navigation", { name: "Mesa contable" });
    expect(within(chips).getByRole("link", { name: /Por facturar/ })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("button", { name: "Preparar CFDI" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/erp/contabilidad/por-facturar/232"));
    expect(llamadas.find((l) => l.url.includes("preparar"))?.body).toEqual({ origen: "SERVICIO", origenId: 398 });
  });

  it("«No se factura» exige motivo y llama a descartar", async () => {
    nav.pathname = "/erp/contabilidad/por-facturar";
    servir(
      { incluye: "mesa/por-facturar?origen=TODO", body: BANDEJA },
      { incluye: "mesa/por-facturar/descartar", metodo: "POST", body: { ok: true } },
    );
    render(<PorFacturarPage />);
    await screen.findByText("Bodegas del Valle");

    await userEvent.click(screen.getByRole("button", { name: "Más acciones para Bodegas del Valle AN-0398" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "No se factura" }));
    const dialogo = screen.getByRole("dialog", { name: "No se factura" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "No se factura" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/Escribe el motivo/);

    await userEvent.type(within(dialogo).getByLabelText("Motivo"), "Garantía del cliente");
    await userEvent.click(within(dialogo).getByRole("button", { name: "No se factura" }));
    await waitFor(() =>
      expect(llamadas.find((l) => l.url.includes("descartar"))?.body).toEqual({ origen: "SERVICIO", origenId: 398, motivo: "Garantía del cliente" }),
    );
  });

  it("con la base vacía dice «Nada pendiente por facturar»; con error, el mensaje del servidor", async () => {
    nav.pathname = "/erp/contabilidad/por-facturar";
    servir({
      incluye: "mesa/por-facturar?origen=TODO",
      body: { ...BANDEJA, items: [], conteos: { TODO: 0 }, timbrado: { conectado: false, proveedor: "", mensaje: null } },
    });
    const { unmount } = render(<PorFacturarPage />);
    expect(await screen.findByText("Nada pendiente por facturar")).toBeInTheDocument();
    expect(screen.getByText("El timbrado todavía no está conectado.")).toBeInTheDocument();
    unmount();

    servir({ incluye: "mesa/por-facturar?origen=TODO", status: 403, body: { message: "No tienes acceso a la Mesa contable." } });
    render(<PorFacturarPage />);
    expect(await screen.findByText("No tienes acceso a la Mesa contable.")).toBeInTheDocument();
  });
});

const REVISION = {
  factura: {
    id: 232,
    folio: "A-232",
    status: "DRAFT",
    esAnticipo: false,
    issueDate: "2026-10-29",
    dueDate: "2026-11-28",
    cfdiUsage: "G03",
    satPaymentMethod: "PUE",
    satPaymentForm: "03",
    currency: "MXN",
    receptor: { nombre: "COLEGIO MONTEBELLO", rfc: "CMO0903155K2", regimen: "603", regimenTexto: "Personas morales con fines no lucrativos", cp: "72810", correo: "pagos@colegiomontebello.mx", clienteId: 7 },
    conceptos: [
      { id: 1, descripcion: "Mantenimiento preventivo de cámara", claveSat: "81111812", unidadClave: "E48", unidad: "Servicio", cantidad: 16, precio: 750, ivaPct: 16, importe: 12000 },
      { id: 2, descripcion: "Reubicación", claveSat: "81111812", unidadClave: "E48", unidad: "Servicio", cantidad: 1, precio: 0, ivaPct: 16, importe: 0 },
    ],
    subtotal: 12000,
    descuento: 0,
    iva: 1920,
    retenciones: 0,
    total: 13920,
    relacionados: [],
    cfdiUuid: null,
    pdfUrl: null,
    editarConceptosHref: "/erp/invoicing/232",
  },
  origen: { tipo: "SERVICIO", folio: "AN-0412", href: "/erp/actividades/412", extra: "COT-NX-0079" },
  revisiones: [
    { clave: "rfc", nivel: "ok", texto: "RFC y razón social coinciden con el SAT", detalle: "Consultado hoy a las 9:12" },
    { clave: "precio", nivel: "error", texto: "Hay conceptos sin precio", detalle: null },
  ],
  poliza: [
    { cuenta: "105.01 Clientes nacionales", debe: 13920, haber: 0 },
    { cuenta: "401.01 Ingresos por servicios", debe: 0, haber: 12000 },
  ],
  notaPoliza: "Cuando se cobre, el IVA pasa de «no cobrado» a «cobrado» en la póliza del pago.",
  puedeTimbrar: false,
  timbrado: TIMBRADO_MOCK,
};

describe("Preparar y timbrar", () => {
  it("muestra cliente, conceptos, revisiones y el motivo; con PPD fija la forma 99", async () => {
    nav.pathname = "/erp/contabilidad/por-facturar/232";
    servir(
      { incluye: "mesa/facturas/232/revision", body: REVISION },
      { incluye: "accounting/invoices/232", metodo: "PATCH", body: { ok: true } },
    );
    render(<PrepararCfdiPage params={{ id: "232" }} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Factura para COLEGIO MONTEBELLO" })).toBeInTheDocument();
    expect(screen.getByText("Borrador · A-232")).toBeInTheDocument();
    expect(screen.getByText("603 · Personas morales con fines no lucrativos")).toBeInTheDocument();
    expect(screen.getByText("Hay conceptos sin precio")).toBeInTheDocument();
    expect(screen.getByText("Antes de timbrar: Hay conceptos sin precio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timbrar y enviar" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Editar conceptos" })).toHaveAttribute("href", "/erp/invoicing/232");
    expect(screen.getByText("Timbrado de prueba: el UUID no es real.")).toBeInTheDocument();
    expect(screen.getByText("· 30 días")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Método de pago"), "PPD");
    await waitFor(() =>
      expect(llamadas.find((l) => l.metodo === "PATCH")?.body).toEqual({ satPaymentMethod: "PPD", satPaymentForm: "99" }),
    );
    expect(screen.getByLabelText("Forma de pago")).toBeDisabled();
    expect(screen.getByLabelText("Forma de pago")).toHaveValue("99");
  });
});

const PAGOS = {
  periodo: { mes: "2026-10", etiqueta: "Octubre 2026", from: "2026-10-01", to: "2026-10-31" },
  resumen: {
    entro: { importe: 318600, conteo: 14 },
    salio: { importe: 298640, conteo: 41 },
    sinCfdi: { conteo: 5, importe: 9340 },
    porConciliar: { conteo: 2, conSugerencia: 1 },
    sinPoliza: { conteo: 2 },
    saldoBancos: null,
  },
  conteos: { TODO: 9, COBRO: 1, PROVEEDOR: 2, VIATICO: 2, GASTO: 1, NOMINA: 1 },
  pendientes: 9,
  items: [
    {
      clave: "VIATICO:5",
      origen: "VIATICO",
      origenId: 5,
      fecha: "2026-10-28",
      tipo: "VIATICO",
      tipoEtiqueta: "Viático comprobado",
      titulo: "Iván R. · Atlixco",
      subtitulo: null,
      folio: { texto: "AN-0405", href: "/erp/actividades/405" },
      importe: -2500,
      cfdi: { estado: "parcial", texto: "2 de 3 con XML", accion: null },
      banco: { estado: "ok", texto: "SPEI 27 oct", accion: null, sugerencia: null },
      poliza: { estado: "falta", texto: "Por registrar", accion: "REGISTRAR", journalEntryId: null },
      pendiente: true,
    },
    {
      clave: "RECEPCION:67",
      origen: "RECEPCION",
      origenId: 67,
      fecha: "2026-10-27",
      tipo: "PROVEEDOR",
      tipoEtiqueta: "Compra",
      titulo: "Distribuidora Seguritec",
      subtitulo: null,
      folio: { texto: "OC-0067", href: null },
      importe: -23780,
      cfdi: { estado: "ok", texto: "…4F2A", accion: null },
      banco: { estado: "sugerencia", texto: "", accion: null, sugerencia: { bankTransactionId: 88, score: 0.96, fecha: "2026-10-27", importe: -23780, descripcion: "SPEI" } },
      poliza: { estado: "ok", texto: "P-0417", accion: null, journalEntryId: 417 },
      pendiente: true,
    },
  ],
};

const DETALLE = {
  item: PAGOS.items[0],
  encabezado: "Viático comprobado · AN-0405",
  montos: [
    { etiqueta: "Entregado", importe: 2500 },
    { etiqueta: "Comprobado", importe: 2500 },
    { etiqueta: "Diferencia", importe: 0 },
  ],
  comprobantes: [{ vinculoId: 1, invoiceId: 10, texto: "Hospedaje", uuidCorto: "9C1E", iva: 200, total: 1450 }],
  sinFactura: { importe: 350, texto: "Comida · solo ticket · no deducible" },
  aceptaXml: true,
  banco: { vinculado: { vinculoId: 4, bankTransactionId: 70, texto: "SPEI del 27 oct · Banorte ··4821", importe: 2500 }, sugerencias: [] },
  polizaPropuesta: [{ cuenta: "601.48 Viáticos y gastos de viaje", debe: 1853.45, haber: 0 }],
  polizaRegistrada: null,
  puedeRegistrarPoliza: true,
  responsable: { id: 12, nombre: "Iván Ramírez" },
};

describe("Pagos y gastos", () => {
  it("pinta la tabla con cada estado, abre el primero en el panel y valida el UUID", async () => {
    nav.pathname = "/erp/contabilidad/pagos-y-gastos";
    servir(
      { incluye: "mesa/pagos-gastos?mes=", body: PAGOS },
      { incluye: "mesa/pagos-gastos/VIATICO/5", body: DETALLE },
    );
    render(<PagosYGastosPage />);

    expect(await screen.findByRole("button", { name: "Iván R. · Atlixco" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Sugerencia 96 %")).toBeInTheDocument();
    expect(screen.getByText(`−$23,780.00`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solo con pendientes · 9" })).toHaveAttribute("aria-pressed", "true");

    const panel = await screen.findByRole("complementary", { name: "Detalle del movimiento" });
    expect(await within(panel).findByText("Hospedaje · XML …9C1E")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Pedir aclaración a Iván" })).toHaveAttribute("href", "/erp/chat");
    expect(within(panel).getByRole("button", { name: "Registrar póliza" })).toBeEnabled();

    await userEvent.type(within(panel).getByLabelText("Arrastra aquí el XML o escribe el UUID"), "no-es-uuid");
    await userEvent.click(within(panel).getByRole("button", { name: "Ligar" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent(/36 caracteres/);
  });
});

const RESULTADOS = {
  periodo: { etiqueta: "Octubre 2026", from: "2026-10-01", to: "2026-10-31" },
  comparado: { etiqueta: "Septiembre 2026", from: "2026-09-01", to: "2026-09-30" },
  mesAbierto: true,
  cifras: {
    ingresos: 412300,
    ingresosVar: 10.7,
    utilidadBruta: 206300,
    margenBruto: 50,
    utilidadOperacion: 94200,
    margenOperacion: 22.8,
    utilidadOperacionVar: 22.3,
    utilidadNeta: 65340,
    margenNeto: 15.8,
  },
  secciones: [
    {
      clave: "gastos",
      titulo: "Gastos de operación",
      filas: [{ cuentaId: 31, codigo: "601.03", nombre: "Combustibles", agrupador: null, actual: 9860, anterior: 8940, pctIngresos: 2.4, variacionPct: 10.3 }],
      total: { nombre: "Utilidad de operación", actual: 94200, anterior: 77000, pctIngresos: 22.8, variacionPct: 22.3 },
    },
  ],
  utilidadNeta: { actual: 65340, anterior: 53280, pctIngresos: 15.8, variacionPct: 22.6 },
  margenes: [
    { mes: "sep", pct: 14.3, actual: false },
    { mes: "oct", pct: 15.8, actual: true },
  ],
  cierre: { sinPoliza: 2, sinAgrupador: 1, porConciliar: 0, polizasCuadradas: true },
};

describe("Estados financieros", () => {
  it("resultados: cifras, «Asignar» con validación y la gráfica accesible", async () => {
    nav.pathname = "/erp/contabilidad/estados";
    servir(
      { incluye: "mesa/estados?vista=resultados", body: RESULTADOS },
      { incluye: "accounting/accounts/31", metodo: "PATCH", body: { ok: true } },
    );
    render(<EstadosFinancierosPage />);

    expect(await screen.findByText("601.03 Combustibles")).toBeInTheDocument();
    expect(screen.getByText("Mes abierto")).toBeInTheDocument();
    expect(screen.getByText("+10.7 % vs septiembre")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Margen neto: septiembre 14.3 %, octubre 15.8 %" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Antes de cerrar octubre" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Balanza de comprobación" })).toHaveAttribute("href", "/erp/contabilidad/reportes");

    await userEvent.click(screen.getByRole("button", { name: "Asignar código agrupador a 601.03 Combustibles" }));
    const dialogo = screen.getByRole("dialog", { name: "Asignar código agrupador" });
    await userEvent.type(within(dialogo).getByLabelText("Código agrupador SAT"), "60x");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Asignar" }));
    expect(within(dialogo).getByRole("alert")).toBeInTheDocument();
    await userEvent.clear(within(dialogo).getByLabelText("Código agrupador SAT"));
    await userEvent.type(within(dialogo).getByLabelText("Código agrupador SAT"), "601.84");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(llamadas.find((l) => l.metodo === "PATCH")?.body).toEqual({ satAgrupador: "601.84" }));
  });

  it("balance: banda «Cuadra al centavo» y los dos lados", async () => {
    nav.pathname = "/erp/contabilidad/estados";
    window.history.replaceState(null, "", "/erp/contabilidad/estados?vista=balance");
    servir({
      incluye: "mesa/estados?vista=balance",
      body: {
        fecha: "2026-10-31",
        etiqueta: "Al 31 de octubre de 2026",
        mesAbierto: true,
        cuadra: true,
        diferencia: 0,
        activo: { total: 1000, secciones: [{ titulo: "Circulante", filas: [{ cuentaId: 1, nombre: "Bancos", agrupador: "102.01", saldo: 1000 }], total: 1000 }] },
        pasivo: { total: 400, secciones: [{ titulo: "Pasivo a corto plazo", filas: [{ cuentaId: 2, nombre: "Proveedores", agrupador: "201.01", saldo: 400 }], total: 400 }] },
        capital: { total: 600, secciones: [{ titulo: "Capital contable", filas: [{ cuentaId: 3, nombre: "Capital social", agrupador: "301.01", saldo: 600 }], total: 600 }] },
        indicadores: { liquidez: 2.27, pruebaAcida: 1.89, diasCobro: 18, endeudamiento: 30.1 },
      },
    });
    render(<EstadosFinancierosPage />);

    expect(await screen.findByText("Cuadra al centavo.")).toBeInTheDocument();
    expect(screen.getByText("Al 31 de octubre de 2026")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Balance general" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("2.27")).toBeInTheDocument();
    expect(screen.getByText("30.1 %")).toBeInTheDocument();
    expect(screen.getByText("Total pasivo")).toBeInTheDocument();
    expect(screen.getByText("Total capital")).toBeInTheDocument();
    expect(screen.getByText("Total circulante")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Balanza XML para el SAT" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });
});
