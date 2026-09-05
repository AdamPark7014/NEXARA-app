import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegraPeoplePage from "./page";

/**
 * Qué protege esta prueba.
 *
 * La consola de Personas enseñaba la ficha como un volcado de JSON, escondía
 * `validEnable` dentro de un cálculo, tiraba el nombre del plan horario que el
 * servidor ya le mandaba, y pedía confirmación para borrar a alguien con el
 * cuadro gris del navegador. Todo eso se ve o no se ve al renderizar; por eso
 * se prueba montando la página de verdad y no llamando a funciones sueltas.
 */

const reemplazar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  usePathname: () => "/integra/people",
  useSearchParams: () => new URLSearchParams(""),
}));

// El proveedor decide qué mitad de la ficha se pinta. ISAPI es el de campo.
vi.mock("../_caps", () => ({
  getCachedProvider: () => "ISAPI",
  subscribeProvider: (cb: (p: string) => void) => {
    cb("ISAPI");
    return () => undefined;
  },
}));

// La foto sale por un proxy autenticado que aquí no existe; el rostro no es lo
// que se está probando.
vi.mock("../_PersonFace", () => ({
  PersonFaceThumb: ({ personName }: { personName?: string | null }) => (
    <div data-testid="rostro">{personName}</div>
  ),
  prefetchPersonFace: () => undefined,
  invalidatePersonFaceCache: () => undefined,
}));

vi.mock("@/components/UserContext", () => ({
  // Sin token, el directorio ERP no se consulta: esta prueba mira el lado ACS.
  useUser: () => ({ user: { token: "" } }),
}));

vi.mock("@/components/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/users-api", () => ({ listUsers: async () => [] }));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VIGENTE = {
  id: "NXR001",
  name: "Ada Lovelace",
  code: "NXR001",
  userType: "normal",
  validEnable: true,
  validFrom: "2026-01-01T00:00:00",
  validTo: "2037-12-31T23:59:59",
  numOfFace: 1,
  numOfFP: 0,
  numOfCard: 1,
  doorNames: ["Puerta principal"],
  sourceName: "Recepción DS-K1T",
  sourceIp: "192.168.9.160",
};

const SUSPENDIDA = {
  id: "NXR002",
  name: "Grace Hopper",
  code: "NXR002",
  userType: "visitor",
  validEnable: false,
  validFrom: "2026-01-01T00:00:00",
  validTo: "2037-12-31T23:59:59",
  numOfFace: 0,
  numOfFP: 0,
  numOfCard: 0,
  doorNames: ["Almacén"],
};

/** Enruta por trozo de URL: el orden de las llamadas no debe importar. */
function servidor(overrides: Record<string, () => Response> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [frag, res] of Object.entries(overrides)) {
      if (url.includes(frag)) return res();
    }
    if (url.includes("/access")) {
      return json({
        personId: "NXR001",
        valid: { enable: true, beginTime: "2026-01-01T00:00:00", endTime: "2037-12-31T23:59:59" },
        validMode: "indefinite",
        doors: [
          {
            deviceIp: "192.168.9.160",
            deviceName: "Recepción DS-K1T",
            doorName: "Puerta principal",
            doorIndexCode: "192.168.9.160|1",
            present: true,
            doorNo: 1,
            planTemplateNo: "3",
            templateName: "Horario oficina",
          },
        ],
      });
    }
    if (/people\/[^/?]+(\?|$)/.test(url) && !url.includes("people?")) {
      return json({ id: "NXR001", name: "Ada Lovelace", numOfFace: 1, validEnable: true });
    }
    if (url.includes("integra/people")) return json({ items: [VIGENTE, SUSPENDIDA] });
    if (url.includes("integra/orgs")) return json({ items: [] });
    if (url.includes("integra/devices")) {
      return json({ items: [{ id: "1", name: "Recepción", kind: "ACS", ip: "192.168.9.160" }] });
    }
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function abrirFicha(nombre: string) {
  const usuario = userEvent.setup();
  await usuario.click(await screen.findByRole("button", { name: new RegExp(nombre) }));
  return usuario;
}

beforeEach(() => {
  reemplazar.mockClear();
  window.localStorage.clear();
});

