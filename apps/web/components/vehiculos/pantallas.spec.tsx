/**
 * Vehículos: la ficha enseña lo que manda la API, el alta no guarda sin confirmar y quien no ve costos no
 * ve dinero. Las cifras son las del mockup aprobado.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AltaVehiculo from "@/app/(panels)/erp/vehiculos/nuevo/page";
import VehiculoDetallePage from "@/app/(panels)/erp/vehiculos/[id]/page";

const estado = vi.hoisted(() => ({ consulta: "", push: vi.fn(), permisos: ["vehicles.inventory"] as string[] }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "2" }),
  useRouter: () => ({ push: estado.push, replace: vi.fn() }),
  usePathname: () => "/erp/vehiculos/2",
  useSearchParams: () => new URLSearchParams(estado.consulta),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 1, nombre: "Ada", email: "ada@nexara.com.mx", token: "jwt", permissions: estado.permisos },
    token: "jwt",
  }),
}));

const FLOTA = {
  vehiculo: {
    id: 2,
    nombre: "Nissan Frontier 2026",
    placas: "TXA-12-34",
    estatus: "Disponible",
    activo: true,
    disponible: true,
    conductor: null,
    desde: null,
    proximaDevolucion: null,
    odometroUltimo: 12480,
    combustibleUltimoPct: 75,
    gpsProveedor: null,
    tieneRastreador: false,
  },
  historial: [],
};

const FICHA = {
  vehiculo: { id: 2, nombre: "Nissan Frontier 2026", placas: "TXA-12-34", estatus: "Disponible", activo: true },
  tieneFicha: true,
  especificacion: {
    marca: "Nissan",
    modelo: "Frontier",
    anio: 2026,
    version: "Doble cabina 4x2",
    numeroSerie: null,
    motor: "2.5 L, 4 cilindros",
    potenciaHp: 166,
    transmision: "Manual",
    combustible: "Gasolina",
    tanqueLitros: 80,
    aceiteTipo: "5W-30",
    aceiteLitros: 5.4,
    llantaMedida: "255/70 R16",
    llantaPsi: 35,
    cargaKg: null,
    rendimientoOficial: 11.9,
    fechaCompra: "2026-06-30",
    odometroCompra: null,
    odometroAlta: 5000,
    fuentes: { tanqueLitros: { tipo: "MANUAL", pagina: 418 }, rendimientoOficial: { tipo: "CONUEE", pagina: 21 } },
  },
  odometro: { km: 12480, fecha: "2026-10-28" },
  rendimiento: { oficial: 11.9, real: 8.6, usado: 8.6, fuente: "REAL", tanques: 8, faltan: 0 },
  autonomiaKm: 688,
  tanques: [
    { fecha: "2026-10-23", km: 440, litros: 50, kmPorLitro: 8.8 },
    { fecha: "2026-10-28", km: 450, litros: 52.3, kmPorLitro: 8.6 },
  ],
  cargas: [
    { id: 9, fecha: "2026-10-28T18:00:00.000Z", odometro: 12480, litros: 52.3, importe: 1281.35, tanqueLleno: true, ticketUrl: "/uploads/vehicles/t.jpg", tableroUrl: null },
  ],
  programa: [
    { id: 31, concepto: "Aceite y filtro", cadaKm: 10000, cadaMeses: 6, costoEstimado: null, ultimoKm: 10020, ultimaFecha: "2026-09-05", proximoKm: 20020, proximaFecha: "2027-03-05", faltanKm: 7540, faltanDias: 120, estado: "OK" },
  ],
  proximoServicio: { km: 20020, faltanKm: 7540, fecha: "2027-03-05", conceptos: ["Aceite y filtro", "Rotar llantas"], estado: "OK" },
  servicios: [{ id: 5, fecha: "2026-09-05", odometro: 10020, concepto: "Servicio de 10,000", costo: 4200, proveedor: "Agencia", comprobanteUrl: null, notas: null }],
  documentos: [{ id: 7, tipo: "POLIZA", nombre: "Póliza de seguro", url: "/uploads/vehicles/p.pdf", paginas: null, venceEl: "2026-11-20", estado: "PRONTO" }],
  desgaste: {
    vida: { pct: 6, km: 12480, totalKm: 200000 },
    llantas: { pct: 25, quedanKm: 37520 },
    aceite: { pct: 25, ultimoKm: 10020 },
  },
  viajes: [
    {
      id: 11,
      fecha: "2026-10-28",
      actividad: { id: 40, folio: "AN-40", titulo: "Instalación de cámaras" },
      destino: { tipo: "PROYECTO", id: 5, nombre: "CCTV Bodega Norte" },
      km: 156,
      importe: 1159,
      sinFoto: false,
    },
  ],
  costos: {
    fichaId: 3,
    ficha: { valor: 480000, valorLlantas: 12000, rescatePct: 0.3, vidaKm: 200000, kmAnio: 30000, tasaInteres: 0.12, primaSeguro: 0.04, ko: 0.6, costoAceite: 1200, aceiteCadaKm: 10000, vidaLlantasKm: 50000, otrosAnuales: 0 },
    porKm: 7.43,
    desglose: [
      { clave: "co", nombre: "Gasolina", importe: 2.85 },
      { clave: "d", nombre: "Desgaste del vehículo", importe: 1.62 },
      { clave: "im", nombre: "Dinero invertido", importe: 1.22 },
      { clave: "mn", nombre: "Mantenimiento", importe: 0.97 },
      { clave: "sm", nombre: "Seguro", importe: 0.41 },
      { clave: "n", nombre: "Llantas", importe: 0.24 },
      { clave: "lb", nombre: "Aceite", importe: 0.12 },
    ],
    precioLitro: 24.5,
    valorEstimado: 459782,
    mantenimiento: { apartado: 12131, gastado: 4200 },
  },
  avisos: { sinFichaDeCosto: false, tanquesFaltantes: 0, salidasSinFoto: 0, sinSalidas: false },
  acceso: { veCostos: true },
};

const SIN_DINERO = {
  ...FICHA,
  costos: null,
  viajes: FICHA.viajes.map((x) => ({ ...x, importe: null })),
  servicios: FICHA.servicios.map((x) => ({ ...x, costo: null })),
  acceso: { veCostos: false },
};

const OMISIONES = {
  valorLlantas: 12000,
  rescatePct: 0.3,
  vidaKm: 200000,
  kmAnio: 30000,
  tasaInteres: 0.12,
  primaSeguro: 0.04,
  ko: 0.6,
  precioCombustible: 24.5,
  costoAceite: 1200,
  aceiteCadaKm: 10000,
  vidaLlantasKm: 50000,
  otrosAnuales: 0,
};

type Regla = { incluye: string; metodo?: string; body: unknown; status?: number };
let llamadas: Array<{ url: string; metodo: string; body: unknown }> = [];

function servir(...reglas: Regla[]) {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      const metodo = init?.method ?? "GET";
      let body: unknown = null;
      if (typeof init?.body === "string") body = JSON.parse(init.body);
      else if (init?.body instanceof FormData) body = Object.fromEntries(init.body.entries());
      llamadas.push({ url: href, metodo, body });
      const regla = reglas.find((r) => href.includes(r.incluye) && (!r.metodo || r.metodo === metodo));
      return new Response(JSON.stringify(regla ? regla.body : {}), {
        status: regla?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

const PARA_FICHA = (ficha: unknown = FICHA) => [
  { incluye: "vehicles/flotilla/2", body: FLOTA },
  { incluye: "vehicles/ficha/2", body: ficha },
];

beforeEach(() => {
  estado.consulta = "";
  estado.push.mockClear();
  estado.permisos = ["vehicles.inventory"];
});

describe("ficha: resumen", () => {
  it("dice cuánto cuesta cada kilómetro, en qué se va y con los porcentajes del mockup", async () => {
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);

    expect(await screen.findByText("A dónde se va cada kilómetro")).toBeInTheDocument();
    expect(screen.getByText("Cuesta cada kilómetro")).toBeInTheDocument();
    expect(screen.getAllByText("$7.43").length).toBeGreaterThan(0);
    const gasolina = screen.getByText("38 %").parentElement!;
    expect(gasolina).toHaveTextContent("Gasolina");
    expect(gasolina).toHaveTextContent("$2.85");
    expect(screen.getByText("$459,782")).toBeInTheDocument();
    expect(screen.getByText(/La tarifa ya apartó \$12,131/)).toBeInTheDocument();
  });

  it("compara la gasolina oficial con la real y enseña el desgaste", async () => {
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);

    expect(await screen.findByText("Gasolina: lo oficial contra lo real")).toBeInTheDocument();
    expect(screen.getByText("28 % debajo del oficial")).toBeInTheDocument();
    expect(screen.getByText("Oficial 11.9")).toBeInTheDocument();
    expect(screen.getByText("8.8")).toBeInTheDocument();
    expect(screen.getByText("Vida del vehículo")).toBeInTheDocument();
    expect(screen.getByText("Quedan 37,520 km")).toBeInTheDocument();
    expect(screen.getByText("A los 20,020 km")).toBeInTheDocument();
    expect(screen.getByText("Aceite y filtro, Rotar llantas.")).toBeInTheDocument();
  });

  it("los viajes dicen a qué se cargaron", async () => {
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);

    const fila = (await screen.findByText("Instalación de cámaras")).closest("tr")!;
    expect(within(fila).getByText("Proyecto")).toBeInTheDocument();
    expect(within(fila).getByText("CCTV Bodega Norte")).toBeInTheDocument();
    expect(within(fila).getByText("156")).toBeInTheDocument();
    expect(within(fila).getByText("$1,159")).toBeInTheDocument();
  });

  it("quien no ve costos ve kilómetros y rendimiento, sin un solo peso", async () => {
    servir(...PARA_FICHA(SIN_DINERO));
    render(<VehiculoDetallePage />);

    expect(await screen.findByText("Gasolina: lo oficial contra lo real")).toBeInTheDocument();
    expect(screen.queryByText("A dónde se va cada kilómetro")).not.toBeInTheDocument();
    expect(screen.queryByText("Cuesta cada kilómetro")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo")).not.toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
  });

  it("sin salidas lo dice, y dónde nacen los kilómetros", async () => {
    servir(...PARA_FICHA({ ...FICHA, viajes: [], avisos: { ...FICHA.avisos, sinSalidas: true } }));
    render(<VehiculoDetallePage />);
    expect(await screen.findByText(/Sin salidas registradas todavía/)).toBeInTheDocument();
  });

  it("sin ficha invita a subir el manual, a quien puede", async () => {
    servir(...PARA_FICHA({ ...SIN_DINERO, tieneFicha: false, especificacion: null, programa: [], proximoServicio: null }));
    render(<VehiculoDetallePage />);
    expect(await screen.findByText("Este vehículo aún no tiene ficha.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Súbele el manual" })).toHaveAttribute("href", "/erp/vehiculos/nuevo?vehiculo=2");
  });

  it("si la ficha falla, el estado se sigue viendo", async () => {
    servir({ incluye: "vehicles/flotilla/2", body: FLOTA }, { incluye: "vehicles/ficha/2", status: 500, body: { message: "x" } });
    render(<VehiculoDetallePage />);
    expect(await screen.findByText("Lo trae")).toBeInTheDocument();
    expect(screen.getByText("12,480 km")).toBeInTheDocument();
  });
});

describe("alta de un vehículo que ya existe, sin ficha", () => {
  it("marca, modelo y año salen de su nombre, y con ellos se busca el rendimiento oficial", async () => {
    estado.consulta = "vehiculo=2";
    const sinFicha = { ...FICHA, tieneFicha: false, especificacion: null, programa: [], costos: null };
    servir(
      { incluye: "costos/acceso", body: { veTodo: true } },
      { incluye: "vehicles/ficha/omisiones", body: OMISIONES },
      { incluye: "vehicles/ficha/rendimiento-oficial", metodo: "POST", body: { rendimiento: { valor: 11.91, fuente: { tipo: "CONUEE", pagina: 24 }, version: "FRONTIER" } } },
      { incluye: "vehicles/ficha/2", metodo: "GET", body: sinFicha },
    );
    const user = userEvent.setup();
    render(<AltaVehiculo />);

    expect(await screen.findByLabelText("Marca")).toHaveValue("Nissan");
    expect(screen.getByLabelText("Modelo")).toHaveValue("Frontier");
    expect(screen.getByLabelText("Año")).toHaveValue("2026");

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => {
      const post = llamadas.find((l) => l.url.includes("rendimiento-oficial"));
      expect(post?.body).toMatchObject({ marca: "Nissan", modelo: "Frontier", anio: 2026 });
    });
    expect(await screen.findByText("CONUEE 2023 p. 24")).toBeInTheDocument();
    estado.consulta = "";
  });
});

describe("ficha: pestañas", () => {
  it("especificaciones: cada dato con su fuente, y los documentos con vencimiento", async () => {
    servir(...PARA_FICHA());
    const user = userEvent.setup();
    render(<VehiculoDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Especificaciones" }));

    expect(await screen.findByText("80 L")).toBeInTheDocument();
    expect(screen.getByText("Manual p. 418")).toBeInTheDocument();
    expect(screen.getByText("CONUEE 2023 p. 21")).toBeInTheDocument();
    expect(screen.getByText("688 km por tanque")).toBeInTheDocument();
    expect(screen.getAllByText("Tus tickets")).toHaveLength(2);
    expect(screen.getByText("Póliza de seguro")).toBeInTheDocument();
    expect(screen.getByText(/Vence 20 de noviembre de 2026/)).toBeInTheDocument();
  });

  it("la pestaña se puede pedir por la dirección", async () => {
    estado.consulta = "tab=gasolina";
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);
    expect(await screen.findByText("Cargas de gasolina")).toBeInTheDocument();
    expect(screen.getByText(/usa el rendimiento real/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ticket" })).toBeInTheDocument();
  });

  it("mantenimiento: programa y servicios hechos", async () => {
    estado.consulta = "tab=mantenimiento";
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);
    expect(await screen.findByText("Programa de servicio")).toBeInTheDocument();
    expect(screen.getByText("Cada 10,000 km o 6 meses")).toBeInTheDocument();
    expect(screen.getByText("Al día")).toBeInTheDocument();
    expect(screen.getByText("Servicio de 10,000")).toBeInTheDocument();
    expect(screen.getByText("$4,200")).toBeInTheDocument();
  });
});

describe("cargar gasolina", () => {
  const foto = new File(["x"], "ticket.jpg", { type: "image/jpeg" });

  it("lee las fotos, enseña el rendimiento y guarda lo que la persona confirma", async () => {
    servir(
      ...PARA_FICHA({ ...FICHA, cargas: [{ ...FICHA.cargas[0], odometro: 12030, litros: 50 }] }),
      { incluye: "leer-foto", body: { litros: 52.3, precioLitro: 24.5, importe: 1281.35, fecha: null, legible: true, revisar: false } },
      { incluye: "/cargas", metodo: "POST", body: FICHA },
    );
    const user = userEvent.setup();
    render(<VehiculoDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Cargar gasolina" }));

    await user.upload(screen.getByLabelText("Foto del ticket"), foto);
    await waitFor(() => expect(screen.getByLabelText("Litros")).toHaveValue("52.3"));
    expect(screen.getByLabelText("Total")).toHaveValue("1281.35");

    await user.type(screen.getByLabelText("Odómetro"), "12480");
    const medido = await screen.findByText(/450 km desde el tanque anterior/);
    expect(medido).toHaveTextContent("8.6 km/L");

    await user.click(screen.getByRole("button", { name: "Guardar carga" }));
    await waitFor(() => {
      const post = llamadas.find((l) => l.url.includes("/cargas") && l.metodo === "POST");
      expect(post?.body).toMatchObject({ odometro: "12480", litros: "52.3", importe: "1281.35", tanqueLleno: "true" });
    });
  });

  it("si la foto no se lee, se captura a mano", async () => {
    servir(...PARA_FICHA(), { incluye: "leer-foto", status: 503, body: { message: "no" } });
    const user = userEvent.setup();
    render(<VehiculoDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Cargar gasolina" }));
    await user.upload(screen.getByLabelText("Foto del ticket"), foto);
    expect(await screen.findByText(/No se pudo leer el ticket/)).toBeInTheDocument();
    expect(screen.getByLabelText("Litros")).toHaveValue("");
  });

  it("no guarda sin los datos mínimos", async () => {
    servir(...PARA_FICHA());
    const user = userEvent.setup();
    render(<VehiculoDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Cargar gasolina" }));
    await user.click(screen.getByRole("button", { name: "Guardar carga" }));
    expect(await screen.findByText(/Faltan el odómetro, los litros o el importe/)).toBeInTheDocument();
    expect(llamadas.some((l) => l.url.includes("/cargas"))).toBe(false);
  });
});

describe("registrar servicio", () => {
  it("marca qué se hizo y lo manda con su odómetro", async () => {
    servir(...PARA_FICHA(), { incluye: "/servicios", metodo: "POST", body: FICHA });
    const user = userEvent.setup();
    render(<VehiculoDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Registrar servicio" }));

    expect(screen.getByLabelText("Odómetro")).toHaveValue("12480");
    await user.click(screen.getByRole("checkbox", { name: "Aceite y filtro" }));
    await user.type(screen.getByLabelText("Costo"), "1550");
    await user.click(screen.getByRole("button", { name: "Guardar servicio" }));

    await waitFor(() => {
      const post = llamadas.find((l) => l.url.includes("/servicios") && l.metodo === "POST");
      expect(post?.body).toMatchObject({ concepto: "Aceite y filtro", odometro: "12480", costo: "1550", planIds: "31" });
    });
  });

  it("sin permiso de inventario no aparece", async () => {
    estado.permisos = [];
    servir(...PARA_FICHA());
    render(<VehiculoDetallePage />);
    expect(await screen.findByRole("button", { name: "Cargar gasolina" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar servicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Editar ficha" })).not.toBeInTheDocument();
  });
});

describe("alta", () => {
  const ACCESO_TODO = { incluye: "/costos/acceso", body: { veTodo: true, puedeLigar: true } };
  const ACCESO_NADA = { incluye: "/costos/acceso", body: { veTodo: false, puedeLigar: false } };
  const OMIS = { incluye: "vehicles/ficha/omisiones", body: OMISIONES };
  const LEIDO = {
    campos: {
      marca: { valor: "Nissan", fuente: { tipo: "MANUAL", pagina: 3 } },
      modelo: { valor: "Frontier", fuente: { tipo: "MANUAL", pagina: 3 } },
      tanqueLitros: { valor: 80, fuente: { tipo: "MANUAL", pagina: 418 } },
    },
    servicios: [{ concepto: "Aceite y filtro", cadaKm: 10000, cadaMeses: 6, paginaManual: 431 }],
    paginas: 612,
    escaneado: false,
    archivo: { url: "/uploads/vehicles/m.pdf", nombre: "Manual.pdf", paginas: 612 },
  };
  const OFICIAL = { incluye: "rendimiento-oficial", body: { rendimiento: { valor: 11.91, fuente: { tipo: "CONUEE", pagina: 21 }, version: "FRONTIER" } } };
  const pdf = new File(["%PDF"], "Manual.pdf", { type: "application/pdf" });

  it("lee el manual, enseña la fuente de cada dato y no guarda hasta confirmar", async () => {
    servir(ACCESO_TODO, OMIS, OFICIAL, { incluye: "leer-manual", body: LEIDO }, { incluye: "vehicles/ficha", metodo: "POST", body: FICHA });
    const user = userEvent.setup();
    render(<AltaVehiculo />);

    await user.upload(screen.getByLabelText("Manual en PDF"), pdf);
    await user.type(await screen.findByLabelText("Precio de compra"), "480000");
    await user.click(screen.getByRole("button", { name: "Leer y revisar" }));

    expect(await screen.findByText(/en las 612 páginas del manual/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tanque (L)")).toHaveValue("80");
    expect(screen.getByText("Manual p. 418")).toBeInTheDocument();
    expect(screen.getByLabelText("Combinado (km/L)")).toHaveValue("11.91");
    expect(screen.getByText("CONUEE 2023 p. 21")).toBeInTheDocument();
    expect(screen.getByLabelText("Qué toca")).toHaveValue("Aceite y filtro");
    // $6.64 con el rendimiento oficial, igual que el mockup.
    expect(screen.getByText("$6.64")).toBeInTheDocument();
    expect(llamadas.some((l) => l.url.endsWith("vehicles/ficha") && l.metodo === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Guardar vehículo" }));
    await waitFor(() => expect(estado.push).toHaveBeenCalledWith("/erp/vehiculos/2"));
    const post = llamadas.find((l) => l.url.endsWith("vehicles/ficha") && l.metodo === "POST");
    expect(post?.body).toMatchObject({
      nombre: "Nissan Frontier",
      marca: "Nissan",
      tanqueLitros: 80,
      rendimientoOficial: 11.91,
      fuentes: { tanqueLitros: { tipo: "MANUAL", pagina: 418 }, rendimientoOficial: { tipo: "CONUEE", pagina: 21 } },
      plan: [{ concepto: "Aceite y filtro", cadaKm: 10000, cadaMeses: 6, paginaManual: 431 }],
      costo: { valor: 480000, rescatePct: 0.3, tasaInteres: 0.12, primaSeguro: 0.04 },
      manual: { url: "/uploads/vehicles/m.pdf" },
    });
  });

  it("corregir un dato leído lo vuelve capturado", async () => {
    servir(ACCESO_TODO, OMIS, OFICIAL, { incluye: "leer-manual", body: LEIDO });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.upload(screen.getByLabelText("Manual en PDF"), pdf);
    await user.click(screen.getByRole("button", { name: "Leer y revisar" }));

    const tanque = await screen.findByLabelText("Tanque (L)");
    await user.clear(tanque);
    await user.type(tanque, "76");
    expect(screen.queryByText("Manual p. 418")).not.toBeInTheDocument();
    expect(within(tanque.parentElement as HTMLElement).getByText("Capturado")).toBeInTheDocument();
  });

  it("lo que la persona escribió manda sobre lo que se leyó", async () => {
    servir(ACCESO_TODO, OMIS, OFICIAL, { incluye: "leer-manual", body: LEIDO });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.type(await screen.findByLabelText("Marca"), "Datsun");
    await user.upload(screen.getByLabelText("Manual en PDF"), pdf);
    await user.click(screen.getByRole("button", { name: "Leer y revisar" }));
    expect(await screen.findByLabelText("Marca")).toHaveValue("Datsun");
  });

  it("un PDF escaneado no detiene el alta: lo dice y deja llenar a mano", async () => {
    servir(ACCESO_TODO, OMIS, { incluye: "leer-manual", body: { ...LEIDO, campos: {}, servicios: [], escaneado: true } });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.upload(screen.getByLabelText("Manual en PDF"), pdf);
    await user.click(screen.getByRole("button", { name: "Leer y revisar" }));
    expect(await screen.findByText(/imagen escaneada/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tanque (L)")).toHaveValue("");
    expect(screen.getAllByText("Falta").length).toBeGreaterThan(0);
  });

  it("si la lectura falla, sigue a mano", async () => {
    servir(ACCESO_TODO, OMIS, { incluye: "leer-manual", status: 503, body: { message: "La IA no respondió" } });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.upload(screen.getByLabelText("Manual en PDF"), pdf);
    await user.click(screen.getByRole("button", { name: "Leer y revisar" }));
    expect(await screen.findByText(/La IA no respondió/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar vehículo" })).toBeInTheDocument();
  });

  it("sin manual: con el modelo busca el rendimiento oficial", async () => {
    servir(ACCESO_TODO, OMIS, OFICIAL);
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.type(await screen.findByLabelText("Marca"), "Nissan");
    await user.type(screen.getByLabelText("Modelo"), "Frontier");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByLabelText("Combinado (km/L)")).toHaveValue("11.91");
    expect(llamadas.some((l) => l.url.includes("leer-manual"))).toBe(false);
  });

  it("no guarda sin marca y modelo", async () => {
    servir(ACCESO_TODO, OMIS);
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await user.click(await screen.findByRole("button", { name: "Guardar vehículo" }));
    expect(await screen.findByText("Escribe la marca y el modelo del vehículo")).toBeInTheDocument();
  });

  it("quien no ve costos da de alta sin precio ni tarifa", async () => {
    servir(ACCESO_NADA, OMIS, { incluye: "vehicles/ficha", metodo: "POST", body: FICHA });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    await user.type(await screen.findByLabelText("Marca"), "Nissan");
    await user.type(screen.getByLabelText("Modelo"), "Frontier");
    expect(screen.queryByLabelText("Precio de compra")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("button", { name: "Guardar vehículo" })).toBeInTheDocument();
    expect(screen.queryByText("Para calcular el costo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Guardar vehículo" }));
    await waitFor(() => expect(estado.push).toHaveBeenCalled());
    const post = llamadas.find((l) => l.url.endsWith("vehicles/ficha") && l.metodo === "POST");
    expect((post?.body as Record<string, unknown>).costo).toBeUndefined();
  });

  it("editar: entra a la revisión con lo que ya tiene, y puede recostear", async () => {
    estado.consulta = "vehiculo=2";
    servir(ACCESO_TODO, OMIS, { incluye: "vehicles/ficha/2", metodo: "GET", body: FICHA }, { incluye: "vehicles/ficha/2", metodo: "PUT", body: FICHA });
    const user = userEvent.setup();
    render(<AltaVehiculo />);
    expect(await screen.findByLabelText("Tanque (L)")).toHaveValue("80");
    expect(screen.getByLabelText("Qué toca")).toHaveValue("Aceite y filtro");
    expect(await screen.findByLabelText("Precio de compra")).toHaveValue("480000");

    await user.click(screen.getByRole("checkbox", { name: /viajes ya cargados/ }));
    await user.click(screen.getByRole("button", { name: "Guardar vehículo" }));
    await waitFor(() => {
      const put = llamadas.find((l) => l.metodo === "PUT");
      expect(put?.url).toContain("vehicles/ficha/2?recostear=1");
      expect(put?.body).toMatchObject({ plan: [{ id: 31, concepto: "Aceite y filtro" }] });
    });
  });
});
