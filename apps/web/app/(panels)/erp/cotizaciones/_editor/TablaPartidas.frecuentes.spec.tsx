import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TablaPartidas from "./TablaPartidas";
import { crearAviso } from "@/lib/aviso-costo-ct";
import { partidaNueva, totalesDePartidas, type PartidaEditor } from "@/lib/cotizacion-documento";
import { buscarPartidasFrecuentes, type PartidaFrecuente } from "@/lib/cotizaciones-api";
import { smartQuoteSearch } from "@/lib/smart-quote-api";

vi.mock("@/lib/smart-quote-api", () => ({ smartQuoteSearch: vi.fn() }));
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  buscarPartidasFrecuentes: vi.fn(),
}));

/**
 * «Partidas frecuentes»: lo que ya se cotizó se ofrece al escribir en «Nueva partida» y entra con
 * los datos de su última vez. Adam lo pidió con una condición: el margen queda vacío, porque en la
 * cotización nueva puede ser otro.
 */
const SWITCH: PartidaFrecuente = {
  name: "Switch Cisco Meraki MS130-48X",
  description: "Switch administrable en la nube, 48 puertos PoE+.",
  brand: "Cisco Meraki",
  model: "MS130-48X",
  unit: "Pieza",
  unitCost: 1000,
  unitPrice: 1250,
  imagenUrl: null,
  grupo: "EQUIPOS",
  veces: 3,
  ultimaVez: "2026-09-20T10:00:00.000Z",
};

const OFERTA = {
  id: "ct-1",
  nombre: "Switch TP-Link 24 puertos",
  marca: "TP-Link",
  modelo: "TL-SG1024",
  precio: 1800,
  costMxn: 1500,
  sellPriceSuggested: 1900,
  stockTotal: 4,
};

function Editor({ alCambiar, cotizacionId = 77 }: { alCambiar?: (p: PartidaEditor[]) => void; cotizacionId?: number }) {
  const [partidas, setPartidas] = useState<PartidaEditor[]>([]);
  alCambiar?.(partidas);
  return (
    <div>
      <TablaPartidas
        partidas={partidas}
        setPartidas={setPartidas}
        editable
        moneda="MXN"
        token="token-de-prueba"
        totales={totalesDePartidas(partidas)}
        cotizacionId={cotizacionId}
      />
      <button type="button">Fuera de la tabla</button>
    </div>
  );
}

const ultimas = (f: ReturnType<typeof vi.fn>) => f.mock.calls.at(-1)![0] as PartidaEditor[];
const nueva = () => screen.getByLabelText("Descripción de la nueva partida");

beforeEach(() => {
  vi.mocked(buscarPartidasFrecuentes).mockReset().mockResolvedValue([SWITCH]);
  vi.mocked(smartQuoteSearch)
    .mockReset()
    .mockResolvedValue({ data: [OFERTA] } as unknown as Awaited<ReturnType<typeof smartQuoteSearch>>);
});

