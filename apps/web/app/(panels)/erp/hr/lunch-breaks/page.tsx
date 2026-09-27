"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import OpsAttendanceRail from "@/components/ops/OpsAttendanceRail";
import { SkeletonList, Skeleton } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { getAttendanceViewMode } from "@/lib/user-access";
import { getLunchBreaksSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

const LunchBreakForm = dynamic(() => import("@/components/LunchBreakForm"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_MINUTES = 60;

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

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, { bg: string; border: string; text: string }> = {
  success: { bg: "var(--state-success-bg)", border: "var(--state-success-border)", text: "var(--state-success-text)" },
  warning: { bg: "var(--state-warning-bg)", border: "var(--state-warning-border)", text: "var(--state-warning-text)" },
  danger: { bg: "var(--state-danger-bg)", border: "var(--state-danger-border)", text: "var(--state-danger-text)" },
  neutral: { bg: "var(--surface)", border: "var(--border)", text: "var(--text-secondary)" },
};

function DurationChip({ minutes }: { minutes: number }) {
  const over = minutes > MAX_MINUTES;
  return (
    <Tag size="sm" variant={over ? "danger" : "positive"}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{minutes} min</span>
    </Tag>
  );
}

// ─── Employee: Today's break status hero ─────────────────────────────────────

function BreakStatusHero({ todayBreak }: { todayBreak: LunchBreak | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (todayBreak?.status !== "IN_PROGRESS") return;
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(todayBreak.checkinTime).getTime()) / 1000);
      setElapsed(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [todayBreak]);

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  const isOver60 = elapsedMin >= MAX_MINUTES;
  const duration = todayBreak ? durationMinutes(todayBreak.checkinTime, todayBreak.checkoutTime) : null;

  let statusLabel = "Aún no sales a comer hoy";
  let tone: Tone = "neutral";
  let icon = "🍽️";

  if (todayBreak?.status === "IN_PROGRESS") {
    statusLabel = isOver60 ? "Llevas más de una hora en comida" : "Estás en tu hora de comida";
    tone = isOver60 ? "danger" : "warning";
    icon = isOver60 ? "⚠️" : "⏳";
  } else if (todayBreak?.status === "COMPLETED") {
    statusLabel = "Comida registrada";
    tone = "success";
    icon = "✅";
  }
  const t = TONE_STYLE[tone];

  return (
    <section
      aria-label="Tu comida de hoy"
      aria-live="polite"
      style={{
        border: `1.5px solid ${t.border}`,
        borderRadius: 14,
        background: t.bg,
        padding: "20px 24px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 40 }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>Hoy</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: t.text }}>{statusLabel}</div>
        {todayBreak?.isCheckinLate && (
          <div style={{ fontSize: 13, color: "var(--state-warning-text)", marginTop: 4 }}>
            Saliste fuera del horario de comida ({fmtTime(todayBreak.checkinTime)}).
          </div>
        )}
        {todayBreak?.isCheckoutLate && (
          <div style={{ fontSize: 13, color: "var(--state-danger-text)", marginTop: 2 }}>
            Regresaste tarde ({todayBreak.checkoutTime ? fmtTime(todayBreak.checkoutTime) : "sin hora"}).
          </div>
        )}
      </div>

      {todayBreak?.status === "IN_PROGRESS" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 2 }}>Tiempo transcurrido</div>
          <div
            role="timer"
            aria-label={`${elapsedMin} minutos`}
            style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: isOver60 ? "var(--danger)" : "var(--warning)" }}
          >
            {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
          </div>
          {isOver60 && <div style={{ fontSize: 12, color: "var(--danger)" }}>Pasaste los {MAX_MINUTES} min</div>}
        </div>
      )}

      {todayBreak && (
        <dl style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: 0 }}>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <dt style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>Salida</dt>
            <dd style={{ margin: 0, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtTime(todayBreak.checkinTime)}</dd>
          </div>
          {todayBreak.checkoutTime && (
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <dt style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>Regreso</dt>
              <dd style={{ margin: 0, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtTime(todayBreak.checkoutTime)}</dd>
            </div>
          )}
          {duration !== null && (
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <dt style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>Duración</dt>
              <dd style={{ margin: 0 }}><DurationChip minutes={duration} /></dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

// ─── Employee: My history list ────────────────────────────────────────────────

function MyHistoryList({ items }: { items: LunchBreak[] }) {
  const past = useMemo(() => items.filter((b) => !isSameDay(b.date)).slice(0, 14), [items]);
  if (!past.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Section title="Tus últimas comidas">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {past.map((b) => {
            const dur = durationMinutes(b.checkinTime, b.checkoutTime);
            const isLate = b.isCheckinLate || b.isCheckoutLate;
            return (
              <li
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: `1px solid ${isLate ? "var(--state-warning-border)" : "var(--border)"}`,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 20 }}>
                  {b.status === "COMPLETED" ? (isLate ? "⚠️" : "✅") : "⏳"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fmtDate(b.date)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtTime(b.checkinTime)}
                    {b.checkoutTime ? ` – ${fmtTime(b.checkoutTime)}` : " – sin regreso registrado"}
                    {isLate && <span style={{ color: "var(--state-warning-text)" }}> · fuera de horario</span>}
                  </div>
                </div>
                {dur !== null ? <DurationChip minutes={dur} /> : <Tag size="sm" variant="warning">En curso</Tag>}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

// ─── Manager: Team break card ─────────────────────────────────────────────────

function TeamBreakCard({ member, highlighted }: { member: LunchBreak; highlighted?: boolean }) {
  const dur = durationMinutes(member.checkinTime, member.checkoutTime);
  const isInProgress = member.status === "IN_PROGRESS";
  const isLate = member.isCheckinLate || member.isCheckoutLate;
  const tone: Tone = isInProgress ? (isLate ? "danger" : "warning") : (isLate ? "warning" : "success");

  return (
    <article
      aria-label={`${member.user?.nombre ?? "Persona"}: ${isInProgress ? "en comida" : "comida terminada"}`}
      style={{
        border: `1.5px solid ${highlighted ? "var(--primary)" : TONE_STYLE[tone].border}`,
        borderRadius: 12,
        padding: "14px 16px",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{member.user?.nombre ?? "Sin nombre"}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {member.user?.department?.nombre ?? member.user?.role?.name ?? ""}
          </div>
        </div>
        <Tag size="sm" dot variant={isInProgress ? (isLate ? "danger" : "warning") : "positive"}>
          {isInProgress ? "En comida" : "Terminada"}
        </Tag>
      </div>

      <dl style={{ display: "flex", gap: 14, margin: 0, flexWrap: "wrap" }}>
        <div>
          <dt style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Salida</dt>
          <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: member.isCheckinLate ? "var(--state-warning-text)" : undefined }}>
            {fmtTime(member.checkinTime)}
            {member.isCheckinLate && <span style={{ fontWeight: 500 }}> · tarde</span>}
          </dd>
        </div>
        {member.checkoutTime && (
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Regreso</dt>
            <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: member.isCheckoutLate ? "var(--state-danger-text)" : undefined }}>
              {fmtTime(member.checkoutTime)}
              {member.isCheckoutLate && <span style={{ fontWeight: 500 }}> · tarde</span>}
            </dd>
          </div>
        )}
        {dur !== null && (
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Duración</dt>
            <dd style={{ margin: 0, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: dur > MAX_MINUTES ? "var(--danger)" : "var(--success)" }}>
              {dur} min
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

// ─── Manager: Team view ───────────────────────────────────────────────────────

function TeamLunchView({
  token,
  dateFilter,
  highlightId,
}: {
  token: string;
  dateFilter: string;
  highlightId?: string | null;
}) {
  const [items, setItems] = useState<LunchBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"cards" | "table">("cards");
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = dateFilter === todayIso()
        ? "lunch-breaks/today"
        : `lunch-breaks?startDate=${dateFilter}&endDate=${dateFilter}`;
      const data = await apiFetch(endpoint, token);
      const arr: LunchBreak[] = Array.isArray(data) ? data : [];
      // Sort: IN_PROGRESS late → IN_PROGRESS → COMPLETED late → COMPLETED
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
  const staleDate = loaded && loadedFor !== dateFilter;

  const visibleItems = useMemo(() => {
    let rows = items;
    if (filterStatus) rows = rows.filter((b) => b.status === filterStatus);
    const q = deferredQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter((b) =>
        (b.user?.nombre ?? "").toLowerCase().includes(q) ||
        (b.user?.department?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) =>
          (a.user?.id === id ? -1 : b.user?.id === id ? 1 : 0),
        );
      }
    }
    return rows;
  }, [items, deferredQ, filterStatus, highlightId]);

  const stats = useMemo(() => {
    let sum = 0, count = 0, over60 = 0, inProgress = 0, completed = 0, lateCount = 0;
    for (const b of items) {
      const d = durationMinutes(b.checkinTime, b.checkoutTime);
      if (d !== null) {
        sum += d;
        count++;
        if (d > MAX_MINUTES) over60++;
      }
      if (b.status === "IN_PROGRESS") inProgress++;
      else completed++;
      if (b.isCheckinLate || b.isCheckoutLate) lateCount++;
    }
    return { avg: count ? Math.round(sum / count) : 0, over60, inProgress, completed, lateCount };
  }, [items]);

  const cols: Column<LunchBreak>[] = [
    {
      key: "user" as keyof LunchBreak,
      label: "Persona",
      render: (b) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.user?.nombre ?? "Sin nombre"}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{b.user?.department?.nombre ?? ""}</div>
        </div>
      ),
      width: 200,
    },
    {
      key: "status",
      label: "Estado",
      render: (b) => (
        <Tag size="sm" dot variant={b.status === "IN_PROGRESS" ? "warning" : "positive"}>
          {b.status === "IN_PROGRESS" ? "En comida" : "Terminada"}
        </Tag>
      ),
      width: 130,
    },
    {
      key: "checkinTime",
      label: "Salida",
      render: (b) => (
        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: b.isCheckinLate ? "var(--state-warning-text)" : undefined }}>
          {fmtTime(b.checkinTime)}
          {b.isCheckinLate && " · tarde"}
        </span>
      ),
      width: 120,
    },
    {
      key: "checkoutTime",
      label: "Regreso",
      render: (b) => (
        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: b.isCheckoutLate ? "var(--state-danger-text)" : undefined }}>
          {b.checkoutTime ? (
            <>
              {fmtTime(b.checkoutTime)}
              {b.isCheckoutLate && " · tarde"}
            </>
          ) : <span style={{ color: "var(--text-tertiary)" }}>Pendiente</span>}
        </span>
      ),
      width: 120,
    },
    {
      key: "id" as keyof LunchBreak,
      label: "Duración",
      align: "right",
      render: (b) => {
        const d = durationMinutes(b.checkinTime, b.checkoutTime);
        if (d === null) return <Tag size="sm" variant="warning">En curso</Tag>;
        return <DurationChip minutes={d} />;
      },
      width: 110,
    },
    {
      key: "notes",
      label: "Notas",
      render: (b) => b.notes
        ? <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{b.notes}</span>
        : <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin notas</span>,
    },
  ];

  const hasFilters = Boolean(searchQ || filterStatus);
  const highlightNum = highlightId ? Number(highlightId) : NaN;

  return (
    <>
      {loaded && (
        <div style={{ marginBottom: 16, opacity: staleDate ? 0.6 : 1 }}>
          <MetricStrip
            ariaLabel="Resumen de comidas del equipo"
            metrics={[
              { label: "Duración promedio", value: `${stats.avg} min`, hint: `Máximo esperado: ${MAX_MINUTES} min` },
              { label: `Más de ${MAX_MINUTES} min`, value: stats.over60, tone: stats.over60 > 0 ? "warning" : "success" },
              { label: "En comida ahora", value: stats.inProgress, onClick: () => setFilterStatus("IN_PROGRESS") },
              { label: "Fuera de horario", value: stats.lateCount, tone: stats.lateCount > 0 ? "danger" : "success" },
            ]}
          />
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre o departamento…", ariaLabel: "Buscar persona" }}
        selects={[{
          label: "Estado",
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: "IN_PROGRESS", label: "En comida" },
            { value: "COMPLETED", label: "Terminada" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterStatus(""); }}
        resultCount={loaded ? visibleItems.length : null}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems.map((b) => ({
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
          ], `comidas-${dateFilter}`)}>Exportar a Excel</Button>
        ) : undefined}
      />
      <Section
        title="Comidas del equipo"
        subtitle={dateFilter === todayIso() ? "Hoy" : fmtDate(`${dateFilter}T12:00:00`)}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Vista">
            <Button
              size="sm"
              variant={viewType === "cards" ? "primary" : "ghost"}
              aria-pressed={viewType === "cards"}
              onClick={() => setViewType("cards")}
            >
              Tarjetas
            </Button>
            <Button
              size="sm"
              variant={viewType === "table" ? "primary" : "ghost"}
              aria-pressed={viewType === "table"}
              onClick={() => setViewType("table")}
            >
              Tabla
            </Button>
            <Button size="sm" variant="ghost" loading={loading && loaded} onClick={() => void load()}>
              Actualizar
            </Button>
          </div>
        }
      >
        {loaded && error && (
          <InlineAlert
            variant="warning"
            title="No se pudo actualizar"
            message={`${error} Mostramos la última información cargada.`}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
            style={{ marginBottom: 12 }}
          />
        )}
        {!loaded && loading && <SkeletonList rows={4} tableLike={viewType === "table"} />}
        {!loaded && !loading && error && (
          <InlineAlert
            variant="danger"
            title="No se pudieron cargar las comidas"
            message={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && visibleItems.length === 0 && (
          <EmptyState
            icon="🍽️"
            title={hasFilters ? "Nadie coincide con la búsqueda" : "Sin registros"}
            description={hasFilters ? "Prueba con otro nombre o quita los filtros." : "Nadie ha registrado su comida en esta fecha."}
            action={hasFilters ? <Button size="sm" variant="secondary" onClick={() => { setSearchQ(""); setFilterStatus(""); }}>Quitar filtros</Button> : undefined}
          />
        )}
        {loaded && visibleItems.length > 0 && viewType === "cards" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
              gap: 12,
              opacity: staleDate ? 0.6 : 1,
            }}
          >
            {visibleItems.map((m) => (
              <TeamBreakCard key={m.id} member={m} highlighted={m.user?.id === highlightNum} />
            ))}
          </div>
        )}
        {loaded && visibleItems.length > 0 && viewType === "table" && (
          <div style={{ opacity: staleDate ? 0.6 : 1 }}>
            <DataTable<LunchBreak>
              columns={cols}
              rows={visibleItems}
              rowKey={(b) => b.id}
              ariaLabel="Comidas del equipo"
              emptyTitle="Sin registros"
              emptyDescription="No hay comidas registradas para esta fecha."
            />
          </div>
        )}
      </Section>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LunchBreaksPage() {
  const { user } = useUser();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const viewMode = useMemo(() => getAttendanceViewMode(user), [user]);
  const headerCfg = useMemo(() => getLunchBreaksSectionConfig(user), [user]);
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
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        title={headerCfg.title}
        subtitle={headerCfg.subtitle}
        actions={
          isManager ? (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              Fecha
              <input
                type="date"
                value={dateFilter}
                max={todayIso()}
                onChange={(e) => e.target.value && setDateFilter(e.target.value)}
                style={{
                  minHeight: 40,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              />
            </label>
          ) : (
            <Button variant="ghost" loading={loadingMy && myBreaks.length > 0} onClick={() => void loadMyBreaks()}>
              Actualizar
            </Button>
          )
        }
      />

      <OpsAttendanceRail />

      {highlightId && (
        <InlineAlert
          variant="info"
          dense
          message="Abriste esta página desde una notificación: la persona indicada aparece primero."
          onDismiss={() => setHighlightId(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      {canRegister && (
        <>
          {myError && (
            <InlineAlert
              variant="warning"
              message={myError}
              action={<Button size="sm" variant="secondary" onClick={() => void loadMyBreaks()}>Reintentar</Button>}
              style={{ marginBottom: 12 }}
            />
          )}
          {loadingMy && myBreaks.length === 0 ? (
            <div
              aria-busy="true"
              aria-label="Cargando tu comida de hoy"
              style={{
                border: "1.5px solid var(--border)",
                borderRadius: 14,
                padding: "20px 24px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
              <Skeleton width={40} height={40} radius={10} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton width={80} height={12} />
                <Skeleton width="50%" height={20} />
              </div>
            </div>
          ) : (
            <BreakStatusHero todayBreak={todayBreak} />
          )}
          {!(loadingMy && myBreaks.length === 0) && (
            <Section
              title={todayBreak?.status === "IN_PROGRESS" ? "Registrar regreso" : "Registrar salida a comer"}
              subtitle="Toma una foto al salir y otra al regresar de tu hora de comida."
            >
              <LunchBreakForm
                key={`${todayBreak?.id ?? "sin-registro"}-${todayBreak?.status ?? ""}`}
                isCheckin={todayBreak?.status !== "IN_PROGRESS"}
                onSuccess={() => void loadMyBreaks()}
              />
            </Section>
          )}
          <MyHistoryList items={myBreaks} />
        </>
      )}

      {isManager && (
        <TeamLunchView token={token} dateFilter={dateFilter} highlightId={highlightId} />
      )}
    </>
  );
}
