import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ControlNominaSemanal from "./ControlNominaSemanal";
import { diasDeSemana } from "@/lib/control-nomina";

const LUNES = "2026-09-28";
const DIAS = diasDeSemana(LUNES);

type Dia = Record<string, unknown>;
const oficina = (fecha: string): Dia => ({ fecha, entrada: "10:00", salida: "18:00", horas: 8, lugar: "Oficina", lugarOrigen: "auto", falta: false });
const descanso = (fecha: string): Dia => ({ fecha, entrada: null, salida: null, horas: 0, lugar: "Descanso", lugarOrigen: "auto", falta: false });
const semana = (cambios: Record<number, Dia> = {}) => DIAS.map((d, i) => cambios[i] ?? (i < 5 ? oficina(d.fecha) : descanso(d.fecha)));

const ANA = {
  userId: 1,
  nombre: "ANA LÓPEZ",
  area: "Operación",
  dias: semana(),
  horasTotales: 40,
  sueldo: 4000,
  pagoPorHora: 100,
  divisorHoras: 40,
  viaticos: 120,
  viaticosDetalle: [{ id: 11, concepto: "Comida en obra", monto: 120, estatus: "APROBADO" }],
  extrasMonto: 300,
  extrasMinutosAprobados: 90,
  extrasMinutosPendientes: 0,
  sueldoPeriodo: 4000,
  descuentos: [],
  descuentosTotal: 0,
  subtotal: 4420,
  total: 4420,
  notaFila: "* Toda la semana asignado a Hotel Casa Azul",
  notaFilaOrigen: "auto",
};

const BETO = {
  ...ANA,
  userId: 2,
  nombre: "BETO RUIZ",
  area: "Administrativo",
  dias: semana({ 1: { fecha: DIAS[1].fecha, entrada: null, salida: null, horas: 0, lugar: "Falta", lugarOrigen: "auto", falta: true } }),
  horasTotales: 32,
  viaticos: 0,
  viaticosDetalle: [],
  extrasMonto: 0,
  extrasMinutosAprobados: 0,
  extrasMinutosPendientes: 120,
  descuentos: [{ id: 21, concepto: "Falta martes 29", monto: 800, sugerido: true }],
  descuentosTotal: 0,
  subtotal: 4000,
  total: 4000,
  notaFila: null,
  notaFilaOrigen: null,
};

const RESPUESTA = {
  semana: { inicio: LUNES, fin: "2026-10-04", estado: "BORRADOR" },
  dias: DIAS,
  filas: [ANA, BETO],
  totales: {},
  formula: {
    pagoPorHora: "Sueldo semanal ÷ horas semanales de su horario (÷48 sin horario fijo).",
    subtotal: "Sueldo del periodo + viáticos + extras.",
    total: "Subtotal − descuentos aceptados.",
  },
};

type Llamada = { url: string; method: string; body: unknown; headers: Record<string, string> };

/** Servidor de mentira: GET de la semana responde `cuerpo`; lo demás, `ok`. */
function servidor(cuerpo: unknown, otras: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    llamadas.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers });
    const clave = Object.keys(otras).find((k) => String(url).includes(k));
    const res = method === "GET" && String(url).includes("control-semanal?") ? cuerpo : clave ? otras[clave] : { ok: true };
    return { ok: true, status: 200, text: async () => JSON.stringify(res), json: async () => res } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return llamadas;
}

const escrituras = (ll: Llamada[]) => ll.filter((l) => l.method !== "GET");

afterEach(() => vi.unstubAllGlobals());

