"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  fetchTeamBoardHistory,
  fetchTeamBoardUser,
  formatClock,
  formatMinutes,
  type TeamBoardHistoryItem,
  type TeamBoardUser,
} from "@/lib/team-board-api";
import { digitalFormLabels } from "@/lib/evidence-flow-helpers";
import { labelForAssignmentCharge } from "@/lib/activity-kinds";
import DespachoPendingPanel from "@/components/pizarra/DespachoPendingPanel";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        padding: "16px 14px",
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{value}</div>
      {hint ? (
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

export default function PizarraPersonaPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user: me } = useUser();
  const userId = Number(params?.userId);
  const isSelf = me?.id != null && me.id === userId;
  const [user, setUser] = useState<TeamBoardUser | null>(null);
  const [history, setHistory] = useState<TeamBoardHistoryItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) {
      setLoading(false);
      setError("Persona no válida.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [card, hist] = await Promise.all([
        fetchTeamBoardUser(token, userId),
        fetchTeamBoardHistory(token, userId).catch(() => [] as TeamBoardHistoryItem[]),
      ]);
      setUser(card);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar el perfil"));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [token, load]);

  if (loading && !user) {
    return <p style={{ color: "var(--text-secondary)" }}>Cargando perfil…</p>;
  }

  if (error || !user) {
    return (
      <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <p style={{ color: "#dc2626", margin: 0 }}>{error || "No encontrado"}</p>
        <Link href="/erp/pizarra" style={{ fontWeight: 700, color: "var(--primary)" }}>
          ← Volver a Actividades
        </Link>
      </div>
    );
  }

  const color = STATUS_COLORS[user.status];
  const act = user.currentActivity;
  const src = user.avatarUrl ? resolveAssetUrl(user.avatarUrl) : null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <button
        type="button"
        onClick={() => router.push("/erp/pizarra")}
        style={{
          alignSelf: "flex-start",
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: 650,
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        ← Equipo
      </button>

      <header
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "20px 18px",
          borderRadius: 20,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            width={96}
            height={96}
            style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "var(--primary)",
              background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
            }}
          >
            {initials(user.nombre)}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{user.nombre}</h1>
          <div style={{ marginTop: 4, fontSize: 14, color: "var(--text-secondary)" }}>
            {user.puesto || user.email}
          </div>
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
              fontWeight: 750,
              fontSize: 13,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
            {STATUS_LABELS[user.status]}
          </div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Entrada hoy" value={formatClock(user.clockInAt)} hint={user.clockInAt ? "Check-in" : "Sin registro"} />
        <Stat label="Tiempo en sitio" value={formatMinutes(user.workedMinutes)} hint="Desde la entrada" />
        <Stat
          label="En actividad"
          value={formatMinutes(user.activityElapsedMinutes)}
          hint={user.activityStartedAt ? `Desde ${formatClock(user.activityStartedAt)}` : "Sin actividad"}
        />
      </div>

      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: 0.04, color: "var(--text-secondary)" }}>
          ACTIVIDAD EN CURSO
        </div>
        {act ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{act.anNumber}</div>
            <div style={{ fontSize: 16, lineHeight: 1.4 }}>{act.titulo}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Estatus: {act.estatus}</div>
            <Link
              href={`/ops/activities/${act.id}`}
              style={{ marginTop: 4, fontWeight: 700, color: "var(--primary)", width: "fit-content" }}
            >
              Abrir actividad →
            </Link>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin actividad abierta en este momento.</div>
        )}
      </section>

      {isSelf && token ? (
        <DespachoPendingPanel
          token={token}
          managerEmail={me?.email ?? user.email}
          managerUserId={user.id}
          pending={user.openActivities ?? []}
          onDone={() => void load()}
        />
      ) : null}

      <section
        style={{
          padding: 18,
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: 0.04, color: "var(--text-secondary)" }}>
          HISTORIAL DE ACTIVIDADES
        </div>
        {history.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Sin historial todavía.</div>
        ) : (
          history.map((h) => {
            const open = expandedId === h.id;
            const ev = h.evidence;
            const labels = digitalFormLabels(h.coreKind);
            const chargeLabel = labelForAssignmentCharge(h.assignmentCharge);
            const formData =
              ev?.serviceSheetData && typeof ev.serviceSheetData === "object"
                ? (ev.serviceSheetData as Record<string, string>)
                : {};
            return (
              <div
                key={h.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : h.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "inherit",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {h.anNumber} · {h.titulo}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {h.estatus}
                    {ev ? ` · avance ${ev.progressPct}%` : ""}
                    {h.coreKind ? ` · ${h.coreKind}` : ""}
                    {chargeLabel ? ` · ${chargeLabel.badge}` : ""}
                  </div>
                </button>
                {open && ev ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[ev.entryPhotoUrl, ...(ev.evidencePhotos || []), ev.exitPhotoUrl]
                        .filter(Boolean)
                        .map((url, i) => {
                          const src = resolveAssetUrl(url as string);
                          return src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={`${h.id}-img-${i}`}
                              src={src}
                              alt=""
                              style={{
                                width: 88,
                                height: 88,
                                objectFit: "cover",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                              }}
                            />
                          ) : null;
                        })}
                    </div>
                    {labels.some((l) => formData[l.key]) ? (
                      <dl style={{ margin: 0, display: "grid", gap: 4 }}>
                        {labels.map((l) =>
                          formData[l.key] ? (
                            <div key={l.key}>
                              <dt style={{ fontWeight: 700, display: "inline" }}>{l.label}: </dt>
                              <dd style={{ display: "inline", margin: 0 }}>{formData[l.key]}</dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    ) : null}
                    {ev.serviceSheetPdfUrl ? (
                      <object
                        data={resolveAssetUrl(ev.serviceSheetPdfUrl) || undefined}
                        type="application/pdf"
                        style={{ width: "100%", height: 280, borderRadius: 10, border: "1px solid var(--border)" }}
                      >
                        <a
                          href={resolveAssetUrl(ev.serviceSheetPdfUrl) || "#"}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 700, color: "var(--primary)" }}
                        >
                          Ver hoja de servicio (PDF)
                        </a>
                      </object>
                    ) : null}
                    <Link href={`/ops/activities/${h.id}`} style={{ fontWeight: 700, color: "var(--primary)" }}>
                      Abrir actividad →
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        {!isSelf ? (
          <Link
            href={`/erp/pizarra/${user.id}/asignar`}
            style={{
              textAlign: "center",
              padding: "14px 12px",
              borderRadius: 14,
              background: "var(--primary)",
              color: "#fff",
              fontWeight: 750,
              textDecoration: "none",
            }}
          >
            Asignar actividad
          </Link>
        ) : null}
      </div>
    </div>
  );
}
