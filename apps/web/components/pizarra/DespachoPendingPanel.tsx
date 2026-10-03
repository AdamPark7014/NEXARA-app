"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { Alert, Avatar, Badge, Button, Checkbox } from "@/components/base";
import {
  dispatchPoolEmails,
  ORG_EMAILS,
  parseDispatchHeadcount,
} from "@/lib/activity-kinds";
import { formatApiError } from "@/lib/erp-api";
import { dispatchMyActivity } from "@/lib/my-activities-api";
import ReprogramarDespacho from "@/components/pizarra/ReprogramarDespacho";
import { fetchTeamBoard, type TeamBoardUser } from "@/lib/team-board-api";
import c from "./comun.module.css";
import s from "./DespachoPendingPanel.module.css";

export type DespachoPendingItem = {
  id: number;
  anNumber: string;
  titulo: string;
  assignmentCharge?: string | null;
  indicaciones?: string | null;
  teamEmails?: string[];
  fechaInicio?: string | null;
};

type Props = {
  token: string;
  managerEmail?: string | null;
  managerUserId: number;
  pending: DespachoPendingItem[];
  onDone?: () => void;
};

type Aviso = { kind: "ok" | "error"; text: string };

function AvisoLinea({ aviso }: { aviso: Aviso }) {
  if (aviso.kind === "ok") {
    return (
      <p className={c.ok} role="status">
        <CheckIcon aria-hidden="true" />
        <span>{aviso.text}</span>
      </p>
    );
  }
  return (
    <p className={c.error} role="alert">
      {aviso.text}
    </p>
  );
}

