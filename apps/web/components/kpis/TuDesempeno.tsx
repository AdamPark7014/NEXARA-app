"use client";

/**
 * «Tu desempeño» en el inicio de cada persona (Adam, 11-11): su índice de la semana y de qué sale,
 * sin abrir el tablero del equipo. Los números son los mismos de Desempeño (`me/kpis/equipo/:id`).
 * Si la consulta falla no se enseña nada: un error de la API nunca llega a la pantalla de inicio.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { fetchKpisPersona, type KpisPersonaResponse } from "@/lib/kpis-equipo";
import { rangoDePreset } from "@/lib/team-board-api";
import { resumenDesempeno } from "@/lib/desempeno";
import s from "./TuDesempeno.module.css";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} %`);

export default function TuDesempeno() {
  const { user, token } = useUser();
  const [datos, setDatos] = useState<KpisPersonaResponse | null>(null);
  const userId = Number(user?.id) || 0;

  useEffect(() => {
    if (!token || !userId) return;
    let vivo = true;
    fetchKpisPersona(token, userId, rangoDePreset("semana"))
      .then((r) => vivo && setDatos(r))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [token, userId]);

  if (!datos) return null;
  const t = datos.totales;
  const indice = t.cumplimientoPct;
  const e = t.entregas;

  return (
    <section className={s.tarjeta} aria-label="Tu desempeño de esta semana">
      <div className={s.indice}>
        <span className={s.eyebrow}>Tu desempeño · esta semana</span>
        <strong className={s.valor}>{indice == null ? "—" : Math.round(indice)}</strong>
        <span className={s.resumen}>{resumenDesempeno(t)}</span>
      </div>
      <dl className={s.cifras}>
        <div>
          <dt>Entregas a tiempo</dt>
          <dd>{e && e.medidas > 0 ? `${e.aTiempo} de ${e.medidas}` : "—"}</dd>
        </div>
        <div>
          <dt>Tiempo en actividades</dt>
          <dd>{pct(t.ocupacion?.pct)}</dd>
        </div>
        <div>
          <dt>Llegadas a tiempo</dt>
          <dd>{pct(t.asistenciaPuntual?.pct)}</dd>
        </div>
      </dl>
    </section>
  );
}
