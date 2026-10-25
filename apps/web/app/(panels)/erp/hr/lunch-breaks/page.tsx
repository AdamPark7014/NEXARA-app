"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Button,
  DateInput,
  EmptyState,
  FilterChip,
  FilterChips,
  LinkButton,
  ListFooter,
  ModuleToolbar,
  PageHead,
  SearchInput,
  SkeletonRows,
  StatusBadge,
} from "@/components/base";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { getAttendanceViewMode } from "@/lib/user-access";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import s from "./comidas.module.css";

const LunchBreakForm = dynamic(() => import("@/components/LunchBreakForm"), { ssr: false });

interface LunchBreak {
  id: number;
  date: string;
  checkinTime: string;
  checkoutTime?: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  isCheckinLate: boolean;
  isCheckoutLate: boolean;
  notes?: string | null;
  user?: {
    id: number;
    nombre: string;
    email?: string;
    department?: { nombre: string } | null;
    role?: { name: string } | null;
  };
}

const MAX_MINUTES = 60;

type Filtro = "" | "IN_PROGRESS" | "COMPLETED" | "LATE";

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || (res.status === 403 ? "No tienes permiso para ver estos registros." : "El servidor no respondió. Intenta de nuevo en unos minutos."));
  }
  return res.json();
}

