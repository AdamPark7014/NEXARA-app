"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Alert, Button, EmptyState, FilterChip, FilterChips, SearchInput, SkeletonRows } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  diaCorto,
  diaLargo,
  formatearRangoHorario,
  hoyMx,
  lunesDe,
  minutosAHorasTexto,
  semanaHorarios,
  sumarDias,
  tituloSemana,
  type DiaHorario,
  type PersonaSemana,
  type SemanaHorarios as Semana,
} from "@/lib/horarios-api";
import ProgramarHorario from "./ProgramarHorario";
import s from "./horarios.module.css";

type Abierto = { userIds: number[]; fechas: string[] };

const tipoDe = (d: DiaHorario) => (!d.programado ? undefined : d.horario.cruzaMedianoche ? "noche" : "programado");
const textoDe = (d: DiaHorario) =>
  d.trabaja ? formatearRangoHorario(d.horario.horaEntrada, d.horario.horaSalida) : "Descansa";

/** La semana del equipo: a qué hora entra y sale cada persona, día por día. */
export default function SemanaHorarios({ token }: { token: string }) {
  const [lunes, setLunes] = useState(() => lunesDe(hoyMx()));
  const [datos, setDatos] = useState<Semana | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloCambios, setSoloCambios] = useState(false);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const pedido = useRef(0);
  const domingo = sumarDias(lunes, 6);

  const cargar = useCallback(async () => {
    if (!token) return;
    const id = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const r = await semanaHorarios(token, lunes, sumarDias(lunes, 6));
      if (id === pedido.current) setDatos(r);
    } catch (e) {
      if (id === pedido.current) setError(formatApiError(e, "No se pudieron cargar los horarios."));
    } finally {
      if (id === pedido.current) setCargando(false);
    }
  }, [token, lunes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const vigente = datos?.from === lunes ? datos : null;
  const hoy = vigente?.hoy ?? hoyMx();
  const personas = useMemo(() => vigente?.personas ?? [], [vigente]);
  const conCambios = personas.filter((p) => p.dias.some((d) => d.programado)).length;
  const visibles = personas.filter(
    (p) =>
      (!soloCambios || p.dias.some((d) => d.programado)) &&
      p.nombre.toLocaleLowerCase("es").includes(q.trim().toLocaleLowerCase("es")),
  );
  const puede = personas.some((p) => p.puedeProgramar);
  const tope = vigente?.topeExtraSemanaMin ?? 540;

  const celda = (p: PersonaSemana, d: DiaHorario, conDia = false) => {
    const etiqueta = `${p.nombre}, ${diaLargo(d.fecha)}: ${textoDe(d)}${d.programado && d.horario.motivo ? `, ${d.horario.motivo}` : ""}`;
    const dentro = (
      <>
        {conDia ? `${diaCorto(d.fecha)} · ` : ""}
        {textoDe(d)}
        {d.programado && d.horario.motivo ? <small>{d.horario.motivo}</small> : null}
      </>
    );
    return p.puedeProgramar && d.fecha >= hoy ? (
      <button
        type="button"
        className={s.dia}
        data-tipo={tipoDe(d)}
        aria-label={`${etiqueta}. Cambiar`}
        title={d.horario.motivo ?? undefined}
        onClick={() => setAbierto({ userIds: [p.id], fechas: [d.fecha] })}
      >
        {dentro}
      </button>
    ) : (
      <span className={s.dia} data-tipo={tipoDe(d)} title={d.horario.motivo ?? undefined}>
        {dentro}
      </span>
    );
  };

  const extra = (p: PersonaSemana) => (
    <>
      <span className={`${s.nombre} ${p.extraMin > tope ? s.alerta : ""}`}>{minutosAHorasTexto(p.extraMin)}</span>
      {p.extraMin > tope ? <span className={s.meta}>arriba del tope</span> : null}
    </>
  );

  return (
    <div className={s.pila}>
      <div className={s.barra}>
        <div className={s.grupo} role="group" aria-label="Elegir semana">
          <Button variant="secondary" size="sm" icon aria-label="Semana anterior" onClick={() => setLunes(sumarDias(lunes, -7))}>
            <ChevronLeftIcon fontSize="small" />
          </Button>
          <strong className={s.semana} aria-live="polite">
            {tituloSemana(lunes, domingo)}
          </strong>
          <Button variant="secondary" size="sm" icon aria-label="Semana siguiente" onClick={() => setLunes(sumarDias(lunes, 7))}>
            <ChevronRightIcon fontSize="small" />
          </Button>
          <Button variant="ghost" size="sm" disabled={lunes === lunesDe(hoyMx())} onClick={() => setLunes(lunesDe(hoyMx()))}>
            Esta semana
          </Button>
        </div>
        {puede ? (
          <Button
            variant="primary"
            disabled={domingo < hoy}
            onClick={() => setAbierto({ userIds: [], fechas: [lunes > hoy ? lunes : hoy] })}
          >
            Programar horario
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert
          tone="danger"
          role="alert"
          title="No se pudieron cargar los horarios"
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error} Lo que ya programaste sigue guardado.
        </Alert>
      ) : null}

      {personas.length > 1 ? (
        <div className={s.barra}>
          <SearchInput placeholder="Buscar persona" aria-label="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
          <FilterChips ariaLabel="Filtros">
            <FilterChip active={soloCambios} count={conCambios} onClick={() => setSoloCambios((v) => !v)}>
              Solo con cambios
            </FilterChip>
          </FilterChips>
        </div>
      ) : null}

      {!vigente && cargando ? (
        <SkeletonRows rows={6} label="Cargando horarios" />
      ) : vigente && !personas.length ? (
        <EmptyState title="No tienes personas a tu cargo" description="Aquí aparece el horario de tu equipo cuando lo tengas." />
      ) : vigente && !visibles.length ? (
        <EmptyState
          title={soloCambios && !q ? "Nadie tiene horario especial esta semana" : "Nadie coincide"}
          description={soloCambios && !q ? "Todo tu equipo sigue con su horario de siempre." : "Prueba con otro nombre o quita los filtros."}
          action={
            <Button
              onClick={() => {
                setQ("");
                setSoloCambios(false);
              }}
            >
              Ver a todos
            </Button>
          }
        />
      ) : vigente ? (
        <>
          <div className={s.marco} tabIndex={0} role="region" aria-label="Horarios de la semana">
            <table className={s.tabla}>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  {visibles[0].dias.map((d) => (
                    <th key={d.fecha} scope="col" className={d.fecha === hoy ? s.hoy : undefined}>
                      {d.fecha === hoy ? "Hoy, " : ""}
                      {d.fecha === hoy ? diaCorto(d.fecha).toLocaleLowerCase("es") : diaCorto(d.fecha)}
                    </th>
                  ))}
                  <th scope="col">Extra prevista</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className={s.nombre}>{p.nombre}</span>
                      {p.puesto ? <span className={s.meta}>{p.puesto}</span> : null}
                    </th>
                    {p.dias.map((d) => (
                      <td key={d.fecha}>{celda(p, d)}</td>
                    ))}
                    <td>{extra(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={s.leyenda}>
              <span>Sin fondo: su horario de siempre</span>
              <span>
                <i className={s.muestra} data-tipo="programado" />
                Programado para ese día
              </span>
              <span>
                <i className={s.muestra} data-tipo="noche" />
                Turno de noche
              </span>
              {puede ? <span>Toca un día para cambiarlo</span> : null}
            </div>
          </div>
          <ul className={s.tarjetas} aria-label="Horarios de la semana">
            {visibles.map((p) => (
              <li key={p.id} className={s.tarjeta}>
                <div className={s.barra}>
                  <div>
                    <span className={s.nombre}>{p.nombre}</span>
                    {p.puesto ? <span className={s.meta}>{p.puesto}</span> : null}
                  </div>
                  <div>
                    <span className={s.meta}>Extra prevista</span>
                    {extra(p)}
                  </div>
                </div>
                <div className={s.tarjetaDias}>
                  {p.dias.map((d) => (
                    <div key={d.fecha}>{celda(p, d, true)}</div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {abierto && vigente ? (
        <ProgramarHorario
          token={token}
          personas={personas.filter((p) => p.puedeProgramar)}
          inicial={abierto}
          lunes={lunes}
          hoy={hoy}
          onCerrar={() => setAbierto(null)}
          onGuardado={() => {
            setAbierto(null);
            void cargar();
          }}
        />
      ) : null}
    </div>
  );
}
