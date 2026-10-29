"use client";

import { useEffect, useRef, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { formatoMinutos } from "@/lib/actividad-tiempos";
import {
  COMPLEJIDADES,
  COMPLEJIDAD_UI,
  esComplejidad,
  fetchTiemposTipicos,
  sugerirComplejidad,
  textoTipico,
  tipicoPara,
  type Complejidad,
  type SugerenciaComplejidad,
  type TiemposTipicos,
} from "@/lib/complejidad";
import s from "./ComplejidadCampo.module.css";

/** Qué cuenta en cada nivel (al pasar el cursor): lo mismo que lee la IA. */
const COMPLEJIDAD_NIVEL_TITULO: Record<Complejidad, string> = {
  BASICA: "Rutina corta y conocida, un solo punto o equipo",
  ESTANDAR: "Lo normal de este tipo de trabajo",
  COMPLEJA: "Más volumen o más difícil: varios puntos, altura, falla sin causa clara o coordinar con otros",
  CRITICA: "El cliente está detenido o hay riesgo: sistema caído, incidente o plazo de horas",
};

/** Espera tras la última tecla antes de pedir la sugerencia (una llamada por título, no por letra). */
const ESPERA_SUGERENCIA_MS = 900;

/**
 * «Complejidad» al asignar (canvas de Asignar, 28-10): cuatro niveles con el tiempo típico de
 * cada uno, la sugerencia de la IA y, debajo, lo típico de ese tipo de trabajo para usarlo como
 * tiempo estimado. La IA solo sugiere: si nadie elige, se toma su nivel; si quien asigna cambia,
 * se guardan las dos.
 */
export default function ComplejidadCampo({
  token,
  coreKind,
  tipo,
  tipoLabel,
  titulo,
  indicaciones,
  value,
  pedirSugerencia,
  tiempoActualMin,
  onChange,
  onUsarTiempo,
  onSugerencia,
  estandarActivo = false,
}: {
  token: string;
  coreKind: string;
  /** Subtipo de tarea (etiqueta del chip) o tipo de servicio; null en los demás tipos. */
  tipo: string | null;
  /** «Instalación», «Servicio correctivo», «Obra»… */
  tipoLabel: string;
  titulo: string;
  indicaciones: string;
  value: string;
  /** false al editar una que ya tiene complejidad: no se vuelve a preguntar. */
  pedirSugerencia: boolean;
  tiempoActualMin: number;
  onChange: (next: { complejidad?: Complejidad; sugerida?: Complejidad }) => void;
  onUsarTiempo: (minutos: number) => void;
  /** La sugerencia completa (trae la cantidad y el destino que leyó la IA, para el tiempo estándar). */
  onSugerencia?: (sugerencia: SugerenciaComplejidad | null) => void;
  /** El tiempo estándar ya fija el tiempo: lo típico queda solo como referencia, sin «Usar…». */
  estandarActivo?: boolean;
}) {
  const [tiempos, setTiempos] = useState<TiemposTipicos | null>(null);
  const [sugerencia, setSugerencia] = useState<SugerenciaComplejidad | null>(null);
  const [pensando, setPensando] = useState(false);
  /** Quien asigna ya eligió a mano: la sugerencia ya no cambia su elección. */
  const elegidaAMano = useRef(esComplejidad(value) && !pedirSugerencia);
  const ultimaPregunta = useRef("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSugerenciaRef = useRef(onSugerencia);
  onSugerenciaRef.current = onSugerencia;

  useEffect(() => {
    let vivo = true;
    setTiempos(null);
    if (!token || !coreKind) return;
    fetchTiemposTipicos(token, { coreKind, tipo })
      .then((t) => vivo && setTiempos(t))
      .catch(() => vivo && setTiempos(null));
    return () => {
      vivo = false;
    };
  }, [token, coreKind, tipo]);

  useEffect(() => {
    const t = titulo.trim();
    if (!pedirSugerencia || !token || t.length < 6) return;
    const pregunta = `${coreKind}|${tipo ?? ""}|${t}|${indicaciones.trim()}`;
    if (pregunta === ultimaPregunta.current) return;
    let vivo = true;
    const espera = window.setTimeout(() => {
      ultimaPregunta.current = pregunta;
      setPensando(true);
      sugerirComplejidad(token, { coreKind, tipo, titulo: t, indicaciones })
        .then(({ sugerencia: sug }) => {
          if (!vivo) return;
          setSugerencia(sug);
          onSugerenciaRef.current?.(sug);
          if (sug) {
            onChangeRef.current(
              elegidaAMano.current ? { sugerida: sug.complejidad } : { complejidad: sug.complejidad, sugerida: sug.complejidad },
            );
          }
        })
        .catch(() => vivo && setSugerencia(null))
        .finally(() => vivo && setPensando(false));
    }, ESPERA_SUGERENCIA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [token, coreKind, tipo, titulo, indicaciones, pedirSugerencia]);

  const elegida = esComplejidad(value) ? value : "";
  const tipico = tipicoPara(tiempos, elegida);
  const textoDelTipico = textoTipico(tipoLabel, elegida, tipico);

  return (
    <div className={s.campo}>
      <span className={s.etiqueta} id="oaf-complejidad-l">
        Complejidad <span className={s.opcional}>· opcional</span>
      </span>
      <div className={s.niveles} role="group" aria-labelledby="oaf-complejidad-l">
        {COMPLEJIDADES.map((c) => {
          const delNivel = tiempos?.porComplejidad[c];
          const on = elegida === c;
          return (
            <button
              key={c}
              type="button"
              className={s.nivel}
              aria-pressed={on}
              data-on={on ? "true" : undefined}
              title={COMPLEJIDAD_NIVEL_TITULO[c]}
              onClick={() => {
                elegidaAMano.current = true;
                onChange({ complejidad: c });
              }}
            >
              <span className={s.nivelT}>{COMPLEJIDAD_UI[c].label}</span>
              <span className={s.nivelD}>
                {delNivel?.medianaMin != null ? formatoMinutos(delNivel.medianaMin) : COMPLEJIDAD_UI[c].ayuda}
              </span>
            </button>
          );
        })}
      </div>

      {sugerencia || pensando ? (
        <div className={s.sugerencia} role="status" aria-live="polite">
          <AutoAwesomeOutlinedIcon className={s.sugerenciaI} aria-hidden="true" />
          {pensando && !sugerencia ? (
            <span>Revisando el título para sugerir la complejidad…</span>
          ) : sugerencia ? (
            <span>
              <strong>Sugerencia: {COMPLEJIDAD_UI[sugerencia.complejidad].label}.</strong>{" "}
              {sugerencia.motivo ? `${sugerencia.motivo.replace(/\.$/, "")}. ` : ""}
              {elegida && elegida !== sugerencia.complejidad
                ? "Elegiste otra: quedan las dos registradas."
                : "Tú decides; si la cambias, queda registrado."}
            </span>
          ) : null}
        </div>
      ) : null}

      {textoDelTipico && tipico ? (
        <div className={s.tipico}>
          <span>
            {textoDelTipico}
            {!tipico.delNivel && elegida ? " Aún no hay suficientes de este nivel." : ""}
          </span>
          {estandarActivo ? (
            <span className={s.usado}>Referencia: el tiempo lo da el estándar.</span>
          ) : tipico.minutos !== tiempoActualMin ? (
            <button type="button" className={s.usar} onClick={() => onUsarTiempo(tipico.minutos)}>
              Usar {formatoMinutos(tipico.minutos)} como tiempo estimado
            </button>
          ) : (
            <span className={s.usado}>Es el tiempo estimado.</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
