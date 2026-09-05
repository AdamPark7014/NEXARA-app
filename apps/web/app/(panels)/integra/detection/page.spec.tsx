import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegraDetectionTuningPage from "./page";

/**
 * La pantalla habla con un endpoint que el servidor puede no tener publicado.
 * Estas pruebas fijan el comportamiento que hace que eso sea aceptable: con un
 * 404 de ruta ni se rompe ni finge, y con el endpoint publicado manda
 * exactamente el cuerpo del contrato.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

const CAMARA = {
  id: "cam-171",
  name: "Recepción",
  region: "Oficinas",
  sourceIp: "10.0.0.171",
};

const PERFIL = {
  cameraId: "cam-171",
  cameraName: "Recepción",
  deviceIp: "10.0.0.171",
  channel: 1,
  enabled: true,
  stored: {
    sensitivity: 35,
    alarmConfidence: "high",
    detectionTarget: "human",
    regions: [
      [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
    ],
    eventTypes: null,
    timeThresholdSec: null,
    minTargetPct: null,
    schedule: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] },
  },
  effective: {
    sensitivity: 35,
    alarmConfidence: "high",
    detectionTarget: "human",
    regions: [
      [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
    ],
    timeThresholdSec: 0,
    eventTypes: ["fielddetection", "linedetection"],
  },
  lastAppliedAt: null,
  lastAppliedNote: null,
  capabilities: null,
  limits: {
    sensitivityMin: 0,
    sensitivityMax: 100,
    sensitivityDefault: 50,
    maxRegions: 4,
    alarmConfidences: ["low", "mediumLow", "mediumHigh", "high"],
    detectionTargets: ["human", "vehicle", "human,vehicle"],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** El servidor de siempre, menos el endpoint de sintonización. */
function servidorSinSintonizacion(status = 404) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/detection")) {
      // Lo que contesta Nest cuando no hay manejador para la ruta.
      return json(
        { message: "Cannot GET /api/integra/cameras/cam-171/detection", statusCode: status },
        status,
      );
    }
    if (url.includes("/stream")) return json({ hls: null, note: null });
    if (url.includes("push/events")) return json({ items: [], total: 0, hasMore: false });
    if (url.includes("integra/cameras")) return json({ items: [CAMARA] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Sintonización de detección · el servidor todavía no la expone", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lo dice con esas palabras en vez de romperse", async () => {
    servidorSinSintonizacion();
    render(<IntegraDetectionTuningPage />);

    expect(
      await screen.findByText(/El endpoint de sintonización todavía no existe/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no.*es la configuración del equipo/i)).toBeInTheDocument();
  });

  it("no ofrece guardar algo que no se puede guardar", async () => {
    servidorSinSintonizacion();
    render(<IntegraDetectionTuningPage />);

    const guardar = await screen.findByRole("button", { name: /Guardar/i });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAttribute(
      "title",
      expect.stringContaining("no publica todavía este endpoint"),
    );
  });

  it("los mandos quedan inertes: no se editan valores que nadie va a recibir", async () => {
    servidorSinSintonizacion();
    render(<IntegraDetectionTuningPage />);

    expect(await screen.findByLabelText("Sensibilidad de detección")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Añadir región/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Aplicar al equipo/i })).toBeDisabled();
  });

  it("un 501 se lee igual que un 404 de ruta: aún no está publicado", async () => {
    servidorSinSintonizacion(501);
    render(<IntegraDetectionTuningPage />);
    expect(
      await screen.findByText(/El endpoint de sintonización todavía no existe/i),
    ).toBeInTheDocument();
  });

  it("un 404 del propio endpoint no se disfraza de «no disponible»", async () => {
    // El servicio contesta 404 cuando la cámara no está en el espejo. Es un
    // problema real y se enseña como tal, con su mensaje y su reintento.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/detection")) {
        return json({ message: "Cámara cam-171 no está en el espejo" }, 404);
      }
      if (url.includes("/stream")) return json({ hls: null });
      if (url.includes("push/events")) return json({ items: [], hasMore: false });
      if (url.includes("integra/cameras")) return json({ items: [CAMARA] });
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegraDetectionTuningPage />);

    expect(await screen.findByText(/no está en el espejo/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/El endpoint de sintonización todavía no existe/i),
    ).not.toBeInTheDocument();
  });

  it("un fallo de verdad del servidor tampoco se disfraza", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/detection")) return json({ message: "boom en el espejo" }, 500);
      if (url.includes("/stream")) return json({ hls: null });
      if (url.includes("push/events")) return json({ items: [], hasMore: false });
      if (url.includes("integra/cameras")) return json({ items: [CAMARA] });
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegraDetectionTuningPage />);

    expect(await screen.findByText(/boom en el espejo/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/El endpoint de sintonización todavía no existe/i),
    ).not.toBeInTheDocument();
  });
});

