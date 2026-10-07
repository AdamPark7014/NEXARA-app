import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArchivosDeActividad from "./ArchivosDeActividad";
import type { AdjuntoActividad } from "@/lib/actividad-adjuntos-api";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok", user: null }) }));

afterEach(() => vi.unstubAllGlobals());

const adjunto = (extra: Partial<AdjuntoActividad>): AdjuntoActividad => ({
  id: 1,
  activityId: 7,
  nombre: "Propuesta Toks.xlsx",
  url: "/uploads/actividades-adjuntos/x.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 2.3 * 1024 * 1024,
  tipo: "excel",
  vistaPrevia: true,
  createdAt: new Date().toISOString(),
  subidoPor: { id: 4, nombre: "Luis Joel" },
  puedeQuitar: false,
  ...extra,
});

type Ruta = { metodo: string; patron: RegExp; responde: () => Response };

function api(rutas: Ruta[]) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? "GET").toUpperCase();
    const r = rutas.find((x) => x.metodo === metodo && x.patron.test(url));
    return r ? r.responde() : new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const json = (v: unknown, status = 200) => () =>
  new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

describe("ArchivosDeActividad", () => {
  it("sin archivos: lo dice y ofrece adjuntar", async () => {
    api([{ metodo: "GET", patron: /\/adjuntos$/, responde: json([]) }]);
    render(<ArchivosDeActividad activityId={7} />);
    expect(await screen.findByText("Aún no hay archivos")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Adjuntar archivo/ })).toBeTruthy();
    expect(screen.getByText("Excel, Word, PDF o imágenes de la propuesta, minutas y lo que mande el cliente")).toBeTruthy();
  });

  it("el Excel se abre embebido: vista previa en un iframe sin scripts", async () => {
    api([
      { metodo: "GET", patron: /\/adjuntos$/, responde: json([adjunto({})]) },
      {
        metodo: "GET",
        patron: /\/adjuntos\/1\/vista-previa$/,
        responde: () => new Response("<table><tr><td>Partida</td></tr></table>", { status: 200, headers: { "Content-Type": "text/html" } }),
      },
    ]);
    render(<ArchivosDeActividad activityId={7} />);
    expect(await screen.findByText(/2\.3 MB · Luis Joel · hoy \d{2}:\d{2}/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Abrir Propuesta Toks.xlsx" }));
    const visor = await screen.findByRole("dialog");
    const marco = await within(visor).findByTitle("Vista previa de Propuesta Toks.xlsx");
    expect(marco.getAttribute("sandbox")).toBe("");
    expect(marco.getAttribute("srcdoc")).toContain("<td>Partida</td>");
    expect(within(visor).getByRole("button", { name: /Descargar/ })).toBeTruthy();
    // No es de quien mira: no hay «Quitar».
    expect(within(visor).queryByRole("button", { name: /Quitar/ })).toBeNull();
  });

  it("un tipo sin vista previa avisa y ofrece descargar, sin pedir nada al API", async () => {
    const f = api([
      { metodo: "GET", patron: /\/adjuntos$/, responde: json([adjunto({ nombre: "Pitch.pptx", tipo: "otro", vistaPrevia: false })]) },
    ]);
    render(<ArchivosDeActividad activityId={7} />);
    await userEvent.click(await screen.findByRole("button", { name: "Abrir Pitch.pptx" }));
    const visor = await screen.findByRole("dialog");
    expect(within(visor).getByText("Este tipo de archivo no se puede ver aquí")).toBeTruthy();
    expect(within(visor).getAllByRole("button", { name: /Descargar/ }).length).toBeGreaterThan(0);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("más de 25 MB se avisa antes de subir y no se manda", async () => {
    const f = api([{ metodo: "GET", patron: /\/adjuntos$/, responde: json([]) }]);
    const { container } = render(<ArchivosDeActividad activityId={7} />);
    await screen.findByText("Aún no hay archivos");
    const grande = new File(["x"], "Levantamiento.pdf", { type: "application/pdf" });
    Object.defineProperty(grande, "size", { value: 30 * 1024 * 1024 });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [grande] } });
    expect(await screen.findByText("«Levantamiento.pdf» pesa 30 MB: el límite es 25 MB por archivo.")).toBeTruthy();
    expect(f.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("sube varios a la vez y los pone arriba de la lista", async () => {
    const f = api([
      { metodo: "GET", patron: /\/adjuntos$/, responde: json([adjunto({ id: 1, nombre: "Viejo.xlsx" })]) },
      {
        metodo: "POST",
        patron: /\/adjuntos$/,
        responde: json([
          adjunto({ id: 2, nombre: "Minuta.docx", tipo: "word" }),
          adjunto({ id: 3, nombre: "Foto.jpg", tipo: "imagen", vistaPrevia: false }),
        ]),
      },
    ]);
    const { container } = render(<ArchivosDeActividad activityId={7} />);
    await screen.findByText("Viejo.xlsx");
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["a"], "Minuta.docx"), new File(["b"], "Foto.jpg")] },
    });
    await screen.findByText("Minuta.docx");
    const nombres = screen.getAllByRole("button", { name: /^Abrir / }).map((b) => b.getAttribute("aria-label"));
    expect(nombres).toEqual(["Abrir Minuta.docx", "Abrir Foto.jpg", "Abrir Viejo.xlsx"]);
    const post = f.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    expect(((post[1] as RequestInit).body as FormData).getAll("files")).toHaveLength(2);
  });

  it("el error del API al subir se enseña tal cual", async () => {
    api([
      { metodo: "GET", patron: /\/adjuntos$/, responde: json([]) },
      {
        metodo: "POST",
        patron: /\/adjuntos$/,
        responde: json({ message: "Solo el equipo de la actividad o quien la gestiona puede adjuntar archivos" }, 403),
      },
    ]);
    const { container } = render(<ArchivosDeActividad activityId={7} />);
    await screen.findByText("Aún no hay archivos");
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["a"], "a.pdf")] } });
    expect(
      await screen.findByText("Solo el equipo de la actividad o quien la gestiona puede adjuntar archivos"),
    ).toBeTruthy();
  });

  it("quitar pide confirmación y lo saca de la lista", async () => {
    const f = api([
      { metodo: "GET", patron: /\/adjuntos$/, responde: json([adjunto({ id: 5, nombre: "Cotización vieja.pdf", tipo: "pdf", puedeQuitar: true })]) },
      { metodo: "DELETE", patron: /\/adjuntos\/5$/, responde: json({ ok: true }) },
    ]);
    render(<ArchivosDeActividad activityId={7} />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar Cotización vieja.pdf" }));
    const confirmacion = await screen.findByRole("alertdialog");
    expect(f.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);
    await userEvent.click(within(confirmacion).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(screen.queryByText("Cotización vieja.pdf")).toBeNull());
    expect(screen.getByText("Aún no hay archivos")).toBeTruthy();
  });
});
