import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CargaDeApoyo, EstadoDeApoyo } from "@/lib/lista-de-apoyo";
import AvisoDeApoyo from "./AvisoDeApoyo";

function apoyo(nombre: string, estado: EstadoDeApoyo, cambios: Partial<CargaDeApoyo> = {}): CargaDeApoyo {
  const fallando = estado === "fallo" || estado === "reintentando";
  return {
    estado,
    nombre,
    causa: null,
    noCargo: fallando,
    recargar: vi.fn(async () => undefined),
    ...cambios,
  };
}

/** El aviso que va dentro del formulario cuando la lista de un campo no llegó. */
describe("AvisoDeApoyo", () => {
  it("no pinta nada si todo cargó", () => {
    const { container } = render(<AvisoDeApoyo de={[apoyo("los almacenes", "lista"), apoyo("los productos", "cargando")]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dice qué no cargó, por qué y ofrece reintentar", async () => {
    const almacenes = apoyo("los almacenes", "fallo", { causa: "El servidor tuvo un problema. Vuelve a intentarlo en un momento." });
    render(<AvisoDeApoyo de={[almacenes]} />);
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar los almacenes");
    expect(aviso).toHaveTextContent("El servidor tuvo un problema. Vuelve a intentarlo en un momento.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(almacenes.recargar).toHaveBeenCalledTimes(1);
  });

  it("sin causa conocida pide intentar otra vez", () => {
    render(<AvisoDeApoyo de={[apoyo("los proveedores", "fallo")]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los proveedores");
    expect(screen.getByRole("alert")).toHaveTextContent("Vuelve a intentarlo.");
  });

  it("varias listas caídas salen en un solo aviso y se reintentan juntas, sin repetir la causa", async () => {
    const causa = "No se pudo conectar con el servidor. Revisa tu internet y vuelve a intentarlo.";
    const productos = apoyo("los productos", "fallo", { causa });
    const almacenes = apoyo("los almacenes", "fallo", { causa });
    const personas = apoyo("las personas", "lista");
    render(<AvisoDeApoyo de={[productos, almacenes, personas]} />);
    const avisos = screen.getAllByRole("alert");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toHaveTextContent("No se pudieron cargar los productos ni los almacenes");
    expect(avisos[0].textContent?.split(causa).length).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(productos.recargar).toHaveBeenCalledTimes(1);
    expect(almacenes.recargar).toHaveBeenCalledTimes(1);
    expect(personas.recargar).not.toHaveBeenCalled();
  });

  it("mientras reintenta el aviso sigue a la vista y el botón no se puede volver a apretar", () => {
    render(<AvisoDeApoyo de={[apoyo("los almacenes", "reintentando")]} />);
    const boton = screen.getByRole("button", { name: "Reintentar" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
  });

  it("un refresco fallido con la lista ya cargada no avisa en el formulario", () => {
    const { container } = render(<AvisoDeApoyo de={[apoyo("los almacenes", "fallo", { noCargo: false })]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
