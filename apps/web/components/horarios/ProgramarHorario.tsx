"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/base";
import { toast } from "@/components/Toast";
import HoraInput24 from "@/components/ops/HoraInput24";
import Cajon from "@/components/ui/Cajon";
import { formatApiError } from "@/lib/erp-api";
import {
  avisosEnPalabras,
  diaCorto,
  plantillasTurno,
  programarHorarios,
  quitarHorario,
  revisarProgramacion,
  sumarDias,
  type AvisosProgramacion,
  type PersonaSemana,
  type PlantillaTurno,
  type Programacion,
} from "@/lib/horarios-api";
import s from "./horarios.module.css";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);
const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Programar o cambiar el horario de una o varias personas en uno o varios días. */
export default function ProgramarHorario({
  token,
  personas,
  inicial,
  lunes,
  hoy,
  onCerrar,
  onGuardado,
}: {
  token: string;
  personas: PersonaSemana[];
  inicial: { userIds: number[]; fechas: string[] };
  lunes: string;
  hoy: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const unaCelda = inicial.userIds.length === 1 && inicial.fechas.length === 1;
  const dia0 = unaCelda
    ? personas.find((p) => p.id === inicial.userIds[0])?.dias.find((d) => d.fecha === inicial.fechas[0])
    : undefined;
  const [userIds, setUserIds] = useState<number[]>(inicial.userIds);
  const [fechas, setFechas] = useState<string[]>(inicial.fechas);
  const [entra, setEntra] = useState(dia0?.horario.horaEntrada ?? "10:00");
  const [sale, setSale] = useState(dia0?.horario.horaSalida ?? "18:00");
  const [motivo, setMotivo] = useState(dia0?.programado ? (dia0.horario.motivo ?? "") : "");
  const [plantillas, setPlantillas] = useState<PlantillaTurno[]>([]);
  const [avisos, setAvisos] = useState<{ clave: string; datos: AvisosProgramacion } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cerrojo = useRef(false);

  useEffect(() => {
    let vivo = true;
    plantillasTurno(token)
      .then((l) => vivo && setPlantillas(l))
      .catch(() => undefined); // Sin plantillas se escribe la hora a mano.
    return () => {
      vivo = false;
    };
  }, [token]);

  const plantilla = plantillas.find((p) => p.horaEntrada === entra && p.horaSalida === sale) ?? null;
  const horasOk = HORA.test(entra) && HORA.test(sale) && entra !== sale;
  const listo = userIds.length > 0 && fechas.length > 0 && horasOk;
  const cuerpo = useMemo<Programacion>(
    () => ({
      userIds,
      fechas,
      horaEntrada: entra,
      horaSalida: sale,
      plantillaTurnoId: plantilla?.id ?? null,
      motivo: motivo.trim() || null,
    }),
    [userIds, fechas, entra, sale, plantilla, motivo],
  );
  const clave = `${userIds.join(",")}|${fechas.join(",")}|${entra}|${sale}`;

  // Los avisos se calculan solos mientras se arma; guardar exige haber visto los de esta combinación.
  useEffect(() => {
    if (!listo) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      revisarProgramacion(token, cuerpo)
        .then((r) => vivo && setAvisos({ clave, datos: r.avisos }))
        .catch(() => undefined); // Al guardar el servidor vuelve a revisar y lo dice.
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
    // `clave` resume lo que cambia los avisos; el motivo no los cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, listo, token]);

  const vistos = avisos?.clave === clave;
  const palabras = vistos ? avisosEnPalabras(avisos.datos) : [];
  const turnos = userIds.length * fechas.length;

  const correr = async (fn: () => Promise<string | null>) => {
    if (cerrojo.current) return;
    cerrojo.current = true;
    setOcupado(true);
    setError(null);
    try {
      const exito = await fn();
      if (exito) {
        toast.success(exito);
        onGuardado();
      }
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar. Lo que escribiste sigue aquí para reintentar."));
    } finally {
      cerrojo.current = false;
      setOcupado(false);
    }
  };

  const guardar = () => {
    if (!userIds.length) return setError("Elige al menos a una persona.");
    if (!fechas.length) return setError("Elige al menos un día.");
    if (!horasOk) return setError("Escribe a qué hora entra y a qué hora sale (no pueden ser iguales).");
    void correr(async () => {
      const r = await programarHorarios(token, cuerpo, vistos && palabras.length > 0);
      if (!r.ok) {
        // Alguien cambió algo mientras tanto: se enseñan los avisos y se vuelve a pedir.
        setAvisos({ clave, datos: r.avisos });
        setError("Revisa estos avisos y vuelve a programar si estás de acuerdo.");
        return null;
      }
      return `${contar(r.creados, "turno programado", "turnos programados")}. Ya les avisamos por chat.`;
    });
  };

  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(lunes, i)).filter((f) => f >= hoy);

  return (
    <Cajon
      titulo={unaCelda ? "Cambiar horario" : "Programar horario"}
      subtitulo={unaCelda ? personas.find((p) => p.id === inicial.userIds[0])?.nombre : undefined}
      onCerrar={() => {
        if (!ocupado) onCerrar();
      }}
      pie={
        <>
          {dia0?.programado ? (
            <Button
              variant="tertiary"
              disabled={ocupado}
              onClick={() =>
                void correr(async () => {
                  await quitarHorario(token, { userId: inicial.userIds[0], fecha: inicial.fechas[0] });
                  return "Volvió a su horario de siempre.";
                })
              }
            >
              Volver al de siempre
            </Button>
          ) : null}
          <Button variant="ghost" disabled={ocupado} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" loading={ocupado} onClick={guardar}>
            {unaCelda && turnos === 1 ? "Guardar horario" : `Programar ${contar(turnos, "turno", "turnos")}`}
          </Button>
        </>
      }
    >
      <fieldset className={s.bloque}>
        <legend className={s.etiqueta}>Quién</legend>
        <div className={`${s.fichas} ${s.personas}`}>
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              className={s.ficha}
              aria-pressed={userIds.includes(p.id)}
              onClick={() => setUserIds((l) => alternar(l, p.id))}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={s.bloque}>
        <legend className={s.etiqueta}>Qué días</legend>
        <div className={s.fichas}>
          {dias.map((f) => (
            <button
              key={f}
              type="button"
              className={s.ficha}
              aria-pressed={fechas.includes(f)}
              onClick={() => setFechas((l) => alternar(l, f).sort())}
            >
              {f === hoy ? `Hoy, ${diaCorto(f).toLocaleLowerCase("es")}` : diaCorto(f)}
            </button>
          ))}
        </div>
      </fieldset>
      {plantillas.length ? (
        <fieldset className={s.bloque}>
          <legend className={s.etiqueta}>Turno</legend>
          <div className={s.fichas}>
            {plantillas.map((p) => (
              <button
                key={p.id}
                type="button"
                className={s.ficha}
                aria-pressed={plantilla?.id === p.id}
                onClick={() => {
                  setEntra(p.horaEntrada);
                  setSale(p.horaSalida);
                }}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className={s.horas}>
        <Field label="Entra">
          <HoraInput24 value={entra} onChange={setEntra} aria-label="Entra" />
        </Field>
        <Field label="Sale" hint={horasOk && sale < entra ? "Sale al día siguiente" : undefined}>
          <HoraInput24 value={sale} onChange={setSale} aria-label="Sale" />
        </Field>
      </div>
      <Field label="Motivo" optional>
        <Input value={motivo} maxLength={200} placeholder="Cableado nocturno en sitio" onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      <div aria-live="polite" className={s.pila}>
        {palabras.map((a) => (
          <Alert key={a.clave} tone="warning" title={a.titulo}>
            {a.detalle}
          </Alert>
        ))}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
      <p className={s.nota}>
        {palabras.length ? "Puedes programarlo así; queda anotado que lo viste. " : ""}A cada persona le llega un aviso por chat con su hora y quién la puso.
      </p>
    </Cajon>
  );
}
