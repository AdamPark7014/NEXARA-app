import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CompletarFicha from "./CompletarFicha";
import type { SeccionProps } from "./tipos";
import { actualizarProyecto } from "@/lib/proyectos-api";

vi.mock("@/lib/proyectos-api", () => ({ actualizarProyecto: vi.fn().mockResolvedValue({ id: 4 }) }));
const props = (): SeccionProps => ({
  proyecto: { id: 4, title: "Anfora", client: { id: 10, name: "Anfora" }, projectType: "INSTALACION_CCTV", responsableId: 8, startDate: "2026-11-01", endDate: null, resumen: { completitud: { fichaOk: false, planOk: false, listoOk: false, nivel: "FICHA", faltantes: [{ clave: "nombre_descriptivo", etiqueta: "Nombre descriptivo", ayuda: "Describe el trabajo" }, { clave: "fecha_fin", etiqueta: "Fecha de fin", ayuda: "Pon fecha" }] } } } as SeccionProps["proyecto"],
  token: "jwt", hoy: "2026-11-16", ocupado: false, personas: [{ id: 8, nombre: "Responsable" }], confirmar: vi.fn(), irA: vi.fn(),
  mutar: vi.fn(async (accion) => { await accion(); return true; }),
});

describe("completar ficha en el proyecto", () => {
  it("enfoca el primer faltante con completar=1 y guarda lo editado sin reenviar al responsable", async () => {
    window.history.replaceState({}, "", "/erp/proyectos/4?completar=1");
    const user = userEvent.setup();
    const p = props();
    render(<CompletarFicha {...p} />);
    expect(screen.getByLabelText(/Nombre descriptivo/)).toHaveFocus();
    expect(screen.getByRole("list", { name: "Completitud del proyecto" })).toHaveTextContent("FICHA");
    await user.click(screen.getByRole("button", { name: /Usar sugerencia/ }));
    expect(screen.getByLabelText(/Nombre descriptivo/)).toHaveValue("Instalación de cámaras Anfora");
    await user.type(screen.getByLabelText("Fin planeado"), "2026-11-30");
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }));
    await waitFor(() => expect(actualizarProyecto).toHaveBeenCalledWith("jwt", 4, { title: "Instalación de cámaras Anfora", endDate: "2026-11-30" }));
  });
});
