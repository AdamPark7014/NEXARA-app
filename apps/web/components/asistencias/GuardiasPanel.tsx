"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { Alert, Avatar, Badge, Button, Card, CardHead, Field, Input, Select, SkeletonRows } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  NOTA_GUARDIA_MAX,
  diaCorto,
  fetchGuardias,
  finesDeSemana,
  programarGuardia,
  quitarGuardia,
  type Guardia,
  type GuardiasRango,
} from "@/lib/guardias-api";
import s from "./guardias.module.css";

const ERROR_CARGA = "No se pudieron cargar las guardias.";
const ERROR_PROGRAMAR = "No se pudo programar la guardia.";
const ERROR_QUITAR = "No se pudo quitar la guardia.";
const VACIO = "No tienes guardias programadas.";

/** Una sola frase. Si el API manda un párrafo, se queda el respaldo. */
function unaFrase(texto: string, respaldo: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return respaldo;
  const partes = limpio.split(/(?<=[.!?])\s+/).filter(Boolean);
  return partes.length > 1 ? respaldo : limpio;
}

/**
 * Guardias de sábado y domingo. Quién puede programar lo decide el API (`puedeProgramar`).
 */
export default function GuardiasPanel({ token }: { token: string }) {
  const [datos, setDatos] = useState<GuardiasRango | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);
  const personaRef = useRef<HTMLSelectElement>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await fetchGuardias(token));
    } catch (e) {
      // Si ya había calendario, se queda a la vista; solo se avisa.
      setError(unaFrase(formatApiError(e, ERROR_CARGA), ERROR_CARGA));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const fines = useMemo(() => (datos ? finesDeSemana(datos.desde, datos.hasta) : []), [datos]);
  const dias = useMemo(
    () => fines.flatMap((f) => [f.sabado, f.domingo]).filter((d): d is string => Boolean(d)),
    [fines],
  );
  const porDia = useMemo(() => {
    const m = new Map<string, Guardia[]>();
    for (const g of datos?.items ?? []) m.set(g.fecha, [...(m.get(g.fecha) ?? []), g]);
    return m;
  }, [datos]);

  const programar = async () => {
    if (!persona || !fecha) return;
    setGuardando(true);
    setErrorForm(null);
    try {
      await programarGuardia(token, { userId: Number(persona), fecha, nota: nota.trim() || undefined });
      setPersona("");
      setNota("");
      await cargar();
    } catch (e) {
      setErrorForm(unaFrase(formatApiError(e, ERROR_PROGRAMAR), ERROR_PROGRAMAR));
    } finally {
      setGuardando(false);
    }
  };

  /** Desde el calendario: deja el día elegido y lleva el foco a «Persona». */
  const programarEn = (d: string) => {
    setFecha(d);
    setErrorForm(null);
    personaRef.current?.focus();
    personaRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  const pedirQuitar = (g: Guardia) => {
    setConfirmar({
      title: "Quitar guardia",
      message: `${g.persona?.nombre ?? "Esta persona"} ya no podrá checar el ${diaCorto(g.fecha)}.`,
      confirmLabel: "Quitar",
      danger: true,
      fn: async () => {
        try {
          await quitarGuardia(token, g.id);
          await cargar();
        } catch (e) {
          setError(unaFrase(formatApiError(e, ERROR_QUITAR), ERROR_QUITAR));
        }
      },
    });
  };

  if (cargando && !datos) {
    return (
      <div className={s.panel}>
        <h2 className={s.titulo}>Guardias</h2>
        <SkeletonRows rows={4} label="Cargando guardias" />
      </div>
    );
  }

  if (error && !datos) {
    return (
      <div className={s.panel}>
        <h2 className={s.titulo}>Guardias</h2>
        <p className={s.frase} role="alert">
          {error}
        </p>
        <div className={s.reintento}>
          <Button size="sm" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  const sinNada = !datos.puedeProgramar && datos.items.length === 0;

  return (
    <div className={s.panel}>
      <h2 className={s.titulo}>Guardias</h2>

      {error ? (
        <p className={s.aviso} role="alert">
          {error}
        </p>
      ) : null}

      {datos.puedeProgramar ? (
        <Card aria-label="Programar guardia">
          <CardHead title="Programar guardia" />
          <div className={s.form}>
            <div className={s.campos}>
              <Field label="Persona" required>
                <Select ref={personaRef} value={persona} onChange={(e) => setPersona(e.target.value)}>
                  <option value="">Elige a quién</option>
                  {datos.personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.puesto ? ` · ${p.puesto}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Día" required>
                <Select value={fecha} onChange={(e) => setFecha(e.target.value)}>
                  <option value="">Sábado o domingo</option>
                  {dias.map((d) => (
                    <option key={d} value={d}>
                      {diaCorto(d)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nota" optional className={s.campoNota}>
                <Input
                  value={nota}
                  maxLength={NOTA_GUARDIA_MAX}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Cubre emergencias de CCTV"
                />
              </Field>
            </div>
            {errorForm ? (
              <Alert tone="danger" role="alert">
                {errorForm}
              </Alert>
            ) : null}
            <div className={s.pie}>
              <Button
                variant="primary"
                iconStart={<EventAvailableOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                disabled={!persona || !fecha || guardando}
                loading={guardando}
                onClick={() => void programar()}
              >
                Programar guardia
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {sinNada ? (
        <p className={s.frase} role="status">
          {VACIO}
        </p>
      ) : (
        <div className={s.fines}>
          {fines.map((f) => {
            const primero = (f.sabado ?? f.domingo) as string;
            const diasDelFin = [f.sabado, f.domingo].filter((d): d is string => Boolean(d));
            const total = diasDelFin.reduce((n, d) => n + (porDia.get(d)?.length ?? 0), 0);
            return (
              <section key={primero} className={s.fin} aria-label={`Fin de semana del ${diaCorto(primero)}`}>
                <header className={s.finHead}>
                  <h3 className={s.finTitulo}>Fin de semana del {diaCorto(primero)}</h3>
                  <Badge size="sm" tone={total > 0 ? "brand" : "neutral"}>
                    {total === 0 ? "Sin guardias" : total === 1 ? "1 de guardia" : `${total} de guardia`}
                  </Badge>
                </header>
                <div className={s.dias}>
                  {diasDelFin.map((d) => {
                    const lista = porDia.get(d) ?? [];
                    const esHoy = d === datos.hoy;
                    return (
                      <div key={d} className={s.dia} data-hoy={esHoy ? "true" : undefined}>
                        <div className={s.diaHead}>
                          <strong className={s.diaNombre}>{diaCorto(d)}</strong>
                          {esHoy ? (
                            <Badge size="sm" tone="success" dot>
                              Hoy
                            </Badge>
                          ) : null}
                          {datos.puedeProgramar ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon
                              className={s.diaMas}
                              aria-label={`Programar guardia el ${diaCorto(d)}`}
                              title="Programar guardia este día"
                              onClick={() => programarEn(d)}
                            >
                              <AddOutlinedIcon fontSize="small" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                        {lista.length === 0 ? (
                          <span className={s.nadie}>Nadie de guardia.</span>
                        ) : (
                          <ul className={s.personas}>
                            {lista.map((g) => {
                              const nombre = g.persona?.nombre ?? `Persona #${g.userId}`;
                              return (
                                <li key={g.id} className={s.persona}>
                                  <Avatar name={nombre} avatarUrl={g.persona?.avatarUrl} size={32} />
                                  <span className={s.personaTexto}>
                                    <span className={s.personaNombre}>{nombre}</span>
                                    {g.nota ? <span className={s.personaNota}>{g.nota}</span> : null}
                                  </span>
                                  {g.puedeQuitar ? (
                                    <Button
                                      size="sm"
                                      variant="danger-ghost"
                                      aria-label={`Quitar guardia de ${g.persona?.nombre ?? "esta persona"} el ${diaCorto(g.fecha)}`}
                                      onClick={() => pedirQuitar(g)}
                                    >
                                      Quitar
                                    </Button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog state={confirmar} onClose={() => setConfirmar(null)} />
    </div>
  );
}
