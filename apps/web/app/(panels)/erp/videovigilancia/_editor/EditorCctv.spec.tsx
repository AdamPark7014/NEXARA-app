import { render, screen, fireEvent } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO } from "@/lib/cctv/catalogo";
import { agregarCamara, agregarEquipo, agregarMuro, agregarPersona, resumenDelPlano } from "@/lib/cctv/editor";
import { planoVacio, type Plano } from "@/lib/cctv/plano";
import type { Diseno } from "@/lib/cctv/api";
import EditorCctv from "./EditorCctv";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

// El motor necesita WebGL de verdad: aquí se prueba lo que el editor le pide.
vi.mock("./Maqueta3D", () => ({
  default: ({ capas, verDesde, onPerderWebGL }: { capas: { noche: boolean }; verDesde: string | null; onPerderWebGL: () => void }) => (
    <div data-testid="maqueta" data-noche={String(capas.noche)} data-ver={verDesde ?? undefined}>
      <button type="button" data-testid="perder-webgl" onClick={onPerderWebGL} />
    </div>
  ),
}));

vi.mock("next/dynamic", async () => {
  const { lazy, Suspense } = await import("react");
  return {
    default: (cargar: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
      const L = lazy(cargar);
      return function Dinamico(p: Record<string, unknown>) {
        return (
          <Suspense fallback={null}>
            <L {...p} />
          </Suspense>
        );
      };
    },
  };
});

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "t", user: { id: 1, permissions: ["cotizaciones.access"] }, loading: false }) }));

