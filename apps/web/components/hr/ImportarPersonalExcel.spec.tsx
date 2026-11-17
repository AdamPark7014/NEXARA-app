import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportarPersonalExcel from "./ImportarPersonalExcel";

vi.mock("@/lib/hr-expediente-api", () => ({ previewImportPersonal: vi.fn(), confirmarImportPersonal: vi.fn() }));
import { previewImportPersonal, confirmarImportPersonal } from "@/lib/hr-expediente-api";

const preview = {
  totalFilas: 1,
  seActualiza: [{ userId: 50, nombre: "Persona ficticia", employeeNumber: "NEX-999", fila: {}, cambios: [
    { campo: "puesto", actual: "Puesto anterior", excel: "Puesto nuevo" },
    { campo: "area", actual: "Área anterior", excel: "Área nueva" },
    { campo: "sueldoSemanal", actual: "100", excel: "200" },
  ] }],
  noEstaEnPlataforma: [], bajaEnExcelActivoEnPlataforma: [],
};
function subir() {
  fireEvent.click(screen.getByRole("button", { name: "Importar Excel de personal" }));
  fireEvent.change(screen.getByLabelText("Excel de personal"), { target: { files: [new File(["excel"], "personal.xlsx")] } });
}

describe("ImportarPersonalExcel", () => {
  beforeEach(() => { vi.mocked(previewImportPersonal).mockReset(); vi.mocked(confirmarImportPersonal).mockReset(); });

  it("confirma solo campos elegidos y nunca envía sueldo ni puesto", async () => {
    vi.mocked(previewImportPersonal).mockResolvedValue(preview);
    vi.mocked(confirmarImportPersonal).mockResolvedValue({});
    render(<ImportarPersonalExcel token="t" />);
    subir();
    await waitFor(() => expect(screen.getByText(/Puesto: «Puesto anterior»/)).toBeInTheDocument());
    expect(confirmarImportPersonal).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Sueldo semanal/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Puesto:/ })).toBeDisabled();
    const area = screen.getByRole("checkbox", { name: /Área:/ });
    fireEvent.click(area);
    expect(screen.getByRole("button", { name: "Confirmar cambios elegidos" })).toBeDisabled();
    expect(screen.getByText(/No hay cambios elegidos/)).toBeInTheDocument();
    fireEvent.click(area);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambios elegidos" }));
    await waitFor(() => expect(confirmarImportPersonal).toHaveBeenCalledWith("t", {
      actualizar: [{ userId: 50, campos: ["area"], area: "Área nueva" }], marcarAlta: [],
    }));
  });

  it("muestra el error y deja volver a elegir el mismo archivo", async () => {
    vi.mocked(previewImportPersonal).mockRejectedValue(new Error("No tienes permiso para importar personal."));
    render(<ImportarPersonalExcel token="t" />);
    subir();
    await waitFor(() => expect(screen.getByText("No tienes permiso para importar personal.")).toBeInTheDocument());
    expect(screen.getByLabelText("Excel de personal")).toBeEnabled();
    expect(confirmarImportPersonal).not.toHaveBeenCalled();
  });

  it("no permite importar sin sesión", () => {
    render(<ImportarPersonalExcel token="" />);
    expect(screen.getByRole("button", { name: "Importar Excel de personal" })).toBeDisabled();
  });
});