describe("Personas · lo que se veía y no se entendía", () => {
  it("una persona suspendida se ve suspendida desde el listado", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    // La tarjeta lleva el estado en su nombre accesible: se lee sin abrir nada.
    expect(
      await screen.findByRole("button", { name: /Grace Hopper.*Suspendida/ }),
    ).toBeInTheDocument();
  });

  it("la ficha explica qué implica la vigencia, no solo la etiqueta", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    await abrirFicha("Grace Hopper");
    await waitFor(() =>
      expect(screen.getByText(/La vigencia está apagada a mano/)).toBeInTheDocument(),
    );
  });

  it("la ficha enseña el plan horario de cada puerta, que ya llegaba y se tiraba", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    await abrirFicha("Ada Lovelace");
    await waitFor(() => expect(screen.getByText("Horario oficina")).toBeInTheDocument());
    // La puerta se nombra en varios sitios de la ficha; basta con que el plan
    // esté colgado de una de ellas y no suelto.
    expect(screen.getAllByText(/Puerta principal/).length).toBeGreaterThan(0);
    expect(screen.getByText(/nº 3/)).toBeInTheDocument();
  });

  it("el detalle del terminal son pares clave-valor; el crudo queda plegado", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    await abrirFicha("Ada Lovelace");

    // Antes esto era el contenido principal: `<pre>{JSON.stringify(detail)}</pre>`.
    await waitFor(() => expect(screen.getByText("Rostros enrolados")).toBeInTheDocument());

    const plegable = screen.getByText(/Ver respuesta cruda/).closest("details");
    expect(plegable).toBeTruthy();
    expect(plegable?.open).toBe(false);
  });

  it("las credenciales dicen qué abre cada una y dónde vive el dato", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    await abrirFicha("Ada Lovelace");
    await waitFor(() =>
      expect(screen.getByText(/Abre mirando al terminal/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Abre acercando la tarjeta/)).toBeInTheDocument();
  });
});

describe("Personas · confirmar antes de romper algo", () => {
  it("borrar no usa el cuadro del navegador: abre un diálogo que dice qué se pierde", async () => {
    servidor();
    // Si algo llamara a window.confirm, la prueba lo cazaría aquí.
    const confirmNativo = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmNativo);

    render(<IntegraPeoplePage />);
    const usuario = await abrirFicha("Ada Lovelace");

    await usuario.click(
      await screen.findByRole("button", { name: /Eliminar de todos los terminales/ }),
    );

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/No se puede deshacer/)).toBeInTheDocument();
    expect(confirmNativo).not.toHaveBeenCalled();
  });

  it("se puede cancelar y no se manda nada al servidor", async () => {
    const fetchMock = servidor();
    render(<IntegraPeoplePage />);
    const usuario = await abrirFicha("Ada Lovelace");

    await usuario.click(
      await screen.findByRole("button", { name: /Eliminar de todos los terminales/ }),
    );
    const dialogo = await screen.findByRole("alertdialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE")).toBe(
      false,
    );
  });
});

describe("Personas · errores que dicen qué hacer", () => {
  it("un 403 se llama «no tienes permiso» y no ofrece reintentar", async () => {
    servidor({ "integra/people": () => json({ message: "" }, 403) });
    render(<IntegraPeoplePage />);

    expect(await screen.findByText("No tienes permiso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Volver a cargar/ })).toBeNull();
  });

  it("un 502 se llama «el servidor falló» y sí deja reintentar", async () => {
    servidor({ "integra/people": () => json({ message: "" }, 502) });
    render(<IntegraPeoplePage />);

    expect(await screen.findByText("El servidor falló")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volver a cargar/ })).toBeInTheDocument();
  });
});

describe("Personas · la vista se puede compartir", () => {
  it("cambiar a tabla y ordenar queda escrito en la URL", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: /Ver como tabla densa/ }));
    await waitFor(() =>
      expect(reemplazar).toHaveBeenCalledWith(
        expect.stringContaining("vista=tabla"),
        expect.anything(),
      ),
    );

    await usuario.selectOptions(
      screen.getByRole("combobox", { name: /Ordenar directorio por/ }),
      "vigencia",
    );
    await waitFor(() =>
      expect(reemplazar).toHaveBeenCalledWith(
        expect.stringContaining("orden=vigencia"),
        expect.anything(),
      ),
    );
  });

  it("filtrar por vigencia también viaja en la URL", async () => {
    servidor();
    render(<IntegraPeoplePage />);
    const usuario = userEvent.setup();

    await usuario.selectOptions(await screen.findByLabelText("Vigencia"), "off");
    await waitFor(() =>
      expect(reemplazar).toHaveBeenCalledWith(
        expect.stringContaining("estado=off"),
        expect.anything(),
      ),
    );
  });
});
