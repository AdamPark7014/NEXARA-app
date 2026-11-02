import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listarFormatos: vi.fn(),
  aplicarFormato: vi.fn(),
  borradorDesdeActividad: vi.fn(),
  crearFormato: vi.fn(),
  editarFormato: vi.fn(),
  archivarFormato: vi.fn(),
  listAssignableUsers: vi.fn(),
  listOperationalProjects: vi.fn(),
  getClientPermissions: vi.fn(),
  listSalesClients: vi.fn(),
  provisionSalesServiceClient: vi.fn(),
  terminar: vi.fn(),
  parametros: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => api.parametros, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok", user: { id: 2 } }) }));
vi.mock("@/lib/cronometro-proceso", () => ({
  useCronometroProceso: () => ({ arrancar: vi.fn(), terminar: api.terminar, descartar: vi.fn() }),
}));
vi.mock("@/lib/formatos-actividad", async (original) => ({
  ...(await original<typeof import("@/lib/formatos-actividad")>()),
  listarFormatos: api.listarFormatos,
  aplicarFormato: api.aplicarFormato,
  borradorDesdeActividad: api.borradorDesdeActividad,
  crearFormato: api.crearFormato,
  editarFormato: api.editarFormato,
  archivarFormato: api.archivarFormato,
}));
vi.mock("@/lib/ops-activities-api", () => ({
  listAssignableUsers: api.listAssignableUsers,
  listOperationalProjects: api.listOperationalProjects,
}));
vi.mock("@/lib/sales-api", () => ({
  getClientPermissions: api.getClientPermissions,
  listSalesClients: api.listSalesClients,
  provisionSalesServiceClient: api.provisionSalesServiceClient,
}));
// El selector de cliente tiene sus propias pruebas: aquí basta con elegir uno.
vi.mock("@/components/erp/ClienteRapido", () => ({
  ClienteRapido: ({ clientes, onElegido }: { clientes: Array<{ id: number; name: string }>; onElegido: (c: unknown) => void }) => (
    <button type="button" onClick={() => onElegido(clientes[0])}>
      Elegir cliente
    </button>
  ),
}));

import Page from "./page";

const renglon = (titulo: string, extra: Record<string, unknown> = {}) => ({
  titulo,
  coreKind: "tarea",
  tipo: null,
  minutosBase: 60,
  minutosPorUnidad: 0,
  fotos: 4,
  indicaciones: null,
  puntos: [],
  herramientas: [],
  ...extra,
});

const CCTV = {
  id: 7,
  nombre: "Instalación CCTV",
  descripcion: null,
  version: 1,
  usos: 12,
  ultimoUsoAt: null,
  receta: {
    unidad: "Cámaras",
    cantidadPorOmision: 4,
    renglones: [
      renglon("Levantamiento"),
      renglon("Montaje", { minutosBase: 30, minutosPorUnidad: 45, puntos: [{ nombre: "Rack", momentos: ["DESPUES"] }] }),
    ],
  },
};
const PREVENTIVO = {
  ...CCTV,
  id: 8,
  nombre: "Mantenimiento",
  usos: 0,
  receta: { unidad: null, cantidadPorOmision: 1, renglones: [renglon("Limpieza")] },
};

beforeEach(() => {
  for (const f of [api.aplicarFormato, api.borradorDesdeActividad, api.provisionSalesServiceClient, api.terminar]) f.mockReset();
  api.parametros = new URLSearchParams();
  api.listarFormatos.mockReset().mockResolvedValue([CCTV, PREVENTIVO]);
  api.listAssignableUsers.mockReset().mockResolvedValue([
    { id: 10, nombre: "Ana Ruiz" },
    { id: 11, nombre: "Beto Díaz", horaEntrada: "08:00" },
  ]);
  api.listOperationalProjects.mockReset().mockResolvedValue([]);
  api.getClientPermissions.mockReset().mockResolvedValue({ puedeAltaRapida: true });
  api.listSalesClients.mockReset().mockResolvedValue([{ id: 40, name: "Crepería Luna", serviceClientId: 3 }]);
});

async function abrir() {
  render(<Page />);
  await screen.findByRole("button", { name: /Instalación CCTV/ });
  return userEvent.setup();
}

const minutosDe = (nombre: string) => screen.getByRole("spinbutton", { name: `Minutos de ${nombre}` });

