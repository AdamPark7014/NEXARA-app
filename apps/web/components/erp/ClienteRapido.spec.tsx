import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteParecido, SalesClient } from "@/lib/sales-api";

const buscarClientesParecidos = vi.fn();
const createSalesClient = vi.fn();
const getSalesClient = vi.fn();
vi.mock("@/lib/sales-api", async (original) => ({
  ...(await original<typeof import("@/lib/sales-api")>()),
  buscarClientesParecidos: (...a: unknown[]) => buscarClientesParecidos(...a),
  createSalesClient: (...a: unknown[]) => createSalesClient(...a),
  getSalesClient: (...a: unknown[]) => getSalesClient(...a),
}));

import { ClienteRapido } from "./ClienteRapido";
import { ClienteTipoPicker } from "./DatosCliente";

const cliente = (id: number, name: string, extra: Partial<SalesClient> = {}) => ({ id, name, ...extra }) as SalesClient;
const CLIENTES = [cliente(1, "Grupo Dice Puebla"), cliente(2, "Lotería Nacional", { legalName: "Lotería Nacional para la Asistencia Pública" })];
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
const armar = (nombre: string) => ({ name: nombre, status: "Activo", tipo: "COMERCIAL" as const, altaRapida: true });

function montar(props: Partial<React.ComponentProps<typeof ClienteRapido>> = {}) {
  const onElegido = vi.fn();
  render(
    <ClienteRapido token="tok" clientes={CLIENTES} salesClientId={null} editable puedeCrear armar={armar} onElegido={onElegido} {...props} />,
  );
  return { onElegido, campo: screen.getByRole("combobox", { name: "Cliente" }), usuario: userEvent.setup() };
}

beforeEach(() => {
  buscarClientesParecidos.mockReset().mockResolvedValue([]);
  createSalesClient.mockReset();
  getSalesClient.mockReset().mockResolvedValue({});
});

describe("ClienteRapido", () => {
  it("escribes el nombre, lo creas con un clic y queda elegido", async () => {
    createSalesClient.mockResolvedValue(cliente(40, "Toks"));
    const { campo, usuario, onElegido } = montar();
    await usuario.type(campo, "Toks");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Toks» con solo el nombre/ }));
    await waitFor(() => expect(onElegido).toHaveBeenCalledTimes(1));
    expect(createSalesClient).toHaveBeenCalledWith("tok", { name: "Toks", status: "Activo", tipo: "COMERCIAL", altaRapida: true });
    expect(onElegido.mock.calls[0][0].id).toBe(40);
    expect(onElegido.mock.calls[0][1]).toEqual({ enLista: false });
  });

  it("revisa si ya existe antes de crear, con la IA disponible", async () => {
    createSalesClient.mockResolvedValue(cliente(40, "Toks"));
    const { campo, usuario } = montar();
    await usuario.type(campo, "Toks");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Toks»/ }));
    await waitFor(() => expect(createSalesClient).toHaveBeenCalled());
    const ultima = buscarClientesParecidos.mock.calls.at(-1)!;
    expect(ultima[1]).toEqual({ nombre: "Toks", razonSocial: undefined, rfc: undefined });
  });

  it("si se parece a otro avisa, y no crea nada hasta que decidas", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [] : [BUAP]));
    const { campo, usuario } = montar();
    await usuario.type(campo, "Benemérita Universidad Autónoma de Puebla");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Benemérita/ }));
    expect(await screen.findByText("¿Ya existe este cliente?")).toBeInTheDocument();
    expect(screen.getByText("«Benemérita Universidad Autónoma de Puebla» se parece a:")).toBeInTheDocument();
    expect(screen.getByText(/Son las siglas de ese nombre/)).toBeInTheDocument();
    expect(createSalesClient).not.toHaveBeenCalled();
  });

  it("«Usar BUAP» trae a ese cliente en vez de crear otro", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [] : [BUAP]));
    createSalesClient.mockResolvedValue(cliente(17, "BUAP"));
    const { campo, usuario, onElegido } = montar();
    await usuario.type(campo, "Benemérita");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Benemérita»/ }));
    await usuario.click(await screen.findByRole("button", { name: "Usar BUAP" }));
    await waitFor(() => expect(onElegido).toHaveBeenCalledTimes(1));
    expect(createSalesClient.mock.calls[0][1]).toMatchObject({ name: "BUAP", reutilizarId: 17 });
    expect(createSalesClient.mock.calls[0][1].confirmarNuevo).toBeUndefined();
  });

  it("«Crear otro de todos modos» lo crea con la confirmación", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [] : [BUAP]));
    createSalesClient.mockResolvedValue(cliente(41, "BUAP Deportes"));
    const { campo, usuario, onElegido } = montar();
    await usuario.type(campo, "BUAP Deportes");
    await usuario.click(await screen.findByRole("option", { name: /Crear «BUAP Deportes»/ }));
    await usuario.click(await screen.findByRole("button", { name: "Crear otro de todos modos" }));
    await waitFor(() => expect(onElegido).toHaveBeenCalledTimes(1));
    expect(createSalesClient.mock.calls[0][1]).toMatchObject({ name: "BUAP Deportes", confirmarNuevo: true, altaRapida: true });
  });

  it("quien no puede abrir al parecido no se lo lleva, pero sabe que existe", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) =>
      q.soloCodigo ? [] : [{ ...BUAP, puedeUsar: false, serviceClientId: null }],
    );
    const { campo, usuario } = montar();
    await usuario.type(campo, "Benemérita");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Benemérita»/ }));
    expect(await screen.findByText("Pide a coordinación que te dé acceso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar BUAP" })).not.toBeInTheDocument();
  });

  it("mientras escribes sugiere lo que se parece, sin gastar IA", async () => {
    buscarClientesParecidos.mockImplementation(async (_t: string, q: { soloCodigo?: boolean }) => (q.soloCodigo ? [BUAP] : []));
    const { campo, usuario } = montar();
    await usuario.type(campo, "Benemérita");
    expect(await screen.findByRole("option", { name: /BUAP/ })).toBeInTheDocument();
    expect(buscarClientesParecidos.mock.calls.at(-1)![1]).toEqual({ nombre: "Benemérita", soloCodigo: true });
  });

  it("encuentra también por razón social y sin acentos", async () => {
    const { campo, usuario } = montar();
    await usuario.type(campo, "asistencia publica");
    expect(await screen.findByRole("option", { name: /Lotería Nacional/ })).toBeInTheDocument();
    await usuario.clear(campo);
    await usuario.type(campo, "loteria");
    expect(await screen.findByRole("option", { name: /Lotería Nacional/ })).toBeInTheDocument();
  });

  it("no ofrece crear lo que ya está en la lista", async () => {
    const { campo, usuario } = montar();
    await usuario.type(campo, "grupo dice puebla");
    await screen.findByRole("option", { name: /Grupo Dice Puebla/ });
    expect(screen.queryByRole("option", { name: /Crear/ })).not.toBeInTheDocument();
  });

  it("sin permiso no ofrece crear", async () => {
    const { campo, usuario } = montar({ puedeCrear: false });
    await usuario.type(campo, "Toks");
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("option", { name: /Crear/ })).not.toBeInTheDocument();
  });

  it("Enter elige sin mandar el formulario de afuera", async () => {
    const enviar = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onElegido = vi.fn();
    render(
      <form onSubmit={enviar}>
        <ClienteRapido token="tok" clientes={CLIENTES} salesClientId={null} editable puedeCrear armar={armar} onElegido={onElegido} />
      </form>,
    );
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox", { name: "Cliente" }), "Grupo{Enter}");
    expect(enviar).not.toHaveBeenCalled();
    expect(onElegido.mock.calls[0][0].name).toBe("Grupo Dice Puebla");
  });

  it("si el servidor rechaza el alta lo dice en palabras", async () => {
    createSalesClient.mockRejectedValue(new Error("Ya hay un cliente muy parecido: BUAP. Elígelo, o confirma que es otro."));
    const { campo, usuario } = montar();
    await usuario.type(campo, "Benemérita");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Benemérita»/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay un cliente muy parecido: BUAP");
  });

  it("el recién creado queda marcado para completar datos", async () => {
    createSalesClient.mockResolvedValue(cliente(40, "Toks"));
    function Conlista() {
      const [lista, setLista] = React.useState(CLIENTES);
      const [id, setId] = React.useState<number | null>(null);
      return (
        <ClienteRapido
          token="tok"
          clientes={lista}
          salesClientId={id}
          editable
          puedeCrear
          armar={armar}
          onElegido={(c, { enLista }) => {
            if (!enLista) setLista((p) => [...p, c]);
            setId(c.id);
          }}
        />
      );
    }
    render(<Conlista />);
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox", { name: "Cliente" }), "Toks");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Toks»/ }));
    expect(await screen.findByText("Cliente nuevo · sin RFC")).toBeInTheDocument();
  });
});

