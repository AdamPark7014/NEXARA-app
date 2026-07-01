"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationRecord {
  id: number;
  usuarioId: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
  usuario?: { nombre: string; role?: { nombre?: string } | null; department?: { nombre?: string } | null } | null;
  actividad?: { id: number; titulo?: string | null; folio?: string | null } | null;
}

interface MyGpsState {
  consent?: boolean;
  location?: LocationRecord | null;
}

interface TrajectoryPoint {
  id: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") || "60");
      throw new Error(`Demasiadas solicitudes. Espera ${retryAfter}s e intenta de nuevo.`);
    }
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed?.message) throw new Error(parsed.message);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Demasiadas")) throw e;
    }
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

function minutesAgo(iso?: string): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  return `Hace ${Math.round(mins / 60)}h`;
}

function fmtCoords(lat?: number | string | null, lng?: number | string | null): string {
  if (!lat || !lng) return "Sin coordenadas";
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Team location card ───────────────────────────────────────────────────────

function TeamLocationCard({ item }: { item: LocationRecord }) {
  const isActive = Boolean(item.estaActivo);
  const mapsUrl = item.latitud && item.longitud
    ? `https://maps.google.com/?q=${Number(item.latitud).toFixed(6)},${Number(item.longitud).toFixed(6)}`
    : null;

  return (
    <article style={{
      background: "var(--surface)",
      border: `1.5px solid ${isActive ? "#3b82f6" : "var(--border)"}`,
      borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.usuario?.nombre ?? "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
            {item.usuario?.role?.nombre ?? item.usuario?.department?.nombre ?? ""}
          </div>
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
          background: isActive ? "#eff6ff" : "var(--surface-2)",
          color: isActive ? "#1d4ed8" : "var(--text-secondary)",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#3b82f6" : "#94a3b8", display: "inline-block" }} />
          {isActive ? "Compartiendo" : "Inactivo"}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
        <span>📍</span>
        <span style={{ fontFamily: "monospace", fontSize: 11.5 }}>{fmtCoords(item.latitud, item.longitud)}</span>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-tertiary)" }}>
        <span>🕐 {minutesAgo(item.ultimaActualizacion)}</span>
        {(item.velocidadKmh ?? 0) > 0 && <span>🚗 {Number(item.velocidadKmh).toFixed(1)} km/h</span>}
      </div>

      {item.actividad && (
        <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
          <span style={{ color: "var(--text-tertiary)" }}>Actividad: </span>
          <span style={{ fontWeight: 600 }}>{item.actividad.folio ?? item.actividad.titulo ?? `ID-${item.actividad.id}`}</span>
        </div>
      )}

      {mapsUrl && isActive && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11.5, color: "var(--primary, #3b82f6)", fontWeight: 600, textDecoration: "none" }}>
          Ver en Google Maps →
        </a>
      )}
    </article>
  );
}

// ─── Employee GPS view ────────────────────────────────────────────────────────

