import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrgChartView from "./OrgChartView";

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Ada", token: "jwt", permissions: [] } }),
}));

vi.mock("@/lib/api-base", () => ({ buildApiUrl: (p: string) => `http://api.test/${p}` }));

/**
 * jsdom no maqueta: `scrollWidth` y `clientWidth` valen 0 y el ajuste automático se
 * rinde antes de calcular nada. Aquí se fingen las medidas de la captura de Adam —
 * un árbol que no cabe en el hueco — para poder reproducir de verdad lo que él ve.
 *
 * `arbolW`/`arbolH` son mutables a propósito: el fallo de fondo solo aparece cuando
 * el árbol **cambia de tamaño después** de que alguien tocó el zoom a mano.
 */
const MEDIDAS = { arbolW: 3000, arbolH: 700, lienzoW: 1000 };

let observadores: Array<() => void> = [];

class ResizeObserverFalso {
  constructor(private cb: () => void) {
    observadores.push(() => this.cb());
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Lo que hace el navegador de verdad cuando una caja observada cambia de tamaño. */
function elNavegadorAvisaDelCambioDeTamano() {
  act(() => {
    observadores.forEach((disparar) => disparar());
  });
}

/** El lienzo es el único con desplazamiento propio. */
function esLienzo(el: HTMLElement) {
  return el.style.overflowX === "auto";
}

function medir() {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return esLienzo(this) ? MEDIDAS.lienzoW : MEDIDAS.arbolW;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return MEDIDAS.arbolH;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return esLienzo(this) ? MEDIDAS.lienzoW : MEDIDAS.arbolW;
    },
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

/** Los 16 de la captura: una raíz, tres mandos medios con cuatro cada uno, y tres sueltos. */
function plantillaDe16(): Persona[] {
  const medios = [2, 3, 4].map((id) =>
    persona({
      id,
      nombre: `Mando ${id}`,
      managerId: 1,
      children: Array.from({ length: 4 }, (_, i) =>
        persona({ id: id * 10 + i, nombre: `Tecnico ${id}-${i}`, managerId: id }),
      ),
    }),
  );
  return [
    persona({
      id: 1,
      nombre: "Christian Pozo",
      puesto: "Dirección General",
      managerId: null,
      children: [
        ...medios,
        persona({ id: 5, nombre: "Suelto 5", managerId: 1 }),
        persona({ id: 6, nombre: "Suelto 6", managerId: 1 }),
        persona({ id: 7, nombre: "Suelto 7", managerId: 1 }),
      ],
    }),
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

let respuesta: () => Persona[] = plantillaDe16;
let peticiones: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
  observadores = [];
  peticiones = [];
  MEDIDAS.arbolW = 3000;
  MEDIDAS.arbolH = 700;
  respuesta = plantillaDe16;
  medir();
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      peticiones.push({ url, init });
      return { ok: true, json: async () => respuesta(), text: async () => "" };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function botonAjustar() {
  return screen.getByRole("button", { name: /ajustar a la pantalla/i });
}
function zoomActual() {
  return botonAjustar().textContent;
}
function lienzo() {
  return Array.from(document.querySelectorAll<HTMLElement>("div")).find((d) => esLienzo(d))!;
}
/** La caja escalada: es la que recorta si se queda con una medida vieja. */
function cajaEscalada() {
  return lienzo().firstElementChild as HTMLElement;
}

describe("OrgChartView · que quepa y que el zoom funcione", () => {
  it("el ajuste no miente: la caja que entrega cabe en el lienzo", async () => {
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(cajaEscalada().style.width).not.toBe(""));

    // Antes se forzaba un suelo del 45 % sobre un ajuste real del 33 %: la caja
    // salía de 1,350px dentro de un hueco de 976px y el organigrama se cortaba.
    const ancho = parseFloat(cajaEscalada().style.width);
    expect(ancho).toBeLessThanOrEqual(MEDIDAS.lienzoW);
  });

  it("al ampliar, el zoom se queda aunque la caja avise de su nuevo tamaño", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(zoomActual()).not.toBe(""));

    const antes = zoomActual();
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    const despues = zoomActual();
    expect(despues).not.toBe(antes);

    elNavegadorAvisaDelCambioDeTamano();
    expect(zoomActual()).toBe(despues);
  });

  /**
   * La prueba que fija el fallo de fondo: medir el árbol estaba dentro de la
   * función que decide el zoom, y esa función se apagaba en cuanto alguien tocaba
   * los botones. La caja se quedaba con el último tamaño natural conocido y
   * recortaba todo lo que creciera después.
   */
  it("tras tocar el zoom a mano, la caja sigue midiendo el árbol cuando este crece", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg eyebrow="Core" />);
    await screen.findByText("Christian Pozo");
    await waitFor(() => expect(cajaEscalada().style.height).not.toBe(""));

    await user.click(screen.getByRole("button", { name: "Acercar" }));
    const zoom = parseInt((zoomActual() ?? "0").replace("%", ""), 10) / 100;

    // El árbol crece: se despliega el editor de una tarjeta.
    MEDIDAS.arbolH = 1400;
    elNavegadorAvisaDelCambioDeTamano();

    const alto = parseFloat(cajaEscalada().style.height);
    expect(alto).toBeCloseTo(MEDIDAS.arbolH * zoom, 0);
  });

