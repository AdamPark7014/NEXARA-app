import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CotizacionDetalle } from "@/lib/cotizaciones-api";
import { MENSAJE_SERVIDOR_CON_PROBLEMA } from "@/lib/erp-api";
import EditorCotizacion from "./EditorCotizacion";

/**
 * Las plantillas del segmento y los paquetes se piden aparte del documento. Cuando no llegaban,
 * el fallo se callaba: el panel de plantillas decía «Cargando plantillas…» para siempre y el
 * botón «Paquetes» quedaba apagado sin decir por qué.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/cotizaciones/7",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ id: "7" }),
}));

const USUARIO = { id: 1, nombre: "Persona Demo" };
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: USUARIO, token: "jwt" }),
}));

const TERMINOS = {
  modalidad: "SUMINISTRO",
  titulo: "Términos y condiciones",
  lineas: [],
  partes: [{ clave: "pago", titulo: "Forma de pago", texto: "Se requiere un 50 % de anticipo.", personalizado: false }],
};

const DETALLE = {
  id: 7,
  folio: "NEX-PD00000000-0007",
  quoteNumber: "NEX-PD00000000-0007",
  folioBase: "NEX-PD00000000-0007",
  conNomenclatura: true,
  necesitaRefolio: false,
  estado: "BORRADOR",
  estadoEtiqueta: "Borrador",
  bloqueada: false,
  segmento: "COMERCIAL",
  segmentoEtiqueta: "Comercial",
  revision: 1,
  issueDate: "2026-09-18T00:00:00.000Z",
  validUntil: "2026-10-03T00:00:00.000Z",
  clientName: "Cliente Demo",
  salesClientId: 7,
  clientEmail: "compras@example.com",
  clientPhone: "222 000 0000",
  projectName: "Renovación del CCTV",
  scope: "",
  objetivo: "",
  objetivoPartes: { intro: "", beneficios: [], cierre: "" },
  objetivoSugerido: { intro: "", beneficios: [], cierre: "" },
  alcanceBloques: [],
  planos: [],
  depositPercent: 50,
  currency: "MXN",
  subtotal: 200,
  taxTotal: 32,
  total: 232,
  incluyeInstalacion: false,
  terminos: TERMINOS,
  terminosBase: TERMINOS,
  grupos: [],
  totalesPorGrupo: { EQUIPOS: 200, MATERIALES: 0, MANO_DE_OBRA: 0 },
  items: [{ id: 1, name: "Cámara bala 2 MP", unit: "Pieza", qty: 2, unitPrice: 100, discount: 0, tax: 16 }],
  elaboro: { id: 1, nombre: "Persona Demo", clave: "PD00000000", siglas: "PD" },
  participantes: [],
  actividades: [],
} as unknown as CotizacionDetalle;

const PLANTILLAS = [
  {
    segmento: "COMERCIAL",
    etiqueta: "Comercial",
    objetivo: { intro: "Este proyecto permitirá…", cierre: "Como resultado…" },
    bloques: [{ clave: "plantilla:cctv", titulo: "Sistema de videovigilancia", texto: null, vinetas: ["Cámaras", "Grabador"] }],
  },
];
const PAQUETES = [{ clave: "camara-ip", titulo: "Cámara IP instalada", descripcion: "Cámara, cable y mano de obra." }];

type Respuesta = () => Response;
const json = (cuerpo: unknown, status = 200): Respuesta => () =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
const caido = json({ message: "Internal server error" }, 500);

function servidor(rutas: { plantillas: Respuesta; paquetes: Respuesta }) {
  const actual = { ...rutas };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
      if (/cotizaciones\/plantillas(\?|$)/.test(url)) return actual.plantillas();
      if (/cotizaciones\/paquetes(\?|$)/.test(url)) return actual.paquetes();
      if (url.includes("cotizaciones/core/7")) return json(DETALLE)();
      return json([])();
    }),
  );
  return { cambiar: (nuevas: Partial<typeof rutas>) => Object.assign(actual, nuevas) };
}

describe("EditorCotizacion · plantillas y paquetes que no cargan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lo dice arriba con «Reintentar», y el panel de plantillas no se queda en «Cargando…»", async () => {
    const api = servidor({ plantillas: caido, paquetes: caido });
    render(<EditorCotizacion inicial={DETALLE} />);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar las plantillas ni los paquetes");
    expect(aviso).toHaveTextContent(MENSAJE_SERVIDOR_CON_PROBLEMA);

    await userEvent.click(screen.getByRole("button", { name: "Plantillas" }));
    expect(screen.getByText("No se pudieron cargar las plantillas. Reintenta desde el aviso de arriba.")).toBeInTheDocument();
    expect(screen.queryByText("Cargando plantillas…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paquetes" })).toBeDisabled();

    api.cambiar({ plantillas: json(PLANTILLAS), paquetes: json(PAQUETES) });
    await userEvent.click(within(aviso).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("button", { name: /Sistema de videovigilancia/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Paquetes" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un segmento sin plantillas dice que no tiene, no que siguen cargando", async () => {
    servidor({ plantillas: json([]), paquetes: json([]) });
    render(<EditorCotizacion inicial={DETALLE} />);
    await userEvent.click(await screen.findByRole("button", { name: "Plantillas" }));
    expect(
      await screen.findByText("Este segmento no tiene subsecciones sugeridas. Agrega la tuya con «+ Subsección»."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a una cotización ganada no le estorba el aviso: ya no se edita", async () => {
    servidor({ plantillas: caido, paquetes: caido });
    render(<EditorCotizacion inicial={{ ...DETALLE, estado: "APROBADA", estadoEtiqueta: "Ganada" } as CotizacionDetalle} />);
    expect(await screen.findByText(/Ganada: es el compromiso con el cliente/)).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes("cotizaciones/paquetes"))).toBe(true));
    expect(screen.queryByText(/No se pudieron cargar/)).not.toBeInTheDocument();
  });
});