vi.mock("@/lib/cctv/api", async (original) => ({
  ...(await original<typeof import("@/lib/cctv/api")>()),
  guardarDiseno: vi.fn(),
  subirCroquis: vi.fn(),
  listarCatalogo: vi.fn().mockResolvedValue([]),
  consultarDisponibilidad: vi.fn().mockResolvedValue([]),
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
    expect(screen.getByRole("toolbar", { name: "Herramientas del plano" })).toBeInTheDocument();
    // sin cámara elegida el plano queda libre; al elegirla sale su vista
    expect(screen.queryByLabelText("Vista desde la cámara 1")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Cámaras · 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Domo 2 Z ALM/ }));
    expect(screen.getByLabelText("Vista desde la cámara 1")).toBeInTheDocument();
    expect(screen.getAllByText(/PPM ·/, { selector: "span" }).length).toBeGreaterThan(0);
  });

  it("sin croquis ni muros invita a subir el croquis", () => {
    render(<EditorCctv diseno={diseno({ ...planoVacio() })} token="t" onRecargar={() => {}} />);
    expect(screen.getByText("Empieza por el croquis del sitio")).toBeInTheDocument();
    expect(screen.getByText("Escala sin calibrar")).toBeInTheDocument();
  });

  it("en 3D pinta el sitio, sus vistas desde las cámaras y deja elegir la cámara", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Maqueta 3D" }));
    expect(screen.getByRole("img", { name: /Vista 3D del sitio/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vistas desde las cámaras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vista superior" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Muro" })).toBeNull();
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

  it("sin nada elegido guía los pasos y cada botón activa su herramienta", () => {
    render(<EditorCctv diseno={{ ...diseno(bodega()), resumen: resumenDelPlano(bodega()) }} token="t" onRecargar={() => {}} />);
    expect(screen.getByText("Para armar el diseño · faltan 1")).toBeInTheDocument();
    expect(screen.getByText("Cobertura del interior")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Maqueta 3D" }));
    fireEvent.click(screen.getByRole("button", { name: "Poner: Cámaras" }));
    // vuelve al 2D con la herramienta de cámara lista
    expect(screen.getByRole("button", { name: "+ Cámara" })).toHaveAttribute("aria-pressed", "true");
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
    fireEvent.click(screen.getByRole("button", { name: "Maqueta 3D" }));
    expect(screen.getByText("Nivel 2 +3.50 m")).toBeInTheDocument();
    expect(screen.getByText("Planta baja ±0.00 m")).toBeInTheDocument();
    // volver a la planta baja la deja como estaba
    fireEvent.click(screen.getByRole("button", { name: /^Planta baja/ }));
    expect(screen.getByRole("tab", { name: "Cámaras · 1" })).toBeInTheDocument();
  });

  it("el plano técnico sale del diseño: ejes, cédula, revisión y carátula", () => {
    render(<EditorCctv diseno={{ ...diseno(bodega()), resumen: resumenDelPlano(bodega()) }} token="t" onRecargar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Plano técnico" }));
    const hoja = screen.getByRole("article", { name: "Plano técnico: Planta baja" });
    expect(hoja).toHaveTextContent("Cédula de equipos");
    expect(hoja).toHaveTextContent("DS-2CD1143G2-LIUF");
    expect(hoja).toHaveTextContent("CAM-01");
    expect(hoja).toHaveTextContent("Concretos Pronto");
    expect(hoja).toHaveTextContent("David Morales");
    expect(hoja).toHaveTextContent("CCTV-01 · Planta baja");
    expect(hoja).toHaveTextContent("Canales del grabador");
    expect(screen.getByRole("button", { name: "Imprimir plano" })).toBeInTheDocument();
    // En la hoja no estorban las herramientas ni el panel.
    expect(screen.queryByRole("toolbar", { name: "Herramientas del plano" })).toBeNull();
  });

  it("el panel de equipos arma la herramienta con el modelo elegido", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    const panel = screen.getByRole("complementary", { name: "Equipos" });
    expect(panel).toHaveTextContent("DS-2CD2347G2-LU");
    fireEvent.click(screen.getByRole("button", { name: /Turret.*DS-2CD2347G2-LU/ }));
    expect(screen.getByRole("button", { name: "+ Cámara" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ambientación" }));
    fireEvent.click(screen.getByRole("button", { name: "Camión" }));
    expect(screen.getByRole("button", { name: "+ Cámara" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Madera" }));
    expect(screen.getByRole("button", { name: "Área" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sin WebGL abre en el dibujo aunque haya muros, y la pestaña 3D usa la vista sencilla", () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    expect(screen.getByRole("button", { name: "Dibujo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Maqueta 3D" }));
    expect(screen.getByRole("button", { name: "Isométrica" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "De noche" })).toBeNull();
  });
});

describe("editor con WebGL", () => {
  // `restoreMocks` del runner quita los espías antes de cada prueba.
  beforeEach(() => {
    vi.stubGlobal("WebGL2RenderingContext", class {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((tipo: string) => (tipo === "webgl2" ? ({} as unknown) : null)) as never);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("con muros abre en la maqueta, con sus capas y herramientas", async () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    expect(screen.getByRole("button", { name: "Maqueta 3D" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("maqueta")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Herramientas del plano" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "De noche" }));
    expect(screen.getByRole("button", { name: "De noche" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/alcance de IR/)).toBeInTheDocument();
    expect(screen.getByTestId("maqueta")).toHaveAttribute("data-noche", "true");
  });

  it("«Ver lo que ve» pide a la maqueta la vista de esa cámara", async () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    await screen.findByTestId("maqueta");
    fireEvent.click(screen.getByRole("tab", { name: "Cámaras · 1" }));
    fireEvent.click(screen.getByRole("button", { name: /Domo 2 Z ALM/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver lo que ve" }));
    expect(screen.getByTestId("maqueta").getAttribute("data-ver")).toBeTruthy();
    // Mientras se ve desde la cámara, no se dibuja.
    expect(screen.queryByRole("toolbar", { name: "Herramientas del plano" })).toBeNull();
  });

  it("lo de rack entra directo al gabinete y se ve en sus Equipos", async () => {
    const gabinete = MODELOS_EQUIPO.find((m) => m.tipo === "gabinete")!;
    render(<EditorCctv diseno={diseno(agregarEquipo(bodega(), { x: 100, y: 100 }, gabinete, 1).plano)} token="t" onRecargar={() => {}} />);
    await screen.findByTestId("maqueta");
    fireEvent.click(screen.getByRole("button", { name: "Rack y red" }));
    fireEvent.click(screen.getByRole("button", { name: /DS-7608NXI-K2/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("entró a GAB-01, unidad 23");
    expect(screen.getByRole("tab", { name: "Equipos · 2" })).toBeInTheDocument();
  });

  it("el diagrama sale de lo colocado y dice lo que falta", async () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    await screen.findByTestId("maqueta");
    fireEvent.click(screen.getByRole("button", { name: "Diagrama" }));
    expect(screen.getByRole("article", { name: "Diagrama del sistema" })).toBeInTheDocument();
    expect(screen.getByText("1 × Domo")).toBeInTheDocument();
    expect(screen.getByText("GABINETE, POR COLOCAR")).toBeInTheDocument();
  });

  it("si se pierde WebGL sigue con la vista sencilla y lo avisa", async () => {
    render(<EditorCctv diseno={diseno(bodega())} token="t" onRecargar={() => {}} />);
    fireEvent.click(await screen.findByTestId("perder-webgl"));
    expect(screen.getByRole("button", { name: "Isométrica" })).toBeInTheDocument();
    expect(screen.getByText(/seguimos con la vista sencilla/)).toBeInTheDocument();
  });
});
