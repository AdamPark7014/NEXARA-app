import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/UserContext", () => ({ useUser: () => ({ user: { id: 1, nombre: "Ana Ruiz" }, token: "jwt" }) }));
vi.mock("../../proyectos/_componentes/personas", async (original) => ({
  ...(await original<typeof import("../../proyectos/_componentes/personas")>()),
  usePersonasAsignables: () => ({
    personas: [
      { id: 1, nombre: "Ana Ruiz" },
      { id: 20, nombre: "Luis Herrera" },
    ],
    cargando: false,
    aviso: null,
  }),
}));

const ganarCotizacion = vi.fn();
const rechazarCotizacion = vi.fn();
const obtenerCotizacion = vi.fn();
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  ganarCotizacion: (...a: unknown[]) => ganarCotizacion(...a),
  rechazarCotizacion: (...a: unknown[]) => rechazarCotizacion(...a),
  obtenerCotizacion: (...a: unknown[]) => obtenerCotizacion(...a),
}));

import ComoTermino from "./ComoTermino";
import type { CotizacionDetalle } from "@/lib/cotizaciones-api";

const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

const ENVIADA = {
  id: 7,
  folio: "NEX-MG76022606-0042",
  estado: "ENVIADA",
  projectName: "Videovigilancia Plaza Norte",
  total: 312480,
  currency: "MXN",
  sentAt: hace(6),
  enviadaPor: "WHATSAPP",
  elaboro: { id: 1, nombre: "Ana Ruiz" },
  items: [{ name: "Cámara domo 4 MP" }, { name: "Grabador" }, { name: "  " }],
} as unknown as CotizacionDetalle;

function pintar(detalle: CotizacionDetalle = ENVIADA) {
  const props = { onDetalle: vi.fn(), onError: vi.fn(), onAviso: vi.fn() };
  render(<ComoTermino detalle={detalle} {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  obtenerCotizacion.mockResolvedValue(ENVIADA);
});

describe("¿Cómo terminó?", () => {
  it("pregunta con lo que ya sabe de cómo salió", () => {
    pintar();
    expect(screen.getByText("¿Cómo terminó?")).toBeInTheDocument();
    expect(screen.getByText(/Salió por WhatsApp hace 6 días\./)).toBeInTheDocument();
    for (const nombre of ["La ganamos", "La perdimos", "Sigue en pláticas"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
  });

  it("un borrador todavía no terminó en nada", () => {
    const { container } = render(
      <ComoTermino detalle={{ ...ENVIADA, estado: "BORRADOR" }} onDetalle={vi.fn()} onError={vi.fn()} onAviso={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("sigue en pláticas: deja de preguntar, y se puede volver", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "Sigue en pláticas" }));
    expect(screen.queryByRole("button", { name: "La ganamos" })).not.toBeInTheDocument();
    expect(screen.getByText(/Te volvemos a preguntar el/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ya respondió" }));
    expect(screen.getByRole("button", { name: "La ganamos" })).toBeInTheDocument();
  });

  it("recuerda que siguen en pláticas al volver a entrar, hasta que se cumplen los días", () => {
    window.localStorage.setItem("cotizacion-platicas-7", String(Date.now() + 60_000));
    pintar();
    expect(screen.getByText("Sigue en pláticas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "La ganamos" })).not.toBeInTheDocument();
  });

  it("los días de pláticas ya pasados vuelven a preguntar", () => {
    window.localStorage.setItem("cotizacion-platicas-7", String(Date.now() - 60_000));
    pintar();
    expect(screen.getByRole("button", { name: "La ganamos" })).toBeInTheDocument();
  });
});

describe("La ganamos", () => {
  it("propone por dónde salió, dice lo que hará y abre el proyecto creado", async () => {
    ganarCotizacion.mockResolvedValue({ cotizacionId: 7, proyecto: { id: 99, title: "X" }, errorProyecto: null });
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "La ganamos" }));

    expect(screen.getByRole("radio", { name: "Por WhatsApp" })).toBeChecked();
    expect(screen.getByText("Crea el proyecto con las 2 partidas como su alcance.")).toBeInTheDocument();
    expect(screen.getByText("La pone en Por facturar, en la Mesa contable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "En persona" }));
    fireEvent.change(screen.getByLabelText("¿Quién lo lleva?"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("¿Cuándo empieza?"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear proyecto" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/erp/proyectos/99"));
    expect(ganarCotizacion).toHaveBeenCalledWith("jwt", 7, { via: "EN_PERSONA", responsableId: 20, startDate: "2026-11-10" });
  });

  it("sin saber cómo aceptó, no deja seguir hasta que se diga", () => {
    pintar({ ...ENVIADA, enviadaPor: "OTRO" });
    fireEvent.click(screen.getByRole("button", { name: "La ganamos" }));
    expect(screen.getByRole("button", { name: "Confirmar y crear proyecto" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Por correo" }));
    expect(screen.getByRole("button", { name: "Confirmar y crear proyecto" })).toBeEnabled();
  });

  it("si pide autorización por monto, lo dice ahí mismo y no se va", async () => {
    ganarCotizacion.mockRejectedValue(new Error("Esta cotización requiere autorización de dirección"));
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "La ganamos" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear proyecto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("requiere autorización");
    expect(push).not.toHaveBeenCalled();
  });

  it("si la ganó pero el proyecto falló, avisa y recarga", async () => {
    ganarCotizacion.mockResolvedValue({ cotizacionId: 7, proyecto: null, errorProyecto: "Cliente no encontrado" });
    const { onError, onDetalle } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "La ganamos" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear proyecto" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("Cliente no encontrado")));
    await waitFor(() => expect(onDetalle).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ganada sin proyecto", () => {
  const GANADA = { ...ENVIADA, estado: "APROBADA", signedAt: hace(1), hilo: { proyecto: null } } as unknown as CotizacionDetalle;

  it("pide crearlo, sin volver a preguntar lo que ya se sabe", () => {
    pintar(GANADA);
    expect(screen.getByText("Siguiente paso: crear el proyecto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText("La pone en Por facturar, en la Mesa contable.")).not.toBeInTheDocument();
  });

  it("con proyecto ya no hay nada que preguntar", () => {
    const { container } = render(
      <ComoTermino
        detalle={{ ...GANADA, hilo: { proyecto: { id: 1, title: "X", status: "PLANNED" } } } as unknown as CotizacionDetalle}
        onDetalle={vi.fn()}
        onError={vi.fn()}
        onAviso={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("La perdimos", () => {
  it("exige el motivo y guarda la nota con él", async () => {
    const perdida = { ...ENVIADA, estado: "RECHAZADA" };
    rechazarCotizacion.mockResolvedValue(perdida);
    const { onDetalle, onAviso } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "La perdimos" }));

    const confirmar = screen.getByRole("button", { name: "Marcar como perdida" });
    expect(confirmar).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Por precio" }));
    fireEvent.change(screen.getByLabelText("Algo más, si quieres"), { target: { value: "Otro ofreció 12 % menos" } });
    fireEvent.click(confirmar);

    await waitFor(() => expect(onDetalle).toHaveBeenCalledWith(perdida));
    expect(rechazarCotizacion).toHaveBeenCalledWith("jwt", 7, "Por precio. Otro ofreció 12 % menos");
    expect(onAviso).toHaveBeenCalledWith("Quedó como perdida, con su motivo.");
  });
});