describe("Sintonización de detección · con el endpoint publicado", () => {
  function servidorCompleto(over: Record<string, unknown> = {}) {
    const perfil = { ...PERFIL, ...over };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/detection/apply")) {
        return json({ cameraId: "cam-171", applied: true, note: "FieldDetection escrito" });
      }
      if (url.includes("/detection")) {
        if (init?.method === "PATCH") {
          const enviado = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json({
            ...perfil,
            stored: { ...PERFIL.stored, schedule: enviado.schedule },
            effective: {
              ...PERFIL.effective,
              sensitivity: enviado.sensitivity,
              alarmConfidence: enviado.alarmConfidence,
              detectionTarget: enviado.detectionTarget,
              regions: enviado.regions,
            },
          });
        }
        return json(perfil);
      }
      if (url.includes("/stream")) return json({ hls: null });
      if (url.includes("push/events")) {
        return json({
          items: [
            {
              id: 1,
              deviceIp: "10.0.0.171",
              eventType: "fielddetection",
              occurredAt: new Date().toISOString(),
            },
            {
              id: 2,
              deviceIp: "10.0.0.171",
              eventType: "fielddetection",
              occurredAt: new Date().toISOString(),
            },
          ],
          hasMore: false,
        });
      }
      if (url.includes("integra/cameras")) return json({ items: [CAMARA] });
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("enseña lo que el servidor le escribiría al equipo, no un valor inventado", async () => {
    servidorCompleto();
    render(<IntegraDetectionTuningPage />);

    expect(await screen.findByText(/35 · Baja/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Región 1/)).toBeInTheDocument();
  });

  it("avisa de que el perfil nunca se ha escrito en la cámara", async () => {
    servidorCompleto();
    render(<IntegraDetectionTuningPage />);
    expect(
      await screen.findByText(/nunca se ha escrito en el equipo/i),
    ).toBeInTheDocument();
  });

  it("cuenta el ruido de la cámara con el endpoint que ya existe", async () => {
    servidorCompleto();
    render(<IntegraDetectionTuningPage />);

    expect(await screen.findByText("Última hora")).toBeInTheDocument();
    expect(screen.getByText("Últimas 24 h")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });

  it("un cambio viaja con los nombres del contrato, no con los de la pantalla", async () => {
    const fetchMock = servidorCompleto();
    const user = userEvent.setup();
    render(<IntegraDetectionTuningPage />);

    await screen.findByText(/35 · Baja/);
    await user.click(screen.getByRole("button", { name: "Personas y vehículos" }));
    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Guardar/i }));
    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch).toBeTruthy();
    const cuerpo = JSON.parse(String(patch?.[1]?.body)) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      detectionTarget: "human,vehicle",
      alarmConfidence: "high",
      sensitivity: 35,
    });
    expect(cuerpo.schedule).toEqual({ start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5] });
  });

  it("guardar y aplicar son dos pasos: no se aplica un borrador sin guardar", async () => {
    servidorCompleto();
    const user = userEvent.setup();
    render(<IntegraDetectionTuningPage />);

    await screen.findByText(/35 · Baja/);
    const aplicar = screen.getByRole("button", { name: /Aplicar al equipo/i });
    expect(aplicar).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Solo vehículos" }));
    // Con cambios pendientes, aplicar escribiría lo viejo: se bloquea y se dice.
    await waitFor(() => expect(aplicar).toBeDisabled());
    expect(aplicar).toHaveAttribute("title", expect.stringContaining("Guarda primero"));
  });

  it("aplicar escribe en el equipo y enseña lo que contestó", async () => {
    const fetchMock = servidorCompleto();
    const user = userEvent.setup();
    render(<IntegraDetectionTuningPage />);

    await screen.findByText(/35 · Baja/);
    await user.click(screen.getByRole("button", { name: /Aplicar al equipo/i }));

    await waitFor(() => expect(screen.getByText("Escrito en el equipo")).toBeInTheDocument());
    expect(screen.getByText("FieldDetection escrito")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/detection/apply")),
    ).toBe(true);
  });
});