describe("TablaPartidas · partidas frecuentes («Usadas antes»)", () => {
  it("desde la segunda letra ofrece lo ya cotizado, rotulado, con las veces y el último precio, antes del catálogo", async () => {
    render(<Editor />);
    await userEvent.type(nueva(), "swi");

    const lista = await screen.findByRole("listbox", { name: "Sugerencias" });
    await within(lista).findByText("Switch TP-Link 24 puertos");

    const renglones = [...lista.children].map((el) => el.textContent ?? "");
    expect(renglones[0]).toBe("Usadas antes");
    expect(renglones[1]).toContain("Switch Cisco Meraki MS130-48X");
    expect(renglones[1]).toContain("usada 3 veces");
    expect(renglones[1]).toMatch(/último precio \$1,250\.00/);
    expect(renglones[2]).toBe("Catálogo");
    expect(renglones[3]).toContain("Switch TP-Link 24 puertos");

    // Busca en la moneda de la cotización y sin contar la que se está editando.
    expect(vi.mocked(buscarPartidasFrecuentes).mock.calls.at(-1)).toEqual([
      "token-de-prueba",
      "swi",
      expect.objectContaining({ moneda: "MXN", excluir: 77 }),
    ]);
  });

  it("el catálogo también ofrece lo que CT no tiene hoy, como «sobre pedido»", async () => {
    vi.mocked(smartQuoteSearch).mockResolvedValue({ data: [{ ...OFERTA, stockTotal: 0 }] } as unknown as Awaited<ReturnType<typeof smartQuoteSearch>>);
    render(<Editor />);
    await userEvent.type(nueva(), "swi");

    const lista = await screen.findByRole("listbox", { name: "Sugerencias" });
    const oferta = await within(lista).findByText("Switch TP-Link 24 puertos");

    expect(oferta.closest("[role=option]")?.textContent).toContain("sobre pedido");
    expect(vi.mocked(smartQuoteSearch).mock.calls.at(-1)?.[1]).toEqual({ q: "swi", take: 6, inStockOnly: false });
  });

  it("con dos letras ya busca lo cotizado (el catálogo sigue pidiendo tres)", async () => {
    render(<Editor />);
    await userEvent.type(nueva(), "sw");
    await screen.findByText("Usadas antes");
    expect(smartQuoteSearch).not.toHaveBeenCalled();
    expect(screen.queryByText("Catálogo")).toBeNull();
  });

  it("al elegirla entra con nombre, descripción, marca, modelo, unidad, costo y precio; el margen queda vacío", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "sw");
    await userEvent.click(await screen.findByRole("option", { name: /Switch Cisco Meraki MS130-48X/ }));

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({
      name: "Switch Cisco Meraki MS130-48X",
      description: "Switch administrable en la nube, 48 puertos PoE+.",
      brand: "Cisco Meraki",
      model: "MS130-48X",
      unit: "Pieza",
      qty: 1,
      unitCost: 1000,
      unitPrice: 1250,
      marginPercent: null,
      grupo: "EQUIPOS",
    });
    expect((screen.getByLabelText("Margen % de la partida 1") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Costo interno de la partida 1") as HTMLInputElement).value).toBe("1,000.00");
    // La fila nueva queda limpia y sin la lista abierta.
    expect((nueva() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox", { name: "Sugerencias" })).toBeNull();
  });

  it("sin margen el precio es el de la última vez; al poner el margen de esta cotización sale del costo", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "sw");
    await userEvent.click(await screen.findByRole("option", { name: /Switch Cisco Meraki MS130-48X/ }));
    await waitFor(() => expect(ultimas(alCambiar)[0]?.unitPrice).toBe(1250));

    await userEvent.type(screen.getByLabelText("Margen % de la partida 1"), "40");

    await waitFor(() => expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1000, marginPercent: 40, unitPrice: 1400 }));
  });

  it("con las flechas y Enter también se elige", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "sw");
    await screen.findByText("Usadas antes");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ model: "MS130-48X", unitCost: 1000, unitPrice: 1250, marginPercent: null });
  });

  it("escrita completa y con Enter, sin elegirla, se reconoce igual (sin importar mayúsculas ni acentos)", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "switch cisco meraki ms130-48x");
    await screen.findByText("Usadas antes");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({
      name: "switch cisco meraki ms130-48x",
      brand: "Cisco Meraki",
      unitCost: 1000,
      unitPrice: 1250,
      marginPercent: null,
    });
  });

  it("también se reconoce si después del nombre se pasó a la cantidad y se salió de la fila sin dar Enter", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "Switch Cisco Meraki MS130-48X");
    await screen.findByText("Usadas antes");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("4");
    // La lista ya se cerró (se salió de la celda del nombre) y la partida se sigue reconociendo.
    await waitFor(() => expect(screen.queryByText("Usadas antes")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Fuera de la tabla" }));

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ model: "MS130-48X", qty: 4, unitCost: 1000, unitPrice: 1250, marginPercent: null });
  });

  it("el precio que la persona ya tecleó en la fila manda sobre el de la última vez", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(screen.getByLabelText("Precio unitario de la nueva partida"), "1500");
    await userEvent.type(nueva(), "sw");
    await userEvent.click(await screen.findByRole("option", { name: /Switch Cisco Meraki MS130-48X/ }));

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1000, unitPrice: 1500, marginPercent: null });
  });

  it("Enter sobre un texto que no es una partida conocida sigue agregando la línea libre", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "Switch de otro tipo");
    await screen.findByText("Usadas antes");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ name: "Switch de otro tipo", unitPrice: 0 });
    expect(ultimas(alCambiar)[0]!.unitCost ?? null).toBeNull();
    expect(ultimas(alCambiar)[0]!.brand ?? null).toBeNull();
  });

  it("si la búsqueda falla se captura a mano como siempre, sin insistir en cada tecla", async () => {
    vi.mocked(buscarPartidasFrecuentes).mockReset().mockRejectedValue(new Error("HTTP 403"));
    vi.mocked(smartQuoteSearch).mockReset().mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<typeof smartQuoteSearch>>);
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(nueva(), "Rack 12U");
    await waitFor(() => expect(buscarPartidasFrecuentes).toHaveBeenCalled());
    await userEvent.type(nueva(), " abierto{Enter}");

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ name: "Rack 12U abierto" });
    expect(buscarPartidasFrecuentes).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Usadas antes")).toBeNull();
  });

  describe("costo de hoy en CT", () => {
    const HOY = { costo: 1200, diferencia: 0.2, piezas: 4, clave: "SWTCIS1", alDia: true, fecha: "2026-11-02T17:00:00.000Z" };
    const CON_AVISO: PartidaFrecuente = { ...SWITCH, costoDeHoy: HOY };

    beforeEach(() => {
      vi.mocked(buscarPartidasFrecuentes).mockReset().mockResolvedValue([CON_AVISO]);
    });

    it("la sugerencia lo dice antes de elegirla", async () => {
      render(<Editor />);
      await userEvent.type(nueva(), "swi");
      const lista = await screen.findByRole("listbox", { name: "Sugerencias" });
      expect(lista).toHaveTextContent("Hoy en CT $1,200.00");
      expect(lista).toHaveTextContent("20 % más que su costo");
    });

    it("sin diferencia, la sugerencia sale como siempre", async () => {
      vi.mocked(buscarPartidasFrecuentes).mockReset().mockResolvedValue([SWITCH]);
      render(<Editor />);
      await userEvent.type(nueva(), "swi");
      const lista = await screen.findByRole("listbox", { name: "Sugerencias" });
      expect(lista).not.toHaveTextContent("Hoy en CT");
    });

    it("entra con lo de la última vez y el aviso se queda en la fila; el costo cambia con el botón, el precio no", async () => {
      const alCambiar = vi.fn();
      render(<Editor alCambiar={alCambiar} />);
      await userEvent.type(nueva(), "swi");
      await screen.findByRole("listbox", { name: "Sugerencias" });
      await userEvent.keyboard("{ArrowDown}{Enter}");

      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1000, unitPrice: 1250, marginPercent: null });
      const aviso = screen.getAllByRole("status").find((n) => n.getAttribute("data-tono"))!;
      expect(aviso).toHaveTextContent("Hoy en CT $1,200.00");
      expect(aviso).toHaveTextContent("A este precio ganas 4.2 %");

      await userEvent.click(screen.getByRole("button", { name: "Usar costo de hoy" }));
      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1200, unitPrice: 1250, marginPercent: null });

      await userEvent.click(screen.getByRole("button", { name: /Subir precio a \$1,500\.00/ }));
      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1200, unitPrice: 1500, marginPercent: 25 });

      await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1000, unitPrice: 1250, marginPercent: null });
    });

    it("quien escribe el nombre completo y da Enter también lo ve", async () => {
      render(<Editor />);
      await userEvent.type(nueva(), SWITCH.name);
      await screen.findByRole("listbox", { name: "Sugerencias" });
      await userEvent.keyboard("{Enter}");
      expect(screen.getAllByRole("status").find((n) => n.getAttribute("data-tono"))).toHaveTextContent("Hoy en CT $1,200.00");
    });

    it("con el margen general, lo que se gana cuenta lo que de verdad se cobra", async () => {
      function ConMargen() {
        const [partidas, setPartidas] = useState<PartidaEditor[]>([]);
        return <TablaPartidas partidas={partidas} setPartidas={setPartidas} editable moneda="MXN" token="t" totales={totalesDePartidas(partidas)} margenPorcentaje={20} />;
      }
      render(<ConMargen />);
      await userEvent.type(nueva(), "swi");
      await screen.findByRole("listbox", { name: "Sugerencias" });
      await userEvent.keyboard("{ArrowDown}{Enter}");
      expect(screen.getAllByRole("status").find((n) => n.getAttribute("data-tono"))).toHaveTextContent("Con el 20 % general ganas 25 %");
    });
  });

  describe("lo copiado de otra cotización, que trae margen en la celda", () => {
    const HOY = { costo: 1200, diferencia: 0.2, piezas: 4, clave: "SWT1", alDia: true, fecha: "2026-11-02T17:00:00.000Z" };

    function Copiada({ alCambiar }: { alCambiar: (p: PartidaEditor[]) => void }) {
      const [partidas, setPartidas] = useState<PartidaEditor[]>(() => [
        partidaNueva({ name: "Switch copiado", unitCost: 1000, unitPrice: 1250, marginPercent: 25, avisoCt: crearAviso(HOY, 1000, 1250, 1250, 25) }),
      ]);
      alCambiar(partidas);
      return <TablaPartidas partidas={partidas} setPartidas={setPartidas} editable moneda="MXN" token="t" totales={totalesDePartidas(partidas)} />;
    }

    it("«Usar costo de hoy» no mueve el precio aunque la celda traiga margen; «Deshacer» lo regresa", async () => {
      const alCambiar = vi.fn();
      render(<Copiada alCambiar={alCambiar} />);

      await userEvent.click(screen.getByRole("button", { name: "Usar costo de hoy" }));
      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1200, unitPrice: 1250, marginPercent: null });

      await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
      expect(ultimas(alCambiar)[0]).toMatchObject({ unitCost: 1000, unitPrice: 1250, marginPercent: 25 });
    });
  });
});
