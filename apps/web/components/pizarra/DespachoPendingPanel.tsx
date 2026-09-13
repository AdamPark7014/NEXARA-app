"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchPoolEmails,
  ORG_EMAILS,
  parseDispatchHeadcount,
} from "@/lib/activity-kinds";
import { addActivityTeamMember } from "@/lib/ops-activities-api";
import { fetchTeamBoard, type TeamBoardUser } from "@/lib/team-board-api";

export type DespachoPendingItem = {
  id: number;
  anNumber: string;
  titulo: string;
  assignmentCharge?: string | null;
  indicaciones?: string | null;
  teamEmails?: string[];
};

type Props = {
  token: string;
  managerEmail?: string | null;
  managerUserId: number;
  pending: DespachoPendingItem[];
  onDone?: () => void;
};

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
  const [msg, setMsg] = useState<string | null>(null);

  const isLuis = (managerEmail || "").trim().toLowerCase() === ORG_EMAILS.luis;

  const loadRoster = useCallback(async () => {
    try {
      const board = await fetchTeamBoard(token);
      setRoster(board.users ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar el equipo");
      setRoster([]);
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

  if (!despachos.length) return null;

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const start = (activityId: number) => {
    setActiveId(activityId);
    setSelected([]);
    setMsg(null);
  };

  const submit = async () => {
    if (!activeId || selected.length === 0) {
      setMsg("Elige al menos a una persona de tu equipo");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      // El cupo viaja con la actividad a quien la recibe.
      const cupoNota = despachos.find((d) => d.id === activeId)?.indicaciones || undefined;
      for (const userId of selected) {
        // Luis → Antonio como LEAD (él decide el soporte). Resto: TECNICO.
        const email = (candidates.find((c) => c.id === userId)?.email || "").toLowerCase();
        const rol =
          isLuis && email === ORG_EMAILS.antonio
            ? "LEAD"
            : "TECNICO";
        await addActivityTeamMember(token, activeId, {
          userId,
          rol,
          ...(cupoNota ? { indicaciones: cupoNota } : {}),
        });
      }
      setMsg(`Asignado a ${selected.length} persona(s)`);
      setActiveId(null);
      setSelected([]);
      onDone?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo asignar");
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
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: 0.04, color: "var(--text-secondary)" }}>
          PENDIENTE DE DESPACHO
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {isLuis
            ? "Mándala a Antonio; él elige a quién del soporte."
            : "Elige a quién de tu equipo ejecuta."}
        </p>
      </div>

      {loadError ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{loadError}</p> : null}

      {despachos.map((a) => {
        const cupo = parseDispatchHeadcount(a.indicaciones);
        return (
          <div
            key={a.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "var(--surface)",
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {a.anNumber} · {a.titulo}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Despacho
                {cupo != null ? ` · se ocupan ${cupo} persona${cupo === 1 ? "" : "s"}` : ""}
              </div>
              {a.indicaciones ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.35 }}>
                  {a.indicaciones}
                </div>
              ) : null}
            </div>

            {activeId === a.id ? (
              <>
                {candidates.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                    No hay gente de tu equipo en el tablero. Actualiza o revisa la jerarquía.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
                      {isLuis ? "Elige a Antonio" : "Elige a quién asignas"}
                    </div>
                    {candidates.map((u) => {
                      const checked = selected.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`,
                            background: checked
                              ? "color-mix(in srgb, var(--primary) 8%, var(--surface))"
                              : "var(--surface)",
                            cursor: "pointer",
                            fontSize: 13,
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={saving || candidates.length === 0}
                    style={{
                      border: "none",
                      background: "var(--primary)",
                      color: "#fff",
                      fontWeight: 750,
                      fontSize: 13,
                      padding: "10px 14px",
                      borderRadius: 10,
                      cursor: saving ? "wait" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {saving ? "Asignando…" : "Asignar al equipo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(null);
                      setSelected([]);
                      setMsg(null);
                    }}
                    disabled={saving}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontWeight: 650,
                      fontSize: 13,
                      padding: "10px 14px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => start(a.id)}
                style={{
                  justifySelf: "start",
                  border: "none",
                  background: "var(--primary)",
                  color: "#fff",
                  fontWeight: 750,
                  fontSize: 13,
                  padding: "10px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Despachar al equipo
              </button>
            )}
          </div>
        );
      })}

      {msg ? (
        <p style={{ margin: 0, fontSize: 13, color: msg.includes("Asignado") ? "#15803d" : "#b91c1c" }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}
