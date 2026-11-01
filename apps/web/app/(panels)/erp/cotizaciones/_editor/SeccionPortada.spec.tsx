import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { documentoVacio, faltaParaEnviar } from "@/lib/cotizacion-documento";
import type { ClienteParecido } from "@/lib/sales-api";

const listSalesClients = vi.fn();
const getClientPermissions = vi.fn();
const createSalesClient = vi.fn();
const buscarClientesParecidos = vi.fn();
vi.mock("@/lib/sales-api", async (original) => ({
  ...(await original<typeof import("@/lib/sales-api")>()),
  listSalesClients: (...a: unknown[]) => listSalesClients(...a),
  getClientPermissions: (...a: unknown[]) => getClientPermissions(...a),
  createSalesClient: (...a: unknown[]) => createSalesClient(...a),
  buscarClientesParecidos: (...a: unknown[]) => buscarClientesParecidos(...a),
  getSalesClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { email: "daniela.hernandez@nexara.com.mx", roleKey: "administrativo" } }),
}));

import { ClienteCombo } from "./SeccionPortada";

const BUAP: ClienteParecido = {
  id: 17,
  nombre: "BUAP",
  razonSocial: null,
  tipos: ["COMERCIAL"],
  porque: "Son las siglas de ese nombre",
  confianza: "alta",
  origen: "codigo",
  puedeUsar: true,
  serviceClientId: 34,
};

function Montar() {
  const [doc, setDoc] = React.useState<DocumentoCotizacion>(documentoVacio("COMERCIAL", new Date(2026, 10, 1)));
  return (
    <>
      <ClienteCombo doc={doc} cambiar={(c) => setDoc((d) => c(d))} token="tok" editable id="cot-cliente" />
      <output data-testid="ligado">{doc.salesClientId ?? "sin ligar"}</output>
    </>
  );
}

beforeEach(() => {
  listSalesClients.mockReset().mockResolvedValue([{ id: 1, name: "Grupo Dice Puebla" }]);
  getClientPermissions.mockReset().mockResolvedValue({ puedeAgregar: true, puedeEditar: false, puedeAltaRapida: true });
  createSalesClient.mockReset();
  buscarClientesParecidos.mockReset().mockResolvedValue([]);
});

describe("cotización: cliente de último momento", () => {
  it("escribir no da de alta a nadie: solo al pedirlo", async () => {
    createSalesClient.mockResolvedValue({ id: 40, name: "Toks" });
    render(<Montar />);
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox"), "Toks");
    await new Promise((r) => setTimeout(r, 450));
    expect(createSalesClient).not.toHaveBeenCalled();
    expect(screen.getByTestId("ligado")).toHaveTextContent("sin ligar");

    await usuario.click(await screen.findByRole("button", { name: "Crear «Toks» con solo el nombre" }));
    await waitFor(() => expect(screen.getByTestId("ligado")).toHaveTextContent("40"));
    expect(createSalesClient).toHaveBeenCalledWith("tok", { name: "Toks", status: "Activo", tipo: "COMERCIAL", altaRapida: true });
  });

  it("BUAP en las dos direcciones: avisa y deja usar el que ya existe", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [] : [BUAP]));
    createSalesClient.mockResolvedValue({ id: 17, name: "BUAP" });
    render(<Montar />);
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox"), "Benemérita Universidad Autónoma de Puebla");
    await usuario.click(await screen.findByRole("button", { name: /Crear «Benemérita/ }));
    await usuario.click(await screen.findByRole("button", { name: "Usar BUAP" }));
    await waitFor(() => expect(screen.getByTestId("ligado")).toHaveTextContent("17"));
    expect(screen.getByRole("combobox")).toHaveValue("BUAP");
    expect(createSalesClient.mock.calls[0][1]).toMatchObject({ reutilizarId: 17 });
  });

  it("se puede crear otro de todos modos", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [] : [BUAP]));
    createSalesClient.mockResolvedValue({ id: 50, name: "BUAP Deportes" });
    render(<Montar />);
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox"), "BUAP Deportes");
    await usuario.click(await screen.findByRole("button", { name: /Crear «BUAP Deportes»/ }));
    await usuario.click(await screen.findByRole("button", { name: "Crear otro de todos modos" }));
    await waitFor(() => expect(screen.getByTestId("ligado")).toHaveTextContent("50"));
    expect(createSalesClient.mock.calls[0][1]).toMatchObject({ confirmarNuevo: true });
  });

  it("mientras escribes sugiere al que se parece", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [BUAP] : []));
    render(<Montar />);
    await userEvent.setup().type(screen.getByRole("combobox"), "Benemérita");
    expect(await screen.findByText(/Se parece: son las siglas/)).toBeInTheDocument();
  });

  it("quien no llega al alta elige de la lista", async () => {
    getClientPermissions.mockResolvedValue({ puedeAgregar: false, puedeEditar: false, puedeAltaRapida: false });
    render(<Montar />);
    await userEvent.setup().type(screen.getByRole("combobox"), "Toks");
    expect(await screen.findByText("Elige un cliente comercial que ya exista")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear/ })).not.toBeInTheDocument();
  });

  it("sin cliente del padrón no se envía", () => {
    const doc = documentoVacio("COMERCIAL", new Date(2026, 10, 1));
    expect(faltaParaEnviar({ ...doc, clientName: "Toks" })).toContain("elegir o crear el cliente");
    expect(faltaParaEnviar({ ...doc, clientName: "Toks", salesClientId: 9 })).not.toContain("elegir o crear el cliente");
  });
});
