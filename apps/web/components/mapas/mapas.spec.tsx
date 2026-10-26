import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// El mapa se dibuja al entrar en pantalla; en jsdom «entra» de inmediato.
vi.mock("@/lib/use-visible-once", () => ({ useVisibleOnce: () => [{ current: null }, true] }));
// Sin WebGL en jsdom: la foto del mapa y el mapa interactivo se simulan.
vi.mock("@/lib/mapa-foto", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mapa-foto")>();
  return { ...real, fotoDeMapa: vi.fn(async () => "data:image/jpeg;base64,AAAA") };
});
vi.mock("@/components/mapas/MapaUbicacion", () => ({
  default: ({ lat, lng, onMover }: { lat?: number | null; lng?: number | null; onMover?: (a: number, b: number) => void }) => (
    <button type="button" data-testid="mapa-ubicacion" onClick={() => onMover?.(19.1, -98.2)}>
      {lat ?? "—"},{lng ?? "—"}
    </button>
  ),
}));
vi.mock("@/lib/places-autocomplete", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/places-autocomplete")>();
  return { ...real, PlacesSearch: vi.fn() };
});

import MapaVistaPrevia from "./MapaVistaPrevia";
import ClientLocationPicker from "@/components/ClientLocationPicker";
import { claveFoto, fotoDeMapa } from "@/lib/mapa-foto";
import { googleMapsLink, hasUsableCoords } from "@/lib/static-map";

describe("MapaVistaPrevia", () => {
  it("dibuja la foto del mapa con el pin y el crédito de OpenStreetMap", async () => {
    const { container } = render(<MapaVistaPrevia lat={19.07402} lng={-98.27774} alt="Mapa sucursal" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")!.getAttribute("src")).toMatch(/^data:image\/jpeg/);
    expect(screen.getByRole("img", { name: "Mapa sucursal" })).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap")).toBeTruthy();
    expect(fotoDeMapa).toHaveBeenCalledWith(expect.objectContaining({ lat: 19.07402, lng: -98.27774 }));
  });

  it("sin coordenadas no pide nada y lo dice", () => {
    vi.mocked(fotoDeMapa).mockClear();
    render(<MapaVistaPrevia lat={null} lng={null} />);
    expect(screen.getByText("Sin ubicación")).toBeTruthy();
    expect(fotoDeMapa).not.toHaveBeenCalled();
  });

  it("nunca vuelve a usar Google Static Maps", () => {
    const { container } = render(<MapaVistaPrevia lat={19.07} lng={-98.27} />);
    expect(container.innerHTML).not.toMatch(/staticmap|maps\.googleapis/);
  });
});

describe("ClientLocationPicker", () => {
  it("mover el pin en el mapa cambia las coordenadas y lo dice", () => {
    const onChange = vi.fn();
    render(
      <ClientLocationPicker
        label="Ubicación"
        value={{ address: "Av. Juárez", latitud: 19.04, longitud: -98.2 }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("mapa-ubicacion"));
    expect(onChange).toHaveBeenCalledWith({ address: "Av. Juárez", latitud: 19.1, longitud: -98.2 });
    expect(screen.getByText("Ubicación ajustada en el mapa")).toBeTruthy();
  });

  it("pegar coordenadas sigue funcionando", () => {
    const onChange = vi.fn();
    render(<ClientLocationPicker label="Ubicación" value={{ address: "" }} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Dirección/), { target: { value: "19.07402, -98.27774" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ latitud: 19.07402, longitud: -98.27774 }));
  });
});

describe("utilidades de mapa", () => {
  it("la foto del mismo punto y tamaño parecido comparte caché", () => {
    expect(claveFoto({ lat: 19.074021, lng: -98.277741, ancho: 612, alto: 180 })).toBe(
      claveFoto({ lat: 19.074019, lng: -98.277739, ancho: 598, alto: 180 }),
    );
  });

  it("0,0 y vacíos no son ubicación; el enlace a Maps es gratis", () => {
    expect(hasUsableCoords(0, 0)).toBe(false);
    expect(hasUsableCoords(null, null)).toBe(false);
    expect(hasUsableCoords("", "")).toBe(false);
    expect(hasUsableCoords("19.07", "-98.27")).toBe(true);
    expect(googleMapsLink(19.07, -98.27)).toBe("https://www.google.com/maps?q=19.07,-98.27");
  });
});
