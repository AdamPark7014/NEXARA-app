import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartidaPropuesta, PropuestaCotizacion } from "@/lib/cotizaciones-api";

const interpretar = vi.fn();
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  interpretarCotizacion: (...args: unknown[]) => interpretar(...args),
}));
vi.mock("@/components/DictadoBoton", () => ({
  default: ({ onTexto }: { onTexto: (t: string) => void }) => (
    <button type="button" onClick={() => onTexto("14 cámaras")}>
      Dictar
    </button>
  ),
}));

import CotizarConIA from "./CotizarConIA";

const fila = (cambios: Partial<PartidaPropuesta>): PartidaPropuesta => ({
  fuente: "libre",
  name: "Partida",
  description: null,
  brand: null,
  model: null,
  unitCost: null,
  unitPrice: 0,
  grupo: null,
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: null,
  productCtId: null,
  pedido: "Partida",
  cantidad: 1,
  unidad: "Pieza",
  seguridad: "ninguna",
  alternativas: [],
  ...cambios,
});

const opcionMayorista = {
  fuente: "catalogo" as const,
  name: "Cámara Domo Dahua",
  description: null,
  brand: "Dahua",
  model: "HDW1500",
  unit: "Pieza",
  unitCost: 500,
  unitPrice: 0,
  grupo: "EQUIPOS",
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: 3,
  productCtId: 9,
};

const PROPUESTA: PropuestaCotizacion = {
  via: "ia",
  cliente: { salesClientId: 5, nombre: "Materiales Pronto", seguridad: "alta", parecidos: [] },
  proyecto: "Videovigilancia en bodega",
  segmento: "COMERCIAL",
  margen: null,
  margenPorOmision: 20,
  conIva: true,
  partidas: [
    fila({ pedido: "Cámara domo", name: "Cámara domo", cantidad: 14, seguridad: "media", alternativas: [opcionMayorista] }),
    fila({ pedido: "NVR 32 canales", name: "NVR 32 Canales IP 8K", model: "DHI-NVR5432", fuente: "usada", seguridad: "alta", unitPrice: 16000, unitCost: 16000, veces: 1, ultimaVez: "2026-10-21T12:00:00Z" }),
  ],
  complementos: [fila({ pedido: "Instalación de cámara", name: "Montaje de cámaras", fuente: "usada", seguridad: "alta", cantidad: 14, unidad: "Servicio", unitPrice: 250 })],
  parecida: null,
  avisos: ["Una partida no tiene precio: escríbelo aquí o después."],
};

function armar(props: Partial<React.ComponentProps<typeof CotizarConIA>> = {}) {
  const onUsar = vi.fn();
  const onPartirDe = vi.fn().mockResolvedValue(undefined);
  render(<CotizarConIA token="t" excluir={null} hayPartidas={false} moneda="MXN" onUsar={onUsar} onPartirDe={onPartirDe} {...props} />);
  return { onUsar, onPartirDe };
}

async function pedir() {
  await userEvent.type(screen.getByLabelText("Qué hay que cotizar"), "14 cámaras domo");
  await userEvent.click(screen.getByRole("button", { name: /Armar cotización/ }));
  await screen.findByText("Revísala antes de usarla");
}

