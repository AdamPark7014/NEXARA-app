"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { IconLabel } from "@/components/ui/IconBadge";
import { Skeleton } from "@/components/base";
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
  type BoardRange,
  type RangoPreset,
  type TeamBoardHistoryItem,
  type TeamBoardUser,
} from "@/lib/team-board-api";
import {
  Chip,
  KpiStrip,
  PrioridadChip,
  RangoSelector,
  SemaforoDot,
} from "@/components/pizarra/PizarraKpi";
import { digitalFormLabels } from "@/lib/evidence-flow-helpers";
import { chargeLabel, estatusUi, formatHourMinute, initials, kindLabel } from "@/lib/activity-labels";
import DespachoPendingPanel from "@/components/pizarra/DespachoPendingPanel";
import { PausarDeEquipo } from "@/components/pizarra/SesionActividad";
import { textoPausa } from "@/lib/sesion-actividad";
import { FotoProtegida, VisorPdf } from "@/components/ops/EquipoEvidencias";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getActivitiesSectionConfig } from "@/lib/section-views";

const btnPrimary: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 48,
  padding: "12px 16px",
  borderRadius: 14,
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 750,
  fontSize: 15,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 44,
  padding: "8px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 14,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const card: CSSProperties = {
  padding: 18,
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  display: "grid",
  gap: 12,
};

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 750,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

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
      {hint ? <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{hint}</div> : null}
    </div>
  );
}

