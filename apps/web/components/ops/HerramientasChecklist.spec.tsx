import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HerramientasChecklist from "./HerramientasChecklist";
import HerramientasChecklistEditor from "./HerramientasChecklistEditor";
import type { ChecklistHerramientas, RequisitoBorrador, RequisitoHerramienta } from "@/lib/herramientas-checklist";

const useUser = vi.hoisted(() => vi.fn());
vi.mock("@/components/UserContext", () => ({ useUser }));

beforeEach(() => {
  useUser.mockReturnValue({ user: { token: "jwt", permissions: [] }, token: "jwt" });
  // El editor trae el catálogo de kits/herramientas al abrirse; aquí no interesa: lista vacía.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Editor({
  inicial = [] as RequisitoBorrador[],
  onToggle = () => undefined,
}: {
  inicial?: RequisitoBorrador[];
  onToggle?: (v: boolean) => void;
}) {
  const [filas, setFilas] = useState<RequisitoBorrador[]>(inicial);
  return <HerramientasChecklistEditor value={filas} onChange={setFilas} usePersonalKit={false} onToggleUsePersonalKit={onToggle} />;
}

const fila = (key: string, descripcion: string, cantidad = 1): RequisitoBorrador => ({ key, descripcion, cantidad });

describe("HerramientasChecklistEditor", () => {
  it("lista los renglones con su cantidad y se pueden quitar", async () => {
    render(<Editor inicial={[fila("a", "Escalera", 2), fila("b", "Multímetro")]} />);
    expect((screen.getByLabelText("Cantidad de Escalera") as HTMLInputElement).value).toBe("2");
    expect(screen.getByText("Multímetro")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Quitar Escalera" }));
    expect(screen.queryByLabelText("Cantidad de Escalera")).toBeNull();
    expect(screen.getByLabelText("Cantidad de Multímetro")).toBeInTheDocument();
  });

  it("«Kit personal» avisa al formulario cuando se marca", async () => {
    const onToggle = vi.fn();
    render(<Editor onToggle={onToggle} />);
    await userEvent.click(screen.getByLabelText("Kit personal"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

function requisito(
  parcial: Partial<RequisitoHerramienta> & { id: number; descripcion: string },
): RequisitoHerramienta {
  return {
    cantidad: 1,
    productId: null,
    producto: null,
    toolId: null,
    herramienta: null,
    check: null,
    ...parcial,
  };
}

function checklistDe(requisitos: RequisitoHerramienta[]): ChecklistHerramientas {
  const pendientes = requisitos.filter((r) => !r.check?.ok).map((r) => r.descripcion);
  return {
    activityId: 5,
    requisitos,
    total: requisitos.length,
    listos: requisitos.length - pendientes.length,
    pendientes,
    completo: pendientes.length === 0,
  };
}

const inicial = checklistDe([
  requisito({
    id: 1,
    descripcion: "Escalera",
    cantidad: 2,
    check: {
      ok: true,
      nota: null,
      fotoUrl: null,
      at: "2026-09-18T16:00:00.000Z",
      por: { id: 7, nombre: "Carolina Pérez Ruiz" },
    },
  }),
  requisito({ id: 2, descripcion: "Taladro con brocas" }),
]);

describe("HerramientasChecklist", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useUser.mockReturnValue({
      user: { token: "jwt", permissions: ["activities.view", "activities.manage"] },
      token: "jwt",
    });
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { ok: boolean; nota?: string };
        return new Response(
          JSON.stringify(
            checklistDe([
              inicial.requisitos[0],
              {
                ...inicial.requisitos[1],
                check: {
                  ok: body.ok,
                  nota: body.nota ?? null,
                  fotoUrl: null,
                  at: "2026-09-18T17:00:00.000Z",
                  por: { id: 7, nombre: "Carolina Pérez Ruiz" },
                },
              },
            ]),
          ),
          { status: 200 },
        );
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          requisitos: Array<{ id?: number; descripcion: string; cantidad: number }>;
        };
        return new Response(
          JSON.stringify(checklistDe(body.requisitos.map((r, i) => requisito({ ...r, id: r.id ?? 90 + i })))),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(inicial), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el avance, quién palomeó y el aviso de que no se puede iniciar", async () => {
    render(<HerramientasChecklist activityId={5} />);

    expect(await screen.findByText("1 de 2 listas")).toBeInTheDocument();
    expect(screen.getByText("No se puede iniciar aún.")).toBeInTheDocument();
    expect(screen.getByText("Escalera")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText(/Carolina Pérez ·/)).toBeInTheDocument();
    expect(screen.getByText("Sin revisar")).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls.find(([u]) => /\/activities\/5\/herramientas$/.test(String(u))) as [string, RequestInit];
    expect(url).toMatch(/\/activities\/5\/herramientas$/);
    expect(init.credentials).toBe("include");
  });

  it("«Lo traigo» palomea el renglón con ok en true", async () => {
    render(<HerramientasChecklist activityId={5} />);
    await screen.findByText("1 de 2 listas");
    const filas = screen.getAllByRole("listitem");
    await userEvent.click(within(filas[1]).getByRole("button", { name: "Lo traigo" }));

    await waitFor(() => expect(screen.getByText("2 de 2 listas")).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST") as [
      string,
      RequestInit,
    ];
    expect(post[0]).toMatch(/\/activities\/5\/herramientas\/2\/check$/);
    expect(JSON.parse(String(post[1].body))).toEqual({ ok: true });
  });

  it("«Falta / dañado» ofrece la nota y manda ok en false", async () => {
    render(<HerramientasChecklist activityId={5} />);
    await screen.findByText("1 de 2 listas");
    const filas = screen.getAllByRole("listitem");
    await userEvent.click(within(filas[1]).getByRole("button", { name: "Falta / dañado" }));

    await userEvent.type(screen.getByLabelText("Nota de Taladro con brocas"), "Sin batería");
    await userEvent.click(screen.getByRole("button", { name: "Marcar faltante" }));

    await waitFor(() => expect(screen.getByText("Falta")).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(post[1].body))).toEqual({ ok: false, nota: "Sin batería" });
    expect(screen.getByText("1 de 2 listas")).toBeInTheDocument();
  });

  it("quien gestiona puede definir la lista completa", async () => {
    render(<HerramientasChecklist activityId={5} />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar herramientas" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar Taladro con brocas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar herramientas" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Guardado: 1 herramienta."));
    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PUT") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(put[1].body))).toEqual({
      requisitos: [expect.objectContaining({ id: 1, descripcion: "Escalera", cantidad: 2 })],
      usePersonalKit: false,
    });
  });

  it("sin permiso de gestión no ofrece definir, pero sí palomear", async () => {
    useUser.mockReturnValue({ user: { token: "jwt", permissions: ["activities.view"] }, token: "jwt" });
    render(<HerramientasChecklist activityId={5} />);
    await screen.findByText("1 de 2 listas");
    expect(screen.queryByRole("button", { name: "Editar herramientas" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Lo traigo" })).toHaveLength(2);
  });
});