function MyGpsView({ token }: { token: string }) {
  const [state, setState] = useState<MyGpsState>({ consent: false, location: null });
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [loadingTraj, setLoadingTraj] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    if (!token) return;
    try {
      const d = await apiFetch<MyGpsState>("gps/me", token);
      setState({ consent: Boolean(d?.consent), location: d?.location ?? null });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar el estado GPS");
    }
  }, [token]);

  const loadTrajectory = useCallback(async () => {
    if (!token) return;
    setLoadingTraj(true);
    try {
      const today = new Date().toLocaleDateString("sv-SE");
      const pts = await apiFetch<TrajectoryPoint[]>(`gps/trajectory?date=${today}`, token);
      setTrajectory(Array.isArray(pts) ? pts : []);
    } catch {
      setTrajectory([]);
    } finally { setLoadingTraj(false); }
  }, [token]);

  const loadAttendance = useCallback(async () => {
    if (!token) return;
    try {
      const d = await apiFetch<{ isOpen?: boolean }>("attendance/current", token);
      setAttendanceOpen(Boolean(d?.isOpen));
    } catch {
      setAttendanceOpen(false);
    }
  }, [token]);

  useEffect(() => {
    void loadState();
    void loadTrajectory();
    void loadAttendance();
  }, [loadState, loadTrajectory, loadAttendance]);

  useEffect(() => {
    const onGps = (e: Event) => {
      const ce = e as CustomEvent<{ enabled: boolean }>;
      setState(prev => ({ ...prev, consent: Boolean(ce.detail?.enabled) }));
      setTimeout(() => void loadTrajectory(), 800);
    };
    window.addEventListener("gps:consent", onGps);
    return () => window.removeEventListener("gps:consent", onGps);
  }, [loadTrajectory]);

  useEffect(() => {
    const onAtt = () => { void loadAttendance(); void loadState(); };
    window.addEventListener("attendance:updated", onAtt);
    return () => window.removeEventListener("attendance:updated", onAtt);
  }, [loadAttendance, loadState]);

  const toggleConsent = async () => {
    if (!token) return;
    setToggling(true);
    setActionError(null);
    try {
      const next = !state.consent;
      const res = await fetch(buildApiUrl("gps/consent"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setState(prev => ({ ...prev, consent: next }));
      window.dispatchEvent(new CustomEvent("gps:consent", { detail: { enabled: next } }));
      void loadState();
      void loadTrajectory();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo actualizar el consentimiento GPS");
    } finally { setToggling(false); }
  };

  const isSharing = state.consent && attendanceOpen;
  const loc = state.location;
  const totalPoints = trajectory.length;

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 600, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5,
  };

  return (
    <>
      {(loadError || actionError) && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {actionError ?? loadError}
          {loadError && (
            <button type="button" onClick={() => void loadState()} style={{ marginLeft: 10, background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
              Reintentar
            </button>
          )}
        </div>
      )}
      <div style={{
        background: "var(--surface)",
        border: `1.5px solid ${isSharing ? "#3b82f6" : "var(--border)"}`,
        borderRadius: 16, padding: "20px 24px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <div>
          <div style={labelStyle}>GPS</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "6px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: isSharing ? "#eff6ff" : "var(--surface-2)",
            color: isSharing ? "#1d4ed8" : "var(--text-secondary)",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isSharing ? "#3b82f6" : "#94a3b8", display: "inline-block" }} />
            {isSharing ? "Activo · Compartiendo" : state.consent && !attendanceOpen ? "Jornada cerrada" : "Inactivo"}
          </div>
        </div>

        <div>
          <div style={labelStyle}>Ultima posicion</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>
            {fmtCoords(loc?.latitud, loc?.longitud)}
          </div>
          {loc?.ultimaActualizacion && (
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>
              {minutesAgo(loc.ultimaActualizacion)}
            </div>
          )}
        </div>

        <div>
          <div style={labelStyle}>Puntos hoy</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{totalPoints}</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", maxWidth: 220, textAlign: "right" }}>
            El GPS se activa automaticamente al registrar entrada y se detiene al salir.
          </div>
          <button
            onClick={() => void toggleConsent()}
            disabled={toggling}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              cursor: toggling ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 600,
              background: isSharing ? "#fee2e2" : "var(--primary, #3b82f6)",
              color: isSharing ? "#b91c1c" : "#fff",
              opacity: toggling ? 0.6 : 1,
            }}
          >
            {toggling ? "..." : isSharing ? "Desactivar GPS" : "Activar GPS manual"}
          </button>
        </div>
      </div>

      <Section
        title={`Trayecto de hoy · ${totalPoints} puntos registrados`}
        subtitle="Historial de ubicaciones durante tu jornada de trabajo."
        actions={
          <button onClick={() => { void loadState(); void loadTrajectory(); }}
            style={{ fontSize: 11.5, color: "var(--primary, #3b82f6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Actualizar
          </button>
        }
      >
        {loadingTraj ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Cargando trayecto…</div>
        ) : trajectory.length === 0 ? (
          <EmptyState
            icon="📍"
            title="Sin puntos de trayecto hoy"
            description="Los puntos de ruta se registran automaticamente mientras tienes una jornada abierta y GPS activo."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 480, overflowY: "auto" }}>
            {trajectory.map((pt, i) => {
              const isFirst = i === 0;
              const isLast = i === trajectory.length - 1;
              const mapsUrl = pt.latitud && pt.longitud
                ? `https://maps.google.com/?q=${Number(pt.latitud).toFixed(6)},${Number(pt.longitud).toFixed(6)}`
                : null;
              return (
                <div key={pt.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
                  background: isFirst ? "#f0fdf4" : (isLast && pt.estaActivo) ? "#eff6ff" : "var(--surface)",
                  borderRadius: 8,
                  borderLeft: `3px solid ${isFirst ? "#22c55e" : pt.estaActivo ? "#3b82f6" : "var(--border)"}`,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: isFirst ? "#22c55e" : (isLast && pt.estaActivo) ? "#3b82f6" : "var(--surface-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9.5, fontWeight: 700,
                    color: (isFirst || (isLast && pt.estaActivo)) ? "#fff" : "var(--text-tertiary)",
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, minWidth: 64 }}>
                    {fmtTime(pt.ultimaActualizacion)}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontFamily: "monospace", flex: 1 }}>
                    {fmtCoords(pt.latitud, pt.longitud)}
                  </div>
                  {(pt.velocidadKmh ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                      {Number(pt.velocidadKmh).toFixed(1)} km/h
                    </div>
                  )}
                  {isFirst && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "2px 7px", borderRadius: 999 }}>INICIO</span>
                  )}
                  {isLast && !isFirst && pt.estaActivo && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "#1d4ed8", background: "#dbeafe", padding: "2px 7px", borderRadius: 999 }}>ACTUAL</span>
                  )}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "var(--primary, #3b82f6)", textDecoration: "none", flexShrink: 0 }}>
                      ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

