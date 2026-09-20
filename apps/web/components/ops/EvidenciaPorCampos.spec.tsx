import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EvidenciaCamposEditor from "./EvidenciaCamposEditor";
import EvidenciaPorCampos from "./EvidenciaPorCampos";
import type { CampoBorrador, CampoEvidencia } from "@/lib/evidencia-campos";

const useUser = vi.hoisted(() => vi.fn());
vi.mock("@/components/UserContext", () => ({ useUser }));

const triggerBlobDownload = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/file-download", () => ({ triggerBlobDownload }));

// Las fotos protegidas y el visor viven en EquipoEvidencias (descargan con la sesión):
// aquí basta con saber qué se pidió mostrar.
vi.mock("@/components/ops/EquipoEvidencias", () => ({
  FotoProtegida: ({ alt }: { alt: string }) => <img alt={alt} />,
  Visor: ({ fotos, index }: { fotos: Array<{ titulo: string }>; index: number }) => (
    <div role="dialog" aria-label={fotos[index]?.titulo} />
  ),
}));

function Editor({ inicial = [] as CampoBorrador[] }) {
  const [filas, setFilas] = useState<CampoBorrador[]>(inicial);
  return <EvidenciaCamposEditor value={filas} onChange={setFilas} />;
}

describe("EvidenciaCamposEditor", () => {
  it("los atajos agregan filas con nombre libre y los momentos se alternan", async () => {
    render(<Editor />);
    await userEvent.click(screen.getByRole("button", { name: "Cámara" }));
    await userEvent.click(screen.getByRole("button", { name: "Cámara" }));
    await userEvent.click(screen.getByRole("button", { name: "Canalización" }));

    const nombres = screen.getAllByLabelText(/Qué fotografiar/).map((el) => (el as HTMLInputElement).value);
    expect(nombres).toEqual(["Cámara 1", "Cámara 2", "Canalización"]);

    const momentos = screen.getByRole("group", { name: /Momentos en que se pide foto de Cámara 1/ });
    const enProgreso = within(momentos).getByRole("button", { name: "En progreso" });
    expect(enProgreso).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(enProgreso);
    expect(enProgreso).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Quitar Cámara 2" }));
    expect(screen.getAllByLabelText(/Qué fotografiar/)).toHaveLength(2);
  });

  it("avisa en la fila cuando se quitan todos los momentos", async () => {
    render(<Editor />);
    await userEvent.click(screen.getByRole("button", { name: "NVR" }));
    await userEvent.click(screen.getByRole("button", { name: "Después" }));
    expect(screen.getByText(/Elige al menos un momento/)).toBeInTheDocument();
  });
});

const campos: CampoEvidencia[] = [
  {
    id: 1,
    nombre: "Cámara 1",
    momentos: ["ANTES", "DESPUES"],
    notas: "Que se vea la etiqueta",
    orden: 0,
    fotos: {
      ANTES: {
        id: 10,
        momento: "ANTES",
        photoUrl: "/activities/a.jpg",
        latitude: 19.04,
        longitude: -98.2,
        capturedAt: "2026-09-17T16:00:00.000Z",
        por: { id: 7, nombre: "Carolina Pérez Ruiz" },
      },
      EN_PROGRESO: null,
      DESPUES: null,
    },
    pendientes: ["DESPUES"],
    completo: false,
  },
  {
    id: 2,
    nombre: "Rack",
    momentos: ["DESPUES"],
    notas: null,
    orden: 1,
    fotos: { ANTES: null, EN_PROGRESO: null, DESPUES: null },
    pendientes: ["DESPUES"],
    completo: false,
  },
];

describe("EvidenciaPorCampos", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useUser.mockReturnValue({
      user: { token: "jwt", permissions: ["activities.manage", "evidences.view"] },
      token: "jwt",
    });
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/evidencia.zip")) {
        return new Response(new Blob(["PK"]), {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              "attachment; filename=\"AN-0005 C_maras.zip\"; filename*=UTF-8''AN-0005%20C%C3%A1maras.zip",
          },
        });
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { campos: Array<{ id?: number }> };
        return new Response(JSON.stringify(campos.filter((c) => body.campos.some((b) => b.id === c.id))), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(campos), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra cada campo por momento, el avance y quién tomó la foto", async () => {
    render(<EvidenciaPorCampos activityId={5} anNumber="AN-0005" titulo="Cámaras" />);

    expect(await screen.findByText("1 de 3 fotos")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cámara 1" })).toBeInTheDocument();
    expect(screen.getByText("Que se vea la etiqueta")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente")).toHaveLength(2);
    expect(screen.getByText(/Carolina Pérez ·/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver en grande: Cámara 1, antes" }));
    expect(screen.getByRole("dialog", { name: /Cámara 1 · Antes/ })).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/activities\/5\/evidencia-campos$/);
    expect(init.credentials).toBe("include");
  });

  it("quitar un campo con fotos pide confirmación y manda la lista completa", async () => {
    render(<EvidenciaPorCampos activityId={5} />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar Cámara 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Quitar y guardar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Vas a quitar «Cámara 1». Se borran 1 foto");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.any(String),
      })
    );
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("sin permiso de gestión no ofrece editar", async () => {
    useUser.mockReturnValue({ user: { token: "jwt", permissions: ["evidences.view"] }, token: "jwt" });
    render(<EvidenciaPorCampos activityId={5} anNumber="AN-0005" titulo="Cámaras" />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar Cámara 1" }));
    expect(screen.queryByRole("button", { name: "Quitar Cámara 1" })).not.toBeInTheDocument();
  });

  it("descarga el ZIP con la sesión y el nombre que manda la API", async () => {
    render(<EvidenciaPorCampos activityId={5} anNumber="AN-0005" titulo="Cámaras" />);
    await userEvent.click(await screen.findByRole("button", { name: "Descargar evidencia (carpeta .zip)" }));

    await waitFor(() => expect(triggerBlobDownload).toHaveBeenCalled());
    const zip = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/evidencia.zip")) as [string, RequestInit];
    expect(zip[0]).toMatch(/\/api\/activity-evidence\/5\/evidencia\.zip$/);
    expect(zip[1].credentials).toBe("include");
    expect((zip[1].headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    const downloadArgs = triggerBlobDownload.mock.calls[0];
    expect(downloadArgs.length).toBe(3);
    expect(downloadArgs[0]).toEqual(expect.objectContaining({ type: "application/zip", size: expect.any(Number) }));
    expect(downloadArgs[1]).toBe("AN-0005 Cámaras.zip");
    expect(downloadArgs[2]).toEqual({
      mimeType: "application/zip",
    });
  });
});