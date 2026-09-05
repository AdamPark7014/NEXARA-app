import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegraVehiclesPage from "./page";

/**
 * Lo que estas pruebas protegen.
 *
 * 1. `PATCH /integra/vehicles/:id` acepta `personId` desde siempre; la pantalla
 *    vieja solo mandaba `plateNo`, así que el dueño no se podía corregir. Si
 *    alguien vuelve a quitar ese campo, aquí se cae.
 * 2. El alta es un `upsert`: repetir placa pisa la ficha anterior. El botón
 *    tiene que quedarse bloqueado antes de que eso ocurra.
 * 3. Nada de `confirm()` del navegador: el borrado pasa por el diálogo del
 *    producto, que además dice qué placa se va a llevar por delante.
 */

const reemplazar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  usePathname: () => "/integra/vehicles",
  useSearchParams: () => new URLSearchParams(""),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VEHICULOS = [
  { id: "local-ABC123", plate: "ABC-123", personId: "1001", personName: "Ada Lovelace" },
  { id: "local-XYZ999", plate: "XYZ999", personId: null, personName: null },
];

const PERSONAS = [
  { id: "1001", name: "Ada Lovelace", code: "E-01" },
  { id: "1002", name: "Grace Hopper" },
];

const NOTA_SYNC =
  "Lista NEXARA. El NVR/PTZ de Oficinas no acepta OCR ANPR (403); las placas no se empujan al equipo.";

type Opciones = {
  vehiculos?: unknown[];
  personas?: unknown[] | "falla";
  notaSync?: string | null;
};

function servidor({ vehiculos = VEHICULOS, personas = PERSONAS, notaSync = NOTA_SYNC }: Opciones = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = (init?.method || "GET").toUpperCase();
    if (url.includes("integra/people")) {
      if (personas === "falla") return json({ statusCode: 403, message: "Sin permiso" }, 403);
      return json({ total: personas.length, items: personas });
    }
    if (url.includes("integra/vehicles")) {
      if (metodo === "GET") {
        return json({
          total: vehiculos.length,
          source: "mirror",
          syncNote: notaSync ?? undefined,
          items: vehiculos,
        });
      }
      return json({ success: true, deviceSync: false });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Vehículos · nada en inglés ni `confirm()` del navegador", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("las acciones de fila son botones con nombre en español y sin texto suelto", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    expect(
      screen.getByRole("button", { name: "Editar la placa ABC-123" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Eliminar la placa ABC-123" }),
    ).toBeInTheDocument();
    // Los rótulos viejos ya no existen en ninguna parte.
    for (const viejo of ["Edit", "Del", "OK", "Refresh"]) {
      expect(screen.queryByRole("button", { name: viejo })).not.toBeInTheDocument();
    }
  });

  it("borrar abre el diálogo del producto, que nombra la placa y a su dueño", async () => {
    const fetchMock = servidor();
    // Si alguien reintroduce `confirm()`, esto lo caza.
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");
    await userEvent.click(screen.getByRole("button", { name: "Eliminar la placa ABC-123" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("ABC-123");
    expect(dialogo).toHaveTextContent("Ada Lovelace");
    expect(dialogo).toHaveTextContent(/no se puede deshacer/i);
    expect(confirmSpy).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialogo).getByRole("button", { name: /Eliminar placa/i }),
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("local-ABC123") &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("cancelar el diálogo no borra nada", async () => {
    const fetchMock = servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");
    await userEvent.click(screen.getByRole("button", { name: "Eliminar la placa ABC-123" }));

    const dialogo = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: /Cancelar/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
  });
});

describe("Vehículos · validación de placa antes de que el upsert pise una ficha", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("con el campo vacío no se puede guardar", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    expect(screen.getByRole("button", { name: /Agregar placa/i })).toBeDisabled();
  });

  it("una placa repetida bloquea el alta y explica que sobrescribiría", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    // Escrita distinta a propósito: el servidor la normaliza a la misma clave.
    await userEvent.type(screen.getByLabelText(/^Placa/i), "abc 123");

    expect(await screen.findByText(/sobrescribiría la actual/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar placa/i })).toBeDisabled();
  });

  it("una placa sin letras ni números se rechaza al salir del campo", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    const campo = screen.getByLabelText(/^Placa/i);
    await userEvent.type(campo, "---");
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/identificador/i);
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });

  it("una placa corta avisa pero deja guardar", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    await userEvent.type(screen.getByLabelText(/^Placa/i), "AB1");

    expect(await screen.findByText(/3 caracteres útiles/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar placa/i })).toBeEnabled();
  });

  it("manda la placa normalizada, no lo que se tecleó", async () => {
    const fetchMock = servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    await userEvent.type(screen.getByLabelText(/^Placa/i), "  qwe-987 ");
    await userEvent.click(screen.getByRole("button", { name: /Agregar placa/i }));

    await waitFor(() => {
      const alta = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(alta).toBeDefined();
      expect(JSON.parse(String((alta?.[1] as RequestInit).body))).toEqual({
        plateNo: "QWE-987",
      });
    });
  });
});