describe("ControlNominaSemanal", () => {
  it("pide la semana por su lunes y arma «Entradas y salidas» con faltas y totales", async () => {
    const llamadas = servidor(RESPUESTA);
    render(<ControlNominaSemanal token="tok-1" canEdit semanaInicial="2026-10-01" />);

    const tabla = await screen.findByRole("region", { name: /Entradas y salidas/ });
    expect(llamadas[0].url).toContain("employee-payments/control-semanal?semana=2026-09-28");
    expect(llamadas[0].headers.authorization).toBe("Bearer tok-1");
    expect(screen.getByText("28 sep – 4 oct 2026")).toBeTruthy();

    // Encabezado de dos niveles: día y número arriba; Entrada · Salida · Horas abajo.
    expect(within(tabla).getAllByRole("columnheader", { name: "Entrada" })).toHaveLength(7);
    expect(within(tabla).getByText("MIÉRCOLES")).toBeTruthy();
    expect(within(tabla).getByText("Sin checada")).toBeTruthy();
    expect(within(tabla).getByText(/Total · 2 personas/)).toBeTruthy();
    expect(within(tabla).getByText("72.00")).toBeTruthy();

    // Resumen con cifras y fórmulas de la API.
    expect(screen.getByText("$8,420.00")).toBeTruthy();
    expect(screen.getByText(/÷48 sin horario fijo/)).toBeTruthy();
  });

  it("en «Nómina» el menú del día cambia el lugar y vuelve a pedir la semana", async () => {
    const user = userEvent.setup();
    const llamadas = servidor(RESPUESTA);
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} />);
    await screen.findByRole("region", { name: /Entradas y salidas/ });

    await user.click(screen.getByRole("tab", { name: "Nómina" }));
    const tabla = screen.getByRole("region", { name: /Nómina de la semana/ });
    expect(within(tabla).getByText("* Toda la semana asignado a Hotel Casa Azul")).toBeTruthy();
    expect(within(tabla).getByRole("link", { name: /2.00 h extra pendientes de BETO RUIZ/ })).toHaveAttribute(
      "href",
      "/erp/asistencias/indicadores/2?desde=2026-09-28&hasta=2026-10-04",
    );

    await user.click(within(tabla).getByRole("button", { name: /BETO RUIZ, Lunes 28: Oficina, automático/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitemradio", { name: /Foráneo/ }));

    await waitFor(() => expect(escrituras(llamadas)).toHaveLength(1));
    expect(escrituras(llamadas)[0]).toMatchObject({
      method: "PATCH",
      body: { semana: LUNES, userId: 2, fecha: "2026-09-28", lugar: "Foráneo" },
    });
    expect(escrituras(llamadas)[0].url).toContain("employee-payments/control-semanal/dia");
    await waitFor(() => expect(llamadas.filter((l) => l.method === "GET")).toHaveLength(2));
  });

  it("el desglose de viáticos y la fórmula del pago por hora se ven en la fila", async () => {
    const user = userEvent.setup();
    servidor(RESPUESTA);
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} />);
    await screen.findByRole("region", { name: /Entradas y salidas/ });
    await user.click(screen.getByRole("tab", { name: "Nómina" }));

    expect(screen.getAllByText(/Sueldo semanal \$4,000.00 ÷ 40.00 h/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Viáticos de ANA LÓPEZ/ }));
    const desglose = await screen.findByRole("dialog", { name: /Desglose de viáticos de ANA LÓPEZ/ });
    expect(within(desglose).getByText("Comida en obra")).toBeTruthy();
  });

  it("cerrar la semana confirma cuántos pagos y el total antes de generarlos", async () => {
    const user = userEvent.setup();
    const onPagos = vi.fn();
    const llamadas = servidor(RESPUESTA, { "/cerrar": { creados: 2 } });
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} onPagosGenerados={onPagos} />);
    await screen.findByRole("region", { name: /Entradas y salidas/ });

    await user.click(screen.getByRole("button", { name: "Cerrar semana y generar pagos" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.textContent).toContain("Se crearán 2 pagos en Borrador");
    expect(dialogo.textContent).toContain("$8,420.00");
    expect(dialogo.textContent).toContain("2.00 h extra pendientes");
    expect(dialogo.textContent).toContain("1 descuento sugerido sin aceptar");

    await user.click(within(dialogo).getByRole("button", { name: "Cerrar y generar 2 pagos" }));
    await waitFor(() => expect(escrituras(llamadas)).toHaveLength(1));
    expect(escrituras(llamadas)[0]).toMatchObject({ method: "POST", body: { semana: LUNES } });
    expect(escrituras(llamadas)[0].url).toContain("control-semanal/cerrar");
    await waitFor(() => expect(onPagos).toHaveBeenCalled());
  });

  it("el panel de descuentos acepta los sugeridos y agrega renglones", async () => {
    const user = userEvent.setup();
    const llamadas = servidor(RESPUESTA);
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} />);
    await screen.findByRole("region", { name: /Entradas y salidas/ });
    await user.click(screen.getByRole("tab", { name: "Nómina" }));

    await user.click(screen.getByRole("button", { name: /Descuentos de BETO RUIZ/ }));
    const panel = await screen.findByRole("dialog", { name: /Descuentos · BETO RUIZ/ });
    expect(within(panel).getByText("Sugerido · por aceptar")).toBeTruthy();

    await user.click(within(panel).getByRole("button", { name: "Aceptar sugerido" }));
    await waitFor(() => expect(escrituras(llamadas)).toHaveLength(1));
    expect(escrituras(llamadas)[0]).toMatchObject({ method: "POST", body: { semana: LUNES, userId: 2 } });
    expect(escrituras(llamadas)[0].url).toContain("descuentos/sugeridos/aceptar");

    const agregar = within(panel).getByRole("button", { name: "Agregar descuento" });
    await waitFor(() => expect(agregar).not.toBeDisabled());
    await user.type(within(panel).getByRole("textbox", { name: "Concepto" }), "Uniforme");
    await user.type(within(panel).getByRole("spinbutton", { name: /Monto/ }), "150");
    await user.click(agregar);
    await waitFor(() => expect(escrituras(llamadas)).toHaveLength(2));
    expect(escrituras(llamadas)[1]).toMatchObject({
      method: "POST",
      body: { semana: LUNES, userId: 2, concepto: "Uniforme", monto: 150 },
    });
  });

  it("sin montos (RH): avisa, oculta importes y no deja cerrar ni editar", async () => {
    const user = userEvent.setup();
    const sinMontos = {
      ...RESPUESTA,
      filas: RESPUESTA.filas.map((f) => ({
        ...f,
        sueldo: null,
        pagoPorHora: null,
        viaticos: null,
        viaticosDetalle: [],
        extrasMonto: null,
        sueldoPeriodo: null,
        descuentos: [],
        descuentosTotal: null,
        subtotal: null,
        total: null,
      })),
    };
    servidor(sinMontos);
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} />);
    expect(await screen.findByText("Montos ocultos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cerrar semana y generar pagos" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Nómina" }));
    const tabla = screen.getByRole("region", { name: /Nómina de la semana/ });
    expect(within(tabla).queryByRole("button", { name: /Cambiar lugar/ })).toBeNull();
    expect(within(tabla).queryByText("$4,000.00")).toBeNull();
  });

  it("semana cerrada: solo lectura y «Reabrir» exige motivo", async () => {
    const user = userEvent.setup();
    const cerrada = {
      ...RESPUESTA,
      semana: { ...RESPUESTA.semana, estado: "CERRADO", cerradaPor: { nombre: "Christian" }, cerradaAt: "2026-10-05T20:20:00.000Z" },
    };
    const llamadas = servidor(cerrada);
    render(<ControlNominaSemanal token="tok" canEdit semanaInicial={LUNES} />);
    expect(await screen.findByText("Semana cerrada")).toBeTruthy();
    expect(screen.getAllByText(/Cerrada por Christian el 5 oct 2026, 14:20/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cerrar semana y generar pagos" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reabrir" }));
    const modal = await screen.findByRole("dialog", { name: "Reabrir semana" });
    await user.click(within(modal).getByRole("button", { name: "Reabrir semana" }));
    expect(await within(modal).findByText(/Explica el motivo/)).toBeTruthy();
    expect(escrituras(llamadas)).toHaveLength(0);

    await user.type(within(modal).getByRole("textbox"), "Faltó el viático de hospedaje");
    await user.click(within(modal).getByRole("button", { name: "Reabrir semana" }));
    await waitFor(() => expect(escrituras(llamadas)).toHaveLength(1));
    expect(escrituras(llamadas)[0]).toMatchObject({
      method: "POST",
      body: { semana: LUNES, motivo: "Faltó el viático de hospedaje" },
    });
  });

  it("si la API falla, lo dice y deja reintentar", async () => {
    const user = userEvent.setup();
    let falla = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        falla
          ? ({ ok: false, status: 500, text: async () => JSON.stringify({ message: "Servidor caído" }) } as unknown as Response)
          : ({ ok: true, status: 200, text: async () => JSON.stringify(RESPUESTA) } as unknown as Response),
      ),
    );
    render(<ControlNominaSemanal token="tok" semanaInicial={LUNES} />);
    expect(await screen.findByText("No se pudo cargar la semana")).toBeTruthy();
    falla = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: /Entradas y salidas/ })).toBeTruthy();
  });
});
