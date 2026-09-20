"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { Alert, Button, Card, CardHead, EmptyState, InfoPopover, SkeletonRows, fieldClass, tabla } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { DIAS_SEMANA, fetchHorarios, guardarHorario, type HorarioPropio } from "@/lib/asistencia-confiable-api";
import estilo from "./asistencia-confiable.module.css";

/**
 * Horario de cada persona.
 *
 * De aquí salen el retardo y el tiempo extra, y de ahí la pre-nómina. Mientras nadie
 * escriba nada la tabla está vacía y manda la plantilla de siempre; por eso las casillas
 * vacías no son un error, son «lo de siempre». Borrarlo todo devuelve a la persona a su
 * plantilla, que es la única forma honesta de decir «déjalo como estaba».
 */

export type PersonaHorario = { id: number; nombre: string; puesto?: string | null };

type Borrador = {
  horaEntrada: string;
  horaSalida: string;
  dias: number[];
  graciaMin: string;
  jornadaHoras: string;
};

const vacio: Borrador = { horaEntrada: "", horaSalida: "", dias: [], graciaMin: "", jornadaHoras: "" };

const aBorrador = (h?: HorarioPropio): Borrador =>
  h
    ? {
        horaEntrada: h.horaEntrada ?? "",
        horaSalida: h.horaSalida ?? "",
        dias: [...(h.dias ?? [])],
        graciaMin: h.graciaMin != null ? String(h.graciaMin) : "",
        jornadaHoras: h.jornadaOrdinariaMin != null ? String(h.jornadaOrdinariaMin / 60) : "",
      }
    : { ...vacio };

const igual = (a: Borrador, b: Borrador) =>
  a.horaEntrada === b.horaEntrada &&
  a.horaSalida === b.horaSalida &&
  a.graciaMin === b.graciaMin &&
  a.jornadaHoras === b.jornadaHoras &&
  a.dias.length === b.dias.length &&
  a.dias.every((d) => b.dias.includes(d));