export default function DespachoPendingPanel({
  token,
  managerEmail,
  managerUserId,
  pending,
  onDone,
}: Props) {
  // Pendiente = despacho que aún no tiene a nadie del grupo de este encargado
  // (Luis → Antonio; Antonio → Carolina/Alejandro; David → instaladores).
  const despachos = useMemo(() => {
    const pool = new Set(dispatchPoolEmails(managerEmail).map((e) => e.toLowerCase()));
    const self = (managerEmail || "").trim().toLowerCase();
    return pending.filter((p) => {
      if ((p.assignmentCharge || "").toLowerCase() !== "despacho") return false;
      if (!p.teamEmails) return true; // API sin teamEmails: comportamiento anterior
      const team = p.teamEmails.map((e) => e.toLowerCase());
      if (pool.size) return !team.some((e) => pool.has(e));
      return !team.some((e) => e !== self);
    });
  }, [pending, managerEmail]);

  const [roster, setRoster] = useState<TeamBoardUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const isLuis = (managerEmail || "").trim().toLowerCase() === ORG_EMAILS.luis;

  const loadRoster = useCallback(async () => {
    try {
      const board = await fetchTeamBoard(token);
      setRoster(board.users ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar a tu equipo"));
    }
  }, [token]);

  useEffect(() => {
    if (!despachos.length) return;
    void loadRoster();
  }, [despachos.length, loadRoster]);

  const candidates = useMemo(() => {
    const pool = dispatchPoolEmails(managerEmail);
    const others = roster.filter((u) => u.id !== managerUserId);
    if (!pool.length) return others;
    const allow = new Set(pool.map((e) => e.toLowerCase()));
    return others.filter((u) => allow.has((u.email || "").toLowerCase()));
  }, [roster, managerEmail, managerUserId]);

  if (!despachos.length) {
    // Recién repartida la última: el aviso de éxito se queda a la vista.
    return aviso?.kind === "ok" ? <AvisoLinea aviso={aviso} /> : null;
  }

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const start = (activityId: number) => {
    setActiveId(activityId);
    setSelected([]);
    setAviso(null);
  };

  const submit = async () => {
    if (!activeId || selected.length === 0) {
      setAviso({ kind: "error", text: "Elige al menos a una persona de tu equipo." });
      return;
    }
    setSaving(true);
    setAviso(null);
    try {
      // El cupo viaja con la actividad. La API valida que sea tu equipo y decide el rol
      // (Luis → Antonio como responsable; Antonio/David → técnicos). No requiere permisos de OT.
      const cupoNota = despachos.find((d) => d.id === activeId)?.indicaciones || undefined;
      await dispatchMyActivity(token, activeId, {
        userIds: selected,
        ...(cupoNota ? { indicaciones: cupoNota } : {}),
      });
      setAviso({
        kind: "ok",
        text: selected.length === 1 ? "Listo: se la pasaste a 1 persona." : `Listo: se la pasaste a ${selected.length} personas.`,
      });
      setActiveId(null);
      setSelected([]);
      onDone?.();
    } catch (e) {
      setAviso({ kind: "error", text: formatApiError(e, "No se pudo repartir. Intenta de nuevo.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={s.panel} aria-labelledby="te-toca-repartir">
      <header className={s.cabeza}>
        <span className={s.icono} aria-hidden="true">
          <SendOutlinedIcon />
        </span>
        <div className={s.cabezaTexto}>
          <h2 id="te-toca-repartir" className={c.titulo}>
            Te toca repartir{despachos.length > 1 ? ` (${despachos.length})` : ""}
          </h2>
          <p className={c.tenue}>
            {isLuis ? "Mándala a Antonio; él elige a quién del soporte." : "Elige a quién de tu equipo le toca hacerla."}
          </p>
        </div>
      </header>

      {loadError ? (
        <Alert
          tone="danger"
          role="alert"
          dense
          action={
            <Button size="sm" className={c.tap} onClick={() => void loadRoster()}>
              Reintentar
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      {despachos.map((a) => {
        const cupo = parseDispatchHeadcount(a.indicaciones);
        const activa = activeId === a.id;
        const cupoTono = cupo == null ? "neutral" : selected.length > cupo ? "warning" : selected.length === cupo ? "success" : "neutral";
        return (
          <article key={a.id} className={s.despacho} data-activa={activa ? "true" : undefined}>
            <div className={c.pila}>
              <div>
                <h3 className={c.tituloFila}>{a.titulo}</h3>
                <span className={c.folio}>
                  {a.anNumber}
                  {cupo != null ? ` · se ocupan ${cupo} persona${cupo === 1 ? "" : "s"}` : ""}
                </span>
              </div>
              {a.indicaciones ? <p className={c.cita}>{a.indicaciones}</p> : null}
              <ReprogramarDespacho token={token} activityId={a.id} fechaActual={a.fechaInicio ?? null} onDone={onDone} />
            </div>

            {activa ? (
              <div className={c.pila}>
                {candidates.length === 0 ? (
                  <p className={c.tenue}>No hay gente de tu equipo disponible. Avísale a dirección.</p>
                ) : (
                  <fieldset className={s.grupo}>
                    <legend className={s.leyenda}>
                      <span>{isLuis ? "Elige a Antonio" : "¿Quién la hace?"}</span>
                      {cupo != null ? (
                        <Badge size="sm" tone={cupoTono}>
                          <span aria-live="polite">
                            {selected.length} de {cupo} persona{cupo === 1 ? "" : "s"}
                          </span>
                        </Badge>
                      ) : null}
                    </legend>
                    <div className={s.candidatos}>
                      {candidates.map((u) => {
                        const checked = selected.includes(u.id);
                        return (
                          <label key={u.id} className={s.candidato} data-checked={checked ? "true" : undefined}>
                            <Checkbox checked={checked} onChange={() => toggle(u.id)} disabled={saving} />
                            <Avatar name={u.nombre} avatarUrl={u.avatarUrl} size={32} />
                            <span className={s.persona}>
                              <span className={s.nombre}>{u.nombre}</span>
                              {u.puesto ? <span className={s.puesto}>{u.puesto}</span> : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <div className={s.acciones}>
                  {aviso ? <AvisoLinea aviso={aviso} /> : null}
                  <span className={s.empuje} />
                  <Button
                    variant="ghost"
                    className={c.tap}
                    onClick={() => {
                      setActiveId(null);
                      setSelected([]);
                      setAviso(null);
                    }}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    className={c.tap}
                    iconStart={<SendOutlinedIcon />}
                    loading={saving}
                    onClick={() => void submit()}
                    disabled={candidates.length === 0}
                  >
                    {saving ? "Repartiendo…" : "Pasársela"}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="tonal" className={c.tap} iconStart={<GroupAddOutlinedIcon />} onClick={() => start(a.id)}>
                  Elegir quién la hace
                </Button>
              </div>
            )}
          </article>
        );
      })}

      {aviso && activeId == null ? <AvisoLinea aviso={aviso} /> : null}
    </section>
  );
}
