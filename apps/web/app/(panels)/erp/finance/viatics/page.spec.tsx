import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ViaticosPage from "./page";

/**
 * La asignación de viáticos en lote.
 *
 * Dos cosas se prueban aquí y no en el servidor, porque son de pantalla: la
 * cuenta que se enseña antes de confirmar —personas × monto— y que el botón no
 * deje mandar un lote al que le falta algo. La primera es la defensa contra el
 * error que de verdad cuesta dinero: capturar el TOTAL del lote creyendo que
 * el campo es por cabeza.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/finance/viatics",
  useSearchParams: () => new URLSearchParams(""),
}));

// Super-admin: `getErpViaticsAdminSectionConfig` le da `canAssign: true` y
// `canCreate: false` — el CEO autoriza y asigna, no solicita.
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 1, nombre: "Adam Pozos", email: "adam@nexara.mx", token: "jwt", isSuperAdmin: true },
    isContextReady: true,
  }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PERSONAS = [
  { id: 11, nombre: "Ada Lovelace", puesto: "Técnica" },
  { id: 12, nombre: "Beto Ruiz", puesto: "Técnico" },
  { id: 13, nombre: "Carla Díaz", puesto: "Supervisora" },
  { id: 14, nombre: "Dani Soto", puesto: "Chofer" },
];

const ACTIVIDADES = [
  { id: 101, anNumber: "AN-101", titulo: "Mantenimiento Plaza Norte" },
  { id: 102, anNumber: "AN-102", titulo: "Cámaras Hotel Centro" },
  { id: 103, anNumber: "AN-103", titulo: "Acceso Escuela Sur" },
  { id: 104, anNumber: "AN-104", titulo: "Ronda Tehuacán" },
  { id: 105, anNumber: "AN-105", titulo: "Revisión Puebla" },
];

type Llamada = { url: string; method: string; body: Record<string, unknown> | null };

/**
 * Un viático ya existente para que la pantalla pinte su barra de filtros: sin
 * ni una fila, la barra no se dibuja (regla 8 del contrato de finanzas) y el
 * botón de asignar solo vive en el estado vacío.
 */
const VIATICO_EXISTENTE = {
  id: 7,
  motivo: "Casetas Puebla",
  montoSolicitado: 400,
  estatus: "Aprobado",
  fechaSolicitud: "2026-09-14T12:00:00.000Z",
  usuario: { id: 12, nombre: "Beto Ruiz" },
};

function servidor(respuestaLote?: unknown) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const l: Llamada = {
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      };
      llamadas.push(l);
      // El más específico primero: `viatics/assign/lote` también contiene
      // «viatics» y la lista se lo tragaría.
      if (l.url.includes("viatics/assign/lote")) {
        return json(
          respuestaLote ?? {
            creados: 4,
            montoPorPersona: 800,
            montoTotal: 3200,
            actividadesCubiertas: 5,
            viaticos: [],
          },
        );
      }
      if (l.url.includes("users/assignable")) return json(PERSONAS);
      if (l.url.includes("activities")) return json(ACTIVIDADES);
      if (l.url.includes("ventas/proyectos")) return json([{ id: 5, name: "Plaza Norte" }]);
      if (l.url.includes("vehicles/inventory")) return json([]);
      if (l.url.includes("viatics")) return json([VIATICO_EXISTENTE]);
      return json({ message: `no esperado: ${l.url}` }, 500);
    }),
  );
  return llamadas;
}

/** Abre el modal y espera a que lleguen los catálogos de personas y actividades. */
async function abrirAsignacion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Asignar viático" }));
  const modal = await screen.findByRole("dialog");
  await within(modal).findByRole("button", { name: /Ada Lovelace/ });
  return modal;
}

const listaDe = (modal: HTMLElement, que: string) =>
  within(modal).getByRole("group", { name: `Lista de ${que}` });

const elegir = async (
  user: ReturnType<typeof userEvent.setup>,
  lista: HTMLElement,
  nombre: RegExp,
) => user.click(within(lista).getByRole("button", { name: nombre }));

