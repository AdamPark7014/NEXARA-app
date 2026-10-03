"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import PageHeader from "@/components/ui/PageHeader";
import PanelTabs from "@/components/ui/PanelTabs";
import Section from "@/components/ui/Section";
import KpiCard, { type KpiVariant } from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import AttendanceGpsDayPanel from "@/components/AttendanceGpsDayPanel";
import GpsTrajectoryPreview from "@/components/GpsTrajectoryPreview";
import SessionImage from "@/components/SessionImage";
import ComidasPanel from "@/components/asistencias/ComidasPanel";
import UniformeControl from "@/components/kpis/UniformeControl";
import { KPIS_PATH } from "@/lib/kpis-equipo";
import { useUser } from "@/components/UserContext";
import { getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { resolveUserAvatarUrl } from "@/lib/user-avatar";
import { attendanceMapUrl, googleMapsPointUrl, toCoord } from "@/lib/gps-map-links";
import { getAttendanceSectionConfig } from "@/lib/user-access";
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail, isNonEmployeeEmail } from "@/lib/platform-accounts";
import { erpFetch } from "@/lib/erp-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { erpInputStyle, formatApiError } from "@/lib/erp-api";
import {
  checadaDelTipo,
  insigniasChecada,
  MOTIVO_CORRECCION_MINIMO,
  type ChecadaValidable,
} from "@/lib/attendance-validacion";
import {
  faltaDelDia,
  justificarFalta,
  MOTIVO_FALTA_MINIMO,
  quitarFaltaJustificada,
  type FaltaJustificada,
} from "@/lib/attendance-justifications";
import { InfoPopover } from "@/components/base";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import SatelliteAltOutlinedIcon from "@mui/icons-material/SatelliteAltOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import styles from "./asistencias.module.css";

// Tres pantallas pesadas que solo ve quien tiene equipo: se cargan cuando se abren
// su pestaña, no en cada visita a Asistencias.
const ChecadasRechazadas = dynamic(() => import("@/components/asistencias/ChecadasRechazadas"), { ssr: false });
const HorariosEquipo = dynamic(() => import("@/components/asistencias/HorariosEquipo"), { ssr: false });
const RegistroAsistido = dynamic(() => import("@/components/asistencias/RegistroAsistido"), { ssr: false });
const GuardiasPanel = dynamic(() => import("@/components/asistencias/GuardiasPanel"), { ssr: false });
import ChecarEnWeb from "@/components/asistencias/ChecarEnWeb";
type TabId = "equipo" | "comidas" | "trayectoria" | "rechazos" | "horarios";
type Estado = "PRESENTE" | "COMPLETO" | "JUSTIFICADA" | "AUSENTE";
type FilterEstado = "TODOS" | Estado;

interface ApiAttendanceUser {
  userId: number;
  userName?: string;
  email?: string;
  /** Foto fija del perfil (la misma de Actividades y el celular); no es la de la checada. */
  avatarUrl?: string | null;
  department?: string;
  roleName?: string;
  totalMinutes?: number;
  days?: { date: string; totalMinutes?: number; isOpen?: boolean }[];
  attendances?: (ChecadaValidable & {
    type: string;
    timestamp: string;
    photoUrl?: string;
    entryLatitude?: number;
    entryLongitude?: number;
    exitLatitude?: number;
    exitLongitude?: number;
  })[];
  /** Días sin checada que Christian justificó (API nueva; opcional). */
  justificaciones?: FaltaJustificada[];
}

interface LunchBreak {
  id: number;
  checkinTime: string;
  checkoutTime?: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  isCheckinLate?: boolean;
  isCheckoutLate?: boolean;
  user?: { id: number; nombre: string; department?: { nombre: string } | null };
}

interface LocationRecord {
  id: number;
  usuarioId: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
  usuario?: { nombre: string; role?: { nombre?: string } | null; department?: { nombre?: string } | null } | null;
}

interface TrajectoryPoint {
  id: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
}

const ESTADO_META: Record<Estado, { label: string; color: string }> = {
  PRESENTE: { label: "En jornada", color: "#16a34a" },
  COMPLETO: { label: "Ya salió", color: "#2563eb" },
  JUSTIFICADA: { label: "Falta justificada", color: "#7c3aed" },
  AUSENTE: { label: "Sin checada", color: "#94a3b8" },
};

const ESTADO_ORDER: Record<Estado, number> = { PRESENTE: 0, COMPLETO: 1, JUSTIFICADA: 2, AUSENTE: 3 };

function todayIso() {
  return new Date().toLocaleDateString("sv-SE");
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** Duración legible con segundos: 0:00:00 · 1:05:09 · 12:03:44 */
function fmtHms(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs < 0) return "0:00:00";
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

function elapsedMs(
  checkIn?: string | null,
  checkOut?: string | null,
  nowMs: number = Date.now(),
): number {
  if (!checkIn) return 0;
  const start = new Date(checkIn).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = checkOut ? new Date(checkOut).getTime() : nowMs;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function latestByType(
  list: ApiAttendanceUser["attendances"],
  type: "entrada" | "salida",
): string | undefined {
  const filtered = (list ?? []).filter((a) => a.type === type);
  if (!filtered.length) return undefined;
  return filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max)).timestamp;
}

