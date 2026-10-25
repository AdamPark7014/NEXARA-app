import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpsProjectDetailShell, {
  avisoAlDesactivarProyecto,
  avisoAlEliminarProyecto,
  FALLO_ELIMINAR_PROYECTO,
  FALLO_ESTATUS_PROYECTO,
  VUELTA_PROYECTOS_OPERATIVOS,
} from "./OpsProjectDetailShell";

const TITULO = "Torre Norte";

/** Texto viejo: desactivar eran dos frases. */
const VIEJO_DESACTIVAR =
  "«Torre Norte» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después.";
/** Texto viejo: eliminar eran cuatro frases. */
const VIEJO_ELIMINAR =
  "¿Eliminar el proyecto «Torre Norte»? Esta acción no se puede deshacer. Sus actividades conservan su historial. Si solo está detenido, mejor desactívalo.";
/** Texto viejo de la vuelta. */
const VIEJA_VUELTA = "← Proyectos operativos";

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
    user: { id: 1, token: "tok", email: "christian@nexara.mx", nombre: "Christian", role: "CEO" },
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

function frases(texto: string): string[] {
  return texto
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const proyecto = {
  id: 42,
  title: TITULO,
  status: "ACTIVE",
  client: { id: 7, name: "ACROBAT" },
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

beforeEach(() => {
  getOperationalProject.mockReset().mockResolvedValue(proyecto);
  deactivateOperationalProject.mockReset().mockResolvedValue({ ...proyecto, status: "ON_HOLD" });
  deleteOperationalProject.mockReset().mockResolvedValue({ ok: true, id: 42 });
  reactivateOperationalProject.mockReset().mockResolvedValue(proyecto);
  getClientPermissions.mockReset().mockResolvedValue(permisosDe({ puedeDesactivar: true, puedeEliminar: true }));
  push.mockReset();
});

describe("avisos del proyecto operativo", () => {
  it("cita el texto viejo y lo deja en una frase, con el mismo hecho", () => {
    expect(frases(VIEJO_DESACTIVAR)).toHaveLength(2);
    expect(frases(VIEJO_ELIMINAR)).toHaveLength(4);

    const desactivar = avisoAlDesactivarProyecto(TITULO);
    const eliminar = avisoAlEliminarProyecto(TITULO);

    expect(desactivar).not.toBe(VIEJO_DESACTIVAR);
    expect(eliminar).not.toBe(VIEJO_ELIMINAR);
    expect(frases(desactivar)).toHaveLength(1);
    expect(frases(eliminar)).toHaveLength(1);

    expect(desactivar).toContain("quedará inactivo");
    expect(desactivar).toContain("sus actividades y su historial se conservan");
    expect(desactivar).toContain("podrás reactivarlo después");
    expect(eliminar).toContain("sin poder deshacerlo");
    expect(eliminar).toContain("conservando el historial de sus actividades");
    expect(eliminar).toContain("si solo está detenido");
    expect(eliminar).toMatch(/desactiv/);
  });

  it("la vuelta es «‹ Proyectos operativos» y Desactivar y Eliminar siguen", async () => {
    render(
      <OpsProjectDetailShell id="42">
        <p>Cuerpo</p>
      </OpsProjectDetailShell>,
    );

    expect(await screen.findByRole("link", { name: VUELTA_PROYECTOS_OPERATIVOS })).toHaveAttribute(
      "href",
      "/ops/projects",
    );
    expect(screen.queryByRole("link", { name: VIEJA_VUELTA })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("desactivar muestra una frase y, si falla, Reintentar con el aviso de estatus", async () => {
    const user = userEvent.setup();
    deactivateOperationalProject.mockRejectedValue(new Error(FALLO_ESTATUS_PROYECTO));
    render(
      <OpsProjectDetailShell id="42">
        <p>Cuerpo</p>
      </OpsProjectDetailShell>,
    );

    await user.click(await screen.findByRole("button", { name: "Desactivar" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(within(dialogo).getByText(avisoAlDesactivarProyecto(TITULO))).toBeInTheDocument();
    expect(within(dialogo).queryByText(VIEJO_DESACTIVAR)).not.toBeInTheDocument();
    expect(screen.queryByText(VIEJO_DESACTIVAR)).not.toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Desactivar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(FALLO_ESTATUS_PROYECTO);
    expect(within(aviso).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(deactivateOperationalProject).toHaveBeenCalledTimes(1);

    deactivateOperationalProject.mockResolvedValueOnce({ ...proyecto, status: "ON_HOLD" });
    await user.click(within(aviso).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(deactivateOperationalProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("eliminar muestra una frase y, si falla, Reintentar sin el texto viejo", async () => {
    const user = userEvent.setup();
    deleteOperationalProject.mockRejectedValue(new Error(FALLO_ELIMINAR_PROYECTO));
    render(
      <OpsProjectDetailShell id="42">
        <p>Cuerpo</p>
      </OpsProjectDetailShell>,
    );

    await user.click(await screen.findByRole("button", { name: "Eliminar" }));
    const dialogo = screen.getByRole("alertdialog");
    expect(within(dialogo).getByText(avisoAlEliminarProyecto(TITULO))).toBeInTheDocument();
    expect(screen.queryByText(VIEJO_ELIMINAR)).not.toBeInTheDocument();

    await user.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(FALLO_ELIMINAR_PROYECTO);
    expect(within(aviso).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("sin permiso no hay Desactivar ni Eliminar", async () => {
    getClientPermissions.mockResolvedValue(permisosDe({}));
    render(
      <OpsProjectDetailShell id="42">
        <p>Cuerpo</p>
      </OpsProjectDetailShell>,
    );
    expect(await screen.findByRole("heading", { name: TITULO })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });
});
