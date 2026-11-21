import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DialogoDevolucion, DialogoEntrega, VisorEvidencia, faltaEvidencia } from "./EvidenciaPrestamo";
import { codigoVigente, primerDiaDePlazo } from "./MisPrestamos";
import { normalizeToolRequestRow } from "@/lib/tool-requests-api";

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Iván", token: "jwt", permissions: ["tools.manage"] } }),
}));

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function foto(nombre = "foto.jpg") {
  return new File(["x"], nombre, { type: "image/jpeg" });
}

beforeEach(() => {
  // jsdom no trae vistas previas de archivos.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:foto"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const PRESTAMO = { id: 7, toolName: "Multímetro", detalle: "Fluke 117 · Serie 123", persona: "Antonio" };

describe("entregar con evidencia", () => {
  it("sin foto de cómo sale no entrega", async () => {
    const fetchMock = stubFetch();
    render(<DialogoEntrega token="jwt" prestamo={{ ...PRESTAMO, pickupCode: "A3F7KD" }} onCerrar={vi.fn()} onListo={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Entregar" }));
    expect(await screen.findByText("Toma al menos una foto de cómo sale la herramienta.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con foto entrega con el código que ya se conoce y avisa a quién", async () => {
    const fetchMock = stubFetch();
    const onListo = vi.fn();
    const { container } = render(
      <DialogoEntrega token="jwt" prestamo={{ ...PRESTAMO, pickupCode: "A3F7KD", recogidaPorId: 3 }} onCerrar={vi.fn()} onListo={onListo} />,
    );
    await userEvent.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, foto());
    await userEvent.click(screen.getByRole("button", { name: "Entregar" }));
    await waitFor(() => expect(onListo).toHaveBeenCalledWith("Multímetro entregada a Antonio"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("tool-requests/7/deliver");
    const form = init.body as FormData;
    expect(form.get("pickupCode")).toBe("A3F7KD");
    expect(form.getAll("fotos")).toHaveLength(1);
  });

  it("cuando toca teclear el código, sin código no entrega", async () => {
    const fetchMock = stubFetch();
    const { container } = render(
      <DialogoEntrega token="jwt" prestamo={{ ...PRESTAMO, pideCodigo: true }} onCerrar={vi.fn()} onListo={vi.fn()} />,
    );
    await userEvent.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, foto());
    await userEvent.click(screen.getByRole("button", { name: "Entregar" }));
    expect(await screen.findByText(/Escribe el código de recolección/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("recibir con evidencia", () => {
  it("enseña cómo salió para compararla", () => {
    render(
      <DialogoDevolucion
        token="jwt"
        prestamo={{ ...PRESTAMO, fotosEntrega: ["/uploads/tools/antes-1"] }}
        onCerrar={vi.fn()}
        onListo={vi.fn()}
      />,
    );
    expect(screen.getByRole("img", { name: "Antes, foto 1" })).toHaveAttribute("src", "/uploads/tools/antes-1");
  });

  it("dañada sin explicación no se recibe", async () => {
    const fetchMock = stubFetch();
    const { container } = render(<DialogoDevolucion token="jwt" prestamo={PRESTAMO} onCerrar={vi.fn()} onListo={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: /Dañada/ }));
    await userEvent.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, foto());
    await userEvent.click(screen.getByRole("button", { name: "Recibir y reportar" }));
    expect(await screen.findByText("Describe qué le pasó a la herramienta.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("en buen estado pide foto de cómo vuelve", async () => {
    const fetchMock = stubFetch();
    render(<DialogoDevolucion token="jwt" prestamo={PRESTAMO} onCerrar={vi.fn()} onListo={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Recibir" }));
    expect(await screen.findByText("Toma al menos una foto de cómo vuelve la herramienta.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("extraviada no pide foto, sí explicación, y avisa que se dio de baja", async () => {
    const fetchMock = stubFetch();
    const onListo = vi.fn();
    render(<DialogoDevolucion token="jwt" prestamo={PRESTAMO} onCerrar={vi.fn()} onListo={onListo} />);
    await userEvent.click(screen.getByRole("radio", { name: /Extraviada/ }));
    expect(screen.queryByText("Cómo vuelve")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /Qué le pasó/ }), "Se quedó en la obra");
    await userEvent.click(screen.getByRole("button", { name: "Recibir y reportar" }));
    await waitFor(() => expect(onListo).toHaveBeenCalledWith("Multímetro registrada como extraviada y dada de baja"));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("condicion")).toBe("EXTRAVIADA");
    expect(form.get("damageDescription")).toBe("Se quedó en la obra");
  });
});

describe("antes y después", () => {
  it("pone las fotos de cada lado con quién entregó, quién recibió y cómo volvió", () => {
    const prestamo = normalizeToolRequestRow({
      id: 5,
      toolName: "Multímetro",
      model: "Fluke 117",
      serialNumber: "123",
      status: "DAMAGED",
      deliveryDate: "2026-11-20T15:00:00Z",
      returnDate: "2026-11-21T15:00:00Z",
      deliveryPhotos: [{ url: "/uploads/tools/a" }],
      returnPhotos: [{ url: "/uploads/tools/b" }],
      returnCondition: "DANADA",
      damageDescription: "Pantalla rota",
      deliveredBy: { nombre: "Iván" },
      receivedBy: { nombre: "Christian" },
    });
    render(<VisorEvidencia prestamo={prestamo} onCerrar={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Antes, foto 1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Después, foto 1" })).toBeInTheDocument();
    expect(screen.getByText("La entregó Iván")).toBeInTheDocument();
    expect(screen.getByText("La recibió Christian")).toBeInTheDocument();
    expect(screen.getByText("Dañada")).toBeInTheDocument();
    expect(screen.getByText("Pantalla rota")).toBeInTheDocument();
  });

  it("marca lo que salió o volvió sin foto, y no reclama foto a la extraviada", () => {
    const base = { deliveryPhotos: [] as string[], returnPhotos: [] as string[], returnCondition: null };
    expect(faltaEvidencia({ ...base, status: "APPROVED" as const })).toMatchObject({ entrega: false, devolucion: false, hay: false });
    expect(faltaEvidencia({ ...base, status: "IN_USE" as const })).toMatchObject({ entrega: true, devolucion: false });
    expect(faltaEvidencia({ ...base, status: "RETURNED" as const, deliveryPhotos: ["/a"] })).toMatchObject({
      entrega: false,
      devolucion: true,
      hay: true,
    });
    expect(faltaEvidencia({ ...base, status: "DAMAGED" as const, returnCondition: "EXTRAVIADA" as const }).devolucion).toBe(false);
  });
});

describe("mis préstamos", () => {
  it("el código solo se enseña mientras sirve", () => {
    const ahora = new Date("2026-11-21T18:00:00Z").getTime();
    expect(codigoVigente({ status: "APPROVED", pickupCode: "A3F7KD", pickupExpiresAt: "2026-11-22T00:00:00Z" }, ahora)).toEqual({
      visible: true,
      caducado: false,
    });
    expect(codigoVigente({ status: "APPROVED", pickupCode: "A3F7KD", pickupExpiresAt: "2026-11-21T10:00:00Z" }, ahora)).toEqual({
      visible: false,
      caducado: true,
    });
    expect(codigoVigente({ status: "IN_USE", pickupCode: "A3F7KD", pickupExpiresAt: null }, ahora).visible).toBe(false);
  });

  it("más plazo se pide desde el día siguiente a la devolución pactada, o a hoy si ya venció", () => {
    const ahora = new Date(2026, 10, 21, 12, 0, 0);
    expect(primerDiaDePlazo(new Date(2026, 10, 25, 18, 0, 0).toISOString(), ahora)).toBe("2026-11-26");
    expect(primerDiaDePlazo(new Date(2026, 10, 10, 18, 0, 0).toISOString(), ahora)).toBe("2026-11-22");
    expect(primerDiaDePlazo(null, ahora)).toBe("2026-11-22");
  });
});
