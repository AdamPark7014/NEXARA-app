"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  dispatchPoolEmails,
  ORG_EMAILS,
  parseDispatchHeadcount,
} from "@/lib/activity-kinds";
import { formatApiError } from "@/lib/erp-api";
import { dispatchMyActivity } from "@/lib/my-activities-api";
import ReprogramarDespacho from "@/components/pizarra/ReprogramarDespacho";
import { fetchTeamBoard, type TeamBoardUser } from "@/lib/team-board-api";

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

const btnPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 750,
  fontSize: 14,
  padding: "10px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 14,
  padding: "10px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

function AvisoLinea({ aviso }: { aviso: Aviso }) {
  return (
    <p
      role={aviso.kind === "error" ? "alert" : "status"}
      style={{
        margin: 0,
        fontSize: 13.5,
        fontWeight: 650,
        color: aviso.kind === "ok" ? "var(--success)" : "var(--danger)",
      }}
    >
      {aviso.kind === "ok" ? "✅ " : ""}
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
    <section
      style={{
        padding: 18,
        borderRadius: 18,
        border: "1px solid color-mix(in srgb, #d97706 35%, var(--border))",
        background: "color-mix(in srgb, #d97706 8%, var(--surface))",
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
          Te toca repartir{despachos.length > 1 ? ` (${despachos.length})` : ""}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {isLuis
            ? "Mándala a Antonio; él elige a quién del soporte."
            : "Elige a quién de tu equipo le toca hacerla."}
        </p>
      </div>

      {loadError ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ margin: 0, color: "var(--danger)", fontSize: 13.5 }}>{loadError}</p>
          <button type="button" style={btnSecondary} onClick={() => void loadRoster()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {despachos.map((a) => {
        const cupo = parseDispatchHeadcount(a.indicaciones);
        const activa = activeId === a.id;
        return (
          <div
            key={a.id}
            style={{
              border: `1px solid ${activa ? "var(--primary)" : "var(--border)"}`,
              borderRadius: 14,
              padding: 14,
              background: "var(--surface)",
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.35 }}>{a.titulo}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                Folio {a.anNumber}
                {cupo != null ? ` · se ocupan ${cupo} persona${cupo === 1 ? "" : "s"}` : ""}
              </div>
              {a.indicaciones ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.4 }}>
                  {a.indicaciones}
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <ReprogramarDespacho
                  token={token}
                  activityId={a.id}
                  fechaActual={a.fechaInicio ?? null}
                  onDone={onDone}
                />
              </div>
            </div>

            {activa ? (
              <>
                {candidates.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)" }}>
                    No hay gente de tu equipo disponible. Avísale a dirección.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 650,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>{isLuis ? "Elige a Antonio" : "¿Quién la hace?"}</span>
                      {cupo != null ? (
                        <span
                          aria-live="polite"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            color: selected.length > cupo ? "#d97706" : selected.length === cupo ? "var(--success)" : undefined,
                          }}
                        >
                          {selected.length} de {cupo} persona{cupo === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                    {candidates.map((u) => {
                      const checked = selected.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            minHeight: 44,
                            padding: 12,
                            borderRadius: 12,
                            border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`,
                            background: checked
                              ? "color-mix(in srgb, var(--primary) 8%, var(--surface))"
                              : "var(--surface)",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(u.id)}
                            disabled={saving}
                            // El input global ocupa 100% de ancho: sin esto el checkbox sale gigante.
                            style={{ width: 20, height: 20, minWidth: 20, flex: "0 0 auto", margin: 0 }}
                          />
                          <span style={{ fontWeight: 650 }}>{u.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={saving || candidates.length === 0}
                    style={{ ...btnPrimary, opacity: saving || candidates.length === 0 ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}
                  >
                    {saving ? "Repartiendo…" : "Pasársela"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(null);
                      setSelected([]);
                      setAviso(null);
                    }}
                    disabled={saving}
                    style={btnSecondary}
                  >
                    Cancelar
                  </button>
                  {aviso ? <AvisoLinea aviso={aviso} /> : null}
                </div>
              </>
            ) : (
              <button type="button" onClick={() => start(a.id)} style={{ ...btnPrimary, justifySelf: "start" }}>
                Elegir quién la hace
              </button>
            )}
          </div>
        );
      })}

      {aviso && activeId == null ? <AvisoLinea aviso={aviso} /> : null}
    </section>
  );
}
