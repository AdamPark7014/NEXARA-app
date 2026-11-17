import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EmployeeDetailPage from "./page";
import { setActiveCompanyId } from "@/lib/tenant";

const contexto = vi.hoisted(() => ({ user: { id: 50, token: "t", roleKey: "ing_campo" } }));
vi.mock("@/components/UserContext", () => ({ useUser: () => contexto }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "50" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/hr/ExpedienteEmpleado", () => ({ default: ({ userId }: { userId: string }) => <div>Expediente permitido por la API: {userId}</div> }));

describe("ficha de personal: acceso al expediente", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    contexto.user = { id: 50, token: "t", roleKey: "ing_campo" };
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("el empleado abre su expediente sin pedir permisos de administración de usuarios", () => {
    render(<EmployeeDetailPage />);
    expect(screen.getByText("Expediente permitido por la API: 50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar ficha" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 403 en la ficha antigua no impide consultar el expediente con sus permisos propios", async () => {
    contexto.user.roleKey = "rh";
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => "Sin permiso de usuarios" } as Response);
    render(<EmployeeDetailPage />);
    await waitFor(() => expect(screen.getByText("Expediente permitido por la API: 50")).toBeInTheDocument());
    expect(screen.queryByText("Sin permiso de usuarios")).not.toBeInTheDocument();
  });

  it("al editar contrato no envía puesto directo y conserva la empresa activa", async () => {
    contexto.user.roleKey = "rh";
    setActiveCompanyId(42);
    fetchMock.mockImplementation(async (url, init) => ({
      ok: true, status: 200,
      json: async () => String(url).includes("attendance/") ? [] : { id: 50, nombre: "Persona ficticia", email: "persona@example.invalid", puesto: "Puesto anterior", tipoContrato: init?.method === "PATCH" ? "Honorarios" : "Planta" },
    } as Response));
    render(<EmployeeDetailPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar ficha" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    expect(screen.getByDisplayValue("Puesto anterior")).toHaveAttribute("readonly");
    expect(screen.getByText(/Dirección debe aprobarla/)).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "Honorarios" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("puesto");
    expect(new Headers(init?.headers).get("X-Company-Id")).toBe("42");
    expect(init?.credentials).toBe("include");
  });
});