describe("ClienteTipoPicker: qué alta pide cada tipo", () => {
  async function altaCon(props: Partial<React.ComponentProps<typeof ClienteTipoPicker>>) {
    createSalesClient.mockResolvedValue(cliente(40, "Toks"));
    const onCreado = vi.fn();
    render(
      <ClienteTipoPicker
        token="tok"
        tipo="COMERCIAL"
        salesClientId={null}
        editable
        puedeCrear
        puedeEditar={false}
        clientes={[]}
        onSelect={vi.fn()}
        onCreado={onCreado}
        {...props}
      />,
    );
    const usuario = userEvent.setup();
    await usuario.type(screen.getByRole("combobox", { name: "Cliente" }), "Toks");
    await usuario.click(await screen.findByRole("option", { name: /Crear «Toks»/ }));
    await waitFor(() => expect(onCreado).toHaveBeenCalled());
    return createSalesClient.mock.calls[0][1];
  }

  it("comercial: alta rápida", async () => {
    expect(await altaCon({ tipo: "COMERCIAL" })).toEqual({ name: "Toks", status: "Activo", tipo: "COMERCIAL", altaRapida: true });
  });

  it("corporativo: alta rápida", async () => {
    expect(await altaCon({ tipo: "CORPORATIVO" })).toEqual({ name: "Toks", status: "Activo", tipo: "CORPORATIVO", altaRapida: true });
  });

  it("de proyecto sin permiso de padrón: solo el nombre", async () => {
    expect(await altaCon({ tipo: "PROYECTO", altaSoloNombre: true })).toEqual({ name: "Toks", status: "Activo", tipo: "PROYECTO", altaProyecto: true });
  });

  it("de proyecto con permiso de padrón: alta normal", async () => {
    expect(await altaCon({ tipo: "PROYECTO" })).toEqual({ name: "Toks", status: "Activo", tipo: "PROYECTO", sectors: ["PROYECTO"] });
  });
});
