import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuardiasPanel from "./GuardiasPanel";
import AvisoGuardia from "./AvisoGuardia";
import { esFinDeSemanaISO, finesDeSemana } from "@/lib/guardias-api";

afterEach(() => vi.unstubAllGlobals());

const JOAN = { id: 30, nombre: "Joan Sánchez", puesto: "Instalador", avatarUrl: null };
const ISRAEL = { id: 31, nombre: "Israel Ramos", puesto: "Instalador", avatarUrl: null };

function rango(extra: Record<string, unknown> = {}) {
  return {
    desde: "2026-10-01",
    hasta: "2026-10-11",
    hoy: "2026-10-01",
    puedeProgramar: true,
    personas: [JOAN, ISRAEL],
    items: [
      {
        id: 7,
        userId: 30,
        fecha: "2026-10-03",
        nota: "Cubre CCTV",
        persona: JOAN,
        creadoPor: { id: 20, nombre: "David" },
        createdAt: "2026-09-30T18:00:00.000Z",
        puedeQuitar: true,
      },
    ],
    ...extra,
  };
}

/** `fetch` falso: responde según método y ruta, y deja ver qué se pidió. */
function api(respuestas: { lista?: unknown; listaOk?: boolean } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    let cuerpo: unknown = respuestas.lista ?? rango();
    let ok = respuestas.listaOk ?? true;
    if (metodo === "POST") {
      cuerpo = { id: 8 };
      ok = true;
    }
    if (metodo === "DELETE") {
      cuerpo = { removed: true, id: 7 };
      ok = true;
    }
    if (String(url).includes("guardias/cobertura")) {
      cuerpo = respuestas.lista;
      ok = true;
    }
    return { ok, status: ok ? 200 : 500, text: async () => JSON.stringify(cuerpo) } as unknown as Response;
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const llamadas = (f: ReturnType<typeof api>, metodo: string) =>
  f.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET") === metodo);

describe("GuardiasPanel", () => {
  it("muestra los próximos fines de semana con quién tiene guardia", async () => {
    api();
    render(<GuardiasPanel token="tok" />);

    const sabado = await screen.findByLabelText(/Fin de semana del sáb 3 oct/);
    expect(within(sabado).getByText("Joan Sánchez")).toBeTruthy();
    expect(within(sabado).getByText("Cubre CCTV")).toBeTruthy();
    // Domingo vacío y el siguiente fin también.
    expect(within(sabado).getByText("Nadie de guardia")).toBeTruthy();
    expect(screen.getByLabelText(/Fin de semana del sáb 10 oct/)).toBeTruthy();
  });

  it("quien tiene gente a su cargo programa: persona, sábado o domingo y nota", async () => {
    const f = api();
    render(<GuardiasPanel token="tok" />);
    const form = await screen.findByRole("region", { name: "Programar guardia" });

    const boton = within(form).getByRole("button", { name: "Programar guardia" });
    expect((boton as HTMLButtonElement).disabled).toBe(true);

    const [persona, dia] = within(form).getAllByRole("combobox");
    // Solo se ofrecen sábados y domingos.
    const opciones = within(dia).getAllByRole("option").map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(opciones).toEqual(["2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11"]);

    fireEvent.change(persona, { target: { value: "31" } });
    fireEvent.change(dia, { target: { value: "2026-10-04" } });
    fireEvent.change(within(form).getByPlaceholderText("Cubre emergencias de CCTV"), { target: { value: " Obra Cholula " } });
    fireEvent.click(boton);

    await waitFor(() => expect(llamadas(f, "POST")).toHaveLength(1));
    const [url, init] = llamadas(f, "POST")[0];
    expect(String(url)).toMatch(/guardias$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ userId: 31, fecha: "2026-10-04", nota: "Obra Cholula" });
    // Vuelve a leer el calendario.
    await waitFor(() => expect(llamadas(f, "GET").length).toBeGreaterThanOrEqual(2));
  });

  it("quitar pide confirmación y luego borra", async () => {
    const f = api();
    render(<GuardiasPanel token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: /Quitar guardia de Joan Sánchez/ }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.textContent).toMatch(/ya no podrá checar el sáb 3 oct/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(llamadas(f, "DELETE")).toHaveLength(1));
    expect(String(llamadas(f, "DELETE")[0][0])).toMatch(/guardias\/7$/);
  });

  it("quien no tiene gente a su cargo solo ve las suyas; sin guardias, lo dice", async () => {
    api({ lista: rango({ puedeProgramar: false, personas: [], items: [] }) });
    render(<GuardiasPanel token="tok" />);
    expect(await screen.findByText("No tienes guardias programadas")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Programar guardia" })).toBeNull();
  });

  it("si no carga, lo dice y deja reintentar", async () => {
    api({ lista: { message: "Base caída" }, listaOk: false });
    render(<GuardiasPanel token="tok" />);
    expect(await screen.findByText("Base caída")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("AvisoGuardia (formulario de asignar actividad)", () => {
  it("en fin de semana avisa de quien no tiene guardia, sin bloquear", async () => {
    api({ lista: { fecha: "2026-10-03", finDeSemana: true, conGuardia: [30] } });
    render(
      <AvisoGuardia
        token="tok"
        fecha="2026-10-03"
        personas={[
          { id: 30, nombre: "Joan" },
          { id: 31, nombre: "Israel" },
        ]}
      />,
    );
    const aviso = await screen.findByText(/Israel no tiene guardia/);
    expect(aviso.textContent).not.toMatch(/Joan/);
  });

  it("entre semana no consulta ni avisa", async () => {
    const f = api();
    const { container } = render(<AvisoGuardia token="tok" fecha="2026-10-05" personas={[{ id: 31, nombre: "Israel" }]} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(f).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});

describe("fechas de guardia", () => {
  it("agrupa sábados y domingos por fin de semana", () => {
    expect(esFinDeSemanaISO("2026-10-03")).toBe(true);
    expect(esFinDeSemanaISO("2026-10-02")).toBe(false);
    expect(finesDeSemana("2026-10-04", "2026-10-10")).toEqual([
      { sabado: null, domingo: "2026-10-04" },
      { sabado: "2026-10-10", domingo: null },
    ]);
  });
});