describe("Vehículos · el dueño por fin se puede corregir", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("editar carga la ficha en el formulario con su dueño puesto", async () => {
    servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    await userEvent.click(screen.getByRole("button", { name: "Editar la placa ABC-123" }));

    expect(screen.getByLabelText(/^Placa/i)).toHaveValue("ABC-123");
    expect(screen.getByLabelText(/Persona dueña/i)).toHaveValue("1001");
    expect(screen.getByRole("button", { name: /Guardar cambios/i })).toBeInTheDocument();
  });

  it("el PATCH lleva `personId`, que es lo que la pantalla vieja no mandaba", async () => {
    const fetchMock = servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    await userEvent.click(screen.getByRole("button", { name: "Editar la placa ABC-123" }));
    await userEvent.selectOptions(screen.getByLabelText(/Persona dueña/i), "1002");
    await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeDefined();
      expect(String(patch?.[0])).toContain("local-ABC123");
      expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
        plateNo: "ABC-123",
        personId: "1002",
      });
    });
  });

  it("quitar el dueño manda cadena vacía, que es como el servidor lo borra", async () => {
    const fetchMock = servidor();
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    await userEvent.click(screen.getByRole("button", { name: "Editar la placa ABC-123" }));
    await userEvent.selectOptions(screen.getByLabelText(/Persona dueña/i), "");
    await userEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
      );
      // `personId: ''` → el servidor hace `personId || null`. `undefined` lo
      // habría dejado como estaba.
      expect(JSON.parse(String((patch?.[1] as RequestInit).body)).personId).toBe("");
    });
  });

  it("un dueño que ya no está en el padrón se marca en vez de disimularse", async () => {
    servidor({
      vehiculos: [
        { id: "local-QQQ", plate: "QQQ111", personId: "9999", personName: "Fulanito" },
      ],
    });
    render(<IntegraVehiclesPage />);

    expect(await screen.findByText("Fulanito")).toBeInTheDocument();
    expect(screen.getByText(/Ya no está en el padrón/i)).toBeInTheDocument();
  });

  it("si el padrón no carga se puede seguir dando de alta, y se dice por qué no hay dueños", async () => {
    servidor({ personas: "falla" });
    render(<IntegraVehiclesPage />);
    await screen.findByText("ABC-123");

    expect(screen.getByLabelText(/Persona dueña/i)).toBeDisabled();
    expect(await screen.findByText(/No tienes permiso: puedes guardar la placa/i)).toBeInTheDocument();
  });
});

describe("Vehículos · estados vacíos, avisos y errores", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("sin placas explica para qué sirve la pantalla y qué NO hace", async () => {
    servidor({ vehiculos: [] });
    render(<IntegraVehiclesPage />);

    expect(
      await screen.findByText(/Todavía no hay ninguna placa registrada/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no se empujan a las cámaras/i)).toBeInTheDocument();
  });

  it("la nota de sincronización del servidor se ve como aviso, no como letra gris", async () => {
    servidor();
    render(<IntegraVehiclesPage />);

    expect(await screen.findByText(NOTA_SYNC)).toBeInTheDocument();
  });

  it("un servidor caído se distingue de un problema de permisos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<IntegraVehiclesPage />);

    expect(await screen.findByText("El servidor no responde")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("un 403 al listar no ofrece reintentar, porque no serviría", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ statusCode: 403, message: "Tu rol (tecnico) no puede acceder" }, 403),
      ),
    );
    render(<IntegraVehiclesPage />);

    expect(await screen.findByText("No tienes permiso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reintentar/i })).not.toBeInTheDocument();
  });
});
