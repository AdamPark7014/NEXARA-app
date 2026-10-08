"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AttendanceGpsDayPanel from "@/components/AttendanceGpsDayPanel";
import GpsTrajectoryPreview from "@/components/GpsTrajectoryPreview";
import SessionImage from "@/components/SessionImage";
import ComidasPanel from "@/components/asistencias/ComidasPanel";
import ChecarEnWeb from "@/components/asistencias/ChecarEnWeb";
import { duracionCorta, horaCorta, transcurrido } from "@/components/asistencias/formato";
import rec from "@/components/asistencias/recorrido.module.css";
import UniformeControl from "@/components/kpis/UniformeControl";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FilterChip,
  FilterChips,
  InfoPopover,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  Tabs,
  Textarea,
  ViewSwitch,
  WhenCell,
  type Column,
  type ModuleEmpty,
  type TabItem,
  type Tone,
  type ViewId,
} from "@/components/base";
import { KPIS_PATH } from "@/lib/kpis-equipo";
import { useUser } from "@/components/UserContext";
import { getSocketBaseUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { attendanceMapUrl, googleMapsPointUrl, toCoord } from "@/lib/gps-map-links";
import { getAttendanceSectionConfig } from "@/lib/user-access";
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail, isNonEmployeeEmail } from "@/lib/platform-accounts";
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import {
  avisoUbicacion,
  checadaDelTipo,
  insigniasChecada,
  MOTIVO_CORRECCION_MINIMO,
  type ChecadaValidable,
  type InsigniaChecada,
  type TramoSinUbicacion,
} from "@/lib/attendance-validacion";
import {
  faltaDelDia,
  justificarFalta,
  MOTIVO_FALTA_MINIMO,
  quitarFaltaJustificada,
  type FaltaJustificada,
} from "@/lib/attendance-justifications";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SatelliteAltOutlinedIcon from "@mui/icons-material/SatelliteAltOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import styles from "./asistencias.module.css";

// Pantallas pesadas que solo se ven al abrir su pestaña: se cargan entonces, no en cada visita.
const ChecadasRechazadas = dynamic(() => import("@/components/asistencias/ChecadasRechazadas"), { ssr: false });
const HorariosEquipo = dynamic(() => import("@/components/asistencias/HorariosEquipo"), { ssr: false });
const RegistroAsistido = dynamic(() => import("@/components/asistencias/RegistroAsistido"), { ssr: false });
const GuardiasPanel = dynamic(() => import("@/components/asistencias/GuardiasPanel"), { ssr: false });

type TabId = "equipo" | "comidas" | "trayectoria" | "rechazos" | "horarios" | "guardias";
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
  /** Tramos con la ubicación del teléfono apagada o sin permiso (API del 08-10; opcional). */
  sinUbicacion?: TramoSinUbicacion[];
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

type Fila = ApiAttendanceUser & {
  checkIn?: string;
  checkOut?: string;
  estado: Estado;
  falta: ReturnType<typeof faltaDelDia>;
  entryMapUrl: string | null;
  exitMapUrl: string | null;
  totalMinutes: number;
  nombre: string;
};

/** Un solo mapa estado → texto y tono (los mismos tonos que el resto del sistema). */
const ESTADO_META: Record<Estado, { label: string; tone: Tone }> = {
  PRESENTE: { label: "En jornada", tone: "success" },
  COMPLETO: { label: "Ya salió", tone: "info" },
  JUSTIFICADA: { label: "Falta justificada", tone: "violet" },
  AUSENTE: { label: "Sin checada", tone: "neutral" },
};

const ESTADO_ORDER: Record<Estado, number> = { PRESENTE: 0, COMPLETO: 1, JUSTIFICADA: 2, AUSENTE: 3 };

/** Marcas del servidor en una checada, con el tono de su gravedad. */
const TONO_INSIGNIA: Record<InsigniaChecada["clave"], Tone> = {
  offline: "info",
  revisar: "warning",
  "fuera-sitio": "danger",
  cierre: "violet",
  corregida: "info",
};

function todayIso() {
  return new Date().toLocaleDateString("sv-SE");
}

function latestByType(list: ApiAttendanceUser["attendances"], type: "entrada" | "salida"): string | undefined {
  const filtered = (list ?? []).filter((a) => a.type === type);
  if (!filtered.length) return undefined;
  return filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max)).timestamp;
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function puestoDe(m: Pick<Fila, "roleName" | "department">) {
  return [m.roleName, m.department].filter(Boolean).join(" · ") || "Equipo NEXARA";
}

/** Reloj que avanza solo mientras la jornada sigue abierta; sin segundos, basta cada 30 s. */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