// ─── Manager team GPS view ────────────────────────────────────────────────────

function TeamGpsView({ token }: { token: string }) {
  const [items, setItems] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollMs, setPollMs] = useState(30_000);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LocationRecord[]>("gps/team", token);
      setItems(Array.isArray(data) ? data : []);
      setPollMs(30_000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar ubicaciones";
      setError(msg);
      if (msg.includes("Demasiadas solicitudes")) setPollMs(90_000);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load({ silent: true }), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const active   = items.filter(i => i.estaActivo).length;
  const inactive = items.filter(i => !i.estaActivo).length;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Unidades visibles" value={items.length} icon="👥" hint="Con jornada abierta" />
        <KpiCard label="Compartiendo GPS"  value={active} variant={active > 0 ? "positive" : "default"} icon="📍" hint="Ubicación activa" />
        <KpiCard label="Sin GPS activo"    value={inactive} variant={inactive > 0 ? "warning" : "positive"} icon="📵" hint={inactive > 0 ? "Sin señal GPS" : "Todos con GPS"} />
      </div>

      <Section
        title={loading ? "Cargando..." : `${active} unidades activas ahora`}
        subtitle={`Actualiza automaticamente cada ${Math.round(pollMs / 1000)} seg. Solo usuarios con jornada abierta y GPS activo.`}
        actions={
          <button onClick={() => void load()}
            style={{ fontSize: 11.5, color: "var(--primary, #3b82f6)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Actualizar
          </button>
        }
      >
        {loading && <EmptyState icon="⏳" title="Cargando telemetria..." description="Consultando ubicaciones desde la API." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && items.length === 0 && (
          <EmptyState icon="📡" title="Sin ubicaciones activas"
            description="Nadie ha compartido su ubicacion. Requiere jornada abierta y consentimiento GPS." />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
            {items.map(t => <TeamLocationCard key={t.id} item={t} />)}
          </div>
        )}
      </Section>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GpsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "gps"), [user]);
  const isManager = cfg.defaultScope === "team";
  const token = user?.token ?? "";

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={isManager ? "GPS y telemetria del equipo" : "Mi GPS y trayecto"}
        subtitle={isManager
          ? "Ubicacion en tiempo real del equipo en campo. Solo usuarios con jornada activa y consentimiento."
          : "Tu ubicacion se comparte automaticamente al registrar entrada y se detiene al registrar salida."}
        actions={
          <Button variant="ghost" iconLeft="🔄" onClick={() => window.location.reload()}>Actualizar</Button>
        }
      />

      {isManager ? <TeamGpsView token={token} /> : <MyGpsView token={token} />}
    </>
  );
}
