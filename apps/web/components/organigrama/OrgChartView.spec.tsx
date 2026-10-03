import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrgChartView from "./OrgChartView";

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Ada", token: "jwt", permissions: [] } }),
}));

vi.mock("@/lib/api-base", () => ({ buildApiUrl: (p: string) => `http://api.test/${p}` }));

vi.mock("@/components/hr/HrModuleRail", () => ({
  default: () => <nav aria-label="Secciones de Recursos Humanos" />,
}));

/**
 * jsdom no maqueta: `clientWidth` y `clientHeight` valen 0. Aquí se fingen las
 * medidas del lienzo de la laptop de Adam para que el encuadre automático tenga
 * con qué calcular.
 */
const LIENZO = { ancho: 1214, alto: 676 };

function medir() {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return LIENZO.ancho;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return LIENZO.alto;
    },
  });
}

// jsdom no trae `PointerEvent`: sin esto `fireEvent.pointerDown` llega sin `clientX`.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventFalso extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: PointerEventFalso });
}

let observadores: Array<() => void> = [];

class ResizeObserverFalso {
  constructor(private cb: () => void) {
    observadores.push(() => this.cb());
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Lo que hace el navegador de verdad cuando el lienzo cambia de tamaño. */
function elNavegadorAvisaDelCambioDeTamano() {
  act(() => {
    observadores.forEach((disparar) => disparar());
  });
}

type Persona = {
  id: number;
  nombre: string;
  puesto: string;
  avatarUrl: null;
  managerId: number | null;
  lateralDeId?: number | null;
  role: null;
  department: { id: number; nombre: string };
  children: Persona[];
};

function persona(p: Partial<Persona> & Pick<Persona, "id" | "nombre">): Persona {
  return {
    puesto: "Puesto",
    avatarUrl: null,
    managerId: null,
    lateralDeId: null,
    role: null,
    department: { id: 1, nombre: "Operaciones" },
    children: [],
    ...p,
  };
}

/** Christian, tres mandos con tres técnicos cada uno, tres sueltos y una persona sin jefe: 17. */
function plantillaDe17(): Persona[] {
  const medios = [2, 3, 4].map((id) =>
    persona({
      id,
      nombre: `Mando ${id}`,
      managerId: 1,
      department: { id: 2, nombre: "Ingeniería" },
      children: Array.from({ length: 3 }, (_, i) =>
        persona({ id: id * 10 + i, nombre: `Tecnico ${id}-${i}`, managerId: id, department: { id: 2, nombre: "Ingeniería" } }),
      ),
    }),
  );
  return [
    persona({
      id: 1,
      nombre: "Christian Pozo",
      puesto: "Dirección General",
      managerId: null,
      department: { id: 3, nombre: "Dirección" },
      children: [
        ...medios,
        persona({ id: 5, nombre: "Suelto 5", managerId: 1 }),
        persona({ id: 6, nombre: "Suelto 6", managerId: 1 }),
        persona({ id: 7, nombre: "Suelto 7", managerId: 1 }),
      ],
    }),
    persona({ id: 8, nombre: "Monica Garcia", puesto: "Administrativo", managerId: null }),
  ];
}

/** Antonio con su gente, y Luis al costado: le pasa trabajo, no le manda. */
function plantillaConLateral(): Persona[] {
  return [
    persona({
      id: 1,
      nombre: "Christian Pozo",
      managerId: null,
      children: [
        persona({
          id: 10,
          nombre: "Jose Antonio Ramirez",
          managerId: 1,
          children: [persona({ id: 12, nombre: "Soporte Uno", managerId: 10 })],
        }),
        persona({ id: 11, nombre: "Luis Joel Aguilar", managerId: 1, lateralDeId: 10 }),
      ],
    }),
  ];
}

let respuesta: () => Persona[] = plantillaDe17;
let peticiones: Array<{ url: string; init?: RequestInit }> = [];
let angosto = false;

beforeEach(() => {
  observadores = [];
  peticiones = [];
  respuesta = plantillaDe17;
  angosto = false;
  medir();
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      peticiones.push({ url, init });
      return { ok: true, json: async () => respuesta(), text: async () => "" };
    }),
  );
  // La vista pregunta por el ancho de la ventana para decidir telaraña o lista.
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: angosto,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** La capa que se mueve y se escala: su `transform` dice el zoom y el encuadre. */
function mundo() {
  return screen.getByRole("group", { name: "Organigrama" });
}
function zoomActual() {
  const m = /scale\(([\d.]+)\)/.exec(mundo().style.transform);
  return m ? parseFloat(m[1]) : NaN;
}
function tarjetas() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-org-id]"));
}
/** El rótulo de un conector: va como `<title>` dentro de su trazo, que `getByTitle` no alcanza. */
function rotuloDeTrazo(texto: string) {
  return Array.from(document.querySelectorAll("svg path > title")).find((t) => t.textContent === texto);
}