/** ¿Pantalla de teléfono? Ahí la lista va en tarjetas (sin desplazamiento lateral). */
function useAngosto(): boolean {
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setAngosto(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return angosto;
}

function LiveTimer({ since, until }: { since?: string | null; until?: string | null }) {
  const ahora = useAhora(Boolean(since) && !until);
  return <>{duracionCorta(transcurrido(since, until, ahora))}</>;
}

type Jornada = { checkIn?: string; checkOut?: string; abierta: boolean };

function LiveTotal({ jornadas }: { jornadas: Jornada[] }) {
  const ahora = useAhora(jornadas.some((j) => j.abierta && j.checkIn));
  const total = jornadas.reduce((sum, j) => sum + transcurrido(j.checkIn, j.abierta ? null : j.checkOut, ahora), 0);
  return <>{duracionCorta(total)}</>;
}

/** Tiempo de la jornada de una persona: en vivo si sigue abierta, «—» si no checó. */
function TiempoJornada({ m }: { m: Fila }) {
  if (m.estado === "AUSENTE" || !m.checkIn) return <span className={styles.tiempoVacio}>—</span>;
  return (
    <span className={styles.tiempo} data-estado={m.estado}>
      <LiveTimer since={m.checkIn} until={m.estado === "PRESENTE" ? null : m.checkOut} />
    </span>
  );
}

/** Marcas del servidor en una checada: sin conexión, revisar, fuera de sitio, cierre, corregida. */
function InsigniasChecada({ checada }: { checada?: ChecadaValidable }) {
  const insignias = insigniasChecada(checada);
  if (!insignias.length) return null;
  return (
    <span className={styles.insignias}>
      {insignias.map((i) => (
        <Badge key={i.clave} tone={TONO_INSIGNIA[i.clave]} size="sm" title={i.detalle}>
          {i.texto}
        </Badge>
      ))}
    </span>
  );
}

/** Punto de la hora: rojo si quedó fuera de sitio, ámbar si hay que revisarla. */
function tonoChecada(hora: string | undefined, checada: ChecadaValidable | undefined, base: Tone): Tone {
  if (!hora) return "neutral";
  const claves = insigniasChecada(checada).map((i) => i.clave);
  if (claves.includes("fuera-sitio")) return "danger";
  if (claves.includes("revisar")) return "warning";
  return base;
}

function ultimaFoto(m: Fila, tipo: "entrada" | "salida") {
  return [...(m.attendances ?? [])].filter((a) => a.type === tipo && a.photoUrl).pop();
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
  const angosto = useAngosto();

  const [tab, setTab] = useState<TabId>("equipo");
  // Los avisos de comida abren /erp/asistencias?tab=comidas.
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("tab");
    if (inicial === "comidas" || inicial === "equipo" || inicial === "guardias") setTab(inicial);
    else if ((inicial === "rechazos" || inicial === "horarios") && isManager) setTab(inicial);
    else if (inicial === "trayectoria" && canLiveGps) setTab(inicial);
  }, [canLiveGps, isManager]);
  const [dateFilter, setDateFilter] = useState(todayIso());
  // Un tramo sin cierre solo «sigue» si el día que se ve es hoy.
  const esHoy = dateFilter === todayIso();
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<ViewId>("lista");
  const vistaEfectiva: ViewId = angosto ? "tablero" : vista;

  const [members, setMembers] = useState<ApiAttendanceUser[]>([]);
  /** Día al que corresponden los datos que se ven: un fallo no borra lo de ese mismo día. */
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const cargadoParaRef = useRef<string | null>(null);
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
  // Ficha del día de una persona (fotos, uniforme, mapas y correcciones).
  const [detalleId, setDetalleId] = useState<number | null>(null);

  // CEO / plataforma (Christian, Claudia equivalente, Adam): toda la empresa.
  // Encargados: solo su gente (árbol de managerId).
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
        cargadoParaRef.current = dateFilter;
        setCargadoPara(dateFilter);
        setRefreshError(null);
        setActualizadoEn(new Date());
      } catch (e) {
        const texto = formatApiError(e, "No se pudo cargar la asistencia de tu equipo.");
        // Un refresco que falla no borra la lista del mismo día: solo avisa.
        if (quiet || cargadoParaRef.current === dateFilter) {
          setRefreshError(texto);
        } else {
          setMembers([]);
          cargadoParaRef.current = null;
          setCargadoPara(null);
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
    // Comidas, rechazos, horarios y guardias cargan lo suyo.
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

  const mapped = useMemo<Fila[]>(() => {
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

  const abrirCorreccion = (checada: ChecadaValidable | undefined, nombre: string, tipo: "entrada" | "salida") => {
    if (!checada?.id || !checada.timestamp) return;
    setDetalleId(null);
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
    setDetalleId(null);
    setMotivoFalta("");
    setErrorFalta(null);
    setJustificando({ userId, nombre });
  };

  const abrirRegistro = (id: number, nombre: string) => {
    setDetalleId(null);
    setRegistrandoPara({ id, nombre });
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
    setDetalleId(null);
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

  const elegirEstado = (key: FilterEstado) => setFilterEstado((prev) => (prev === key && key !== "TODOS" ? "TODOS" : key));

  const filtered = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return mapped.filter(
      (m) =>
        (filterEstado === "TODOS" || m.estado === filterEstado) &&
        (!q || normalizar(`${m.nombre} ${m.roleName ?? ""} ${m.department ?? ""}`).includes(q)),
    );
  }, [mapped, filterEstado, busqueda]);

  const detalle = detalleId == null ? null : (mapped.find((m) => m.userId === detalleId) ?? null);
  const esOtro = (m: Fila) => isManager && m.userId !== user?.id;
  const horaActualizado = actualizadoEn ? horaCorta(actualizadoEn.toISOString()) : null;

  /* ─── Piezas de la pestaña Equipo ─────────────────────────────────────── */

  const fechaControl = (
    <DateInput
      aria-label="Día"
      value={dateFilter}
      max={todayIso()}
      onChange={(e) => setDateFilter(e.target.value)}
      className={styles.fecha}
    />
  );

  const accionesDePersona = (m: Fila, size: "sm" | "md" = "sm") => (
    <>
      {m.estado === "AUSENTE" && puedeJustificar ? (
        <Button
          size={size}
          variant="ghost"
          iconStart={<EventBusyOutlinedIcon fontSize="inherit" aria-hidden="true" />}
          onClick={() => abrirJustificar(m.userId, m.nombre)}
        >
          Justificar falta
        </Button>
      ) : null}
      {/* Teléfono roto, sin batería u olvidado: que su falta no la pague en la nómina. */}
      {esOtro(m) ? (
        <Button
          size={size}
          variant="ghost"
          iconStart={<HowToRegOutlinedIcon fontSize="inherit" aria-hidden="true" />}
          onClick={() => abrirRegistro(m.userId, m.nombre)}
        >
          Registrar checada
        </Button>
      ) : null}
    </>
  );

  const columnas: Column<Fila>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (m) => (
        <Link
          href={`/erp/pizarra/${m.userId}`}
          className={styles.personaLink}
          aria-label={`${m.nombre}: ver qué está haciendo`}
          onClick={(e) => e.stopPropagation()}
        >
          <PersonCell name={m.nombre} avatarUrl={m.avatarUrl} subtitle={puestoDe(m)} size={32} />
        </Link>
      ),
    },
    {
      key: "entrada",
      label: "Entrada",
      render: (m) => {
        const c = checadaDelTipo(m.attendances, "entrada");
        return (
          <WhenCell
            time={horaCorta(m.checkIn)}
            tone={tonoChecada(m.checkIn, c, "success")}
            hint={insigniasChecada(c).length ? <InsigniasChecada checada={c} /> : undefined}
          />
        );
      },
    },
    {
      key: "salida",
      label: "Salida",
      render: (m) => {
        const c = checadaDelTipo(m.attendances, "salida");
        return (
          <WhenCell
            time={horaCorta(m.checkOut)}
            tone={tonoChecada(m.checkOut, c, "info")}
            hint={insigniasChecada(c).length ? <InsigniasChecada checada={c} /> : undefined}
          />
        );
      },
    },
    { key: "tiempo", label: "Tiempo", numeric: true, render: (m) => <TiempoJornada m={m} /> },
    {
      key: "estado",
      label: "Estado",
      render: (m) => {
        const aviso = avisoUbicacion(m.sinUbicacion, esHoy);
        return (
          <>
            <StatusBadge
              label={ESTADO_META[m.estado].label}
              tone={ESTADO_META[m.estado].tone}
              size="sm"
              title={m.falta ? `Falta justificada · ${m.falta.motivo}` : undefined}
            />
            {aviso ? (
              <span className={styles.insignias}>
                <Badge tone={aviso.tono} size="sm" title={aviso.detalle}>
                  {aviso.texto}
                </Badge>
              </span>
            ) : null}
          </>
        );
      },
    },
  ];

  const tablaEquipo = (
    <DataTable
      flush
      columns={columnas}
      rows={filtered}
      rowKey={(m) => m.userId}
      onRowClick={(m) => setDetalleId(m.userId)}
      ariaLabel="Asistencia del equipo"
      rowActionsLabel="Acciones"
      rowActions={(m) => (
        <>
          {accionesDePersona(m)}
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label={`Ver el día de ${m.nombre}`}
            title="Ver el día"
            onClick={() => setDetalleId(m.userId)}
          >
            <ChevronRightIcon fontSize="small" aria-hidden="true" />
          </Button>
        </>
      )}
    />
  );

  const tarjetasEquipo = (
    <ul className={styles.tarjetas} aria-label="Asistencia del equipo">
      {filtered.map((m) => {
        const cEntrada = checadaDelTipo(m.attendances, "entrada");
        const cSalida = checadaDelTipo(m.attendances, "salida");
        return (
          <li key={m.userId} className={styles.tarjeta} data-estado={m.estado}>
            <div className={styles.tarjetaHead}>
              <Avatar name={m.nombre} avatarUrl={m.avatarUrl} size={44} />
              <div className={styles.tarjetaQuien}>
                <Link href={`/erp/pizarra/${m.userId}`} className={styles.tarjetaNombre} aria-label={`${m.nombre}: ver qué está haciendo`}>
                  {m.nombre}
                </Link>
                <span className={styles.tarjetaPuesto}>{puestoDe(m)}</span>
              </div>
              <StatusBadge label={ESTADO_META[m.estado].label} tone={ESTADO_META[m.estado].tone} size="sm" />
            </div>
            <dl className={styles.horas}>
              <div>
                <dt>Entrada</dt>
                <dd>
                  <span className={styles.hora}>{horaCorta(m.checkIn)}</span>
                  <InsigniasChecada checada={cEntrada} />
                </dd>
              </div>
              <div>
                <dt>Salida</dt>
                <dd>
                  <span className={styles.hora}>{horaCorta(m.checkOut)}</span>
                  <InsigniasChecada checada={cSalida} />
                </dd>
              </div>
              <div className={styles.horasTiempo}>
                <dt>{m.estado === "PRESENTE" ? "En vivo" : "Tiempo"}</dt>
                <dd>
                  <TiempoJornada m={m} />
                </dd>
              </div>
            </dl>
            {m.falta ? <p className={styles.faltaLinea}>Falta justificada · {m.falta.motivo}</p> : null}
            <div className={styles.tarjetaAcciones}>
              {accionesDePersona(m)}
              <Button size="sm" variant="tertiary" iconEnd={<ChevronRightIcon fontSize="inherit" aria-hidden="true" />} onClick={() => setDetalleId(m.userId)}>
                Ver el día
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const miJornada = canRegister ? (
    <Card aria-label="Mi jornada">
      <CardHead
        title="Mi jornada"
        subtitle="Se checa desde la app NEXARA"
        actions={
          <InfoPopover label="¿Por qué ya no puedo checar aquí?" title="Se checa desde la app">
            <p className={styles.popParrafo}>
              Un navegador puede decir que está donde quiera —la ubicación de una pestaña se cambia desde la
              consola en dos líneas— y de estas checadas sale la nómina. Por eso ahora solo se checa desde la
              app, que sabe si el GPS es simulado y de cuándo es la medición.
            </p>
            <p className={styles.popParrafo}>
              ¿Teléfono roto, sin batería u olvidado en casa? Tu jefe puede registrar tu checada desde esta
              misma pantalla, con el motivo; queda a su nombre y marcada para revisión.
            </p>
          </InfoPopover>
        }
      />
      <div className={styles.cardBody}>
        {/* Solo con la excepción temporal que abre dirección aparece el formulario; si no, «usa la app». */}
        <ChecarEnWeb token={token} />
      </div>
    </Card>
  ) : null;

  const barraFecha = (
    <div className={styles.barra}>
      <label className={styles.barraEtiqueta}>
        <span>Día</span>
        {fechaControl}
      </label>
    </div>
  );

  /* ─── Lo que va en la plantilla según la pestaña ──────────────────────── */

  const enEquipo = tab === "equipo" && isManager;
  const cargandoEquipo = enEquipo && loading && cargadoPara !== dateFilter;
  let stats: ReactNode = null;
  let before: ReactNode = null;
  let toolbar: ReactNode = null;
  let contenido: ReactNode = null;
  let footer: ReactNode = null;
  let vacio = false;
  let vacioState: ModuleEmpty | undefined;

  if (enEquipo) {
    stats = (
      <StatRow ariaLabel="Resumen del día">
        <Stat
          label="En jornada"
          value={presentes}
          suffix={mapped.length ? `/ ${mapped.length}` : undefined}
          tone={presentes > 0 ? "success" : "default"}
          icon={<LoginOutlinedIcon aria-hidden="true" />}
          iconTone="success"
          hint="Con la jornada abierta"
          onClick={() => elegirEstado("PRESENTE")}
          pressed={filterEstado === "PRESENTE"}
          loading={cargandoEquipo}
        />
        <Stat
          label="Ya salieron"
          value={completos}
          icon={<LogoutOutlinedIcon aria-hidden="true" />}
          iconTone="info"
          hint="Entrada y salida registradas"
          onClick={() => elegirEstado("COMPLETO")}
          pressed={filterEstado === "COMPLETO"}
          loading={cargandoEquipo}
        />
        <Stat
          label="Sin checada"
          value={ausentes}
          tone={ausentes > 0 ? "danger" : "default"}
          icon={<PersonOffOutlinedIcon aria-hidden="true" />}
          iconTone={ausentes > 0 ? "danger" : "neutral"}
          hint={justificadas > 0 ? `${justificadas} con falta justificada` : "Sin entrada registrada"}
          onClick={() => elegirEstado("AUSENTE")}
          pressed={filterEstado === "AUSENTE"}
          loading={cargandoEquipo}
        />
        <Stat
          label="Horas trabajadas"
          value={<LiveTotal jornadas={jornadas} />}
          icon={<ScheduleOutlinedIcon aria-hidden="true" />}
          hint="Todo tu equipo junto, en vivo"
          loading={cargandoEquipo}
        />
      </StatRow>
    );
    before =
      miJornada || refreshError || (error && mapped.length > 0) ? (
        <div className={styles.pila}>
          {refreshError ? (
            <Alert
              tone="warning"
              action={
                <Button size="sm" onClick={() => void refrescar()} disabled={refrescando}>
                  Reintentar
                </Button>
              }
            >
              No se pudo actualizar; ves los datos de las {horaActualizado ?? "última carga"}. {refreshError}
            </Alert>
          ) : null}
          {error && mapped.length > 0 ? (
            <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
          {miJornada}
        </div>
      ) : null;
    const chips: { key: FilterEstado; label: string; n: number; dot?: Tone }[] = [
      { key: "TODOS", label: "Todos", n: mapped.length },
      { key: "PRESENTE", label: "En jornada", n: presentes, dot: "success" },
      { key: "COMPLETO", label: "Ya salieron", n: completos, dot: "info" },
      ...(justificadas > 0 || puedeJustificar
        ? [{ key: "JUSTIFICADA" as const, label: "Falta justificada", n: justificadas, dot: "violet" as const }]
        : []),
      { key: "AUSENTE", label: "Sin checada", n: ausentes, dot: "neutral" },
    ];
    toolbar = (
      <ModuleToolbar
        search={
          <SearchInput
            placeholder="Buscar persona"
            aria-label="Buscar persona"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        }
        chips={
          <FilterChips ariaLabel="Filtrar por estado">
            {chips.map((c) => (
              <FilterChip key={c.key} active={filterEstado === c.key} count={c.n} dot={c.dot} onClick={() => setFilterEstado(c.key)}>
                {c.label}
              </FilterChip>
            ))}
          </FilterChips>
        }
        end={
          <>
            {fechaControl}
            <Button
              size="sm"
              variant="ghost"
              iconStart={<RefreshOutlinedIcon fontSize="inherit" aria-hidden="true" />}
              loading={refrescando}
              disabled={loading}
              onClick={() => void refrescar()}
            >
              Actualizar
            </Button>
            <span className={styles.vistaSwitch}>
              <ViewSwitch value={vista} onChange={setVista} views={["lista", "tablero"]} ariaLabel="Ver como" />
            </span>
          </>
        }
      />
    );
    contenido = vistaEfectiva === "lista" ? tablaEquipo : tarjetasEquipo;
    footer = (
      <ListFooter total={filtered.length} unit={filtered.length === 1 ? "persona" : "personas"}>
        {horaActualizado ? <span className={styles.actualizado}>Actualizado a las {horaActualizado}</span> : null}
      </ListFooter>
    );
    vacio = !cargandoEquipo && filtered.length === 0;
    vacioState =
      error && mapped.length === 0
        ? {
            tone: "danger",
            title: "No se pudo cargar la asistencia",
            description: error,
            action: (
              <Button variant="primary" onClick={() => void loadEquipo()}>
                Reintentar
              </Button>
            ),
          }
        : mapped.length === 0
          ? {
              icon: <GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />,
              title: "Nadie en tu equipo este día",
              description: "Cuando alguien de tu equipo registre su entrada, aparece aquí.",
            }
          : {
              icon: <GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />,
              tone: "neutral",
              title: "Nadie en este grupo",
              description: busqueda.trim() ? "Nadie coincide con la búsqueda." : "Toca «Todos» para ver a todo el equipo.",
              action: (
                <Button
                  onClick={() => {
                    setFilterEstado("TODOS");
                    setBusqueda("");
                  }}
                >
                  Ver todo el equipo
                </Button>
              ),
            };
  } else if (tab === "equipo") {
    contenido = miJornada ?? (
      <EmptyState
        icon={<GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />}
        title="Vista de equipo"
        description="Aquí aparece la asistencia de tu equipo cuando tienes personas a tu cargo."
      />
    );
  } else if (tab === "comidas") {
    before = barraFecha;
    contenido = <ComidasPanel fecha={dateFilter} />;
  } else if (tab === "rechazos" && isManager) {
    before = barraFecha;
    contenido = <ChecadasRechazadas token={token} desde={dateFilter} hasta={dateFilter} />;
  } else if (tab === "horarios" && isManager) {
    contenido = (
      <HorariosEquipo
        token={token}
        personas={mapped.map((m) => ({ id: m.userId, nombre: m.nombre, puesto: m.roleName ?? m.department }))}
      />
    );
  } else if (tab === "guardias") {
    contenido = <GuardiasPanel token={token} />;
  } else if (tab === "trayectoria" && canLiveGps) {
    before = (
      <div className={styles.pila}>
        {barraFecha}
        {error ? (
          <Alert
            tone="danger"
            role="alert"
            action={
              <Button size="sm" onClick={() => void loadTrayectoria()}>
                Reintentar
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}
      </div>
    );
    contenido = (
      <div className={styles.columna}>
        <Card aria-label="Dónde está tu equipo">
          <CardHead title="Dónde está tu equipo" subtitle="Personas con jornada abierta que comparten su ubicación." />
          <div className={styles.cardBody}>
            {loading ? (
              <SkeletonRows rows={3} label="Buscando la ubicación de tu equipo" />
            ) : teamGps.length === 0 ? (
              error ? null : (
                <EmptyState
                  icon={<SatelliteAltOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                  title="Sin ubicaciones"
                  description="Nadie está compartiendo su ubicación ahora."
                  tone="neutral"
                />
              )
            ) : (
              <ul className={styles.ubicaciones}>
                {teamGps.map((item) => {
                  const lat = toCoord(item.latitud);
                  const lng = toCoord(item.longitud);
                  const puesto = item.usuario?.role?.nombre ?? item.usuario?.department?.nombre ?? "";
                  const cuando = item.ultimaActualizacion ? `a las ${horaCorta(item.ultimaActualizacion)}` : "";
                  return (
                    <li key={item.id} className={styles.ubicacion} data-activo={item.estaActivo ? "true" : undefined}>
                      <PersonCell
                        name={item.usuario?.nombre ?? "Sin nombre"}
                        subtitle={[puesto, cuando].filter(Boolean).join(" · ") || undefined}
                        size={36}
                      />
                      {lat != null && lng != null ? (
                        <a href={googleMapsPointUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={rec.lugar}>
                          <PlaceOutlinedIcon aria-hidden="true" />
                          Ver en mapa
                        </a>
                      ) : (
                        <span className={`${rec.vacio} ${rec.sinLugar}`}>Sin ubicación por ahora</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
        {canSeeOwnTrajectory ? (
          <Card aria-label="Mi recorrido del día">
            <CardHead title="Mi recorrido del día" subtitle="Tu entrada, por dónde pasaste y tu salida." />
            <div className={styles.cardBody}>
              {loading ? (
                <SkeletonRows rows={3} label="Cargando recorrido" />
              ) : (
                <GpsTrajectoryPreview trajectory={trajectory} attendances={dayAttendances} />
              )}
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<PlaceOutlinedIcon fontSize="inherit" aria-hidden="true" />}
            title="Tu recorrido no se muestra aquí"
            description="El recorrido de cada persona de tu equipo está en su ficha, en «Equipo del día»."
          />
        )}
      </div>
    );
  }

  const pestanas: TabItem<TabId>[] = [
    {
      id: "equipo",
      label: isManager ? "Equipo del día" : "Mi jornada",
      count: isManager && cargadoPara === dateFilter ? mapped.length : undefined,
    },
    { id: "comidas", label: "Comidas" },
    // Quién intentó checar y no pudo, y el horario de cada quien: quien tiene equipo.
    ...(isManager
      ? [
          { id: "rechazos" as const, label: "Checadas rechazadas" },
          { id: "horarios" as const, label: "Horarios" },
        ]
      : []),
    // Mapa del equipo y recorridos: solo dirección.
    ...(canLiveGps ? [{ id: "trayectoria" as const, label: "Recorrido del día" }] : []),
    { id: "guardias", label: "Guardias" },
  ];

  const descripcion =
    tab === "equipo"
      ? isManager
        ? "Quién llegó, a qué hora y cuánto lleva trabajando tu equipo."
        : "Tu jornada del día. La entrada y la salida se registran desde la app NEXARA."
      : tab === "comidas"
        ? isManager
          ? "Tus comidas y las de tu equipo."
          : "Tus comidas del día."
        : tab === "rechazos"
          ? "Quién intentó checar y no pudo, y por qué."
          : tab === "horarios"
            ? "El horario de cada persona de tu equipo."
            : tab === "guardias"
              ? "Quién trabaja cada sábado y domingo de las próximas semanas."
              : "Dónde está tu equipo ahora y tu propio recorrido del día.";

  /* ─── Ficha del día de una persona ────────────────────────────────────── */

  const fichaDetalle = detalle
    ? (() => {
        const m = detalle;
        const checadaEntrada = checadaDelTipo(m.attendances, "entrada");
        const mapasPropios = m.userId === user?.id && !canSeeOwnTrajectory && (m.entryMapUrl || m.exitMapUrl);
        return (
          <div className={styles.ficha}>
            <div className={styles.fichaHead}>
              <Avatar name={m.nombre} avatarUrl={m.avatarUrl} size={52} />
              <div className={styles.fichaResumen}>
                <StatusBadge label={ESTADO_META[m.estado].label} tone={ESTADO_META[m.estado].tone} />
                <span className={styles.fichaTiempo}>
                  <TiempoJornada m={m} />
                  {m.estado === "PRESENTE" ? <span className={styles.fichaPista}>trabajando, en vivo</span> : null}
                </span>
              </div>
              <ButtonLink href={`/erp/pizarra/${m.userId}`} size="sm" variant="secondary">
                Ver qué está haciendo
              </ButtonLink>
            </div>

            <div className={styles.fichaChecadas}>
              {(["entrada", "salida"] as const).map((tipo) => {
                const checada = checadaDelTipo(m.attendances, tipo);
                const hora = tipo === "entrada" ? m.checkIn : m.checkOut;
                const foto = ultimaFoto(m, tipo);
                const titulo = tipo === "entrada" ? "Entrada" : "Salida";
                return (
                  <section key={tipo} className={styles.checada} aria-label={titulo}>
                    <div className={styles.checadaTexto}>
                      <span className={styles.etiqueta}>{titulo}</span>
                      <span className={styles.checadaHora}>{horaCorta(hora)}</span>
                      <InsigniasChecada checada={checada} />
                      {puedeCorregir && checada?.id ? (
                        <Button size="sm" variant="tertiary" onClick={() => abrirCorreccion(checada, m.nombre, tipo)}>
                          Corregir hora
                        </Button>
                      ) : null}
                    </div>
                    {foto?.photoUrl ? (
                      <SessionImage src={resolveAssetUrl(foto.photoUrl)} alt={titulo} className={styles.checadaFoto} />
                    ) : null}
                  </section>
                );
              })}
            </div>

            {/* KPI «cumplimiento con uniforme»: el jefe lo marca viendo la foto de entrada. */}
            {checadaEntrada?.id ? (
              <div className={styles.uniforme}>
                <span className={styles.etiqueta}>Uniforme</span>
                <UniformeControl
                  attendanceId={checadaEntrada.id}
                  uniformeOk={checadaEntrada.uniformeOk}
                  revisadoAt={checadaEntrada.uniformeRevisadoAt}
                  editable={m.userId !== user?.id}
                  token={token}
                  onCambio={(ok, at) => actualizarUniforme(m.userId, checadaEntrada.id!, ok, at)}
                />
              </div>
            ) : null}

            {m.falta ? (
              <Alert
                tone="info"
                icon={<EventBusyOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                title={`Falta justificada · ${m.falta.motivo}`}
                action={
                  puedeJustificar ? (
                    <Button size="sm" variant="ghost" onClick={() => pedirQuitarFalta(m.falta!, m.nombre)}>
                      Quitar
                    </Button>
                  ) : undefined
                }
              >
                {m.falta.justificadaPor?.nombre ? `Justificó ${m.falta.justificadaPor.nombre}` : "Justificada"}
                {" · "}
                {new Date(m.falta.justificadaAt).toLocaleString("es-MX", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Alert>
            ) : null}

            {/* AttendanceGpsDayPanel no se pinta en tu propia ficha sin recorrido: ahí los mapas van aparte. */}
            {mapasPropios ? (
              <div className={styles.mapas}>
                {m.entryMapUrl ? (
                  <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" className={rec.lugar}>
                    <PlaceOutlinedIcon aria-hidden="true" />
                    Entrada en mapa
                  </a>
                ) : null}
                {m.exitMapUrl ? (
                  <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" className={rec.lugar}>
                    <PlaceOutlinedIcon aria-hidden="true" />
                    Salida en mapa
                  </a>
                ) : null}
              </div>
            ) : null}

            {m.estado === "PRESENTE" || m.estado === "COMPLETO" ? (
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
            ) : null}
          </div>
        );
      })()
    : null;

  const accionesDetalle =
    detalle && ((detalle.estado === "AUSENTE" && puedeJustificar) || esOtro(detalle)) ? (
      <>
        {detalle.estado === "AUSENTE" && puedeJustificar ? (
          <Button onClick={() => abrirJustificar(detalle.userId, detalle.nombre)}>Justificar falta</Button>
        ) : null}
        {esOtro(detalle) ? (
          <Button variant="primary" onClick={() => abrirRegistro(detalle.userId, detalle.nombre)}>
            Registrar checada
          </Button>
        ) : null}
      </>
    ) : undefined;

  return (
    <>
      <ModulePage
        title="Asistencia del día"
        description={descripcion}
        breadcrumbs={[{ label: "Hoy", href: "/erp" }, { label: "Asistencias" }]}
        secondaryActions={
          isManager ? (
            <ButtonLink href={KPIS_PATH} iconStart={<InsightsOutlinedIcon fontSize="inherit" aria-hidden="true" />}>
              KPIs del equipo
            </ButtonLink>
          ) : undefined
        }
        tabs={<Tabs items={pestanas} value={tab} onChange={setTab} ariaLabel="Secciones de asistencia" />}
        stats={stats}
        before={before}
        toolbar={toolbar}
        footer={enEquipo && !vacio ? footer : undefined}
        loading={cargandoEquipo}
        empty={vacio}
        emptyState={vacioState}
        card={enEquipo}
        listLabel={enEquipo ? "Equipo del día" : undefined}
      >
        {contenido}
      </ModulePage>

      <Modal
        open={detalle != null}
        onClose={() => setDetalleId(null)}
        title={detalle?.nombre ?? ""}
        description={detalle ? puestoDe(detalle) : undefined}
        size="lg"
        footer={accionesDetalle}
      >
        {fichaDetalle}
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
        <div className={styles.modalCuerpo}>
          <p className={styles.modalTexto}>
            {justificando?.nombre} · {dateFilter}. El día quedará como «Falta justificada» con tu motivo; no se crea
            ninguna checada. Se avisa a la persona y a sus jefes.
          </p>
          <Field label="Motivo" required hint={`${motivoFalta.trim().length}/${MOTIVO_FALTA_MINIMO} caracteres mínimo`}>
            <Textarea
              value={motivoFalta}
              onChange={(e) => setMotivoFalta(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ej. Cita médica con comprobante del IMSS."
            />
          </Field>
          {errorFalta ? (
            <Alert tone="danger" role="alert">
              {errorFalta}
            </Alert>
          ) : null}
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
        <div className={styles.modalCuerpo}>
          <p className={styles.modalTexto}>
            {corrigiendo?.nombre} · {corrigiendo?.tipo === "entrada" ? "Entrada" : "Salida"} de las{" "}
            {corrigiendo ? horaCorta(corrigiendo.timestamp) : ""}. La checada original no se borra: queda el antes, el
            después, tu motivo y tu nombre. Se avisa a la persona y a sus jefes.
          </p>
          <Field label="Hora correcta" required>
            <DateInput type="datetime-local" value={horaCorreccion} onChange={(e) => setHoraCorreccion(e.target.value)} />
          </Field>
          <Field
            label="Motivo"
            required
            hint={`${motivoCorreccion.trim().length}/${MOTIVO_CORRECCION_MINIMO} caracteres mínimo`}
          >
            <Textarea
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ej. Entró a la planta a las 8:05 y el teléfono no tenía señal."
            />
          </Field>
          {errorCorreccion ? (
            <Alert tone="danger" role="alert">
              {errorCorreccion}
            </Alert>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog state={confirmFalta} onClose={() => setConfirmFalta(null)} />

      {registrandoPara ? (
        <RegistroAsistido
          token={token}
          persona={registrandoPara}
          fecha={dateFilter}
          onClose={() => setRegistrandoPara(null)}
          onRegistrada={() => void loadEquipo()}
        />
      ) : null}
    </>
  );
}
