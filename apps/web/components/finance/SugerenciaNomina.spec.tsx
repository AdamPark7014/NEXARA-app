import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SugerenciaNomina, {
  NOTA_FORMULA,
  diaYFecha,
  encabezadoSemana,
  fechaCorta,
  formatoHoras,
  rangoCorto,
  rutaSugerencia,
  type FilaSugerencia,
  type SugerenciaNominaRespuesta,
} from "./SugerenciaNomina";

const fila = (over: Partial<FilaSugerencia>): FilaSugerencia => ({
  userId: 1,
  nombre: "Ana López",
  puesto: null,
  numeroEmpleado: null,
  horario: "Oficina · entra 09:00",
  horasLaboradas: 88,
  horasProductivas: 70.4,
  productividadPct: 80,
  horasEsperadas: 88,
  cumplimientoPct: 100,
  sueldoSemanal: 4000,
  horasSemanales: 40,
  origenDivisor: "plantilla",
  divisor: "Oficina · entra 09:00: 8 h × 5 días = 40 h",
  pagoHora: 100,
  pagoPorLaboradas: 8800,
  pagoPorProductivas: 7040,
  sueldoPeriodo: 8571.43,
  montoSugerido: 8571.43,
  devengadoALaFecha: 571.43,
  proyectado: 8571.43,
  diasALaFecha: 1,
  diasRestantes: 14,
  estado: "ok",
  sugerencia: "Cumplió su jornada (88 h de 88 h): se sugiere su sueldo.",
  avisos: [],
  ...over,
});