describe("asignación de viáticos en lote", () => {
  it("multiplica personas por monto y dice entre cuántas actividades se reparte", async () => {
    servidor();
    const user = userEvent.setup();
    render(<ViaticosPage />);

    const modal = await abrirAsignacion(user);
    const personas = listaDe(modal, "beneficiarios");
    for (const quien of [/Ada Lovelace/, /Beto Ruiz/, /Carla Díaz/, /Dani Soto/]) {
      await elegir(user, personas, quien);
    }
    await user.type(within(modal).getByLabelText(/Monto por persona/), "800");
    const actividades = listaDe(modal, "actividades");
    for (const acta of [/AN-101/, /AN-102/, /AN-103/, /AN-104/, /AN-105/]) {
      await elegir(user, actividades, acta);
    }

    // La frase completa: 4 × 800 son 3,200 en total, no 800 repartidos.
    expect(within(modal).getByRole("status")).toHaveTextContent(
      "4 personas × $800.00 = $3,200.00, repartido entre 5 actividades",
    );
    // Y la misma cifra en el botón, que es donde se mira al final.
    expect(within(modal).getByRole("button", { name: /^Confirmar/ })).toHaveTextContent(
      "Confirmar $3,200.00",
    );
  });

  it("con una sola persona no pluraliza ni habla de reparto", async () => {
    servidor();
    const user = userEvent.setup();
    render(<ViaticosPage />);

    const modal = await abrirAsignacion(user);
    await elegir(user, listaDe(modal, "beneficiarios"), /Ada Lovelace/);
    await user.type(within(modal).getByLabelText(/Monto por persona/), "1250.50");
    await elegir(user, listaDe(modal, "actividades"), /AN-101/);

    expect(within(modal).getByRole("status")).toHaveTextContent(
      "1 persona × $1,250.50 = $1,250.50, sobre 1 actividad",
    );
  });

  it("no deja confirmar mientras falten beneficiarios, monto o el vínculo", async () => {
    servidor();
    const user = userEvent.setup();
    render(<ViaticosPage />);

    const modal = await abrirAsignacion(user);
    const confirmar = within(modal).getByRole("button", { name: /^Confirmar/ });

    // Recién abierto no falta una cosa: faltan las tres, y se dicen todas.
    expect(confirmar).toBeDisabled();
    expect(within(modal).getByText(/Para poder asignar/)).toHaveTextContent(
      "elige al menos un beneficiario; captura el monto por persona; liga el viático a una actividad o a un proyecto",
    );

    // Con beneficiarios pero sin monto, sigue sin poder mandarse.
    await elegir(user, listaDe(modal, "beneficiarios"), /Ada Lovelace/);
    expect(confirmar).toBeDisabled();
    expect(within(modal).getByText(/Para poder asignar/)).toHaveTextContent(
      "captura el monto por persona",
    );

    // Con monto pero sin actividad ni proyecto, tampoco: es regla del servidor.
    await user.type(within(modal).getByLabelText(/Monto por persona/), "800");
    expect(confirmar).toBeDisabled();
    expect(within(modal).getByText(/Para poder asignar/)).toHaveTextContent(
      "liga el viático a una actividad o a un proyecto",
    );

    // Un proyecto basta como vínculo: no hace falta elegir actividades.
    await user.selectOptions(within(modal).getByLabelText(/Proyecto/), "5");
    expect(confirmar).toBeEnabled();

    // Y si se quita el único beneficiario, vuelve a bloquearse.
    await user.click(within(modal).getByRole("button", { name: "Quitar Ada Lovelace" }));
    expect(confirmar).toBeDisabled();
  });

  it("manda el monto POR PERSONA, no el total, y el periodo de la semana elegida", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<ViaticosPage />);

    const modal = await abrirAsignacion(user);
    await elegir(user, listaDe(modal, "beneficiarios"), /Ada Lovelace/);
    await elegir(user, listaDe(modal, "beneficiarios"), /Beto Ruiz/);
    await user.type(within(modal).getByLabelText(/Monto por persona/), "800");
    await elegir(user, listaDe(modal, "actividades"), /AN-101/);
    await elegir(user, listaDe(modal, "actividades"), /AN-102/);
    await user.click(within(modal).getByRole("button", { name: "Esta semana" }));
    await user.click(within(modal).getByRole("button", { name: /^Confirmar/ }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes("viatics/assign/lote"))).toBe(true);
    });
    const lote = llamadas.find((l) => l.url.includes("viatics/assign/lote"))!;
    expect(lote.method).toBe("POST");
    // 800 es lo de cada uno: el total (1,600) lo calcula el servidor.
    expect(lote.body).toMatchObject({
      usuarioIds: [11, 12],
      actividadIds: [101, 102],
      montoPorPersona: 800,
    });
    // El atajo «esta semana» llena lunes y domingo, en ese orden.
    const { desde, hasta } = lote.body as { desde: string; hasta: string };
    expect(new Date(`${desde}T00:00:00`).getDay()).toBe(1);
    expect(new Date(`${hasta}T00:00:00`).getDay()).toBe(0);
    expect(new Date(hasta).getTime() - new Date(desde).getTime()).toBe(6 * 24 * 60 * 60 * 1000);

    // Al terminar, el modal se cierra y la lista se vuelve a pedir.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("buscar filtra la lista sin desmarcar a quien ya estaba elegido", async () => {
    servidor();
    const user = userEvent.setup();
    render(<ViaticosPage />);

    const modal = await abrirAsignacion(user);
    await elegir(user, listaDe(modal, "beneficiarios"), /Ada Lovelace/);
    await user.type(within(modal).getByLabelText("Buscar beneficiarios"), "carla");

    const personas = listaDe(modal, "beneficiarios");
    expect(within(personas).queryByRole("button", { name: /Ada Lovelace/ })).toBeNull();
    expect(within(personas).getByRole("button", { name: /Carla Díaz/ })).toBeInTheDocument();
    // La ficha de Ada sigue arriba: lo elegido no se pierde al buscar.
    expect(within(modal).getByRole("button", { name: "Quitar Ada Lovelace" })).toBeInTheDocument();
  });
});