/** Reloj que avanza solo mientras la jornada sigue abierta; el resto de la página no se vuelve a pintar. */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

function LiveTimer({ since, until }: { since?: string | null; until?: string | null }) {
  const ahora = useAhora(Boolean(since) && !until);
  return <>{fmtHms(elapsedMs(since, until, ahora))}</>;
}

type Jornada = { checkIn?: string; checkOut?: string; abierta: boolean };

function LiveTotal({ jornadas }: { jornadas: Jornada[] }) {
  const ahora = useAhora(jornadas.some((j) => j.abierta && j.checkIn));
  const total = jornadas.reduce(
    (sum, j) => sum + elapsedMs(j.checkIn, j.abierta ? null : j.checkOut, ahora),
    0,
  );
  return <>{fmtHms(total)}</>;
}

/** Marcas del servidor en una checada: sin conexión, revisar, fuera de sitio, cierre, corregida. */
function InsigniasChecada({ checada }: { checada?: ChecadaValidable }) {
  const insignias = insigniasChecada(checada);
  if (!insignias.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {insignias.map((i) => (
        <span
          key={i.clave}
          title={i.detalle}
          style={{
            display: "inline-block",
            maxWidth: "100%",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.4,
            color: i.color,
            background: `color-mix(in srgb, ${i.color} 12%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${i.color} 35%, transparent)`,
            padding: "2px 7px",
            borderRadius: 8,
          }}
        >
          {i.texto}
        </span>
      ))}
    </div>
  );
}

/** Solo dirección y RH: mover una hora deja rastro (antes, después, motivo y quién). */
function BotonCorregir({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 2,
        minHeight: 40,
        background: "none",
        border: "none",
        padding: "0 8px 0 0",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 650,
        fontFamily: "inherit",
        color: "var(--primary)",
      }}
    >
      Corregir hora
    </button>
  );
}

