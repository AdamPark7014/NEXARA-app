import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecorridoDia from "./RecorridoDia";
import { geojsonRecorrido } from "./RecorridoMapa";

// El mapa real necesita WebGL: aquí solo se prueba lo que arma.
vi.mock("maplibre-gl", () => ({}));
vi.mock("@/app/components/BrandMap", () => ({ MAPLIBRE_WORKER_URL: "/maplibre/maplibre-gl-worker.mjs" }));

const at = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00-06:00`).toISOString();
const punto = (hhmm: string, id: number) => ({ id, latitud: 19.07402, longitud: -98.27774, ultimaActualizacion: at(hhmm) });

describe("RecorridoDia", () => {
  it("dice la entrada sin ubicación con su causa y el hueco de 08:20 a 13:12", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at("13:20")));
    render(
      <RecorridoDia
        enJornada
        attendances={[
          { type: "entrada", timestamp: at("07:58"), motivoValidacion: "Sin ubicación: ubicación del teléfono apagada" },
        ]}
        trajectory={[punto("08:01", 1), punto("08:09", 2), punto("08:14", 3), punto("08:20", 4), punto("13:12", 5)]}
      />,
    );
    vi.useRealTimers();
    expect(screen.getByText("Entrada sin ubicación: ubicación del teléfono apagada")).toBeTruthy();
    expect(screen.getByText(/Sin ubicación de 8:20 a\.\s?m\. a 1:12 p\.\s?m\./)).toBeTruthy();
  });

  it("la entrada completada con el primer punto dice cuándo se tomó", () => {
    render(
      <RecorridoDia
        attendances={[
          {
            type: "entrada",
            timestamp: at("07:58"),
            entryLatitude: 19.07402,
            entryLongitude: -98.27774,
            ubicacionPosteriorAt: at("08:01"),
          },
          { type: "salida", timestamp: at("08:30"), exitLatitude: 19.07, exitLongitude: -98.27 },
        ]}
        trajectory={[punto("08:01", 1)]}
      />,
    );
    expect(screen.getByText(/Ubicación tomada a las 8:01 a\.\s?m\. \(3 min después\)/)).toBeTruthy();
    expect(screen.queryByText(/Sin ubicación de/)).toBeNull();
  });
});

describe("geojsonRecorrido", () => {
  it("una línea por la ruta y los puntos marcados como inicio, intermedios y fin", () => {
    const g = geojsonRecorrido([
      { lat: 19.1, lng: -98.2 },
      { lat: 19.2, lng: -98.3 },
      { lat: 19.3, lng: -98.4 },
    ]);
    expect(g.ruta.features[0]!.geometry.coordinates).toEqual([
      [-98.2, 19.1],
      [-98.3, 19.2],
      [-98.4, 19.3],
    ]);
    expect(g.puntos.features.map((f) => f.properties.tipo)).toEqual(["inicio", "punto", "fin"]);
  });

  it("con un solo punto no hay línea", () => {
    expect(geojsonRecorrido([{ lat: 19.1, lng: -98.2 }]).ruta.features).toEqual([]);
  });
});
