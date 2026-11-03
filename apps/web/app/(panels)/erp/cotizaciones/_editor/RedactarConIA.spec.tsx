import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentoVacio, itemsDesdeTextos, partidaNueva, type DocumentoCotizacion } from "@/lib/cotizacion-documento";
import type { TextosRedactados } from "@/lib/cotizaciones-api";

const redactar = vi.fn();
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  redactarTextos: (...args: unknown[]) => redactar(...args),
}));
vi.mock("@/components/DictadoBoton", () => ({
  default: ({ onTexto }: { onTexto: (t: string) => void }) => (
    <button type="button" onClick={() => onTexto("para la planta dos")}>
      Dictar
    </button>
  ),
}));

import RedactarConIA from "./RedactarConIA";

const REDACTADO: TextosRedactados = {
  via: "ia",
  proyecto: "Suministro de lectores",
  objetivo: { intro: "NEXARA propone 80 lectores.", beneficios: ["Lectura: rápida."], cierre: "Listos para su operación." },
  bloques: [{ clave: "ia:justificacion", titulo: "Justificación tecnológica", texto: "Por qué.", vinetas: ["Uno: dos."] }],
  quitadas: 0,
};

const conPartidas = (cambios: Partial<DocumentoCotizacion> = {}): DocumentoCotizacion => ({
  ...documentoVacio(),
  partidas: [partidaNueva({ name: "Lector UHF", qty: 80, unitPrice: 100, avisoCt: null } as never), partidaNueva({ name: "Impresora", qty: 2, unitPrice: 100, avisoCt: null } as never)],
  ...cambios,
});

let actual: DocumentoCotizacion;
function Prueba({ inicial, disparar = 0 }: { inicial: DocumentoCotizacion; disparar?: number }) {
  const [doc, setDoc] = useState(inicial);
  actual = doc;
  return (
    <>
      <RedactarConIA token="t" doc={doc} cambiar={setDoc} disparar={disparar} />
      <label>
        Introducción
        <input value={doc.objetivo.intro} onChange={(e) => setDoc((d) => ({ ...d, objetivo: { ...d.objetivo, intro: e.target.value } }))} />
      </label>
    </>
  );
}

describe("RedactarConIA", () => {
  beforeEach(() => {
    redactar.mockReset();
    redactar.mockResolvedValue(REDACTADO);
  });

  it("sin partidas no se ofrece: todavía no hay de qué escribir", () => {
    render(<Prueba inicial={documentoVacio()} />);
    expect(screen.queryByTestId("redactar-con-ia")).toBeNull();
  });

  it("dice de cuántas partidas va a escribir", () => {
    render(<Prueba inicial={conPartidas()} />);
    expect(screen.getByText(/La IA lee tus 2 partidas/)).toBeTruthy();
  });

  it("un clic llena los textos, sin preguntar, y avisa que hay que revisarlos", async () => {
    render(<Prueba inicial={conPartidas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Redactar con IA" }));
    await screen.findByText(/Listo: escribí el 01 y el 02 con tus 2 partidas/);
    expect(actual.objetivo.intro).toBe("NEXARA propone 80 lectores.");
    expect(actual.projectName).toBe("Suministro de lectores");
    expect(actual.bloques.map((b) => b.titulo)).toEqual(["Justificación tecnológica"]);
    expect(screen.queryByText(/Reemplazar/)).toBeNull();
    expect(screen.getByRole("button", { name: "Redactar de nuevo" })).toBeTruthy();
  });

  it("manda las partidas y lo que quien cotiza quiso aclarar", async () => {
    render(<Prueba inicial={conPartidas()} />);
    await userEvent.type(screen.getByLabelText("Indicación opcional para la IA"), "bodega nueva");
    await userEvent.click(screen.getByRole("button", { name: "Redactar con IA" }));
    await waitFor(() => expect(redactar).toHaveBeenCalledTimes(1));
    const [token, pedido] = redactar.mock.calls[0]!;
    expect(token).toBe("t");
    expect(pedido.indicacion).toBe("bodega nueva");
    expect(pedido.partidas.map((p: { name: string }) => p.name)).toEqual(["Lector UHF", "Impresora"]);
  });

  it("el dictado llena la indicación", async () => {
    render(<Prueba inicial={conPartidas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Dictar" }));
    expect((screen.getByLabelText("Indicación opcional para la IA") as HTMLInputElement).value).toBe("para la planta dos");
  });

  it("«Deshacer» regresa lo que había, también lo escrito a mano", async () => {
    const inicial = conPartidas({ projectName: "", objetivo: { intro: "Lo mío.", beneficios: itemsDesdeTextos(["Mío"]), cierre: "" } });
    render(<Prueba inicial={inicial} />);
    await userEvent.click(screen.getByRole("button", { name: "Redactar de nuevo" }));
    await screen.findByText(/Listo: escribí/);
    expect(actual.objetivo.intro).toBe("NEXARA propone 80 lectores.");

    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(actual.objetivo.intro).toBe("Lo mío.");
    expect(actual.objetivo.beneficios.map((b) => b.texto)).toEqual(["Mío"]);
    expect(actual.projectName).toBe("");
    expect(actual.bloques).toEqual([]);
    expect(screen.getByText("Listo: regresé lo que había.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("deshace lo último, con lo que se escribió mientras tanto", async () => {
    render(<Prueba inicial={conPartidas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Redactar con IA" }));
    await screen.findByText(/Listo: escribí/);
    const campo = screen.getByLabelText("Introducción");
    await userEvent.clear(campo);
    await userEvent.type(campo, "Ajustado");
    await userEvent.click(screen.getByRole("button", { name: "Redactar de nuevo" }));
    await waitFor(() => expect(redactar).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "Deshacer" });
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(actual.objetivo.intro).toBe("Ajustado");
  });

  it("si la IA no respondió lo dice: dejó el texto general y se puede deshacer", async () => {
    redactar.mockResolvedValue({ ...REDACTADO, via: "general", proyecto: null });
    render(<Prueba inicial={conPartidas()} />);
    await userEvent.click(screen.getByRole("button", { name: "Redactar con IA" }));
    await screen.findByText(/La IA no respondió: dejé el texto general/);
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("si falla la conexión avisa y no toca nada", async () => {
    redactar.mockRejectedValue(new Error("Tardó demasiado en contestar"));
    const inicial = conPartidas({ objetivo: { intro: "Lo mío.", beneficios: [], cierre: "" } });
    render(<Prueba inicial={inicial} />);
    await userEvent.click(screen.getByRole("button", { name: "Redactar de nuevo" }));
    await screen.findByRole("alert");
    expect(actual.objetivo.intro).toBe("Lo mío.");
  });

  it("al venir de «Cotizar con IA» se redacta solo, una sola vez", async () => {
    const { rerender } = render(<Prueba inicial={conPartidas()} disparar={1} />);
    await screen.findByText(/Listo: escribí/);
    expect(redactar).toHaveBeenCalledTimes(1);
    rerender(<Prueba inicial={conPartidas()} disparar={1} />);
    expect(redactar).toHaveBeenCalledTimes(1);
  });

  it("no pisa lo que ya estaba escrito por venir de «Cotizar con IA»", () => {
    render(<Prueba inicial={conPartidas({ objetivo: { intro: "Lo mío.", beneficios: [], cierre: "" } })} disparar={1} />);
    expect(redactar).not.toHaveBeenCalled();
  });
});