export default function HorariosEquipo({
  token,
  personas,
}: {
  token: string;
  personas: PersonaHorario[];
}) {
  const [guardados, setGuardados] = useState<HorarioPropio[] | null>(null);
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const filas = await fetchHorarios(token);
      setGuardados(filas);
      setBorradores(Object.fromEntries(filas.map((f) => [f.userId, aBorrador(f)])));
    } catch (e) {
      setGuardados(null);
      setError(formatApiError(e, "No se pudieron cargar los horarios"));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porUsuario = useMemo(
    () => new Map((guardados ?? []).map((h) => [h.userId, h])),
    [guardados],
  );

  const borradorDe = (userId: number) => borradores[userId] ?? aBorrador(porUsuario.get(userId));

  const editar = (userId: number, cambio: Partial<Borrador>) =>
    setBorradores((prev) => ({ ...prev, [userId]: { ...borradorDe(userId), ...cambio } }));

  const alternarDia = (userId: number, dia: number) => {
    const actual = borradorDe(userId).dias;
    editar(userId, {
      dias: actual.includes(dia) ? actual.filter((d) => d !== dia) : [...actual, dia].sort(),
    });
  };

  const guardar = async (userId: number) => {
    const b = borradorDe(userId);
    setGuardando(userId);
    setError(null);
    setAviso(null);
    try {
      const horas = Number(b.jornadaHoras);
      const r = await guardarHorario(token, {
        userId,
        horaEntrada: b.horaEntrada || null,
        horaSalida: b.horaSalida || null,
        dias: b.dias,
        graciaMin: b.graciaMin === "" ? null : Number(b.graciaMin),
        jornadaOrdinariaMin: b.jornadaHoras === "" || !Number.isFinite(horas) ? null : Math.round(horas * 60),
      });
      setAviso(r?.message ?? "Horario guardado");
      await cargar();
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar el horario"));
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Card>
      <CardHead
        title="Horario de cada persona"
        actions={
          <InfoPopover label="¿Cómo funciona?" title="Horario de cada persona">
            <p style={{ margin: "0 0 8px" }}>
              Vacío significa <strong style={{ color: "var(--ui-fg)" }}>lo de siempre</strong>: oficina entra 09:00,
              campo 08:00, 15 minutos de tolerancia, de lunes a viernes, jornada de 8 h netas de comida.
            </p>
            <ul>
              <li>Cada casilla se decide por separado: cambiar la hora de entrada no cambia sus días ni su jornada.</li>
              <li>La hora de salida es informativa. La jornada se mide con las checadas, no con ella.</li>
              <li>
                Poner una hora de entrada a quien no tenía (dirección 24/7, visitante) hace que a partir de ahí sí se
                le cuenten retardos y tiempo extra.
              </li>
              <li>Borrar todo y guardar devuelve a la persona a su plantilla.</li>
              <li>De esto salen el retardo y el tiempo extra, y de ahí la pre-nómina: queda registrado quién lo cambió.</li>
            </ul>
          </InfoPopover>
        }
      />

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {aviso ? <Alert tone="info">{aviso}</Alert> : null}

      {!guardados ? (
        <SkeletonRows rows={4} label="Cargando horarios" />
      ) : personas.length ? (
        <div className={tabla.tabla} role="table" aria-label="Horario de cada persona">
          <div className={`${tabla.cabeza} ${estilo.horarios}`} role="row">
            <span role="columnheader">Persona</span>
            <span role="columnheader">Días</span>
            <span role="columnheader">Entra</span>
            <span role="columnheader">Sale</span>
            <span role="columnheader">Jornada / tolerancia</span>
            <span role="columnheader">Origen</span>
            <span role="columnheader" />
          </div>
          {personas.map((p) => {
            const b = borradorDe(p.id);
            const original = aBorrador(porUsuario.get(p.id));
            const sucio = !igual(b, original);
            const propio = porUsuario.has(p.id);
            return (
              <div key={p.id} className={`${tabla.fila} ${estilo.horarios}`} role="row">
                <span className={tabla.celda} role="cell">
                  <span className={tabla.fuerte}>{p.nombre}</span>
                  <span className={tabla.tenue}>{p.puesto ?? ""}</span>
                </span>
                <span role="cell">
                  <span className={estilo.dias}>
                    {DIAS_SEMANA.map((d) => (
                      <button
                        key={d.valor}
                        type="button"
                        className={estilo.dia}
                        aria-pressed={b.dias.includes(d.valor)}
                        aria-label={d.largo}
                        title={d.largo}
                        onClick={() => alternarDia(p.id, d.valor)}
                      >
                        {d.corto}
                      </button>
                    ))}
                  </span>
                </span>
                <span role="cell">
                  <input
                    type="time"
                    className={`${fieldClass} ${estilo.campo} ${estilo.campoCorto}`}
                    value={b.horaEntrada}
                    aria-label={`Hora de entrada de ${p.nombre}`}
                    onChange={(e) => editar(p.id, { horaEntrada: e.target.value })}
                  />
                </span>
                <span role="cell">
                  <input
                    type="time"
                    className={`${fieldClass} ${estilo.campo} ${estilo.campoCorto}`}
                    value={b.horaSalida}
                    aria-label={`Hora de salida de ${p.nombre}`}
                    onChange={(e) => editar(p.id, { horaSalida: e.target.value })}
                  />
                </span>
                <span className={estilo.acciones} role="cell">
                  <input
                    type="number"
                    min={1}
                    max={16}
                    step={0.5}
                    placeholder="8 h"
                    className={`${fieldClass} ${estilo.campo} ${estilo.campoCorto}`}
                    value={b.jornadaHoras}
                    aria-label={`Jornada diaria de ${p.nombre}, en horas`}
                    onChange={(e) => editar(p.id, { jornadaHoras: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    max={180}
                    placeholder="15 min"
                    className={`${fieldClass} ${estilo.campo} ${estilo.campoCorto}`}
                    value={b.graciaMin}
                    aria-label={`Tolerancia de ${p.nombre}, en minutos`}
                    onChange={(e) => editar(p.id, { graciaMin: e.target.value })}
                  />
                </span>
                <span role="cell">
                  <span className={tabla.tenue}>{propio ? "Propio" : "Plantilla"}</span>
                </span>
                <span className={estilo.acciones} role="cell">
                  <Button
                    variant={sucio ? "primary" : "ghost"}
                    disabled={!sucio || guardando === p.id}
                    onClick={() => void guardar(p.id)}
                  >
                    {guardando === p.id ? "Guardando…" : "Guardar"}
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ScheduleOutlinedIcon />}
          title="Sin gente a tu cargo"
          description="Los horarios los edita quien tiene equipo."
        />
      )}
    </Card>
  );
}
