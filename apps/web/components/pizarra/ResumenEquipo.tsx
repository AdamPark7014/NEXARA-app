"use client";

import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import { Stat, StatRow } from "@/components/base";
import { desgloseRetraso as desglose, resumenEquipo, type EstadoAro } from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";

export type FiltroEquipo = EstadoAro | "todos";

/**
 * Franja de KPI de «Mi equipo»: quién trabaja (de cuántos), quién va con
 * retraso (semáforo), quién está libre y cuántas entregas esperan revisión.
 * El filtro vive en los chips de la lista.
 *
 * Regla 7: sin nadie en el tablero, una fila de ceros no informa y no se pinta;
 * lo que ayuda ahí es el vacío con el primer paso, no cuatro ceros encima.
 */
export default function ResumenEquipo({ users }: { users: readonly TeamBoardUser[] }) {
  if (users.length === 0) return null;
  const r = resumenEquipo(users);
  const espera = users.reduce((n, u) => n + (u.enEsperaAprobacion ?? 0), 0);
  const corrigiendo = users.filter((u) => (u.enCorreccion ?? 0) > 0).length;
  // «2 atrasados · 9 sin nada asignado · 3 sin entrada»: sin ceros.
  const desgloseRetraso = desglose(r);

  return (
    <StatRow cols={4} ariaLabel="Resumen del equipo">
      <Stat
        label="Trabajando"
        value={r.trabajando}
        suffix={`/ ${r.total}`}
        hint="con una actividad en curso"
        icon={<PlayCircleOutlineIcon />}
        iconTone="success"
        meter={[{ value: r.trabajando, tone: "success" }]}
        meterMax={r.total}
      />
      <Stat
        label="Con retraso"
        value={r.retraso}
        tone={r.atrasados > 0 ? "danger" : r.retraso > 0 ? "warning" : "default"}
        hint={desgloseRetraso}
        title={desgloseRetraso}
        icon={<AccessTimeIcon />}
        iconTone={r.atrasados > 0 ? "danger" : r.retraso > 0 ? "warning" : "neutral"}
        semaforo={r.atrasados > 0 ? "rojo" : r.retraso > 0 ? "ambar" : "verde"}
      />
      <Stat
        label="Libres"
        value={r.libres}
        hint="terminaron lo suyo"
        icon={<GroupsOutlinedIcon />}
        iconTone="info"
      />
      <Stat
        label="Esperan revisión"
        value={espera}
        tone={espera > 0 ? "brand" : "default"}
        hint={corrigiendo > 0 ? `${corrigiendo} corrigiendo evidencia` : "entregadas que nadie ha aprobado"}
        icon={<RateReviewOutlinedIcon />}
        iconTone={espera > 0 ? "violet" : "neutral"}
      />
    </StatRow>
  );
}