function FichaCargando() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando perfil"
      style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 16 }}
    >
      <Skeleton width={150} height={20} />
      <div style={{ ...card, gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 16 }}>
        <Skeleton width={80} height={80} radius={40} />
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="40%" height={14} />
          <Skeleton width={110} height={26} radius={999} />
        </div>
      </div>
      <Skeleton height={48} radius={14} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Skeleton height={92} radius={16} />
        <Skeleton height={92} radius={16} />
        <Skeleton height={92} radius={16} />
      </div>
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
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pdfAbierto, setPdfAbierto] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [asignada, setAsignada] = useState(false);
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const [rango, setRango] = useState<BoardRange>({});
  const hayDatos = useRef(false);
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;

  // Al volver de asignar (`?asignada=<id>`). Sin useSearchParams: evita el error de Suspense en build.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("asignada")) setAsignada(true);
  }, []);

  const cerrarAviso = () => {
    setAsignada(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("asignada");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* sin History API: basta con ocultarlo */
    }
  };

  useEffect(() => {
    hayDatos.current = false;
    setUser(null);
  }, [userId]);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) {
      setLoading(false);
      setError("No encontramos a esta persona.");
      return;
    }
    setLoading(true);
    try {
      const [card, hist] = await Promise.all([
        fetchTeamBoardUser(token, userId, { desde, hasta }),
        fetchTeamBoardHistory(token, userId).then(
          (h) => ({ ok: true as const, items: Array.isArray(h) ? h : [] }),
          (e: unknown) => ({ ok: false as const, error: formatApiError(e, "No se pudo cargar el historial") }),
        ),
      ]);
      hayDatos.current = true;
      setUser(card);
      if (hist.ok) {
        setHistory(hist.items);
        setHistoryError(null);
      } else {
        setHistoryError(hist.error);
      }
      setError(null);
      setRefreshError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      const msg = formatApiError(e, "No se pudo cargar el perfil");
      if (hayDatos.current) setRefreshError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, userId, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, load]);

  if (loading && !user && !error) return <FichaCargando />;

  if (!user) {
    return (
      <div style={{ maxWidth: 480, margin: "24px auto", display: "grid", gap: 12, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 750 }}>No pudimos abrir este perfil</p>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>{error || "No encontramos a esta persona."}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" style={{ ...btnPrimary, minHeight: 44 }} onClick={() => void load()} disabled={loading}>
            {loading ? "Cargando…" : "Reintentar"}
          </button>
          <Link href="/erp/pizarra" style={btnSecondary}>
            ← Volver al equipo
          </Link>
        </div>
      </div>
    );
  }

  const color = STATUS_COLORS[user.status];
  const act = user.currentActivity;
  const actEstatus = act ? estatusUi(act.estatus) : null;
  // Sesiones de trabajo: la fila completa de lo que está haciendo (corre / en pausa) y
  // lo demás que tenga con el reloj corriendo. Solo su jefe (o dirección) lo pausa.
  const abiertas = user.openActivities ?? [];
  const actAbierta = act ? abiertas.find((a) => a.id === act.id) : undefined;
  const otrasCorriendo = abiertas.filter((a) => a.enCurso && a.id !== act?.id);
  const puedoPausar = Boolean(!isSelf && token && user.puedePausar);
  const src = user.avatarUrl ? resolveAssetUrl(user.avatarUrl) : null;
  const actCfg = getActivitiesSectionConfig(me);
  const canAssign =
    hasPermission(me, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => router.push("/erp/pizarra")}
        style={{
          alignSelf: "flex-start",
          minHeight: 44,
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: 650,
          fontSize: 14,
          cursor: "pointer",
          padding: "8px 0",
          fontFamily: "inherit",
        }}
      >
        ← Volver al equipo
      </button>

      {asignada ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 8px 10px 14px",
            borderRadius: 14,
            border: "1px solid color-mix(in srgb, var(--success) 40%, var(--border))",
            background: "color-mix(in srgb, var(--success) 10%, var(--surface))",
            color: "var(--success)",
            fontWeight: 750,
            fontSize: 14,
          }}
        >
          <span>✅ Actividad asignada</span>
          <button
            type="button"
            onClick={cerrarAviso}
            aria-label="Cerrar aviso"
            style={{
              minWidth: 40,
              minHeight: 40,
              border: "none",
              background: "transparent",
              color: "inherit",
              fontSize: 18,
              cursor: "pointer",
              borderRadius: 10,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      <header
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          padding: "18px 16px",
          borderRadius: 20,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={80}
            height={80}
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 80,
              height: 80,
              flex: "0 0 auto",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: 26,
              fontWeight: 800,
              color: "var(--primary)",
              background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
            }}
          >
            {initials(user.nombre)}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {user.nombre}
          </h1>
          <div style={{ marginTop: 4, fontSize: 14, color: "var(--text-secondary)" }}>
            {user.puesto || "Equipo NEXARA"}
          </div>
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 999,
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
              fontWeight: 750,
              fontSize: 13,
            }}
          >
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
            {STATUS_LABELS[user.status]}
          </div>
        </div>
      </header>

      {!isSelf && canAssign ? (
        <Link href={`/erp/pizarra/${user.id}/asignar`} style={btnPrimary}>
          ＋ Asignar actividad
        </Link>
      ) : isSelf ? (
        <Link href="/erp/pizarra?vista=mias" style={{ ...btnSecondary, minHeight: 48 }}>
          Ver mis actividades →
        </Link>
      ) : null}

      {refreshError ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            padding: "8px 8px 8px 14px",
            borderRadius: 12,
            background: "color-mix(in srgb, #d97706 10%, var(--surface))",
            border: "1px solid color-mix(in srgb, #d97706 35%, var(--border))",
            fontSize: 13,
          }}
        >
          <span>No se pudo actualizar. Ves lo de las {formatHourMinute(updatedAt)}.</span>
          <button type="button" style={btnSecondary} onClick={() => void load()} disabled={loading}>
            Reintentar
          </button>
        </div>
      ) : null}

      <RangoSelector
        preset={preset}
        rango={rango}
        onChange={(p, r) => {
          setPreset(p);
          setRango(p === "hoy" ? {} : r);
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat
          label={preset === "hoy" ? "Entrada hoy" : "Última entrada"}
          value={formatClock(user.clockInAt)}
          hint={user.clockInAt ? "Entrada registrada" : "Sin registro"}
        />
        <Stat label="Horas trabajadas" value={formatMinutes(user.workedMinutes)} hint="Entrada a salida, sin la comida" />
        <Stat
          label="En actividad"
          value={formatMinutes(user.activityElapsedMinutes)}
          hint={
            actAbierta?.enPausa
              ? "En pausa"
              : user.activityStartedAt
                ? `Desde las ${formatClock(user.activityStartedAt)}`
                : "Sin actividad iniciada"
          }
        />
        {user.kpis ? (
          <Stat
            label="Horas productivas"
            value={formatMinutes(user.kpis.minutosEnActividad)}
            hint="Con una actividad corriendo, dentro de su jornada"
          />
        ) : null}
      </div>

      <KpiStrip kpis={user.kpis} />

      <section style={card}>
        <h2 style={cardTitle}>Actividad en curso</h2>
        {act && actEstatus ? (
          <>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>{act.titulo}</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Folio {act.anNumber}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Chip color={actEstatus.color ?? "var(--text-secondary)"} style={{ fontSize: 12, fontWeight: 650 }}>
                {actEstatus.label}
              </Chip>
              {act.periodo ? (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 650,
                    color: act.periodo.estado === "vencida" ? "var(--danger)" : "var(--text-secondary)",
                  }}
                >
                  {act.periodo.etiqueta}
                </span>
              ) : null}
              {actAbierta?.enPausa ? (
                <Chip color="#d97706" style={{ fontSize: 12, fontWeight: 650 }}>
                  En pausa
                </Chip>
              ) : actAbierta?.enCurso ? (
                <Chip color="#16a34a" style={{ fontSize: 12, fontWeight: 650 }}>
                  Reloj corriendo
                </Chip>
              ) : null}
            </div>
            {actAbierta?.enPausa ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                {textoPausa(actAbierta, { miId: me?.id, propia: isSelf })}
              </div>
            ) : null}
            {puedoPausar && token && actAbierta?.enCurso ? (
              <PausarDeEquipo
                token={token}
                userId={user.id}
                activityId={act.id}
                nombre={user.nombre}
                onDone={() => void load()}
              />
            ) : null}
            <Link href={`/erp/actividades/${act.id}`} style={{ ...btnSecondary, justifySelf: "start" }}>
              Abrir actividad →
            </Link>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>No tiene nada abierto en este momento.</div>
        )}
        {puedoPausar && token && otrasCorriendo.length ? (
          <div style={{ display: "grid", gap: 10, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>También tiene el reloj corriendo en</div>
            {otrasCorriendo.map((a) => (
              <div key={a.id} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 650 }}>
                  {a.titulo} <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>Folio {a.anNumber}</span>
                </div>
                <PausarDeEquipo token={token} userId={user.id} activityId={a.id} nombre={user.nombre} onDone={() => void load()} />
              </div>
            ))}
          </div>
        ) : null}
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

      <section style={card}>
        <h2 style={cardTitle}>Historial de actividades</h2>
        {historyError && history.length === 0 ? (
          <div
            role="alert"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>No se pudo cargar el historial.</span>
            <button type="button" style={btnSecondary} onClick={() => void load()} disabled={loading}>
              Reintentar
            </button>
          </div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Todavía no tiene actividades registradas.</div>
        ) : (
          history.map((h) => {
            const ev = h.evidence;
            const open = Boolean(ev) && expandedId === h.id;
            const est = estatusUi(h.estatus);
            const encargo = chargeLabel(h.assignmentCharge);
            const labels = digitalFormLabels(h.coreKind);
            const formData =
              ev?.serviceSheetData && typeof ev.serviceSheetData === "object"
                ? (ev.serviceSheetData as Record<string, string>)
                : {};
            const meta = [
              ev ? `Avance ${ev.progressPct}%` : null,
              h.minutosPlan != null ? `Plan ${formatMinutes(h.minutosPlan)}` : null,
              h.minutosReales != null ? `Real ${formatMinutes(h.minutosReales)}` : null,
            ].filter(Boolean);
            const resumen = (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                  <span style={{ paddingTop: 6 }}>
                    <SemaforoDot semaforo={h.semaforo} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.35 }}>{h.titulo}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>Folio {h.anNumber}</div>
                  </div>
                  {ev ? (
                    <span aria-hidden style={{ fontSize: 14, color: "var(--text-secondary)", paddingTop: 2 }}>
                      {open ? "▾" : "▸"}
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  <Chip color={est.color ?? "var(--text-secondary)"} style={{ fontSize: 12 }}>
                    {est.label}
                  </Chip>
                  <Chip color="var(--text-secondary)" style={{ fontSize: 12 }}>
                    {kindLabel(h)}
                  </Chip>
                  {encargo ? (
                    <Chip color="var(--text-secondary)" style={{ fontSize: 12 }}>
                      {encargo}
                    </Chip>
                  ) : null}
                  <PrioridadChip prioridad={h.prioridad} />
                  {h.retirado ? (
                    <Chip color="#64748b" title="La sacaron del equipo de esta actividad" style={{ fontSize: 12 }}>
                      Ya no está en el equipo
                    </Chip>
                  ) : null}
                </div>
                {meta.length ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>{meta.join(" · ")}</div>
                ) : null}
              </>
            );
            return (
              <div
                key={h.id}
                style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}
              >
                {ev ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : h.id)}
                    aria-expanded={open}
                    style={{
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "inherit",
                      color: "inherit",
                      minHeight: 44,
                    }}
                  >
                    {resumen}
                  </button>
                ) : (
                  <div>{resumen}</div>
                )}
                {open && ev ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {[
                        ...(ev.entryPhotoUrl ? [{ url: ev.entryPhotoUrl, label: "Entrada", icon: LoginIcon }] : []),
                        ...(ev.evidencePhotos || []).map((url, i) => ({
                          url,
                          label: `Evidencia ${i + 1}`,
                          icon: PhotoCameraOutlinedIcon,
                        })),
                        ...(ev.exitPhotoUrl ? [{ url: ev.exitPhotoUrl, label: "Salida", icon: LogoutIcon }] : []),
                      ].map((foto, i) => (
                        <figure key={`${h.id}-foto-${i}`} style={{ margin: 0, display: "grid", gap: 4, width: 104 }}>
                          <div
                            style={{
                              width: 104,
                              height: 104,
                              borderRadius: 10,
                              overflow: "hidden",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <FotoProtegida
                              url={foto.url}
                              alt={`${foto.label} · ${h.titulo}`}
                              alto={104}
                              style={{ width: 104, height: 104, objectFit: "cover", display: "block" }}
                            />
                          </div>
                          <figcaption
                            style={{ fontSize: 11.5, fontWeight: 700, textAlign: "center", color: "var(--text-secondary)" }}
                          >
                            <IconLabel icon={foto.icon} size={14} gap={4}>
                              {foto.label}
                            </IconLabel>
                          </figcaption>
                        </figure>
                      ))}
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {ev.serviceSheetPdfUrl ? (
                        <>
                          <a
                            href={resolveAssetUrl(ev.serviceSheetPdfUrl) ?? ev.serviceSheetPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={btnSecondary}
                          >
                            📄 Abrir hoja de servicio
                          </a>
                          <button
                            type="button"
                            style={btnSecondary}
                            aria-expanded={pdfAbierto === h.id}
                            onClick={() => setPdfAbierto(pdfAbierto === h.id ? null : h.id)}
                          >
                            {pdfAbierto === h.id ? "Ocultar vista previa" : "Ver aquí"}
                          </button>
                        </>
                      ) : null}
                      <Link href={`/erp/actividades/${h.id}`} style={btnSecondary}>
                        Abrir actividad →
                      </Link>
                    </div>
                    {ev.serviceSheetPdfUrl && pdfAbierto === h.id ? (
                      <VisorPdf url={ev.serviceSheetPdfUrl} alto="500px" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