describe("Asignar con un formato", () => {
  it("abre con el primero elegido y su cantidad", async () => {
    await abrir();
    expect(screen.getByRole("button", { name: /Instalación CCTV/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /se usó 12 veces/ })).toBeTruthy();
    expect(minutosDe("Montaje")).toHaveValue(210);
    expect(screen.getByRole("button", { name: "Asignar 2 actividades" })).toBeTruthy();
    expect(screen.getByText(/Total 4 h 30 min · cabe en 1 jornada/)).toBeTruthy();
  });

  it("subir la cantidad recalcula, pero respeta lo escrito a mano", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "Más cámaras" }));
    expect(minutosDe("Montaje")).toHaveValue(255);
    await u.clear(minutosDe("Levantamiento"));
    await u.type(minutosDe("Levantamiento"), "90");
    await u.click(screen.getByRole("button", { name: "Más cámaras" }));
    expect(minutosDe("Levantamiento")).toHaveValue(90);
    expect(minutosDe("Montaje")).toHaveValue(300);
  });

  it("sin unidad no pide cantidad", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: /Mantenimiento/ }));
    expect(screen.queryByRole("button", { name: /^Más / })).toBeNull();
    expect(screen.getByRole("button", { name: "Asignar 1 actividad" })).toBeTruthy();
  });

  it("la hora sigue la entrada de la persona hasta que alguien la escribe", async () => {
    const u = await abrir();
    await screen.findAllByRole("option", { name: "Beto Díaz" });
    const hora = screen.getByLabelText("Hora de inicio");
    await u.selectOptions(screen.getByRole("combobox", { name: /Quién/ }), "11");
    expect(hora).toHaveValue("08:00");
    await u.selectOptions(screen.getByRole("combobox", { name: /Quién/ }), "10");
    expect(hora).toHaveValue("");
    await u.type(hora, "12:30");
    await u.selectOptions(screen.getByRole("combobox", { name: /Quién/ }), "11");
    expect(hora).toHaveValue("12:30");
  });

  it("editar el formato no cuenta como tiempo de asignar", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "Más cámaras" }));
    expect(screen.getByText("Clics").nextSibling?.textContent).toBe("1");
    await u.click(screen.getByRole("button", { name: "Editar formato" }));
    await u.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByText("Clics").nextSibling?.textContent).toBe("0"));
  });

  it("no manda nada sin persona y lo dice", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "Asignar 2 actividades" }));
    expect(api.aplicarFormato).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Elige quién la lleva/).length).toBeGreaterThan(0);
  });

  it("asigna con lo editado, dice cuánto tardó y enlaza lo creado", async () => {
    api.aplicarFormato.mockResolvedValue({
      actividades: [
        { id: 501, anNumber: "AN-0501", titulo: "Levantamiento en Luna" },
        { id: 502, anNumber: "AN-0502", titulo: "Montaje" },
      ],
      fallidas: [],
    });
    const u = await abrir();
    await u.click(await screen.findByRole("button", { name: /Elegir cliente/ }));
    await u.type(screen.getByRole("textbox", { name: /Sucursal/ }), "Angelópolis");
    await screen.findAllByRole("option", { name: "Ana Ruiz" });
    await u.selectOptions(screen.getByRole("combobox", { name: /Quién/ }), "10");
    await u.selectOptions(screen.getByRole("combobox", { name: /Con quién más/ }), "11");
    const titulo = screen.getByRole("textbox", { name: "Título de la actividad 1" });
    await u.clear(titulo);
    await u.type(titulo, "Levantamiento en Luna");
    await u.click(screen.getByRole("button", { name: "Asignar 2 actividades" }));

    await waitFor(() => expect(api.aplicarFormato).toHaveBeenCalledTimes(1));
    const [token, id, datos] = api.aplicarFormato.mock.calls[0];
    expect([token, id]).toEqual(["tok", 7]);
    expect(datos).toMatchObject({ responsableId: 10, equipoIds: [11], clientId: 3, sucursal: "Angelópolis", hora: null });
    expect(datos.clave).toBeTruthy();
    expect(datos.renglones[0]).toMatchObject({ titulo: "Levantamiento en Luna", minutos: 60 });
    expect(datos.renglones[1]).toMatchObject({ titulo: "Montaje", minutos: 210, puntos: [{ nombre: "Rack" }] });
    expect(datos.renglones[0].clave).toBeUndefined();

    const listo = await screen.findByRole("status");
    expect(listo.textContent).toMatch(/Listo en \d+ s y \d+ clics: 2 actividades para Ana Ruiz en Crepería Luna · Angelópolis/);
    expect(within(listo).getByRole("link", { name: /AN-0501/ })).toHaveAttribute("href", "/erp/actividades/501");
    expect(api.terminar).toHaveBeenCalledWith(501, "2 actividades");
    expect(screen.getByRole("button", { name: "Asignar 2 actividades" })).toBeDisabled();
  });

  it("si una falló, dice cuál y enseña las que sí quedaron", async () => {
    api.aplicarFormato.mockResolvedValue({
      actividades: [{ id: 501, anNumber: "AN-0501", titulo: "Levantamiento" }],
      fallidas: [{ titulo: "Montaje", motivo: "Sin permiso" }],
    });
    const u = await abrir();
    await screen.findAllByRole("option", { name: "Ana Ruiz" });
    await u.selectOptions(screen.getByRole("combobox", { name: /Quién/ }), "10");
    await u.click(screen.getByRole("button", { name: "Asignar 2 actividades" }));
    expect(await screen.findByRole("link", { name: /AN-0501/ })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Montaje (Sin permiso)");
  });

  it("a quien no asigna a otros le explica por qué no entra", async () => {
    api.listarFormatos.mockRejectedValue(new Error("Los formatos son de quien asigna actividades a otras personas"));
    render(<Page />);
    expect((await screen.findByRole("alert")).textContent).toContain("Los formatos son de quien asigna");
  });

  it("desde una actividad abre el editor con lo ya hecho", async () => {
    api.parametros = new URLSearchParams("desde=99");
    api.borradorDesdeActividad.mockResolvedValue({
      nombre: "Cableado sucursal",
      receta: { unidad: null, cantidadPorOmision: 1, renglones: [renglon("Cableado sucursal")] },
    });
    render(<Page />);
    await waitFor(() => expect(api.borradorDesdeActividad).toHaveBeenCalledWith("tok", 99));
    expect(await screen.findByRole("dialog", { name: "Nuevo formato" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("Cableado sucursal"));
  });
});
