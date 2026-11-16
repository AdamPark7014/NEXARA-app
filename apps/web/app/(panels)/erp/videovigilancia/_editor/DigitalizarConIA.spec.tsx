import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { planoVacio } from "@/lib/cctv/plano";

const digitalizarCroquis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cctv/api", async (original) => ({ ...(await original<typeof import("@/lib/cctv/api")>()), digitalizarCroquis }));

import DigitalizarConIA from "./DigitalizarConIA";

describe("DigitalizarConIA", () => {
  it("lee el croquis, deja corregir y entrega el plano con lo revisado", async () => {
    digitalizarCroquis.mockResolvedValue({
      anchoPx: 2000,
      altoPx: 1000,
      ms: 900,
      lectura: {
        clase: "plano",
        anchoM: 40,
        escalaTexto: "1:100",
        muros: [{ a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } }],
        areas: [],
        camaras: [
          { numero: 1, pos: { x: 100, y: 100 }, rumboDeg: 0, tipo: "domo", ubicacion: "Acceso", alturaM: 3, segura: true },
          { numero: 2, pos: { x: 500, y: 500 }, rumboDeg: null, tipo: "otra", ubicacion: "", alturaM: null, segura: false },
        ],
        dudas: ["El símbolo 2 no se lee"],
      },
    });
    const plano = { ...planoVacio(), croquis: { url: "/uploads/cctv-croquis/5-1-0123456789abcdef.png", anchoPx: 2000, altoPx: 1000, opacidad: 0.6 } };
    const onAplicar = vi.fn();
    render(<DigitalizarConIA abierto token="tok" disenoId={5} plano={plano} onCerrar={() => undefined} onAplicar={onAplicar} />);
    expect(await screen.findByText("Cámaras detectadas (2)")).toBeInTheDocument();
    expect(screen.getByText("El símbolo 2 no se lee")).toBeInTheDocument();
    expect(digitalizarCroquis).toHaveBeenCalledWith("tok", 5, "/uploads/cctv-croquis/5-1-0123456789abcdef.png", undefined);
    await userEvent.click(screen.getByRole("button", { name: "Quitar la cámara 2" }));
    await userEvent.clear(screen.getByLabelText("Ubicación de la cámara 1"));
    await userEvent.type(screen.getByLabelText("Ubicación de la cámara 1"), "Acceso norte");
    await userEvent.click(screen.getByRole("button", { name: "Usar en el diseño" }));
    const [nuevo, resumen] = onAplicar.mock.calls[0]!;
    expect(resumen).toBe("1 muro y 1 cámara");
    expect(nuevo.camaras.map((c: { nombre: string }) => c.nombre)).toEqual(["Cámara 1 · Acceso norte"]);
    expect(nuevo.escala.metrosPorPx).toBeCloseTo(0.02);
  });
});