export default function ErpAsistenciasPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const attCfg = useMemo(() => getAttendanceSectionConfig(user), [user]);
  const isManager = attCfg.canManageTeam;
  const canRegister = attCfg.canRegisterSelf;
  // GPS en vivo (mapa del equipo y trayectorias): solo dirección —Christian y
  // Claudia— por el contrato del viernes 18-09. Un encargado ve las checadas de
  // su gente, con su punto y su distancia al sitio, no el rastro del día.
  const canLiveGps = isCeoEquivalentEmail(user?.email);
  const canSeeOwnTrajectory = canLiveGps;

  const [tab, setTab] = useState<TabId>("equipo");
  const [verGuardias, setVerGuardias] = useState(false);
  // Los avisos de comida abren /erp/asistencias?tab=comidas.
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("tab");
    if (inicial === "comidas" || inicial === "equipo") setTab(inicial);
    else if ((inicial === "rechazos" || inicial === "horarios") && isManager) setTab(inicial);
    else if (inicial === "trayectoria" && canLiveGps) setTab(inicial);
  }, [canLiveGps, isManager]);
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("TODOS");

  const [members, setMembers] = useState<ApiAttendanceUser[]>([]);
  const [teamGps, setTeamGps] = useState<LocationRecord[]>([]);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [dayAttendances, setDayAttendances] = useState<
    { type: string; timestamp: string; entryLatitude?: unknown; entryLongitude?: unknown; exitLatitude?: unknown; exitLongitude?: unknown }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);
  // Salida de emergencia: a quién le está registrando la checada un jefe.
  const [registrandoPara, setRegistrandoPara] = useState<{ id: number; nombre: string } | null>(null);

  // CEO / plataforma (Christian, Claudia equivalente, Adam): company-wide (sin scope=subtree).
  // Encargados: árbol managerId.
  const companyWideViewer = Boolean(
    user?.isSuperAdmin ||
      user?.roleKey === "ceo" ||
      isCeoEquivalentEmail(user?.email) ||
      isDeveloperSuperAdminEmail(user?.email),
  );

  const loadEquipo = useCallback(
    async (quiet = false) => {
      if (!token) return;
      if (!isManager) {
        setMembers([]);
        setLoading(false);
        return;
      }
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const scopeQs = companyWideViewer ? "" : "&scope=subtree";
        const raw = await erpFetch<{ users?: ApiAttendanceUser[] } | ApiAttendanceUser[]>(
          `attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}${scopeQs}`,
          token,
        );
        const list = Array.isArray(raw) ? raw : (raw?.users ?? []);
        // Christian/Adam/Claudia/cuenta demo no son empleados: no deben verse como "sin checada".
        const equipo = list.filter((u) => !isNonEmployeeEmail(u.email));
        setMembers(equipo);
        setRefreshError(null);
        setActualizadoEn(new Date());
      } catch (e) {
        const texto = formatApiError(e, "No se pudo cargar la asistencia de tu equipo.");
        // Un refresco silencioso que falla no borra la lista: solo avisa.
        if (quiet) {
          setRefreshError(texto);
        } else {
          setMembers([]);
          setError(texto);
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [token, dateFilter, isManager, companyWideViewer],
  );

  const loadTrayectoria = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [team, pts, hist] = await Promise.all([
        canLiveGps ? erpFetch<LocationRecord[]>("gps/team", token) : Promise.resolve([] as LocationRecord[]),
        canSeeOwnTrajectory
          ? erpFetch<TrajectoryPoint[]>(`gps/trajectory?date=${dateFilter}`, token)
          : Promise.resolve([] as TrajectoryPoint[]),
        canSeeOwnTrajectory
          ? erpFetch<typeof dayAttendances>(`attendance/history?date=${dateFilter}`, token).catch(() => [])
          : Promise.resolve([] as typeof dayAttendances),
      ]);
      setTeamGps(Array.isArray(team) ? team : []);
      setTrajectory(Array.isArray(pts) ? pts : []);
      setDayAttendances(Array.isArray(hist) ? hist : []);
    } catch (e) {
      setTeamGps([]);
      setTrajectory([]);
      setError(formatApiError(e, "No se pudo cargar el recorrido del día."));
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter, canLiveGps, canSeeOwnTrajectory]);

  useEffect(() => {
    // Comidas carga lo suyo en ComidasPanel.
    setError(null);
    if (tab === "equipo") void loadEquipo();
    else if (tab === "trayectoria") void loadTrayectoria();
  }, [tab, loadEquipo, loadTrayectoria]);

  // Live: CEO (manage-only) también debe ver checadas ajenas al instante.
  // Antes el poll/socket exigía canRegister → Christian nunca refrescaba.
  useEffect(() => {
    if (!isManager || !token || tab !== "equipo") return;
    const bump = () => void loadEquipo(true);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    window.addEventListener("attendance:updated", bump);
    document.addEventListener("visibilitychange", onVis);

    const socket = createRealtimeSocket(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
    });
    socket.on("attendance:updated", bump);
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Attendance" || payload?.model === "AttendanceDay") bump();
    });

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") bump();
    }, 15_000);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("attendance:updated", bump);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      socket.disconnect();
    };
  }, [isManager, token, tab, loadEquipo]);

  const mapped = useMemo(() => {
    const meId = user?.id;
    return members
      .map((raw) => {
        const checkIn = latestByType(raw.attendances, "entrada");
        const checkOut = latestByType(raw.attendances, "salida");
        const dayInfo = raw.days?.find((d) => d.date === dateFilter || d.date?.startsWith(dateFilter));
        const falta = faltaDelDia(raw.justificaciones, dateFilter);
        const estado: Estado = dayInfo?.isOpen
          ? "PRESENTE"
          : checkIn && checkOut
            ? "COMPLETO"
            : checkIn
              ? "PRESENTE"
              : falta
                ? "JUSTIFICADA"
                : "AUSENTE";
        return {
          ...raw,
          checkIn,
          checkOut,
          estado,
          falta,
          entryMapUrl: attendanceMapUrl(raw.attendances, "entrada"),
          exitMapUrl: attendanceMapUrl(raw.attendances, "salida"),
          totalMinutes: dayInfo?.totalMinutes ?? raw.totalMinutes ?? 0,
          nombre: raw.userName?.trim() || raw.email || `Usuario #${raw.userId}`,
        };
      })
      .sort((a, b) => {
        if (meId != null) {
          if (a.userId === meId) return -1;
          if (b.userId === meId) return 1;
        }
        return ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado] || a.nombre.localeCompare(b.nombre, "es");
      });
  }, [members, dateFilter, user?.id]);

  const presentes = mapped.filter((m) => m.estado === "PRESENTE").length;
  const completos = mapped.filter((m) => m.estado === "COMPLETO").length;
  const ausentes = mapped.filter((m) => m.estado === "AUSENTE").length;
  const justificadas = mapped.filter((m) => m.estado === "JUSTIFICADA").length;
  const jornadas = useMemo<Jornada[]>(
    () => mapped.map((m) => ({ checkIn: m.checkIn, checkOut: m.checkOut, abierta: m.estado === "PRESENTE" })),
    [mapped],
  );

  const refrescar = async () => {
    setRefrescando(true);
    try {
      await loadEquipo(true);
    } finally {
      setRefrescando(false);
    }
  };

  // Faltas justificadas: solo Christian (y su equivalente) las marca o las quita; la API lo vuelve a exigir.
  const puedeJustificar = isCeoEquivalentEmail(user?.email);
  const [justificando, setJustificando] = useState<{ userId: number; nombre: string } | null>(null);
  const [motivoFalta, setMotivoFalta] = useState("");
  const [guardandoFalta, setGuardandoFalta] = useState(false);
  const [errorFalta, setErrorFalta] = useState<string | null>(null);
  const [confirmFalta, setConfirmFalta] = useState<ConfirmState | null>(null);

  // Corregir la hora de una checada: dirección (CEO-equivalentes) y RH. La API lo vuelve a exigir.
  const puedeCorregir =
    isCeoEquivalentEmail(user?.email) ||
    isDeveloperSuperAdminEmail(user?.email) ||
    ["rh", "rrhh", "recursos_humanos"].includes(String(user?.roleKey ?? "").toLowerCase());
  const [corrigiendo, setCorrigiendo] = useState<{
    id: number;
    nombre: string;
    tipo: "entrada" | "salida";
    timestamp: string;
  } | null>(null);
  const [horaCorreccion, setHoraCorreccion] = useState("");
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);
  const [errorCorreccion, setErrorCorreccion] = useState<string | null>(null);

  /** `AAAA-MM-DDTHH:mm` local, que es lo que entiende `datetime-local`. */
  const paraInputLocal = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const abrirCorreccion = (
    checada: ChecadaValidable | undefined,
    nombre: string,
    tipo: "entrada" | "salida",
  ) => {
    if (!checada?.id || !checada.timestamp) return;
    setErrorCorreccion(null);
    setMotivoCorreccion("");
    setHoraCorreccion(paraInputLocal(checada.timestamp));
    setCorrigiendo({ id: checada.id, nombre, tipo, timestamp: checada.timestamp });
  };

  const guardarCorreccion = async () => {
    if (!corrigiendo || motivoCorreccion.trim().length < MOTIVO_CORRECCION_MINIMO) return;
    const nueva = new Date(horaCorreccion);
    if (Number.isNaN(nueva.getTime())) {
      setErrorCorreccion("La hora no es válida");
      return;
    }
    setGuardandoCorreccion(true);
    setErrorCorreccion(null);
    try {
      await erpFetch(`attendance/${corrigiendo.id}/correccion`, token, {
        method: "PATCH",
        body: JSON.stringify({ timestamp: nueva.toISOString(), motivo: motivoCorreccion.trim() }),
      });
      setCorrigiendo(null);
      await loadEquipo(true);
    } catch (e) {
      setErrorCorreccion(formatApiError(e, "No se pudo corregir la checada"));
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  /** Refleja el ✓ / ✗ de uniforme sin recargar todo el equipo. */
  const actualizarUniforme = (userId: number, attendanceId: number, ok: boolean | null, at: string | null) => {
    setMembers((prev) =>
      prev.map((u) =>
        u.userId !== userId
          ? u
          : {
              ...u,
              attendances: (u.attendances ?? []).map((a) =>
                a.id === attendanceId ? { ...a, uniformeOk: ok, uniformeRevisadoAt: at } : a,
              ),
            },
      ),
    );
  };

  const abrirJustificar = (userId: number, nombre: string) => {
    setMotivoFalta("");
    setErrorFalta(null);
    setJustificando({ userId, nombre });
  };

  const guardarJustificacion = async () => {
    if (!justificando || motivoFalta.trim().length < MOTIVO_FALTA_MINIMO) return;
    setGuardandoFalta(true);
    setErrorFalta(null);
    try {
      await justificarFalta(token, { userId: justificando.userId, fecha: dateFilter, motivo: motivoFalta.trim() });
      setJustificando(null);
      await loadEquipo(true);
    } catch (e) {
      setErrorFalta(formatApiError(e, "No se pudo justificar la falta"));
    } finally {
      setGuardandoFalta(false);
    }
  };

  const pedirQuitarFalta = (falta: FaltaJustificada, nombre: string) => {
    setConfirmFalta({
      title: "Quitar falta justificada",
      message: `El ${dateFilter} de ${nombre} volverá a mostrarse como «Sin checada».`,
      confirmLabel: "Quitar",
      danger: true,
      fn: async () => {
        try {
          await quitarFaltaJustificada(token, falta.id);
          await loadEquipo(true);
        } catch (e) {
          setError(formatApiError(e, "No se pudo quitar la falta justificada"));
        }
      },
    });
  };

  const kpis: { key: FilterEstado; label: string; value: number; variant: KpiVariant }[] = [
    { key: "TODOS", label: "Todo el equipo", value: mapped.length, variant: "default" },
    { key: "PRESENTE", label: "En jornada", value: presentes, variant: presentes > 0 ? "accent" : "default" },
    { key: "COMPLETO", label: "Ya salieron", value: completos, variant: completos > 0 ? "positive" : "default" },
    ...(justificadas > 0 || puedeJustificar
      ? [{ key: "JUSTIFICADA" as const, label: "Falta justificada", value: justificadas, variant: "default" as const }]
      : []),
    { key: "AUSENTE", label: "Sin checada", value: ausentes, variant: ausentes > 0 ? "danger" : "positive" },
  ];

  const filtered = useMemo(
    () => (filterEstado === "TODOS" ? mapped : mapped.filter((m) => m.estado === filterEstado)),
    [mapped, filterEstado],
  );

  const sectionTitle =
    filterEstado === "TODOS"
      ? `Equipo del día (${filtered.length})`
      : `${kpis.find((k) => k.key === filterEstado)?.label ?? ESTADO_META[filterEstado].label} (${filtered.length})`;

  return (
    <>
      <PageHeader
        eyebrow="Asistencias"
        title="Asistencia del día"
        subtitle={
          isManager
            ? "Quién llegó, a qué hora y cuánto lleva trabajando tu equipo."
            : "Tu jornada y tus comidas del día."
        }
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {isManager ? (
              <Link
                href={KPIS_PATH}
                className={styles.control}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--nx-panel-hairline)",
                  background: "var(--nx-panel-surface-overlay)",
                  color: "var(--primary)",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                KPIs del equipo
              </Link>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setVerGuardias(true)}>
              Guardias
            </Button>
            <input
              type="date"
              aria-label="Día"
              value={dateFilter}
              max={todayIso()}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`${styles.control} ${styles.dateInput}`}
              style={{
                padding: "7px 10px",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 8,
                background: "var(--nx-panel-surface-overlay)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
          </div>
        }
      />

      <div className={styles.tabs}>
        <PanelTabs
          ariaLabel="Secciones de asistencia"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "equipo", label: isManager ? "Equipo del día" : "Mi jornada" },
            { key: "comidas", label: "Comidas" },
            // Quién intentó checar y no pudo, y el horario de cada quien: quien tiene equipo.
            ...(isManager
              ? [
                  { key: "rechazos" as const, label: "Checadas rechazadas" },
                  { key: "horarios" as const, label: "Horarios" },
                ]
              : []),
            // Mapa del equipo y recorridos: solo dirección.
            ...(canLiveGps ? [{ key: "trayectoria" as const, label: "Recorrido del día" }] : []),
          ]}
        />
      </div>

      <p className={styles.tabHint}>
        {tab === "equipo"
          ? isManager
            ? "Aquí ves la entrada, la salida y el tiempo trabajado de tu equipo. Toca una tarjeta para ver qué está haciendo cada quien."
            : "Aquí ves tu jornada. La entrada y la salida se registran desde la app NEXARA."
          : tab === "comidas"
            ? isManager
              ? "Aquí ves tus comidas y las de tu equipo."
              : "Aquí ves tus comidas del día."
            : tab === "rechazos"
              ? "Aquí ves quién intentó checar y no pudo, y por qué."
              : tab === "horarios"
                ? "Aquí ves el horario de cada persona de tu equipo."
                : "Aquí ves dónde está tu equipo ahora y tu propio recorrido del día."}
      </p>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <InlineAlert
            variant="danger"
            message={error}
            action={
              tab === "equipo" || tab === "trayectoria" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void (tab === "equipo" ? loadEquipo() : loadTrayectoria())}
                >
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}

      {tab === "equipo" && (
        <>
          {canRegister ? (
            <Section
              dense
              tone="accent"
              title="Mi jornada"
              subtitle="Se checa desde la app NEXARA"
              actions={
                <InfoPopover label="¿Por qué ya no puedo checar aquí?" title="Se checa desde la app">
                  <p style={{ margin: "0 0 8px" }}>
                    Un navegador puede decir que está donde quiera —la ubicación de una pestaña se cambia desde la
                    consola en dos líneas— y de estas checadas sale la nómina. Por eso ahora solo se checa desde la
                    app, que sabe si el GPS es simulado y de cuándo es la medición.
                  </p>
                  <p style={{ margin: 0 }}>
                    ¿Teléfono roto, sin batería u olvidado en casa? Tu jefe puede registrar tu checada desde esta
                    misma pantalla, con el motivo; queda a su nombre y marcada para revisión.
                  </p>
                </InfoPopover>
              }
            >
              {/* Solo con la excepción temporal que abre dirección aparece el formulario; si no, «usa la app». */}
              <ChecarEnWeb token={token} />
            </Section>
          ) : null}

          {!isManager ? (
            canRegister ? null : (
              <EmptyState
                icon={<GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                title="Vista de equipo"
                description="Aquí aparece la asistencia de tu equipo cuando tienes personas a tu cargo."
              />
            )
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: canRegister ? 16 : 0,
                  marginBottom: 10,
                }}
              >
                {actualizadoEn ? (
                  <span className={styles.actualizado}>
                    Actualizado {actualizadoEn.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className={styles.control}
                  onClick={() => void refrescar()}
                  disabled={refrescando || loading}
                >
                  <span className={refrescando ? styles.girando : undefined} aria-hidden>
                    ↻
                  </span>{" "}
                  Actualizar
                </Button>
              </div>

              {refreshError ? (
                <div style={{ marginBottom: 12 }}>
                  <InlineAlert
                    variant="warning"
                    message={`No se pudo actualizar; ves los datos de las ${
                      actualizadoEn
                        ? actualizadoEn.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                        : "última carga"
                    }. ${refreshError}`}
                    action={
                      <Button size="sm" variant="secondary" onClick={() => void refrescar()} disabled={refrescando}>
                        Reintentar
                      </Button>
                    }
                  />
                </div>
              ) : null}

              <div className={styles.kpis} role="group" aria-label="Filtrar por estado">
                {kpis.map((k) => {
                  const activo = filterEstado === k.key;
                  const elegir = () => setFilterEstado(activo && k.key !== "TODOS" ? "TODOS" : k.key);
                  return (
                    <div
                      key={k.key}
                      className={`${styles.kpi} ${activo ? styles.kpiActivo : ""}`}
                      aria-current={activo ? "true" : undefined}
                      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          elegir();
                        }
                      }}
                    >
                      <KpiCard label={k.label} value={k.value} variant={k.variant} onClick={elegir} />
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid color-mix(in srgb, #16a34a 28%, var(--border))",
                  background: "color-mix(in srgb, #16a34a 8%, var(--surface))",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Horas trabajadas hoy
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
                    Todo tu equipo junto, en vivo
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    color: "#16a34a",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <LiveTotal jornadas={jornadas} />
                </div>
              </div>

              <Section title={sectionTitle} subtitle="Toca una tarjeta para ver qué está haciendo cada quien.">
                {loading && (
                  <EmptyState
                    icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />}
                    title="Cargando…"
                    description="Consultando la asistencia de tu equipo."
                  />
                )}
                {!loading && !error && filtered.length === 0 && (
                  <EmptyState
                    icon={<GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                    title={mapped.length === 0 ? "Nadie en tu equipo este día" : "Nadie en este grupo"}
                    description={
                      mapped.length === 0
                        ? "Cuando alguien de tu equipo registre su entrada, aparece aquí."
                        : "Toca «Todo el equipo» arriba para ver a todos."
                    }
                    action={
                      mapped.length > 0 ? (
                        <Button size="sm" variant="secondary" onClick={() => setFilterEstado("TODOS")}>
                          Ver todo el equipo
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                {!loading && filtered.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {filtered.map((m) => {
                      const meta = ESTADO_META[m.estado];
                      const entryPhoto = [...(m.attendances ?? [])]
                        .filter((a) => a.type === "entrada" && a.photoUrl)
                        .pop();
                      const exitPhoto = [...(m.attendances ?? [])]
                        .filter((a) => a.type === "salida" && a.photoUrl)
                        .pop();
                      // Lo que el servidor dejó dicho de cada checada (contrato A).
                      const checadaEntrada = checadaDelTipo(m.attendances, "entrada");
                      const checadaSalida = checadaDelTipo(m.attendances, "salida");
                      return (
                        <article
                          key={m.userId}
                          className={styles.card}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderLeft: `3px solid ${meta.color}`,
                            borderRadius: 16,
                            padding: "14px 16px",
                            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                            opacity: m.estado === "AUSENTE" ? 0.88 : 1,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <div
                                aria-hidden
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: "50%",
                                  overflow: "hidden",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: "var(--primary)",
                                  background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
                                }}
                              >
                                {resolveUserAvatarUrl(m.avatarUrl) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={resolveUserAvatarUrl(m.avatarUrl)}
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  initials(m.nombre)
                                )}
                              </div>
                              <span
                                title={meta.label}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  bottom: 0,
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  background: meta.color,
                                  border: "2px solid var(--surface)",
                                  boxShadow: `0 0 0 2px color-mix(in srgb, ${meta.color} 25%, transparent)`,
                                }}
                              />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <Link
                                href={`/erp/pizarra/${m.userId}`}
                                className={styles.cardLink}
                                aria-label={`${m.nombre}: ver qué está haciendo`}
                                style={{
                                  fontWeight: 750,
                                  fontSize: 15,
                                  color: "inherit",
                                  textDecoration: "none",
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {m.nombre}
                              </Link>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-tertiary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {[m.roleName, m.department].filter(Boolean).join(" · ") || "Equipo NEXARA"}
                              </div>
                            </div>
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 11,
                                fontWeight: 700,
                                color: meta.color,
                                background: `color-mix(in srgb, ${meta.color} 12%, var(--surface))`,
                                padding: "4px 8px",
                                borderRadius: 999,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr auto",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "var(--surface-2, color-mix(in srgb, var(--border) 35%, var(--surface)))",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                }}
                              >
                                Entrada
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 750,
                                  fontVariantNumeric: "tabular-nums",
                                  marginTop: 2,
                                }}
                              >
                                {fmtTime(m.checkIn)}
                              </div>
                              <InsigniasChecada checada={checadaEntrada} />
                              {puedeCorregir && checadaEntrada?.id ? (
                                <BotonCorregir
                                  onClick={() =>
                                    abrirCorreccion(checadaEntrada, m.nombre, "entrada")
                                  }
                                />
                              ) : null}
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                }}
                              >
                                Salida
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 750,
                                  fontVariantNumeric: "tabular-nums",
                                  marginTop: 2,
                                }}
                              >
                                {fmtTime(m.checkOut)}
                              </div>
                              <InsigniasChecada checada={checadaSalida} />
                              {puedeCorregir && checadaSalida?.id ? (
                                <BotonCorregir
                                  onClick={() => abrirCorreccion(checadaSalida, m.nombre, "salida")}
                                />
                              ) : null}
                            </div>
                            <div style={{ textAlign: "right", alignSelf: "center", minWidth: 88 }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  textTransform: "uppercase",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  justifyContent: "flex-end",
                                }}
                              >
                                {m.estado === "PRESENTE" ? (
                                  <>
                                    <span
                                      aria-hidden
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: "#16a34a",
                                        boxShadow: "0 0 0 3px color-mix(in srgb, #16a34a 30%, transparent)",
                                      }}
                                    />
                                    En vivo
                                  </>
                                ) : m.estado === "COMPLETO" ? (
                                  "Jornada"
                                ) : (
                                  "Tiempo"
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: m.estado === "AUSENTE" ? 15 : 18,
                                  fontWeight: 800,
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                  marginTop: 2,
                                  color:
                                    m.estado === "PRESENTE"
                                      ? "#16a34a"
                                      : m.estado === "COMPLETO"
                                        ? "#2563eb"
                                        : "var(--text-tertiary)",
                                  letterSpacing: "-0.02em",
                                }}
                              >
                                {m.estado === "AUSENTE" || !m.checkIn ? (
                                  "—"
                                ) : (
                                  <LiveTimer
                                    since={m.checkIn}
                                    until={m.estado === "PRESENTE" ? null : m.checkOut}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          {(entryPhoto?.photoUrl || exitPhoto?.photoUrl || checadaEntrada?.id) && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              {entryPhoto?.photoUrl && (
                                <SessionImage
                                  src={resolveAssetUrl(entryPhoto.photoUrl)}
                                  alt="Entrada"
                                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }}
                                />
                              )}
                              {exitPhoto?.photoUrl && (
                                <SessionImage
                                  src={resolveAssetUrl(exitPhoto.photoUrl)}
                                  alt="Salida"
                                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }}
                                />
                              )}
                              {/* KPI «cumplimiento con uniforme»: el jefe lo marca viendo la foto de entrada. */}
                              {checadaEntrada?.id ? (
                                <UniformeControl
                                  attendanceId={checadaEntrada.id}
                                  uniformeOk={checadaEntrada.uniformeOk}
                                  revisadoAt={checadaEntrada.uniformeRevisadoAt}
                                  editable={m.userId !== user?.id}
                                  token={token}
                                  onCambio={(ok, at) => actualizarUniforme(m.userId, checadaEntrada.id!, ok, at)}
                                />
                              ) : null}
                            </div>
                          )}

                          {m.falta ? (
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "flex-start",
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: `color-mix(in srgb, ${ESTADO_META.JUSTIFICADA.color} 8%, var(--surface))`,
                                fontSize: 12.5,
                                lineHeight: 1.45,
                              }}
                            >
                              <EventBusyOutlinedIcon aria-hidden="true" sx={{ fontSize: 18, color: ESTADO_META.JUSTIFICADA.color, mt: "1px" }} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>Falta justificada · {m.falta.motivo}</div>
                                <div style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>
                                  {m.falta.justificadaPor?.nombre ? `Justificó ${m.falta.justificadaPor.nombre}` : "Justificada"}
                                  {" · "}
                                  {new Date(m.falta.justificadaAt).toLocaleString("es-MX", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                              {puedeJustificar ? (
                                <Button size="sm" variant="ghost" onClick={() => pedirQuitarFalta(m.falta!, m.nombre)}>
                                  Quitar
                                </Button>
                              ) : null}
                            </div>
                          ) : null}

                          {(m.estado === "AUSENTE" && puedeJustificar) ||
                          (isManager && m.userId !== user?.id) ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                              {/* Teléfono roto, sin batería u olvidado: que su falta no la pague en la nómina. */}
                              {isManager && m.userId !== user?.id ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setRegistrandoPara({ id: m.userId, nombre: m.nombre })}
                                >
                                  Registrar checada
                                </Button>
                              ) : null}
                              {m.estado === "AUSENTE" && puedeJustificar ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => abrirJustificar(m.userId, m.nombre)}
                                  iconLeft={<EventBusyOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                                >
                                  Justificar falta
                                </Button>
                              ) : null}
                            </div>
                          ) : null}

                          {/* AttendanceGpsDayPanel no se pinta en tu propia tarjeta sin recorrido: ahí los mapas van aparte. */}
                          {m.userId === user?.id && !canSeeOwnTrajectory && (m.entryMapUrl || m.exitMapUrl) ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {m.entryMapUrl ? (
                                <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" className={styles.mapButton} style={{ marginTop: 0 }}>
                                  📍 Entrada en mapa
                                </a>
                              ) : null}
                              {m.exitMapUrl ? (
                                <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" className={styles.mapButton} style={{ marginTop: 0 }}>
                                  📍 Salida en mapa
                                </a>
                              ) : null}
                            </div>
                          ) : null}

                          {(m.estado === "PRESENTE" || m.estado === "COMPLETO") && (
                            <AttendanceGpsDayPanel
                              token={token}
                              userId={m.userId}
                              date={dateFilter}
                              attendances={m.attendances}
                              hasCheckIn={Boolean(m.checkIn)}
                              viewerUserId={user?.id}
                              canViewOwnTrajectory={canSeeOwnTrajectory}
                              canViewTrajectory={canLiveGps}
                            />
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      )}

      <Modal open={verGuardias} onClose={() => setVerGuardias(false)} title="Guardias de fin de semana" size="lg">
        {verGuardias ? <GuardiasPanel token={token} /> : null}
      </Modal>

      <Modal
        open={justificando != null}
        onClose={() => !guardandoFalta && setJustificando(null)}
        title="Justificar falta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setJustificando(null)} disabled={guardandoFalta}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void guardarJustificacion()}
              disabled={motivoFalta.trim().length < MOTIVO_FALTA_MINIMO}
              loading={guardandoFalta}
            >
              Justificar falta
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {justificando?.nombre} · {dateFilter}. El día quedará como «Falta justificada» con tu motivo; no se crea
            ninguna checada. Se avisa a la persona y a sus jefes.
          </p>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo *</span>
            <textarea
              value={motivoFalta}
              onChange={(e) => setMotivoFalta(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ej. Cita médica con comprobante del IMSS."
              style={{ ...erpInputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            <span
              style={{
                fontSize: 11,
                color: motivoFalta.trim().length >= MOTIVO_FALTA_MINIMO ? "var(--text-tertiary)" : "var(--danger)",
              }}
            >
              {motivoFalta.trim().length}/{MOTIVO_FALTA_MINIMO} caracteres mínimo
            </span>
          </label>
          {errorFalta ? <InlineAlert variant="danger" message={errorFalta} /> : null}
        </div>
      </Modal>
      <Modal
        open={corrigiendo != null}
        onClose={() => !guardandoCorreccion && setCorrigiendo(null)}
        title="Corregir hora de la checada"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCorrigiendo(null)} disabled={guardandoCorreccion}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void guardarCorreccion()}
              disabled={motivoCorreccion.trim().length < MOTIVO_CORRECCION_MINIMO || !horaCorreccion}
              loading={guardandoCorreccion}
            >
              Guardar corrección
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {corrigiendo?.nombre} · {corrigiendo?.tipo === "entrada" ? "Entrada" : "Salida"} de las{" "}
            {corrigiendo ? fmtTime(corrigiendo.timestamp) : ""}. La checada original no se borra:
            queda el antes, el después, tu motivo y tu nombre. Se avisa a la persona y a sus jefes.
          </p>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Hora correcta *</span>
            <input
              type="datetime-local"
              value={horaCorreccion}
              onChange={(e) => setHoraCorreccion(e.target.value)}
              style={erpInputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo *</span>
            <textarea
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ej. Entró a la planta a las 8:05 y el teléfono no tenía señal."
              style={{ ...erpInputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            <span
              style={{
                fontSize: 11,
                color:
                  motivoCorreccion.trim().length >= MOTIVO_CORRECCION_MINIMO
                    ? "var(--text-tertiary)"
                    : "var(--danger)",
              }}
            >
              {motivoCorreccion.trim().length}/{MOTIVO_CORRECCION_MINIMO} caracteres mínimo
            </span>
          </label>
          {errorCorreccion ? <InlineAlert variant="danger" message={errorCorreccion} /> : null}
        </div>
      </Modal>

      <ConfirmDialog state={confirmFalta} onClose={() => setConfirmFalta(null)} />

      {tab === "comidas" && <ComidasPanel fecha={dateFilter} />}

      {tab === "rechazos" && isManager && (
        <ChecadasRechazadas token={token} desde={dateFilter} hasta={dateFilter} />
      )}

      {tab === "horarios" && isManager && (
        <HorariosEquipo
          token={token}
          personas={mapped.map((m) => ({ id: m.userId, nombre: m.nombre, puesto: m.roleName ?? m.department }))}
        />
      )}

      {registrandoPara ? (
        <RegistroAsistido
          token={token}
          persona={registrandoPara}
          fecha={dateFilter}
          onClose={() => setRegistrandoPara(null)}
          onRegistrada={() => void loadEquipo()}
        />
      ) : null}

      {tab === "trayectoria" && canLiveGps && (
        <>
          {canLiveGps && (
            <Section title="Dónde está tu equipo" subtitle="Personas con jornada abierta que comparten su ubicación.">
              {loading && <EmptyState icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />} title="Cargando…" description="Buscando la ubicación de tu equipo." />}
              {!loading && !error && teamGps.length === 0 && (
                <EmptyState icon={<SatelliteAltOutlinedIcon fontSize="inherit" aria-hidden="true" />} title="Sin ubicaciones" description="Nadie está compartiendo su ubicación ahora." />
              )}
              {!loading && teamGps.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {teamGps.map((item) => {
                    const lat = toCoord(item.latitud);
                    const lng = toCoord(item.longitud);
                    return (
                      <article
                        key={item.id}
                        style={{
                          background: "var(--surface)",
                          border: `1.5px solid ${item.estaActivo ? "#3b82f6" : "var(--border)"}`,
                          borderRadius: 16,
                          padding: 14,
                          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <div style={{ fontWeight: 750, fontSize: 14 }}>{item.usuario?.nombre ?? "Sin nombre"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          {item.usuario?.role?.nombre ?? item.usuario?.department?.nombre ?? ""}
                          {item.ultimaActualizacion ? ` · a las ${fmtTime(item.ultimaActualizacion)}` : ""}
                        </div>
                        {lat != null && lng != null ? (
                          <a
                            href={googleMapsPointUrl(lat, lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.mapButton}
                          >
                            📍 Ver en mapa
                          </a>
                        ) : (
                          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10 }}>
                            Sin ubicación por ahora
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </Section>
          )}
          {canSeeOwnTrajectory ? (
            <Section title="Mi recorrido del día" subtitle="Tu entrada, por dónde pasaste y tu salida.">
              {loading ? (
                <EmptyState icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />} title="Cargando recorrido…" description="" />
              ) : (
                <GpsTrajectoryPreview trajectory={trajectory} attendances={dayAttendances} />
              )}
            </Section>
          ) : (
            <EmptyState
              icon={<PlaceOutlinedIcon fontSize="inherit" aria-hidden="true" />}
              title="Tu recorrido no se muestra aquí"
              description="El recorrido de cada persona de tu equipo está en su tarjeta, en «Equipo del día»."
            />
          )}
        </>
      )}
    </>
  );
}
