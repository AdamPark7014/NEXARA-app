"use client";

/**
 * Análisis de Nómina (propuesta aprobada por Adam el 10-11): las últimas seis semanas del Control semanal,
 * la que se elige en grande, lo que falta antes de pagar, el reparto por área y cada persona.
 * Lee lo mismo que «Control semanal»: no calcula montos por su cuenta.
 */
import { useEffect, useMemo, useState } from "react";
import { financeFetch } from "@/lib/finance-api";
import { formatApiError } from "@/lib/erp-api";
import { rutaControlSemanal } from "@/lib/control-nomina-api";
import { lunesDe, sumarDias } from "@/lib/control-nomina";
import s from "./AnalisisNomina.module.css";

type Fila = {
  nombre: string;
  area: string | null;
  horas: number;
  total: number;
  faltas: number;
  descuentoSugerido: number;
  extrasPendientesMin: number;
  cumplimiento: number | null;
};

type Semana = {
  lunes: string;
  total: number;
  horas: number;
  personas: number;
  faltas: number;
  descuentosSugeridos: number;
  extrasPendientesMin: number;
  filas: Fila[];
};

const SEMANAS = 6;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SIN_AREA = "Sin área";

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dinero = (v: number) => `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «2–8 nov» o «26 oct–1 nov». */
export function etiquetaSemana(lunes: string): string {
  const fin = sumarDias(lunes, 6);
  const [, m1, d1] = lunes.split("-").map(Number);
  const [, m2, d2] = fin.split("-").map(Number);
  return `${d1}${m1 !== m2 ? ` ${MESES[m1 - 1]}` : ""}–${d2} ${MESES[m2 - 1]}`;
}

function aSemana(lunes: string, raw: Record<string, unknown>): Semana {
  const t = (raw.totales ?? {}) as Record<string, unknown>;
  const filas = ((raw.filas ?? []) as Record<string, unknown>[]).map((f) => ({
    nombre: String(f.nombre ?? ""),
    area: (f.area as string | null) ?? null,
    horas: n(f.horasNetasTotales ?? f.horasTotales),
    total: n(f.total),
    faltas: n(f.faltasInjustificadas),
    descuentoSugerido: n(f.descuentosSugeridosTotal),
    extrasPendientesMin: n(f.extrasMinutosPendientes),
    cumplimiento: f.cumplimientoPct == null ? null : n(f.cumplimientoPct),
  }));
  return {
    lunes,
    total: n(t.total),
    horas: n(t.horasTotales ?? t.horas),
    personas: n(t.personas) || filas.length,
    faltas: n(t.faltasInjustificadas ?? t.faltas),
    descuentosSugeridos: n(t.descuentosSugeridosTotal),
    extrasPendientesMin: n(t.extrasMinutosPendientes),
    filas,
  };
}

export default function AnalisisNomina({ token, onIrControl }: { token: string; onIrControl: () => void }) {
  const [semanas, setSemanas] = useState<Semana[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const [area, setArea] = useState("");

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    // La semana en curso todavía no se paga: se cuentan las seis cerradas antes de ella.
    const ultima = sumarDias(lunesDe(new Date()), -7);
    const lunes = Array.from({ length: SEMANAS }, (_, i) => sumarDias(ultima, -7 * (SEMANAS - 1 - i)));
    Promise.all(
      lunes.map((l) =>
        financeFetch(rutaControlSemanal(l), token).then((raw) => {
          const r = (raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw) as Record<string, unknown>;
          return aSemana(l, r ?? {});
        }),
      ),
    )
      .then((lista) => {
        if (!vivo) return;
        setSemanas(lista);
        setElegida(lista.length - 1);
      })
      .catch((e) => vivo && setError(formatApiError(e, "No se pudieron leer las semanas del Control semanal")));
    return () => {
      vivo = false;
    };
  }, [token]);

  const w = semanas && elegida != null ? semanas[elegida] : null;
  const previa = semanas && elegida ? semanas[elegida - 1] : null;
  const areas = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of w?.filas ?? []) m.set(f.area || SIN_AREA, (m.get(f.area || SIN_AREA) ?? 0) + f.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [w]);

  if (error) return <div className={s.cargando}>{error}</div>;
  if (!semanas || !w) return <div className={s.cargando}>Leyendo las últimas semanas…</div>;

  const maximo = Math.max(...semanas.map((x) => x.total), 1);
  const cambio = previa && previa.total ? ((w.total - previa.total) / previa.total) * 100 : null;
  const sinChecadas = w.filas.filter((f) => !f.horas);
  const conDescuento = w.filas.filter((f) => f.descuentoSugerido > 0);
  const casos = new Set([...sinChecadas, ...conDescuento]).size;
  const filas = w.filas.filter((f) => !area || (f.area || SIN_AREA) === area).sort((a, b) => b.total - a.total);
  const tope = Math.max(...filas.map((f) => f.total), 1);

  return (
    <div className={s.pantalla}>
      <section className={s.banda} aria-label="Semana elegida">
        <div>
          <div className={s.eyebrow}>Semana {etiquetaSemana(w.lunes)} · total a pagar</div>
          <div className={s.total}>{dinero(w.total)}</div>
          <span className={s.cambio}>
            {cambio == null ? "primera semana del rango" : `${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio).toFixed(1)} % contra la semana anterior`}
          </span>
          <div className={s.pasos}>
            <span className={`${s.paso} ${s.pasoHecho}`}>1 · Semana calculada</span>
            <span className={s.paso}>2 · Revisar {casos} {casos === 1 ? "caso" : "casos"}</span>
            <span className={s.paso}>3 · Cerrar y generar pagos</span>
            <span className={s.paso}>4 · Pagado</span>
          </div>
        </div>
        <div className={s.barras}>
          {semanas.map((x, i) => (
            <button
              key={x.lunes}
              type="button"
              className={s.barra}
              aria-pressed={i === elegida}
              aria-label={`Semana ${etiquetaSemana(x.lunes)}: ${dinero(x.total)}`}
              onClick={() => setElegida(i)}
            >
              <b>${(x.total / 1000).toFixed(1)}k</b>
              <i style={{ height: Math.round((x.total / maximo) * 74) }} />
              <small>{etiquetaSemana(x.lunes)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={s.cuatro} aria-label="Antes de pagar">
        <div className={`${s.tarjeta} ${s.ambar}`}>
          <small>Descuentos por aceptar</small>
          <strong>{dinero(w.descuentosSugeridos)}</strong>
          <em>
            {w.faltas} faltas · {conDescuento.length} personas
          </em>
          <br />
          <button type="button" className={s.enlace} onClick={onIrControl}>
            Revisar y aceptar →
          </button>
        </div>
        <div className={`${s.tarjeta} ${s.verde}`}>
          <small>Si aceptas los descuentos</small>
          <strong>{dinero(w.total - w.descuentosSugeridos)}</strong>
          <em>sería el neto de la semana</em>
        </div>
        <div className={`${s.tarjeta} ${s.ambar}`}>
          <small>Extras por aprobar</small>
          <strong>{(w.extrasPendientesMin / 60).toFixed(1)} h</strong>
          <em>no se pagan hasta aprobarlas</em>
          <br />
          <button type="button" className={s.enlace} onClick={onIrControl}>
            Ir a aprobar →
          </button>
        </div>
        <div className={`${s.tarjeta} ${s.rojo}`}>
          <small>Sin checadas</small>
          <strong>{sinChecadas.length}</strong>
          <em>{dinero(sinChecadas.reduce((a, f) => a + f.total, 0))} incluidos en el total</em>
        </div>
      </section>

      <section className={s.dos}>
        <div className={s.tarjeta}>
          <h4 className={s.titulo}>Por área</h4>
          {areas.map(([nombre, monto]) => (
            <button key={nombre} type="button" className={s.area} onClick={() => setArea(nombre)}>
              <div className={s.areaLinea}>
                <span>{nombre}</span>
                <b>{dinero(monto)}</b>
              </div>
              <div className={s.pista}>
                <u style={{ width: `${Math.round((monto / (w.total || 1)) * 100)}%` }} />
              </div>
            </button>
          ))}
          <h4 className={s.titulo} style={{ marginTop: 18 }}>
            Horas de la semana
          </h4>
          <div className={s.horas}>{w.horas.toFixed(1)} h</div>
          <div className={s.tenue}>
            {w.personas} personas · promedio {(w.horas / (w.personas || 1)).toFixed(1)} h
          </div>
        </div>
        <div className={s.tarjeta}>
          <div className={s.chips} role="group" aria-label="Área">
            <button type="button" className={s.chip} aria-pressed={!area} onClick={() => setArea("")}>
              Todos
            </button>
            {areas.map(([nombre]) => (
              <button key={nombre} type="button" className={s.chip} aria-pressed={area === nombre} onClick={() => setArea(nombre)}>
                {nombre}
              </button>
            ))}
          </div>
          {filas.map((f) => {
            const estado = !f.horas
              ? { texto: "Sin checadas", clase: s.estadoRojo }
              : f.faltas
                ? { texto: `${f.faltas} falta${f.faltas > 1 ? "s" : ""}`, clase: s.estadoAmbar }
                : f.extrasPendientesMin > 0
                  ? { texto: "Extras por aprobar", clase: "" }
                  : { texto: "Listo", clase: "" };
            return (
              <div key={f.nombre} className={s.persona}>
                <span className={s.iniciales}>
                  {f.nombre
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")}
                </span>
                <div>
                  <b>{f.nombre.split(/\s+/).slice(0, 3).join(" ")}</b>
                  <small>
                    {f.area || SIN_AREA} · {f.horas.toFixed(1)} h
                  </small>
                </div>
                <div className={s.pista}>
                  <u style={{ width: `${Math.round((f.total / tope) * 100)}%` }} />
                </div>
                <div className={`${s.der} ${s.tenue}`}>{f.cumplimiento == null ? "—" : `${f.cumplimiento} %`}</div>
                <div className={s.der}>
                  <b>{dinero(f.total)}</b>
                </div>
                <span className={`${s.estado} ${estado.clase}`}>{estado.texto}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
