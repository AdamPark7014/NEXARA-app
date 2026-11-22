import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_SERVIDOR_CON_PROBLEMA } from "@/lib/erp-api";
import ComprasPage from "./page";

/**
 * Los formularios de Compras se llenan con listas que se piden aparte (órdenes abiertas,
 * almacenes, proveedores). Cuando no llegaban, el formulario decía «No hay órdenes abiertas por
 * recibir» o «Aún no hay proveedores. Da de alta el primero»: un fallo de carga contado como si
 * no hubiera datos, que invita a dar de alta un proveedor que ya existe.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/procurement",
}));

const USUARIO = { id: 1, nombre: "Persona Demo", token: "jwt", isSuperAdmin: true, permissions: [] as string[] };
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: USUARIO, token: "jwt" }),
}));

type Respuesta = () => Response | Promise<Response>;
const json = (cuerpo: unknown, status = 200): Respuesta => () => new Response(JSON.stringify(cuerpo), { status });
const caido: Respuesta = json({ message: "Internal server error" }, 500);

type Rutas = Partial<Record<"ordenes" | "almacenes" | "recepciones" | "cotizaciones" | "requisiciones" | "proveedores", Respuesta>>;

/** `fetch` de mentira: contesta según la ruta; lo que no se nombra llega como lista vacía. */
function servidor(rutas: Rutas) {
  const actual: Rutas = { ...rutas };
  const vacia = json([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
      if (/\/procurement\/purchase-orders\/suppliers(\?|$)/.test(url)) return (actual.proveedores ?? vacia)();
      if (/\/procurement\/purchase-orders(\?|$)/.test(url)) return (actual.ordenes ?? vacia)();
      if (/\/procurement\/goods-receipts(\?|$)/.test(url)) return (actual.recepciones ?? vacia)();
      if (/\/procurement\/requisitions(\?|$)/.test(url)) return (actual.requisiciones ?? vacia)();
      if (/\/procurement\/rfq(\?|$)/.test(url)) return (actual.cotizaciones ?? vacia)();
      if (/\/warehouse(\?|$)/.test(url)) return (actual.almacenes ?? vacia)();
      return vacia();
    }),
  );
  return { cambiar: (nuevas: Rutas) => Object.assign(actual, nuevas) };
}

const ORDEN = { id: 5, poNumber: "PO-000128", status: "APPROVED", totalAmount: 1500, supplier: { name: "Proveedor Demo" } };
const CENTRAL = { id: 1, code: "CEN", name: "Central", isActive: true };
const REQUISICION = { id: 3, reqNumber: "REQ-000077", title: "Cámaras para sitio demo", status: "APPROVED" };
const PROVEEDOR = { id: 9, name: "Proveedor Demo", rfc: null };

async function abrir(pestana: string, boton: RegExp) {
  window.history.replaceState(null, "", `/erp/procurement?tab=${pestana}`);
  render(<ComprasPage />);
  const [accion] = await screen.findAllByRole("button", { name: boton });
  await userEvent.click(accion);
  return within(await screen.findByRole("dialog"));
}

const primeraOpcion = (selector: HTMLElement) => (selector as HTMLSelectElement).options[0].textContent;

describe("Compras · listas de los formularios", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("recepción: si las órdenes y los almacenes no cargan, lo dice y deja reintentar", async () => {
    const api = servidor({ ordenes: caido, almacenes: caido });
    const dialogo = await abrir("receipts", /Registrar recepción/);

    const aviso = await dialogo.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar las órdenes de compra ni los almacenes");
    expect(aviso).toHaveTextContent(MENSAJE_SERVIDOR_CON_PROBLEMA);
    const orden = dialogo.getByRole("combobox", { name: /Orden de compra que llegó/ });
    expect(primeraOpcion(orden)).toBe("No se pudieron cargar las órdenes");
    expect(dialogo.queryByText("No hay órdenes abiertas por recibir")).not.toBeInTheDocument();

    api.cambiar({ ordenes: json([ORDEN]), almacenes: json([CENTRAL]) });
    await userEvent.click(within(aviso).getByRole("button", { name: "Reintentar" }));

    expect(await dialogo.findByRole("option", { name: /PO-000128/ })).toBeInTheDocument();
    expect(primeraOpcion(orden)).toBe("Elige la orden…");
    // El primer almacén queda propuesto, como antes.
    await waitFor(() => expect(dialogo.getByRole("combobox", { name: /Almacén donde entra/ })).toHaveValue("1"));
    expect(dialogo.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recepción: sin órdenes de verdad sí dice que no hay nada por recibir", async () => {
    servidor({ ordenes: json([]), almacenes: json([CENTRAL]) });
    const dialogo = await abrir("receipts", /Registrar recepción/);
    const orden = dialogo.getByRole("combobox", { name: /Orden de compra que llegó/ });
    await waitFor(() => expect(primeraOpcion(orden)).toBe("No hay órdenes abiertas por recibir"));
    expect(dialogo.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recepción: con órdenes pero ninguna abierta no se queda en «Cargando…»", async () => {
    servidor({ ordenes: json([{ ...ORDEN, status: "RECEIVED" }]), almacenes: json([CENTRAL]) });
    const dialogo = await abrir("receipts", /Registrar recepción/);
    const orden = dialogo.getByRole("combobox", { name: /Orden de compra que llegó/ });
    await waitFor(() => expect(primeraOpcion(orden)).toBe("No hay órdenes abiertas por recibir"));
  });

  it("cotización: si la pestaña no cargó, el formulario no dice «Aún no hay proveedores»", async () => {
    const api = servidor({ cotizaciones: caido });
    const dialogo = await abrir("rfq", /Pedir cotización/);

    const aviso = await dialogo.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar las requisiciones ni los proveedores");
    expect(dialogo.queryByText(/Aún no hay proveedores/)).not.toBeInTheDocument();

    api.cambiar({ cotizaciones: json([]), requisiciones: json([REQUISICION]), proveedores: json([PROVEEDOR]) });
    await userEvent.click(within(aviso).getByRole("button", { name: "Reintentar" }));

    expect(await dialogo.findByRole("checkbox", { name: /Proveedor Demo/ })).toBeInTheDocument();
    expect(dialogo.getByRole("option", { name: /Cámaras para sitio demo/ })).toBeInTheDocument();
    expect(dialogo.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cotización: sin proveedores de verdad sí invita a dar de alta el primero", async () => {
    servidor({ requisiciones: json([REQUISICION]) });
    const dialogo = await abrir("rfq", /Pedir cotización/);
    expect(await dialogo.findByText("Aún no hay proveedores. Da de alta el primero con «Nuevo proveedor».")).toBeInTheDocument();
    expect(dialogo.queryByRole("alert")).not.toBeInTheDocument();
  });
});