describe("OrgChartView · solo el organigrama, con el director al centro", () => {
  it("no hay encabezado, cifras, barra por departamento ni filtros: solo la telaraña", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");

    expect(screen.queryByText("Por departamento")).not.toBeInTheDocument();
    expect(screen.queryByText("Personas")).not.toBeInTheDocument();
    expect(screen.queryByText(/personas$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Todas" })).not.toBeInTheDocument();
    // El título sigue existiendo para el lector de pantalla, no a la vista.
    expect(screen.getByRole("heading", { name: "Organigrama" })).toHaveClass("ui-sr-only");
  });

  it("dibuja a las 17 personas una sola vez y pone al director en el centro del lienzo", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");

    expect(tarjetas()).toHaveLength(17);
    expect(screen.getAllByText("Monica Garcia")).toHaveLength(1);
    const centro = tarjetas().find((t) => t.dataset.orgId === "1")!;
    // La tarjeta del director está centrada en (0, 0) del mundo…
    expect(parseFloat(centro.style.left) + parseFloat(centro.style.width) / 2).toBe(0);
    expect(parseFloat(centro.style.top) + parseFloat(centro.style.height) / 2).toBe(0);
    // …y el mundo se encuadra en el centro del lienzo medido.
    await waitFor(() =>
      expect(mundo().style.transform).toContain(`translate(${LIENZO.ancho / 2}px, ${LIENZO.alto / 2}px)`),
    );
  });

  it("quien no tiene jefe sigue a la vista, marcado y colgado del centro con línea punteada", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Monica Garcia");

    const monica = tarjetas().find((t) => t.dataset.orgId === "8")!;
    expect(within(monica).getByText("Sin jefe")).toBeInTheDocument();
    expect(rotuloDeTrazo("Monica Garcia no tiene jefe asignado")).toBeDefined();
  });

  it("la leyenda enseña las áreas con su color", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");
    const leyenda = screen.getByRole("list", { name: "Áreas" });
    expect(within(leyenda).getByText("Ingeniería")).toBeInTheDocument();
    expect(within(leyenda).getByText("Operaciones")).toBeInTheDocument();
    expect(within(leyenda).getByText("Dirección")).toBeInTheDocument();
  });

  it("sin permiso de edición, las tarjetas no son botones", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");
    expect(screen.queryByRole("button", { name: /Colocar a/ })).not.toBeInTheDocument();
  });
});

describe("OrgChartView · encuadre y zoom", () => {
  it("al entrar cabe entero (zoom legible) y los botones acercan, alejan y centran", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(zoomActual()).toBeGreaterThan(0.8));

    const inicial = zoomActual();
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    expect(zoomActual()).toBeCloseTo(inicial * 1.2, 2);
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(zoomActual()).toBeCloseTo(inicial, 2);
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(zoomActual()).toBeLessThan(inicial);
    await user.click(screen.getByRole("button", { name: "Centrar" }));
    expect(zoomActual()).toBeCloseTo(inicial, 2);
  });

  it("tras tocar el zoom a mano, un cambio de tamaño del lienzo no lo pisa", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(zoomActual()).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "Acercar" }));
    const manual = zoomActual();
    elNavegadorAvisaDelCambioDeTamano();
    expect(zoomActual()).toBe(manual);
  });

  it("arrastrar el lienzo lo desplaza", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(mundo().style.transform).toContain("translate("));
    const antes = mundo().style.transform;
    const lienzo = mundo().parentElement!;

    fireEvent.pointerDown(lienzo, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(lienzo, { pointerId: 1, clientX: 340, clientY: 320 });
    fireEvent.pointerUp(lienzo, { pointerId: 1 });

    expect(mundo().style.transform).not.toBe(antes);
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(mundo().style.transform)!;
    expect(parseFloat(m[1])).toBe(LIENZO.ancho / 2 + 40);
    expect(parseFloat(m[2])).toBe(LIENZO.alto / 2 + 20);
  });
});

