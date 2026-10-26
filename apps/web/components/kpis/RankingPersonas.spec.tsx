import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EntregasKpi, KpiPersonaFila, TotalesKpi } from "@/lib/kpis-equipo";
import RankingPersonas from "./RankingPersonas";
import s from "./kpis.module.css";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const entregas = (over: Partial<EntregasKpi> = {}): EntregasKpi => ({
  medidas: 18,
  aTiempo: 17,
  tarde: 1,
  sinEntregar: 0,
  revisadas: 18,
  aprobadasALaPrimera: 18,
  devueltas: 0,
  pctATiempo: 94.4,
  pctALaPrimera: 100,
  ...over,
});

const totales = (over: Partial<TotalesKpi> = {}): TotalesKpi => ({
  diasConJornada: 5,
  diasSinChecada: 0,
  faltasJustificadas: 0,
  retardos: 0,
  minutosTarde: 0,
  uniforme: { revisadas: 5, ok: 5, noOk: 0, sinRevisar: 0, pct: 100 },
  minutosLaborados: 1440,
  minutosProductivos: 190,
  minutosInactivos: 1250,
  productividadPct: 13,
  minutosExtra: 0,
  minutosExtraAprobados: 0,
  minutosExtraPendientes: 0,
  diasExtraPendientes: 0,
  jornadasAbiertas: 0,
  jornadasSinSalida: 0,
  cierresAutomaticos: 0,
  actividadesFueraDeJornada: 0,
  cumplimientoPct: 90,
  entregas: entregas(),
  ...over,
});

function fila(id: number, nombre: string, t: TotalesKpi): KpiPersonaFila {
  return {
    persona: { id, nombre, email: "", avatarUrl: null, puesto: "Técnico" },
    horario: {
      clave: null,
      etiqueta: "Oficina",
      entrada: null,
      salida: null,
      graciaMin: 15,
      jornadaOrdinariaMin: null,
      dias: [],
      personalizado: false,
    },
    totales: t,
    semaforo: "verde",
    motivos: [],
  };
}

describe("ranking de indicadores", () => {
  it("un dato por renglón: el texto viejo juntaba las cifras en una sola línea", () => {
    const viejo = "17/18 a tiempo · 18/18 a la primera · 3 h 10 min en actividades de 24 h";
    const viejoSinEntregas = "Sin entregas · 3 h 10 min en actividades de 24 h";
    const viejoSinJornada = "17/18 a tiempo · Sin jornada";
    const { container } = render(
      <RankingPersonas
        hrefDe={() => "/erp/asistencias/indicadores/1"}
        personas={[
          fila(1, "Ana Ruiz", totales()),
          fila(2, "Luis Mora", totales({ entregas: entregas({ medidas: 0, revisadas: 0, aTiempo: 0, tarde: 0 }) })),
          fila(3, "Dana Gil", totales({ minutosLaborados: 0, minutosProductivos: 0, entregas: entregas({ revisadas: 0 }) })),
        ]}
      />,
    );
    const filas = [...container.querySelectorAll(`.${s.detalleCifras}`)];
    expect(filas).toHaveLength(3);

    const cifrasDe = (nodo: Element) => [...nodo.querySelectorAll(`.${s.detalleCifra}`)].map((el) => el.textContent);

    expect(cifrasDe(filas[0])).toEqual(viejo.split(" · "));
    expect(cifrasDe(filas[0]).join(" · ")).toBe(viejo);
    expect(filas[0].textContent?.includes(viejo)).toBe(true);
    expect(cifrasDe(filas[0]).some((c) => c === viejo)).toBe(false);

    expect(cifrasDe(filas[1])).toEqual(viejoSinEntregas.split(" · "));
    expect(cifrasDe(filas[1]).join(" · ")).toBe(viejoSinEntregas);
    expect(cifrasDe(filas[1]).some((c) => c === viejoSinEntregas)).toBe(false);

    expect(cifrasDe(filas[2])).toEqual(viejoSinJornada.split(" · "));
    expect(cifrasDe(filas[2]).join(" · ")).toBe(viejoSinJornada);
    expect(cifrasDe(filas[2]).some((c) => c === viejoSinJornada)).toBe(false);
  });
});