const RESPUESTA: SugerenciaNominaRespuesta = {
  periodo: {
    desde: "2026-10-01",
    hasta: "2026-10-15",
    etiqueta: "1.ª quincena de octubre de 2026 (1–15)",
    origen: "calculado",
    clave: "quincena",
    enCurso: true,
    calculadoHasta: "2026-10-01",
  },
  periodos: [
    { clave: "semana", desde: "2026-09-28", hasta: "2026-10-04", etiqueta: "semana" },
    { clave: "semana_anterior", desde: "2026-09-21", hasta: "2026-09-27", etiqueta: "semana" },
    { clave: "quincena", desde: "2026-10-01", hasta: "2026-10-15", etiqueta: "1.ª quincena" },
    { clave: "quincena_anterior", desde: "2026-09-16", hasta: "2026-09-30", etiqueta: "2.ª quincena" },
    { clave: "mes", desde: "2026-10-01", hasta: "2026-10-31", etiqueta: "octubre" },
    { clave: "mes_anterior", desde: "2026-09-01", hasta: "2026-09-30", etiqueta: "septiembre" },
  ],
  generadoAt: "2026-10-02T16:00:00.000Z",
  scope: "company",
  formula: ["Pago por hora = sueldo semanal ÷ horas semanales de su horario."],
  filas: [
    fila({ userId: 2, nombre: "Beto Ruiz", productividadPct: 40, estado: "revisar", sugerencia: "Productivas: 40 % de las laboradas." }),
    fila({
      userId: 3,
      nombre: "Carla Díaz",
      sueldoSemanal: null,
      pagoHora: null,
      pagoPorLaboradas: null,
      pagoPorProductivas: null,
      sueldoPeriodo: null,
      montoSugerido: null,
      estado: "sin_sueldo",
      sugerencia: "Sin sueldo semanal capturado en RH: no se puede calcular el pago.",
    }),
    fila({}),
  ],
  totales: {
    personas: 3,
    sinSueldo: 1,
    sinJornadas: 0,
    revisar: 1,
    horasLaboradas: 264,
    horasProductivas: 211.2,
    productividadPct: 80,
    pagoPorLaboradas: 17600,
    pagoPorProductivas: 14080,
    sueldoPeriodo: 17142.86,
    montoSugerido: 17142.86,
    devengadoALaFecha: 1142.86,
    proyectado: 17142.86,
  },
};

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return vi.fn(
    async () =>
      ({
        ok,
        status,
        json: async () => cuerpo,
        text: async () => JSON.stringify(cuerpo),
      }) as unknown as Response,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("rutaSugerencia", () => {
  it("periodo calculado o del calendario por nombre; rango solo si está completo y en orden", () => {
    expect(rutaSugerencia("quincena", "", "")).toBe("employee-payments/sugerencia-nomina?periodo=quincena");
    expect(rutaSugerencia("semana_anterior", "", "")).toBe("employee-payments/sugerencia-nomina?periodo=semana_anterior");
    expect(rutaSugerencia("vigente", "", "")).toBe("employee-payments/sugerencia-nomina?periodo=vigente");
    expect(rutaSugerencia("anterior", "", "")).toBe("employee-payments/sugerencia-nomina?periodo=anterior");
    expect(rutaSugerencia("rango", "2026-09-01", "2026-09-15")).toBe(
      "employee-payments/sugerencia-nomina?desde=2026-09-01&hasta=2026-09-15",
    );
    expect(rutaSugerencia("rango", "2026-09-01", "")).toBeNull();
    expect(rutaSugerencia("rango", "2026-09-15", "2026-09-01")).toBeNull();
  });

  it("encabezado de la semana de pago, sin quincenas", () => {
    expect(diaYFecha("2026-11-02")).toBe("lunes 2 nov");
    expect(encabezadoSemana("2026-10-26", "2026-11-01", "2026-11-02")).toBe("Semana del 26 oct al 1 nov · se paga el lunes 2 nov");
    expect(encabezadoSemana("2026-10-19", "2026-10-25", "2026-10-26")).toBe("Semana del 19 al 25 oct · se paga el lunes 26 oct");
    expect(encabezadoSemana("2026-10-19", "2026-10-25")).toBe("Semana del 19 al 25 oct");
  });

  it("fechas cortas para el selector, con el año si el rango cruza de año", () => {
    expect(fechaCorta("2026-11-01")).toBe("1 nov");
    expect(rangoCorto("2026-10-26", "2026-11-01")).toBe("26 oct – 1 nov");
    expect(rangoCorto("2026-12-28", "2027-01-03")).toBe("28 dic 2026 – 3 ene 2027");
  });

  it("formatea horas en español de México", () => {
    expect(formatoHoras(70.4)).toBe("70.4 h");
    expect(formatoHoras(1234.5)).toBe("1,234.5 h");
  });
});

describe("SugerenciaNomina", () => {
  it("abre en la semana en curso con la sesión y enseña la fórmula y los dos cortes", async () => {
    const f = respuesta(RESPUESTA);
    vi.stubGlobal("fetch", f);
    render(<SugerenciaNomina token="tok-9" />);

    expect(await screen.findByText("Ana López")).toBeTruthy();
    const [url, init] = (f.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    expect(String(url)).toContain("employee-payments/sugerencia-nomina?periodo=semana");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-9");

    expect(screen.getByText(NOTA_FORMULA)).toBeTruthy();
    expect(screen.getByText(/no genera pagos/)).toBeTruthy();
    expect(screen.getByText(/en curso: lo esperado se cuenta hasta el 2026-10-01/)).toBeTruthy();
    expect(screen.getByText(/«a la fecha» corta el 1 oct y «periodo completo» el 15 oct/)).toBeTruthy();
    // El selector ya trae las fechas de cada periodo.
    expect(screen.getByRole("option", { name: "Semana actual · 28 sep – 4 oct" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Mes anterior · 1 sep – 30 sep" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Rango personalizado" })).toBeTruthy();
    expect(screen.getAllByText(/Periodo completo al 15 oct/).length).toBeGreaterThan(0);
  });

  it("una fila por persona, sin omitir a quien no tiene sueldo, y la fila de totales", async () => {
    vi.stubGlobal("fetch", respuesta(RESPUESTA));
    render(<SugerenciaNomina token="tok" />);

    const tabla = await screen.findByRole("region", { name: /Sugerencia de nómina por persona/ });
    expect(within(tabla).getByText("Beto Ruiz")).toBeTruthy();
    expect(within(tabla).getByText("Carla Díaz")).toBeTruthy();
    expect(within(tabla).getByText(/Sin sueldo semanal capturado/)).toBeTruthy();
    expect(within(tabla).getByText("Sin sueldo")).toBeTruthy();
    expect(within(tabla).getByText("Revisar")).toBeTruthy();
    expect(within(tabla).getByText("40 %")).toBeTruthy();
    expect(within(tabla).getByText(/Total · 3 personas/)).toBeTruthy();
    expect(within(tabla).getByText("264 h")).toBeTruthy();
    expect(within(tabla).getAllByText("÷ 40 h").length).toBe(3);
  });

  it("al cambiar de periodo vuelve a pedir sin recargar la página", async () => {
    const f = respuesta(RESPUESTA);
    vi.stubGlobal("fetch", f);
    render(<SugerenciaNomina token="tok" />);
    await screen.findByText("Ana López");

    for (const clave of ["semana_anterior", "quincena", "quincena_anterior", "mes", "mes_anterior"]) {
      await userEvent.selectOptions(screen.getByLabelText("Periodo"), clave);
      await waitFor(() =>
        expect((f.mock.calls as unknown as Array<[string]>).some(([u]) => String(u).endsWith(`periodo=${clave}`))).toBe(true),
      );
    }
  });

  it("si la API falla lo dice y deja reintentar", async () => {
    vi.stubGlobal("fetch", respuesta({ message: "Sin permiso" }, false, 403));
    render(<SugerenciaNomina token="tok" />);
    expect(await screen.findByText(/Sin permiso/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("la semana de pago", () => {
  it("el encabezado dice las fechas de la semana y su día de pago", async () => {
    const semana: SugerenciaNominaRespuesta = {
      ...RESPUESTA,
      periodo: {
        desde: "2026-10-26",
        hasta: "2026-11-01",
        etiqueta: "semana del 26 de octubre de 2026 al 1 de noviembre de 2026",
        origen: "calculado",
        clave: "semana",
        pagoEl: "2026-11-02",
        enCurso: true,
        calculadoHasta: "2026-10-28",
      },
    };
    vi.stubGlobal("fetch", respuesta(semana));
    render(<SugerenciaNomina token="tok" />);
    const encabezado = await screen.findByText(/Semana del 26 oct al 1 nov · se paga el lunes 2 nov/);
    // La frase del periodo no nombra quincenas (el selector sí las ofrece como opción).
    expect(encabezado.parentElement?.textContent ?? "").not.toMatch(/quincena/i);
  });
});