function durationMinutes(start: string, end?: string | null): number | null {
  if (!end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(iso: string) {
  return iso.slice(0, 10) === todayIso();
}

function fraseDeHoy(b: LunchBreak | null, minutos: number): string {
  if (!b) return "Aún no sales a comer hoy.";
  if (b.status === "IN_PROGRESS") {
    return minutos >= MAX_MINUTES ? "Llevas más de una hora en comida." : "Estás en tu hora de comida.";
  }
  return "Comida registrada.";
}

function Hoy({ registro }: { registro: LunchBreak | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (registro?.status !== "IN_PROGRESS") return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(registro.checkinTime).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [registro]);

  const minutos = Math.floor(elapsed / 60);
  const duracion = registro ? durationMinutes(registro.checkinTime, registro.checkoutTime) : null;

  return (
    <section aria-label="Tu comida de hoy" aria-live="polite">
      <p className={s.hoy}>{fraseDeHoy(registro, minutos)}</p>
      {registro ? (
        <dl className={s.datos}>
          <div className={s.dato}>
            <dt>Salida</dt>
            <dd className={registro.isCheckinLate ? s.tarde : undefined}>
              {fmtTime(registro.checkinTime)}
              {registro.isCheckinLate ? " · tarde" : ""}
            </dd>
          </div>
          <div className={s.dato}>
            <dt>Regreso</dt>
            <dd className={registro.isCheckoutLate ? s.pasado : undefined}>
              {registro.checkoutTime ? fmtTime(registro.checkoutTime) : "Pendiente"}
              {registro.isCheckoutLate ? " · tarde" : ""}
            </dd>
          </div>
          <div className={s.dato}>
            <dt>{registro.status === "IN_PROGRESS" ? "Tiempo" : "Duración"}</dt>
            <dd>
              {registro.status === "IN_PROGRESS"
                ? `${String(minutos).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
                : duracion != null
                  ? `${duracion} min`
                  : "En curso"}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function Historial({ items }: { items: LunchBreak[] }) {
  const pasadas = useMemo(() => items.filter((b) => !isSameDay(b.date)).slice(0, 14), [items]);
  if (!pasadas.length) return null;
  const unidad = pasadas.length === 1 ? "comida" : "comidas";
  return (
    <section className={s.tarjeta} aria-label="Tus últimas comidas">
      <ul className={s.filas}>
        {pasadas.map((b) => {
          const dur = durationMinutes(b.checkinTime, b.checkoutTime);
          const tarde = b.isCheckinLate || b.isCheckoutLate;
          return (
            <li key={b.id} className={s.fila}>
              <span className={s.persona}>
                <span className={s.nombre}>{fmtDate(b.date)}</span>
              </span>
              <span className={s.estado}>{b.status === "COMPLETED" ? (tarde ? "Fuera de horario" : "Terminada") : "En curso"}</span>
              <span className={s.hora}>{fmtTime(b.checkinTime)}</span>
              <span className={s.hora}>{b.checkoutTime ? fmtTime(b.checkoutTime) : "Sin regreso"}</span>
              <span className={s.duracion}>{dur != null ? `${dur} min` : "En curso"}</span>
            </li>
          );
        })}
      </ul>
      <ListFooter total={pasadas.length} unit={unidad} />
    </section>
  );
}

function Renglon({ member, highlighted }: { member: LunchBreak; highlighted?: boolean }) {
  const dur = durationMinutes(member.checkinTime, member.checkoutTime);
  const enCurso = member.status === "IN_PROGRESS";
  return (
    <li className={s.fila} data-resaltada={highlighted ? "true" : undefined}>
      <span className={s.persona}>
        <span className={s.nombre}>{member.user?.nombre ?? "Sin nombre"}</span>
        <span className={s.area}>{member.user?.department?.nombre || member.user?.role?.name || "Sin área"}</span>
      </span>
      <span className={s.estado}>
        <StatusBadge label={enCurso ? "En comida" : "Terminada"} tone={enCurso ? "warning" : "success"} size="sm" />
      </span>
      <span className={`${s.hora} ${member.isCheckinLate ? s.tarde : ""}`}>
        {fmtTime(member.checkinTime)}
        {member.isCheckinLate ? " · tarde" : ""}
      </span>
      <span className={`${s.hora} ${member.isCheckoutLate ? s.pasado : ""}`}>
        {member.checkoutTime ? fmtTime(member.checkoutTime) : "Pendiente"}
        {member.isCheckoutLate ? " · tarde" : ""}
      </span>
      <span className={s.duracion}>{dur == null ? "En curso" : `${dur} min`}</span>
    </li>
  );
}

function TeamLunchView({
  token,
  dateFilter,
  onDate,
  highlightId,
}: {
  token: string;
  dateFilter: string;
  onDate: (dia: string) => void;
  highlightId?: string | null;
}) {
  const [items, setItems] = useState<LunchBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [filterStatus, setFilterStatus] = useState<Filtro>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = dateFilter === todayIso()
        ? "lunch-breaks/today"
        : `lunch-breaks?startDate=${dateFilter}&endDate=${dateFilter}`;
      const data = await apiFetch(endpoint, token);
      const arr: LunchBreak[] = Array.isArray(data) ? data : [];
      arr.sort((a, b) => {
        const score = (x: LunchBreak) => {
          if (x.status === "IN_PROGRESS") return x.isCheckinLate ? 0 : 1;
          return x.isCheckoutLate ? 2 : 3;
        };
        return score(a) - score(b);
      });
      setItems(arr);
      setLoadedFor(dateFilter);
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las comidas del equipo."));
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter]);

  useEffect(() => { void load(); }, [load]);

  const loaded = loadedFor !== null;

  const visibleItems = useMemo(() => {
    let rows = items;
    if (filterStatus === "IN_PROGRESS" || filterStatus === "COMPLETED") rows = rows.filter((b) => b.status === filterStatus);
    else if (filterStatus === "LATE") rows = rows.filter((b) => b.isCheckinLate || b.isCheckoutLate);
    const q = deferredQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter((b) =>
        (b.user?.nombre ?? "").toLowerCase().includes(q) ||
        (b.user?.department?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => (a.user?.id === id ? -1 : b.user?.id === id ? 1 : 0));
      }
    }
    return rows;
  }, [items, deferredQ, filterStatus, highlightId]);

  const cuentas = useMemo(() => {
    let enComida = 0;
    let terminadas = 0;
    let tarde = 0;
    for (const b of items) {
      if (b.status === "IN_PROGRESS") enComida += 1;
      else terminadas += 1;
      if (b.isCheckinLate || b.isCheckoutLate) tarde += 1;
    }
    return { todas: items.length, enComida, terminadas, tarde };
  }, [items]);

  const hayFiltros = Boolean(searchQ || filterStatus);
  const quitar = () => {
    setSearchQ("");
    setFilterStatus("");
  };
  const highlightNum = highlightId ? Number(highlightId) : NaN;
  const unidad = visibleItems.length === 1 ? "comida" : "comidas";
  const chip = (id: Filtro, label: string, count: number) => (
    <FilterChip active={filterStatus === id} count={count} onClick={() => setFilterStatus(filterStatus === id && id !== "" ? "" : id)}>
      {label}
    </FilterChip>
  );

  if (!loaded && !loading && error) {
    return (
      <Alert tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}>
        {error}
      </Alert>
    );
  }

  return (
    <section className={s.tarjeta} aria-label="Comidas del equipo">
      <ModuleToolbar
        search={
          <SearchInput
            aria-label="Buscar persona"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Nombre o área"
          />
        }
        chips={
          <FilterChips ariaLabel="Filtrar comidas">
            {chip("", "Todos", cuentas.todas)}
            {chip("IN_PROGRESS", "En comida", cuentas.enComida)}
            {chip("COMPLETED", "Terminadas", cuentas.terminadas)}
            {cuentas.tarde || filterStatus === "LATE" ? chip("LATE", "Fuera de horario", cuentas.tarde) : null}
          </FilterChips>
        }
        end={
          <>
            <DateInput aria-label="Fecha" value={dateFilter} max={todayIso()} onChange={(e) => e.target.value && onDate(e.target.value)} />
            {hayFiltros ? <LinkButton onClick={quitar}>Quitar filtros</LinkButton> : null}
            {items.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportToExcel(visibleItems.map((b) => ({
                  nombre: b.user?.nombre ?? "",
                  departamento: b.user?.department?.nombre ?? "",
                  estado: b.status === "IN_PROGRESS" ? "En comida" : "Terminada",
                  entrada: fmtTime(b.checkinTime),
                  salida: b.checkoutTime ? fmtTime(b.checkoutTime) : "",
                  duracion: durationMinutes(b.checkinTime, b.checkoutTime) ?? "",
                  tardanza: b.isCheckinLate || b.isCheckoutLate ? "Sí" : "No",
                })), [
                  { key: "nombre", label: "Nombre" },
                  { key: "departamento", label: "Departamento" },
                  { key: "estado", label: "Estado" },
                  { key: "entrada", label: "Salida a comer" },
                  { key: "salida", label: "Regreso" },
                  { key: "duracion", label: "Duración (min)" },
                  { key: "tardanza", label: "Fuera de horario" },
                ], `comidas-${dateFilter}`)}
              >
                Excel
              </Button>
            ) : null}
          </>
        }
      />

      {loaded && error ? (
        <Alert tone="warning" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}>
          {error}
        </Alert>
      ) : null}

      {!loaded && loading ? <SkeletonRows rows={4} label="Cargando comidas" /> : null}

      {loaded && visibleItems.length === 0 ? (
        <EmptyState
          title={hayFiltros ? "Nadie coincide con la búsqueda." : "Nadie ha registrado comida en esta fecha."}
          tone="neutral"
          action={hayFiltros ? <Button size="sm" onClick={quitar}>Quitar filtros</Button> : undefined}
        />
      ) : null}

      {loaded && visibleItems.length > 0 ? (
        <>
          <div className={s.cabecera} aria-hidden="true">
            <span>Persona</span>
            <span>Estado</span>
            <span>Salida</span>
            <span>Regreso</span>
            <span>Duración</span>
          </div>
          <ul className={s.filas}>
            {visibleItems.map((m) => (
              <Renglon key={m.id} member={m} highlighted={m.user?.id === highlightNum} />
            ))}
          </ul>
          <ListFooter total={visibleItems.length} unit={unidad} />
        </>
      ) : null}
    </section>
  );
}

export default function LunchBreaksPage() {
  const { user } = useUser();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const viewMode = useMemo(() => getAttendanceViewMode(user), [user]);
  const isManager = viewMode !== "register";
  const canRegister = viewMode === "register" || viewMode === "manage_register";
  const token = user?.token ?? "";

  const [myBreaks, setMyBreaks] = useState<LunchBreak[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(todayIso());

  useEffect(() => {
    setHighlightId(new URLSearchParams(window.location.search).get("highlight"));
  }, []);

  const loadMyBreaks = useCallback(async () => {
    if (!token || !canRegister) return;
    setLoadingMy(true);
    try {
      const data = await apiFetch("lunch-breaks/my-breaks", token);
      setMyBreaks(Array.isArray(data) ? data : []);
      setMyError(null);
    } catch (e) {
      setMyError(formatApiError(e, "No se pudo consultar tu registro de comida."));
    } finally {
      setLoadingMy(false);
    }
  }, [token, canRegister]);

  useEffect(() => { void loadMyBreaks(); }, [loadMyBreaks]);

  const todayBreak = useMemo(
    () => myBreaks.find((b) => isSameDay(b.date)) ?? null,
    [myBreaks],
  );

  return (
    <div className={s.pagina}>
      <PageHead title="Comidas" back={{ href: "/erp/asistencias", label: "Asistencias" }} />

      {highlightId ? (
        <Alert tone="info" onDismiss={() => setHighlightId(null)}>
          La persona de la notificación aparece primero.
        </Alert>
      ) : null}

      {canRegister ? (
        <>
          {myError ? (
            <Alert tone="warning" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void loadMyBreaks()}>Reintentar</Button>}>
              {myError}
            </Alert>
          ) : null}
          {loadingMy && myBreaks.length === 0 ? (
            <SkeletonRows rows={2} label="Cargando tu comida de hoy" />
          ) : (
            <Hoy registro={todayBreak} />
          )}
          {!(loadingMy && myBreaks.length === 0) ? (
            <section className={s.tarjeta} aria-label={todayBreak?.status === "IN_PROGRESS" ? "Registrar regreso" : "Registrar salida a comer"}>
              <LunchBreakForm
                key={`${todayBreak?.id ?? "sin-registro"}-${todayBreak?.status ?? ""}`}
                isCheckin={todayBreak?.status !== "IN_PROGRESS"}
                onSuccess={() => void loadMyBreaks()}
              />
            </section>
          ) : null}
          <Historial items={myBreaks} />
        </>
      ) : null}

      {isManager ? (
        <TeamLunchView token={token} dateFilter={dateFilter} onDate={setDateFilter} highlightId={highlightId} />
      ) : null}
    </div>
  );
}