describe("OrgChartView · colocación lateral", () => {
  beforeEach(() => {
    respuesta = plantillaConLateral;
  });

  it("dibuja al lateral una sola vez, al lado de su ancla y con puente punteado", async () => {
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Luis Joel Aguilar");

    expect(screen.getAllByText("Luis Joel Aguilar")).toHaveLength(1);
    expect(tarjetas()).toHaveLength(4);
    expect(rotuloDeTrazo("Luis Joel Aguilar va al lado de Jose Antonio Ramirez")).toBeDefined();
    // La tarjeta lo dice al pasar el puntero, para que no haya que adivinar la línea.
    const luis = tarjetas().find((t) => t.dataset.orgId === "11")!;
    expect(luis.title).toContain("va al lado de Jose Antonio Ramirez");
  });

  it("Adam lo coloca desde la pantalla, y eso no toca la línea de mando", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg />);
    await screen.findByText("Soporte Uno");

    await user.click(screen.getByRole("button", { name: "Colocar a Soporte Uno en el organigrama" }));
    const editor = screen.getByRole("dialog", { name: "Colocar a Soporte Uno" });
    // Lo que cuenta de la persona: puesto, área y gente a cargo de verdad.
    expect(within(editor).getByText("Soporte Uno")).toBeInTheDocument();
    await user.selectOptions(within(editor).getByLabelText("Al lado de:"), "11");
    await user.click(within(editor).getByRole("button", { name: "Guardar" }));

    const escrituras = peticiones.filter((p) => p.init?.method === "PATCH");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].url).toContain("users/12/lateral");
    expect(JSON.parse(String(escrituras[0].init?.body))).toEqual({ lateralDeId: 11 });
    // Ni una llamada a `manager`: colocar al costado no reasigna jefe.
    expect(escrituras.some((p) => p.url.includes("/manager"))).toBe(false);
    // Al guardar se vuelve a pedir el organigrama y el editor se cierra.
    await waitFor(() => expect(peticiones.filter((p) => !p.init?.method).length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cambiar a quién reporta llama a `manager`, y nadie puede reportar a su propia gente", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg />);
    await screen.findByText("Jose Antonio Ramirez");

    await user.click(screen.getByRole("button", { name: "Colocar a Jose Antonio Ramirez en el organigrama" }));
    const jefe = screen.getByLabelText("Reporta a:") as HTMLSelectElement;
    const opciones = Array.from(jefe.options).map((o) => o.value);
    expect(opciones).toContain("1");
    expect(opciones).toContain("11");
    expect(opciones).not.toContain("12"); // Soporte Uno cuelga de él
    expect(opciones).not.toContain("10"); // él mismo

    await user.selectOptions(jefe, "11");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const escrituras = peticiones.filter((p) => p.init?.method === "PATCH");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].url).toContain("users/10/manager");
    expect(JSON.parse(String(escrituras[0].init?.body))).toEqual({ managerId: 11 });
  });

  it("Cancelar y Escape cierran el editor sin guardar nada", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg />);
    await screen.findByText("Soporte Uno");

    await user.click(screen.getByRole("button", { name: "Colocar a Soporte Uno en el organigrama" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Colocar a Soporte Uno en el organigrama" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(peticiones.filter((p) => p.init?.method === "PATCH")).toHaveLength(0);
  });
});

describe("OrgChartView · pantalla angosta", () => {
  beforeEach(() => {
    angosto = true;
  });

  it("cambia la telaraña por una lista vertical que conserva a todos y la edición", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg />);
    await screen.findByText("Christian Pozo");

    expect(screen.queryByRole("group", { name: "Organigrama" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acercar" })).not.toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Organigrama" });
    expect(within(lista).getAllByText(/Tecnico/)).toHaveLength(9);
    expect(within(lista).getByText("Sin jefe asignado")).toBeInTheDocument();
    expect(within(lista).getByText("Monica Garcia")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Colocar a Suelto 5 en el organigrama" }));
    expect(screen.getByRole("dialog", { name: "Colocar a Suelto 5" })).toBeInTheDocument();
  });
});

describe("OrgChartView · estados", () => {
  it("si la carga falla, avisa y deja reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}), text: async () => "Sin acceso" })),
    );
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.getByText(/Sin acceso/)).toBeInTheDocument();
  });

  it("sin nadie dado de alta, lo dice", async () => {
    respuesta = () => [];
    render(<OrgChartView canEditOrg={false} />);
    await screen.findByText("Aún no hay nadie en el organigrama");
  });

  it("dentro de RH conserva el carril de secciones", async () => {
    render(<OrgChartView canEditOrg showHrRail />);
    await screen.findByText("Christian Pozo");
    expect(screen.getByRole("navigation", { name: "Secciones de Recursos Humanos" })).toBeInTheDocument();
  });
});
