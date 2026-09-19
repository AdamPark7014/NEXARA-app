import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CotizacionDetallePage from "./page";

/**
 * El editor: la propuesta en el orden del documento, autoguardado de lo que cambia, captura rápida
 * de partidas con total en vivo y envío por correo con copia.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/cotizaciones/7",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ id: "7" }),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Luis Joel Aguilar" }, token: "jwt" }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const DETALLE = {
  id: 7,
  folio: "NEX-LJ75100126-0007",
  quoteNumber: "NEX-LJ75100126-0007",
  folioBase: "NEX-LJ75100126-0007",
  conNomenclatura: true,
  necesitaRefolio: false,
  estado: "BORRADOR",
  estadoEtiqueta: "Borrador",
  bloqueada: false,
  segmento: "COMERCIAL",
  segmentoEtiqueta: "Comercial",
  revision: 1,
  issueDate: "2026-09-18T00:00:00.000Z",
  validUntil: "2026-10-03T00:00:00.000Z",
  clientName: "Plaza Norte",
  clientEmail: "compras@plazanorte.mx",
  clientPhone: "222 123 4567",
  projectName: "Renovación del CCTV",
  scope: "",
  objetivo: "",
  objetivoPartes: { intro: "", beneficios: [], cierre: "" },
  objetivoSugerido: {
    intro: "Este proyecto permitirá contar con una solución tecnológica confiable.",
    beneficios: ["Mayor cobertura con la incorporación de 2 equipos nuevos."],
    cierre: "Como resultado, el cliente dispondrá de una solución con mayor cobertura.",
  },
  alcanceBloques: [],
  planos: [],
  depositPercent: 50,
  currency: "MXN",
  subtotal: 200,
  taxTotal: 32,
  total: 232,
  incluyeInstalacion: false,
  terminos: {
    modalidad: "SUMINISTRO",
    titulo: "Términos y condiciones",
    lineas: [],
    partes: [
      { clave: "pago", titulo: "Forma de pago", texto: "Se requiere un 50 % de anticipo.", personalizado: false },
      { clave: "alcance", titulo: "Alcance de la cotización", texto: "Solo suministro.", personalizado: false },
    ],
  },
  terminosBase: {
    modalidad: "SUMINISTRO",
    titulo: "Términos y condiciones",
    lineas: [],
    partes: [
      { clave: "pago", titulo: "Forma de pago", texto: "Se requiere un 50 % de anticipo.", personalizado: false },
      { clave: "alcance", titulo: "Alcance de la cotización", texto: "Solo suministro.", personalizado: false },
    ],
  },
  grupos: [],
  totalesPorGrupo: { EQUIPOS: 200, MATERIALES: 0, MANO_DE_OBRA: 0 },
  items: [{ id: 1, name: "Cámara bala 2 MP", unit: "Pieza", qty: 2, unitPrice: 100, discount: 0, tax: 16 }],
  elaboro: { id: 1, nombre: "Luis Joel Aguilar", clave: "LJ75100126", siglas: "LJ" },
  participantes: [
    {
      userId: 1,
      nombre: "Luis Joel Aguilar",
      clave: "LJ75100126",
      siglas: "LJ",
      rol: "ELABORO",
      rolEtiqueta: "Elaboró",
      at: "2026-09-18T00:00:00.000Z",
    },
  ],
  actividades: [],
};

function servidor() {
  const llamadas: Array<{ metodo: string; url: string; cuerpo: unknown }> = [];
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    llamadas.push({ metodo, url, cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("cotizaciones/core/7")) return json(DETALLE);
    if (url.includes("cotizaciones/plantillas")) return json([]);
    if (url.includes("cotizaciones/paquetes")) return json([]);
    if (url.includes("cotizaciones/7/versiones")) return json([]);
    if (url.includes("cotizaciones/7/send")) return json({ id: 7, quoteNumber: "NEX-LJ75100126-0007" });
    if (metodo === "PUT" && url.includes("cotizaciones/7")) return json({ id: 7, quoteNumber: DETALLE.folio });
    if (url.includes("smart-quote")) return json({ message: "sin catálogo" }, 503);
    return json({ message: "no esperado" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

describe("editor de cotización", () => {
  it("se lee como la propuesta: portada, 01 Objetivo, 02 Alcance, 03 Planos, 04 Cotización", async () => {
    servidor();
    render(<CotizacionDetallePage />);
    expect(await screen.findByRole("heading", { name: /01\. Objetivo del proyecto/ })).toBeInTheDocument();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos.slice(0, 6)).toEqual([
      "Portada",
      "Personalizar",
      "01. Objetivo del proyecto",
      "02. Alcance del proyecto",
      "03. Planos",
      "04. Cotización",
    ]);
    expect(screen.getAllByText("NEX-LJ75100126-0007").length).toBeGreaterThan(0);
    // El título del proyecto está en la portada y como encabezado de 02, como en el PDF.
    expect(screen.getAllByDisplayValue("Renovación del CCTV")).toHaveLength(2);
    // Lo que el PDF pondría si se deja vacío.
    expect(screen.getByText("Mayor cobertura con la incorporación de 2 equipos nuevos.")).toBeInTheDocument();
  });

  it("guarda solo lo que cambió, un momento después de escribir", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<CotizacionDetallePage />);
    const beneficio = await screen.findByRole("button", { name: "+ Agregar beneficio" });
    await user.click(beneficio);
    await user.type(screen.getByLabelText("Beneficio 1"), "Monitoreo remoto desde Hik-Connect.");

    await waitFor(
      () => {
        const puts = llamadas.filter((l) => l.metodo === "PUT");
        expect(puts.at(-1)?.cuerpo).toEqual({ objetivo: "Beneficios:\n1. Monitoreo remoto desde Hik-Connect." });
      },
      { timeout: 4000 },
    );
    expect(await screen.findByText(/^Guardado ·/, {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("captura rápida: Enter agrega la partida y el total se recalcula con IVA", async () => {
    servidor();
    const user = userEvent.setup();
    render(<CotizacionDetallePage />);
    const descripcion = await screen.findByLabelText("Descripción de la nueva partida");
    await user.type(descripcion, "Instalación de cámara");
    await user.selectOptions(screen.getByLabelText("Unidad de la nueva partida"), "Servicio");
    await user.clear(screen.getByLabelText("Cantidad de la nueva partida"));
    await user.type(screen.getByLabelText("Cantidad de la nueva partida"), "2");
    await user.type(screen.getByLabelText("Precio unitario de la nueva partida"), "1000{Enter}");

    expect(screen.getByLabelText("Descripción de la partida 2")).toHaveValue("Instalación de cámara");
    expect(screen.getByLabelText("Unidad de la partida 2")).toHaveValue("Servicio");
    // (2 × 100 + 2 × 1000) × 1.16
    expect(screen.getByTestId("total-cotizacion")).toHaveTextContent("2,552.00");
    // El renglón de captura queda listo para la siguiente.
    expect(screen.getByLabelText("Descripción de la nueva partida")).toHaveValue("");
  });

  it("partidas como hoja de cálculo: Enter agrega fila debajo, ↑↓ cambian de fila, el grupo va en el menú", async () => {
    servidor();
    const user = userEvent.setup();
    render(<CotizacionDetallePage />);
    const primera = await screen.findByLabelText("Descripción de la partida 1");
    await user.click(primera);
    await user.keyboard("{Enter}");
    const segunda = screen.getByLabelText("Descripción de la partida 2");
    expect(segunda).toHaveFocus();
    expect(segunda).toHaveValue("");
    await user.keyboard("Balún pasivo{Tab}");
    expect(screen.getByLabelText("Unidad de la partida 2")).toHaveFocus();
    await user.click(screen.getByLabelText("Cantidad de la partida 2"));
    await user.keyboard("{ArrowUp}");
    expect(screen.getByLabelText("Cantidad de la partida 1")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Opciones de la partida 2" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Mano de obra" }));
    await user.click(screen.getByRole("button", { name: "Opciones de la partida 2" }));
    expect(screen.getByRole("menuitemradio", { name: "Mano de obra" })).toHaveAttribute("aria-checked", "true");
  });

  it("Personalizar: apagar 03 Planos la deja en una línea y se guarda en las opciones", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<CotizacionDetallePage />);
    await user.click(await screen.findByRole("button", { name: "Ajustar" }));
    await user.click(screen.getByRole("switch", { name: /03 Planos/ }));
    expect(screen.getByText("No va en el PDF de esta cotización (Personalizar).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Incluir" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "USD · dólares" }));

    await waitFor(
      () => {
        const puts = llamadas.filter((l) => l.metodo === "PUT");
        expect(puts.at(-1)?.cuerpo).toMatchObject({ currency: "USD", opciones: { secciones: { planos: false } } });
      },
      { timeout: 4000 },
    );
  });

  it("envía por correo con copia y mensaje", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<CotizacionDetallePage />);
    await user.click(await screen.findByRole("button", { name: /Enviar por correo/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Enviar por correo" });
    expect(within(dialogo).getByLabelText("Para")).toHaveValue("compras@plazanorte.mx");
    await user.type(within(dialogo).getByLabelText("Con copia (opcional)"), "jefe@plazanorte.mx, gerencia@nexara.com.mx");
    expect(within(dialogo).getByText(/Sale como/)).toHaveTextContent("NEX-LJ75100126-0007");
    await user.click(within(dialogo).getByRole("button", { name: "Enviar" }));

    await waitFor(() => {
      const envio = llamadas.find((l) => l.url.includes("/send"));
      expect(envio?.cuerpo).toMatchObject({
        email: "compras@plazanorte.mx",
        cc: ["jefe@plazanorte.mx", "gerencia@nexara.com.mx"],
      });
      expect(String((envio?.cuerpo as { message: string }).message)).toContain("Plaza Norte");
    });
    expect(await screen.findByText(/Enviada a compras@plazanorte.mx/)).toBeInTheDocument();
  });
});
