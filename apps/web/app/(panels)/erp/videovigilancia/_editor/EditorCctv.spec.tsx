import { render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MODELOS_CAMARA } from "@/lib/cctv/catalogo";
import { agregarCamara, agregarMuro, agregarPersona } from "@/lib/cctv/editor";
import { planoVacio, type Plano } from "@/lib/cctv/plano";
import type { Diseno } from "@/lib/cctv/api";
import EditorCctv from "./EditorCctv";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

vi.mock("@/lib/cctv/api", async (original) => ({
  ...(await original<typeof import("@/lib/cctv/api")>()),
  guardarDiseno: vi.fn(),
  subirCroquis: vi.fn(),
}));

beforeAll(() => {
  // jsdom no trae ResizeObserver ni getScreenCTM.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function bodega(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: 0.05, calibracion: { a: { x: 0, y: 0 }, b: { x: 860, y: 0 }, metros: 43 } } };
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: 860, y: 0 }],
    [{ x: 860, y: 0 }, { x: 860, y: 400 }],
    [{ x: 860, y: 400 }, { x: 0, y: 400 }],
    [{ x: 0, y: 400 }, { x: 0, y: 0 }],
  ]) p = agregarMuro(p, a, b, { alturaM: 5 }).plano;
  p = agregarCamara(p, { x: 7, y: 7 }, MODELOS_CAMARA[0], { nombre: "Domo 2 Z ALM", rumboDeg: 132, alturaM: 5, inclinacionDeg: 39, distanciaM: 13.8 }).plano;
  return agregarPersona(p, { x: 160, y: 145 });
}

const diseno = (plano: Plano): Diseno => ({
  id: 7,
  nombre: "Proyecto CCTV Bodegas VDM",
  clienteId: null,
  clienteNombre: "Concretos Pronto",
  cotizacionId: null,
  estado: "borrador",
  resumen: null,
  version: 1,
  creadoPor: { id: 3, nombre: "David Morales" },
  actualizadoPor: null,
  createdAt: "2026-10-29T17:00:00.000Z",
  updatedAt: "2026-10-29T17:00:00.000Z",
  plano,
  grabacion: null,
});

describe("editor del diseñador de videovigilancia", () => {
  it("pinta el plano, la cámara con su número y la vista de la cámara", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    expect(screen.getByRole("heading", { name: "Proyecto CCTV Bodegas VDM" })).toBeInTheDocument();
    expect(screen.getByText(/Escala calibrada · cota 43.00 m/)).toBeInTheDocument();
    expect(screen.getByLabelText("Vista desde la cámara 1")).toBeInTheDocument();
    expect(screen.getByText(/PPM ·/, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Herramientas del plano" })).toBeInTheDocument();
  });

  it("sin croquis ni muros invita a subir el croquis", () => {
    render(<EditorCctv diseno={diseno({ ...planoVacio() })} token="t" onRecargar={() => {}} />);
    expect(screen.getByText("Empieza por el croquis del sitio")).toBeInTheDocument();
    expect(screen.getByText("Escala sin calibrar")).toBeInTheDocument();
  });

  it("en 3D pinta el sitio, sus vistas desde las cámaras y deja elegir la cámara", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByRole("img", { name: /Vista 3D del sitio/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vistas desde las cámaras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vista superior" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Muro/ })).toBeNull();
    // controles a la vista: girar, acercar y encuadrar
    fireEvent.click(screen.getByRole("button", { name: "Girar a la derecha" }));
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    fireEvent.click(screen.getByRole("button", { name: "Encuadrar todo" }));
    expect(screen.getByRole("img", { name: /Vista 3D del sitio/ })).toBeInTheDocument();
  });

  it("la lista de cámaras abre la ficha de la cámara en el panel", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Cámaras · 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Domo 2 Z ALM/ }));
    expect(screen.getByRole("tab", { name: "Cámara 1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Alcance en el piso")).toBeInTheDocument();
    expect(screen.getByText("hasta 4.3 m")).toBeInTheDocument();
  });

  it("agrega un nivel encima, le copia los muros y lo apila en 3D", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    const barra = screen.getByRole("region", { name: "Niveles del edificio" });
    expect(screen.getByRole("button", { name: /Planta baja.*±0.00 m · 1 cámara/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "+ Nivel" }));
    expect(barra).toHaveTextContent("Nivel 2+3.50 m · sin cámaras");
    expect(screen.getByRole("button", { name: /Nivel 2/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Ver el nivel de abajo en gris")).toBeChecked();
    // la pestaña Plano trae los datos del nivel
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Nivel 2");
    fireEvent.click(screen.getByRole("button", { name: "Copiar muros de Planta baja" }));
    expect(screen.getByText(/Muros copiados de Planta baja/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByText("Nivel 2 +3.50 m")).toBeInTheDocument();
    expect(screen.getByText("Planta baja ±0.00 m")).toBeInTheDocument();
    // volver a la planta baja la deja como estaba
    fireEvent.click(screen.getByRole("button", { name: /^Planta baja/ }));
    expect(screen.getByRole("tab", { name: "Cámaras · 1" })).toBeInTheDocument();
  });
});
