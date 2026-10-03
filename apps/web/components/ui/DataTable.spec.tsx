import React, { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DataTable, { PersonCell, ProgressCell, SelectionBar, StatusCell, WhenCell, type Column, type RowKey } from "./DataTable";

type Fila = { id: number; titulo: string; tecnico: string; hechas: number; pasos: number; estado: string };

const FILAS: Fila[] = [
  { id: 1, titulo: "Mantenimiento DVR", tecnico: "José Antonio Ramírez", hechas: 4, pasos: 6, estado: "EN_PROCESO" },
  { id: 2, titulo: "Alta de huellas", tecnico: "Paulina Torres", hechas: 3, pasos: 3, estado: "POR_VALIDAR" },
  { id: 3, titulo: "Enlace 5 GHz", tecnico: "Luis Joel Acosta", hechas: 1, pasos: 4, estado: "VENCIDA" },
];

const COLUMNAS: Column<Fila>[] = [
  { key: "titulo", label: "Actividad", render: (r) => r.titulo },
  { key: "quien", label: "Responsable", render: (r) => <PersonCell name={r.tecnico} subtitle="Técnico" /> },
  { key: "cuando", label: "Cuándo", render: () => <WhenCell time="Hoy 10:00" hint="En sitio desde 10:06" tone="success" /> },
  { key: "ev", label: "Evidencia", render: (r) => <ProgressCell value={r.hechas} max={r.pasos} /> },
  { key: "estado", label: "Estado", render: (r) => <StatusCell status={r.estado} /> },
];

describe("DataTable · API de siempre", () => {
  it("pinta encabezados y filas, y una fila con onRowClick responde a clic y teclado", async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={COLUMNAS} rows={FILAS} rowKey={(r) => r.id} onRowClick={onRowClick} ariaLabel="Actividades" />);
    const tabla = screen.getByRole("region", { name: "Actividades" });
    expect(within(tabla).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(tabla).getAllByRole("row")).toHaveLength(4);
    expect(within(tabla).queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.click(within(tabla).getByText("Alta de huellas"));
    expect(onRowClick).toHaveBeenCalledWith(FILAS[1]);
  });

  it("sin filas muestra el vacío; con loading, esqueletos", () => {
    const { rerender } = render(<DataTable columns={COLUMNAS} rows={[]} rowKey={(r: Fila) => r.id} emptyTitle="Nada por aquí" />);
    expect(screen.getByText("Nada por aquí")).toBeInTheDocument();
    rerender(<DataTable columns={COLUMNAS} rows={[]} rowKey={(r: Fila) => r.id} loading loadingRows={2} ariaLabel="Actividades" />);
    expect(screen.getByRole("region", { name: "Actividades" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Cargando registros…")).toBeInTheDocument();
  });
});

describe("DataTable · celdas auxiliares", () => {
  it("persona, avance, estado y hora se leen en la celda", () => {
    render(<DataTable columns={COLUMNAS} rows={FILAS} rowKey={(r) => r.id} />);
    expect(screen.getByText("José Antonio Ramírez")).toBeInTheDocument();
    expect(screen.getAllByText("Técnico")).toHaveLength(3);
    expect(screen.getByText("4/6")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.getByText("Por validar")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.getAllByText("En sitio desde 10:06")).toHaveLength(3);
  });
});

describe("DataTable · acciones por fila", () => {
  it("agrega una columna final cuya acción no dispara el clic de la fila", async () => {
    const onRowClick = vi.fn();
    const aprobar = vi.fn();
    render(
      <DataTable
        columns={COLUMNAS}
        rows={FILAS}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        rowActions={(r) => (
          <button type="button" onClick={() => aprobar(r.id)}>
            Aprobar
          </button>
        )}
      />,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Aprobar" })[1]);
    expect(aprobar).toHaveBeenCalledWith(2);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("DataTable · selección múltiple", () => {
  function Harness({ onChange }: { onChange?: (keys: RowKey[]) => void }) {
    const [sel, setSel] = useState<RowKey[]>([]);
    return (
      <DataTable
        columns={COLUMNAS}
        rows={FILAS}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={sel}
        onSelectionChange={(keys) => {
          setSel(keys);
          onChange?.(keys);
        }}
        selectRowLabel={(r) => `Seleccionar ${r.titulo}`}
        selectionBar={({ count }) => <button type="button">Reasignar {count}</button>}
      />
    );
  }

  it("marca filas, muestra la barra flotante con el conteo y la quita con ×", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Alta de huellas" }));
    expect(onChange).toHaveBeenLastCalledWith([2]);
    const fila = screen.getByRole("checkbox", { name: "Seleccionar Alta de huellas" }).closest("tr");
    expect(fila).toHaveAttribute("aria-selected", "true");

    const barra = screen.getByRole("toolbar", { name: "Acciones de la selección" });
    expect(barra).toHaveTextContent("1 seleccionada");
    expect(within(barra).getByRole("button", { name: "Reasignar 1" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Enlace 5 GHz" }));
    expect(screen.getByRole("toolbar")).toHaveTextContent("2 seleccionadas");

    await userEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Quitar selección" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("la casilla de la cabecera marca todas, queda indeterminada con algunas y desmarca todas", async () => {
    render(<Harness />);
    const todas = screen.getByRole("checkbox", { name: "Seleccionar todas" });
    await userEvent.click(todas);
    expect(screen.getByRole("toolbar")).toHaveTextContent("3 seleccionadas");
    const cabecera = screen.getByRole("checkbox", { name: "Quitar selección de todas" }) as HTMLInputElement;
    expect(cabecera.checked).toBe(true);

    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Enlace 5 GHz" }));
    const parcial = screen.getByRole("checkbox", { name: "Seleccionar todas" }) as HTMLInputElement;
    expect(parcial.indeterminate).toBe(true);
    expect(parcial.checked).toBe(false);

    await userEvent.click(parcial);
    expect(screen.getByRole("toolbar")).toHaveTextContent("3 seleccionadas");
    await userEvent.click(screen.getByRole("checkbox", { name: "Quitar selección de todas" }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("marcar la casilla no dispara el clic de la fila", async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={COLUMNAS} rows={FILAS} rowKey={(r) => r.id} selectable selectedKeys={[]} onSelectionChange={() => {}} onRowClick={onRowClick} />);
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Seleccionar fila" })[0]);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("SelectionBar suelta: etiqueta por defecto y botón de quitar", async () => {
    const onClear = vi.fn();
    render(
      <SelectionBar count={4} onClear={onClear}>
        <button type="button">Avisar</button>
      </SelectionBar>,
    );
    expect(screen.getByRole("toolbar")).toHaveTextContent("4 seleccionadas");
    await userEvent.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