  it("con 16 personas se apila solo, y Adam puede volver a extenderlo", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Christian Pozo");

    const alternar = await screen.findByRole("button", { name: /compacto|extendido/i });
    expect(alternar).toHaveTextContent("Compacto");
    expect(alternar).toHaveAttribute("aria-pressed", "true");

    await user.click(alternar);
    expect(alternar).toHaveTextContent("Extendido");
    expect(alternar).toHaveAttribute("aria-pressed", "false");
  });
});

describe("OrgChartView · colocación lateral", () => {
  beforeEach(() => {
    respuesta = plantillaConLateral;
    MEDIDAS.arbolW = 600;
  });

  it("dibuja al lateral una sola vez y lo cuenta entre las personas", async () => {
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Luis Joel Aguilar");

    expect(screen.getAllByText("Luis Joel Aguilar")).toHaveLength(1);
    // Sigue siendo parte de la plantilla: estar al costado no lo borra del censo.
    expect(screen.getByRole("heading", { name: "4 personas" })).toBeInTheDocument();
  });

  it("no lo cuenta como gente a cargo de la persona a la que acompaña", async () => {
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Jose Antonio Ramirez");

    // Antonio tiene a Soporte debajo. Luis va a su lado, no a su cargo.
    expect(screen.getByTitle("Gente a cargo de Jose Antonio Ramirez por línea de mando")).toHaveTextContent(
      "1 a cargo",
    );
    // Christian sí lo conserva: Luis sigue colgando de él por `managerId`, solo se
    // dibuja en otro sitio. Mover la tarjeta no cambia de quién depende.
    expect(screen.getByTitle("Gente a cargo de Christian Pozo por línea de mando")).toHaveTextContent(
      "3 a cargo",
    );
  });

  it("enseña que va al lado, no debajo", async () => {
    render(<OrgChartView canEditOrg={false} eyebrow="Core" />);
    await screen.findByText("Luis Joel Aguilar");
    expect(
      screen.getByTitle("Luis Joel Aguilar va al lado de Jose Antonio Ramirez"),
    ).toBeInTheDocument();
  });

  it("Adam lo coloca desde la pantalla, y eso no toca la línea de mando", async () => {
    const user = userEvent.setup();
    render(<OrgChartView canEditOrg eyebrow="Core" />);
    await screen.findByText("Soporte Uno");

    await user.click(
      screen.getByRole("button", { name: "Colocar a Soporte Uno en el organigrama" }),
    );
    await user.selectOptions(screen.getByLabelText("Al lado de:"), "11");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const escrituras = peticiones.filter((p) => p.init?.method === "PATCH");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].url).toContain("users/12/lateral");
    expect(JSON.parse(String(escrituras[0].init?.body))).toEqual({ lateralDeId: 11 });
    // Ni una llamada a `manager`: colocar al costado no reasigna jefe.
    expect(escrituras.some((p) => p.url.includes("/manager"))).toBe(false);
  });
});
