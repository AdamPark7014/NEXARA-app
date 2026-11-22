import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_SIN_CONEXION } from "@/lib/red-caida";
import { VistaAlmacen } from "./VistaAlmacen";

/**
 * El formulario de movimiento se llena con dos listas: productos y almacenes. Cuando no
 * cargaban, decía «No hay productos en el catálogo» y «Primero crea un almacén»: mandaba a dar
 * de alta lo que ya existía. Una lista que no llegó no es una lista vacía.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/warehouse",
}));

const USUARIO = { id: 1, nombre: "Persona Demo", token: "jwt", isSuperAdmin: true, permissions: [] as string[] };
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: USUARIO, token: "jwt" }),
}));

type Respuesta = () => Response | Promise<Response>;
const json = (cuerpo: unknown, status = 200): Respuesta => () => new Response(JSON.stringify(cuerpo), { status });
const sinRed: Respuesta = () => Promise.reject(new TypeError("Failed to fetch"));

/** `fetch` de mentira: contesta según la ruta; lo que no se nombra llega como lista vacía. */
function servidor(rutas: { almacenes: Respuesta; productos: Respuesta }) {
  const actual = { ...rutas };
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    if (/\/warehouse(\?|$)/.test(url)) return actual.almacenes();
    if (/\/catalog\/products(\?|$)/.test(url)) return actual.productos();
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    cambiar: (nuevas: Partial<typeof rutas>) => Object.assign(actual, nuevas),
    pedidas: (patron: RegExp) => fetchMock.mock.calls.filter(([entrada]) => patron.test(String(entrada))).length,
  };
}

const CENTRAL = { id: 1, name: "Central", code: "CEN" };
const CAMARA = { id: 7, name: "Cámara demo", sku: "SKU-0007", category: "CCTV", tipoArticulo: "EQUIPO" };

async function abrirMovimiento() {
  render(<VistaAlmacen />);
  const [entrada] = await screen.findAllByRole("button", { name: /Entrada de stock/ });
  await userEvent.click(entrada);
  return within(await screen.findByRole("dialog"));
}

const primeraOpcion = (selector: HTMLElement) => (selector as HTMLSelectElement).options[0].textContent;

describe("VistaAlmacen · listas del formulario de movimiento", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sin conexión dice que no cargaron, no manda a crear un almacén, y deja reintentar", async () => {
    const api = servidor({ almacenes: sinRed, productos: sinRed });
    const dialogo = await abrirMovimiento();

    const aviso = await dialogo.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar los productos ni los almacenes");
    expect(aviso).toHaveTextContent(MENSAJE_SIN_CONEXION);
    expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Producto/ }))).toBe("No se pudieron cargar los productos");
    expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Almacén destino/ }))).toBe("No se pudieron cargar los almacenes");
    expect(dialogo.queryByText("Primero crea un almacén")).not.toBeInTheDocument();
    expect(dialogo.queryByText("No hay productos en el catálogo")).not.toBeInTheDocument();

    api.cambiar({ almacenes: json([CENTRAL]), productos: json({ data: [CAMARA], total: 1 }) });
    await userEvent.click(within(aviso).getByRole("button", { name: "Reintentar" }));

    expect(await dialogo.findByRole("option", { name: "SKU-0007 — Cámara demo" })).toBeInTheDocument();
    expect(dialogo.getByRole("option", { name: "Central" })).toBeInTheDocument();
    expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Producto/ }))).toBe("Elige el producto");
    expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Almacén destino/ }))).toBe("Elige el almacén");
    await waitFor(() => expect(dialogo.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("si solo falló una, el aviso nombra esa y la otra sigue sirviendo", async () => {
    servidor({ almacenes: json({ message: "Internal server error" }, 500), productos: json({ data: [CAMARA], total: 1 }) });
    const dialogo = await abrirMovimiento();
    const aviso = await dialogo.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar los almacenes");
    expect(aviso).not.toHaveTextContent("los productos");
    expect(await dialogo.findByRole("option", { name: "SKU-0007 — Cámara demo" })).toBeInTheDocument();
  });

  it("vacías de verdad sí dicen qué hacer, sin aviso de error", async () => {
    servidor({ almacenes: json([]), productos: json({ data: [], total: 0 }) });
    const dialogo = await abrirMovimiento();
    await waitFor(() =>
      expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Almacén destino/ }))).toBe("Primero crea un almacén"),
    );
    expect(primeraOpcion(dialogo.getByRole("combobox", { name: /Producto/ }))).toBe("No hay productos en el catálogo");
    expect(dialogo.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pide cada lista una sola vez al abrir la pantalla", async () => {
    const api = servidor({ almacenes: json([CENTRAL]), productos: json({ data: [CAMARA], total: 1 }) });
    const dialogo = await abrirMovimiento();
    await dialogo.findByRole("option", { name: "Central" });
    expect(api.pedidas(/\/warehouse(\?|$)/)).toBe(1);
    expect(api.pedidas(/\/catalog\/products(\?|$)/)).toBe(1);
  });
});