describe("CotizarConIA", () => {
  beforeEach(() => {
    interpretar.mockReset();
    interpretar.mockResolvedValue(PROPUESTA);
  });

  it("sin texto no gasta nada", async () => {
    armar();
    expect(screen.getByRole("button", { name: /Armar cotización/ })).toBeDisabled();
    expect(interpretar).not.toHaveBeenCalled();
  });

  it("el dictado escribe en la caja", async () => {
    armar();
    await userEvent.click(screen.getByRole("button", { name: "Dictar" }));
    expect(screen.getByLabelText("Qué hay que cotizar")).toHaveValue("14 cámaras");
  });

  it("muestra cliente, proyecto y partidas, y nada se guarda hasta usarla", async () => {
    const { onUsar } = armar();
    await pedir();
    expect(interpretar).toHaveBeenCalledWith("t", "14 cámaras domo", { excluir: null });
    expect(screen.getByLabelText("Cliente")).toHaveValue("Materiales Pronto");
    expect(screen.getByLabelText("Proyecto")).toHaveValue("Videovigilancia en bodega");
    expect(screen.getByLabelText("Margen %")).toHaveValue("20");
    expect(screen.getByText("Ya le has cotizado")).toBeInTheDocument();
    expect(screen.getByText("Ya cotizada")).toBeInTheDocument();
    expect(onUsar).not.toHaveBeenCalled();
    expect(screen.getByText("1 partida sin precio: puedes ponerlo aquí o después")).toBeInTheDocument();
  });

  it("elegir una opción pone su precio con el margen y el total se mueve", async () => {
    armar();
    await pedir();
    expect(screen.getByTestId("cotizar-ia-total").textContent).toContain("16,000");
    const opciones = screen.getByRole("group", { name: "Opciones para Cámara domo" });
    const boton = within(opciones).getByRole("button", { name: /Dahua HDW1500/ });
    await userEvent.click(boton);
    expect(boton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Precio de Cámara domo")).toHaveValue("600.00");
    expect(screen.getByTestId("cotizar-ia-total").textContent).toContain("24,400");
    expect(screen.getByText("Todas con precio")).toBeInTheDocument();
  });

  it("cambiar el margen recalcula lo del mayorista y no lo ya cotizado", async () => {
    armar();
    await pedir();
    await userEvent.click(within(screen.getByRole("group", { name: "Opciones para Cámara domo" })).getByRole("button", { name: /Dahua HDW1500/ }));
    const margen = screen.getByLabelText("Margen %");
    await userEvent.clear(margen);
    await userEvent.type(margen, "10");
    expect(screen.getByLabelText("Precio de Cámara domo")).toHaveValue("550.00");
    expect(screen.getByLabelText("Precio de NVR 32 canales")).toHaveValue("16,000.00");
  });

  it("marcar un extra suma; usar entrega lo editado", async () => {
    const { onUsar } = armar();
    await pedir();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByTestId("cotizar-ia-total").textContent).toContain("19,500");

    const cantidad = screen.getByLabelText("Cantidad de NVR 32 canales");
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, "2");
    const proyecto = screen.getByLabelText("Proyecto");
    await userEvent.clear(proyecto);
    await userEvent.type(proyecto, "CCTV de bodega");

    await userEvent.click(screen.getByRole("button", { name: "Usar en la cotización" }));
    const datos = onUsar.mock.calls[0]![0];
    expect(datos.proyecto).toBe("CCTV de bodega");
    expect(datos.cliente).toEqual({ salesClientId: 5, nombre: "Materiales Pronto" });
    expect(datos.filas.find((f: { pedido: string }) => f.pedido === "NVR 32 canales").cantidad).toBe(2);
    expect(datos.filas.filter((f: { incluida: boolean }) => f.incluida)).toHaveLength(3);
  });

  it("escribir otro nombre de cliente lo desliga", async () => {
    const { onUsar } = armar();
    await pedir();
    const cliente = screen.getByLabelText("Cliente");
    await userEvent.clear(cliente);
    await userEvent.type(cliente, "Otro Cliente");
    expect(screen.getByText("Cliente nuevo: se guarda como texto")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usar en la cotización" }));
    expect(onUsar.mock.calls[0]![0].cliente).toEqual({ salesClientId: null, nombre: "Otro Cliente" });
  });

  it("sin nombre de cliente no se puede usar", async () => {
    armar();
    await pedir();
    await userEvent.clear(screen.getByLabelText("Cliente"));
    expect(screen.getByRole("button", { name: "Usar en la cotización" })).toBeDisabled();
  });

  it("si parece otro cliente, se elige con un clic", async () => {
    interpretar.mockResolvedValue({ ...PROPUESTA, cliente: { salesClientId: null, nombre: "Materiales P", seguridad: "media", parecidos: [{ id: 5, nombre: "Materiales Pronto" }] } });
    const { onUsar } = armar();
    await pedir();
    await userEvent.click(screen.getByRole("button", { name: "Materiales Pronto" }));
    await userEvent.click(screen.getByRole("button", { name: "Usar en la cotización" }));
    expect(onUsar.mock.calls[0]![0].cliente).toEqual({ salesClientId: 5, nombre: "Materiales Pronto" });
  });

  it("quitar saca el renglón; descartar deja la caja como estaba", async () => {
    armar();
    await pedir();
    await userEvent.click(screen.getByRole("button", { name: "Quitar NVR 32 canales" }));
    expect(screen.queryByLabelText("Precio de NVR 32 canales")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByText("Revísala antes de usarla")).toBeNull();
    expect(screen.getByLabelText("Qué hay que cotizar")).toHaveValue("14 cámaras domo");
  });

  it("ofrece partir de una casi igual, con el cliente solo si se dijo", async () => {
    interpretar.mockResolvedValue({ ...PROPUESTA, parecida: { id: 48, folio: "COT-48", cliente: "Hotel Aurora", proyecto: null, enComun: 5, deLineas: 5 } });
    const { onPartirDe } = armar();
    await pedir();
    expect(screen.getByText(/Se parece a COT-48 de Hotel Aurora: 5 de 5 partidas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Partir de esa" }));
    await waitFor(() => expect(onPartirDe).toHaveBeenCalledWith(48, { salesClientId: 5, nombre: "Materiales Pronto" }));
  });

  it("si falla el servidor lo dice y el texto sigue ahí", async () => {
    interpretar.mockRejectedValue(new Error("Sin conexión"));
    armar();
    await userEvent.type(screen.getByLabelText("Qué hay que cotizar"), "14 cámaras");
    await userEvent.click(screen.getByRole("button", { name: /Armar cotización/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByLabelText("Qué hay que cotizar")).toHaveValue("14 cámaras");
  });

  it("con partidas ya capturadas se quita, salvo que haya una propuesta abierta", async () => {
    const { rerender } = render(<CotizarConIA token="t" excluir={null} hayPartidas moneda="MXN" onUsar={vi.fn()} onPartirDe={vi.fn()} />);
    expect(screen.queryByTestId("cotizar-con-ia")).toBeNull();
    rerender(<CotizarConIA token="t" excluir={null} hayPartidas={false} moneda="MXN" onUsar={vi.fn()} onPartirDe={vi.fn()} />);
    await pedir();
    rerender(<CotizarConIA token="t" excluir={null} hayPartidas moneda="MXN" onUsar={vi.fn()} onPartirDe={vi.fn()} />);
    expect(screen.getByText("Revísala antes de usarla")).toBeInTheDocument();
  });
});
