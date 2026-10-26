import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpsProjectDetailShell from "./OpsProjectDetailShell";

const TITULO = "Torre Norte";

const getOperationalProject = vi.hoisted(() => vi.fn());
const deactivateOperationalProject = vi.hoisted(() => vi.fn());
const deleteOperationalProject = vi.hoisted(() => vi.fn());
const reactivateOperationalProject = vi.hoisted(() => vi.fn());
const getClientPermissions = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/ops/projects/42",
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 1, token: "tok", email: "direccion@empresa.test", nombre: "Dirección", role: "CEO" },
  }),
}));

vi.mock("@/lib/ops-operational-api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ops-operational-api")>();
  return {
    ...real,
    getOperationalProject,
    deactivateOperationalProject,
    deleteOperationalProject,
    reactivateOperationalProject,
  };
});

vi.mock("@/lib/sales-api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sales-api")>();
  return { ...real, getClientPermissions };
});

const proyecto = {
  id: 42,
  title: TITULO,
  status: "ACTIVE",
  client: { id: 7, name: "Cliente de prueba" },
};

function permisosDe(parcial: { puedeDesactivar?: boolean; puedeEliminar?: boolean }) {
  return {
    puedeAgregar: false,
    puedeEditar: false,
    puedeDesactivar: false,
    puedeEliminar: false,
    ...parcial,
  };
}

function pintar() {
  render(
    <OpsProjectDetailShell id="42">
      <p>Cuerpo</p>
    </OpsProjectDetailShell>,
  );
}

beforeEach(() => {
  getOperationalProject.mockReset().mockResolvedValue(proyecto);
  deactivateOperationalProject.mockReset().mockResolvedValue({ ...proyecto, status: "ON_HOLD" });
  deleteOperationalProject.mockReset().mockResolvedValue({ ok: true, id: 42 });
  reactivateOperationalProject.mockReset().mockResolvedValue(proyecto);
  getClientPermissions.mockReset().mockResolvedValue(permisosDe({ puedeDesactivar: true, puedeEliminar: true }));
  push.mockReset();
});

describe("ficha del proyecto operativo", () => {
  it("la vuelta lleva a la lista y Desactivar y Eliminar siguen", async () => {
    pintar();
    expect(await screen.findByRole("link", { name: "‹ Proyectos operativos" })).toHaveAttribute(
      "href",
      "/ops/projects",
    );
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("desactivar avisa que se puede reactivar y, si falla, Reintentar lo vuelve a pedir", async () => {
    const user = userEvent.setup();
    deactivateOperationalProject.mockRejectedValueOnce(new Error("El proyecto tiene una actividad en curso"));
    pintar();

    await user.click(await screen.findByRole("button", { name: "Desactivar" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(
      within(dialogo).getByText(
        "«Torre Norte» quedará inactivo: sus actividades y su historial se conservan y podrás reactivarlo después.",
      ),
    ).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));
    // El aviso trae la causa que dio el servidor, no un texto fijo.
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El proyecto tiene una actividad en curso");
    expect(deactivateOperationalProject).toHaveBeenCalledTimes(1);

    await user.click(within(aviso).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(deactivateOperationalProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("eliminar dice que es para siempre y, aparte, que se puede desactivar", async () => {
    const user = userEvent.setup();
    deleteOperationalProject.mockRejectedValueOnce(new Error("No se pudo eliminar el proyecto"));
    pintar();

    await user.click(await screen.findByRole("button", { name: "Eliminar" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(
      within(dialogo).getByText(
        "El proyecto «Torre Norte» se eliminará para siempre y sus actividades conservarán su historial; si solo está detenido, mejor desactívalo.",
      ),
    ).toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo eliminar el proyecto");
    expect(within(aviso).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(within(aviso).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ops/projects"));
    expect(deleteOperationalProject).toHaveBeenCalledTimes(2);
  });

  it("sin permiso no hay Desactivar ni Eliminar", async () => {
    getClientPermissions.mockResolvedValue(permisosDe({}));
    pintar();
    expect(await screen.findByRole("heading", { name: TITULO })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });
});
