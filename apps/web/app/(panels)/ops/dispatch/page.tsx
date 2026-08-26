"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  DashPill,
  DashEmpty,
  ListRow,
} from "@/components/dashboard/DashKit";
import { CommandCenterRail } from "@/components/command-center/CommandCenterRail";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import {
  getDispatchBoard,
  reassignActivity,
  type DispatchActivityCard,
  type DispatchBoard,
} from "@/lib/ops-activities-api";

const GpsMap = dynamic(() => import("@/components/GpsMap"), { ssr: false });

const COLUMN_META: Array<{
  key: keyof DispatchBoard["columns"];
  title: string;
  tone?: "warning" | "accent" | "positive" | "neutral";
}> = [
  { key: "pendiente", title: "Pendientes", tone: "neutral" },
  { key: "en_curso", title: "En curso", tone: "warning" },
  { key: "por_validar", title: "Por validar", tone: "accent" },
  { key: "completadas_hoy", title: "Completadas hoy", tone: "positive" },
];

function DispatchCard({
  card,
  selected,
  onToggle,
  canAssign,
}: {
  card: DispatchActivityCard;
  selected: boolean;
  onToggle: () => void;
  canAssign: boolean;
}) {
  return (
    <div
      style={{
        border: selected ? "2px solid var(--panel-accent, var(--primary))" : "1px solid var(--border)",
        borderRadius: 10,
        padding: 10,
        background: "var(--surface-elevated, var(--bg-secondary))",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {canAssign && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${card.anNumber}`}
          style={{ marginTop: 4 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Link
            href={`/ops/activities/${card.id}`}
            style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}
          >
            {card.anNumber}
          </Link>
          {card.overdue && <DashPill tone="danger">Vencida</DashPill>}
          {card.prioridad && <DashPill tone="warning">{card.prioridad}</DashPill>}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>{card.titulo}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
          {[card.client?.name, card.branchName, card.branchCity, card.responsable?.nombre]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </div>
  );
}

export default function OpsDispatchPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canAssign = Boolean(
    user?.isSuperAdmin || hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE),
  );

  const [board, setBoard] = useState<DispatchBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignUserId, setAssignUserId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDispatchBoard(token);
      setBoard(data);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el tablero");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalOpen = useMemo(() => {
    if (!board) return 0;
    return (
      board.columns.pendiente.length +
      board.columns.en_curso.length +
      board.columns.por_validar.length
    );
  }, [board]);

  const toggleCard = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!token || !assignUserId || selected.size === 0) return;
    setAssigning(true);
    setAssignMsg(null);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        await reassignActivity(token, id, {
          aUsuarioId: Number(assignUserId),
          motivo: "Asignación desde centro de despacho",
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setAssignMsg(`${ok} OT reasignadas${fail ? ` · ${fail} fallaron` : ""}`);
    setAssigning(false);
    await load();
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="OPS · Despacho"
        title="Centro de despacho"
        subtitle="Columnas por estatus, carga del equipo y asignación masiva."
        actions={
          <>
            {board && <DashPill tone="accent">{totalOpen} OT abiertas</DashPill>}
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
            <Button variant="secondary" onClick={() => setShowMap((v) => !v)}>
              {showMap ? "Ocultar mapa" : "Mapa GPS"}
            </Button>
          </>
        }
      />

      <CommandCenterRail panel="ops" />

      {canAssign && board && board.assignableUsers.length > 0 && (
        <DashPanel title="Asignación masiva" subtitle="Selecciona OT en las columnas y reasigna al técnico">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : "")}
              style={{
                minWidth: 220,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
              }}
            >
              <option value="">Técnico destino…</option>
              {board.assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            <Button
              variant="primary"
              disabled={assigning || selected.size === 0 || !assignUserId}
              onClick={() => void handleBulkAssign()}
            >
              {assigning ? "Asignando…" : `Asignar ${selected.size} OT`}
            </Button>
            {assignMsg && (
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{assignMsg}</span>
            )}
          </div>
        </DashPanel>
      )}

      {error && !loading && (
        <DashPanel title="Error" subtitle={error}>
          <Button size="sm" onClick={() => void load()}>Reintentar</Button>
        </DashPanel>
      )}

      <DashGrid>
        <DashCol span={8}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {COLUMN_META.map((col) => {
              const items = board?.columns[col.key] ?? [];
              return (
                <DashPanel
                  key={col.key}
                  title={col.title}
                  subtitle={`${items.length} OT`}
                >
                  {loading && <DashEmpty title="Cargando…" />}
                  {!loading && items.length === 0 && (
                    <DashEmpty title="Sin OT" description="Nada en esta columna." />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((card) => (
                      <DispatchCard
                        key={card.id}
                        card={card}
                        selected={selected.has(card.id)}
                        onToggle={() => toggleCard(card.id)}
                        canAssign={canAssign}
                      />
                    ))}
                  </div>
                </DashPanel>
              );
            })}
          </div>
        </DashCol>

        <DashCol span={4}>
          <DashPanel title="Carga por técnico" subtitle="OT activas y en curso">
            {loading && <DashEmpty title="Cargando…" />}
            {!loading && (board?.technicians.length ?? 0) === 0 && (
              <DashEmpty title="Sin asignaciones" description="No hay técnicos con OT." />
            )}
            {board?.technicians.map((t) => (
              <ListRow
                key={t.id}
                title={t.nombre}
                sub={`${t.enCurso} en curso · ${t.activas} activas`}
                trail={
                  <DashPill tone={t.activas >= 5 ? "danger" : t.activas >= 3 ? "warning" : "neutral"}>
                    {t.completadasHoy} hoy
                  </DashPill>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
      </DashGrid>

      {showMap && (
        <DashPanel title="Mapa en vivo" subtitle="Ubicación de cuadrillas (GPS)">
          <div style={{ minHeight: 420, borderRadius: 12, overflow: "hidden" }}>
            <GpsMap />
          </div>
        </DashPanel>
      )}
    </DashPage>
  );
}
