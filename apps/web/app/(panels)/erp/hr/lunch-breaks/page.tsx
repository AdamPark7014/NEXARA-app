"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getAttendanceViewMode } from "@/lib/user-access";
import { getLunchBreaksSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

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

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
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
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isSameDay(iso: string) {
  return iso.slice(0, 10) === todayIso();
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

  const isOver60 = elapsedMin >= 60;
  const duration = todayBreak ? durationMinutes(todayBreak.checkinTime, todayBreak.checkoutTime) : null;

  let statusLabel = "Sin registro hoy";
  let statusColor = "#6b7280";
  let bgColor = "var(--surface)";
  let borderColor = "var(--border)";
  let icon = "🍽️";

  if (todayBreak?.status === "IN_PROGRESS") {
    statusLabel = "En comida ahora";
    statusColor = isOver60 ? "#ef4444" : "#f59e0b";
    bgColor = isOver60 ? "#fef2f2" : "#fffbeb";
    borderColor = isOver60 ? "#fca5a5" : "#fcd34d";
    icon = isOver60 ? "⚠️" : "⏳";
  } else if (todayBreak?.status === "COMPLETED") {
    statusLabel = "Comida completada";
    statusColor = "#22c55e";
    bgColor = "#f0fdf4";
    borderColor = "#86efac";
    icon = "✅";
  }

  return (
    <div
      style={{
        border: `1.5px solid ${borderColor}`,
        borderRadius: 14,
        background: bgColor,
        padding: "20px 24px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 40 }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>Estado de hoy</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: statusColor }}>{statusLabel}</div>
        {todayBreak?.isCheckinLate && (
          <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
            ⚠️ Entrada fuera de horario ({fmtTime(todayBreak.checkinTime)})
          </div>
        )}
        {todayBreak?.isCheckoutLate && (
          <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>
            ⚠️ Regreso tardio ({todayBreak.checkoutTime ? fmtTime(todayBreak.checkoutTime) : "—"})
          </div>
        )}
      </div>

      {todayBreak?.status === "IN_PROGRESS" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 2 }}>Tiempo transcurrido</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: isOver60 ? "#ef4444" : "#f59e0b" }}>
            {String(elapsedMin).padStart(2, "0")}:{String(elapsedSec).padStart(2, "0")}
          </div>
          {isOver60 && <div style={{ fontSize: 11, color: "#ef4444" }}>Excede 60 min</div>}
        </div>
      )}

      {todayBreak && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Entrada</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtTime(todayBreak.checkinTime)}</div>
          </div>
          {todayBreak.checkoutTime && (
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Salida</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtTime(todayBreak.checkoutTime)}</div>
            </div>
          )}
          {duration !== null && (
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Duracion</div>
              <div
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 700,
                  background: duration > 60 ? "#fee2e2" : "#dcfce7",
                  color: duration > 60 ? "#ef4444" : "#16a34a",
                }}
              >
                {duration} min
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Employee: My history list ────────────────────────────────────────────────

function MyHistoryList({ items }: { items: LunchBreak[] }) {
  const past = items.filter((b) => !isSameDay(b.date)).slice(0, 14);
  if (!past.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Section title="Historial reciente">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {past.map((b) => {
          const dur = durationMinutes(b.checkinTime, b.checkoutTime);
          const isLate = b.isCheckinLate || b.isCheckoutLate;
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                background: "var(--surface)",
                border: `1px solid ${isLate ? "#fcd34d" : "var(--border)"}`,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {b.status === "COMPLETED" ? (isLate ? "⚠️" : "✅") : "⏳"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(b.date)}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {fmtTime(b.checkinTime)}
                  {b.checkoutTime ? ` → ${fmtTime(b.checkoutTime)}` : " → en curso"}
                </div>
              </div>
              {dur !== null ? (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 700,
                    background: dur > 60 ? "#fee2e2" : "#dcfce7",
                    color: dur > 60 ? "#ef4444" : "#16a34a",
                  }}
                >
                  {dur} min
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>En curso</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
    </div>
  );
}

// ─── Manager: Team break card ─────────────────────────────────────────────────

function TeamBreakCard({ member }: { member: LunchBreak }) {
  const dur = durationMinutes(member.checkinTime, member.checkoutTime);
  const isInProgress = member.status === "IN_PROGRESS";
  const isLate = member.isCheckinLate || member.isCheckoutLate;

  let borderColor = "#86efac";
  let bgChip = "#dcfce7";
  let textChip = "#16a34a";
  let chipLabel = "Completada";

  if (isInProgress) {
    borderColor = isLate ? "#fca5a5" : "#fcd34d";
    bgChip = isLate ? "#fee2e2" : "#fffbeb";
    textChip = isLate ? "#ef4444" : "#d97706";
    chipLabel = "En comida";
  }

  return (
    <div
      style={{
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        padding: "14px 16px",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{member.user?.nombre ?? "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {member.user?.department?.nombre ?? member.user?.role?.name ?? ""}
          </div>
        </div>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            background: bgChip,
            color: textChip,
          }}
        >
          {chipLabel}
        </span>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>Entrada</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {fmtTime(member.checkinTime)}
            {member.isCheckinLate && " ⚠️"}
          </div>
        </div>
        {member.checkoutTime && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>Regreso</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {fmtTime(member.checkoutTime)}
              {member.isCheckoutLate && " ⚠️"}
            </div>
          </div>
        )}
        {dur !== null && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>Duracion</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: dur > 60 ? "#ef4444" : "#16a34a",
              }}
            >
              {dur} min
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Manager: Team view ───────────────────────────────────────────────────────

function TeamLunchView({ token, dateFilter }: { token: string; dateFilter: string }) {
  const [items, setItems] = useState<LunchBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"cards" | "table">("cards");
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (filterStatus) rows = rows.filter((b) => b.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((b) =>
        (b.user?.nombre ?? "").toLowerCase().includes(q) ||
        (b.user?.department?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [items, searchQ, filterStatus]);

  const stats = useMemo(() => {
    const durs = items.map((b) => durationMinutes(b.checkinTime, b.checkoutTime)).filter((d): d is number => d !== null);
    const avg = durs.length ? Math.round(durs.reduce((s, d) => s + d, 0) / durs.length) : 0;
    const over60 = items.filter((b) => { const d = durationMinutes(b.checkinTime, b.checkoutTime); return d !== null && d > 60; }).length;
    const inProgress = items.filter((b) => b.status === "IN_PROGRESS").length;
    const lateCount = items.filter((b) => b.isCheckinLate || b.isCheckoutLate).length;
    return { avg, over60, inProgress, lateCount };
  }, [items]);

  const cols: Column<LunchBreak>[] = [
    {
      key: "user" as keyof LunchBreak,
      label: "Persona",
      render: (b) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{b.user?.nombre ?? "—"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{b.user?.department?.nombre ?? ""}</div>
        </div>
      ),
      width: 180,
    },
    {
      key: "status",
      label: "Estado",
      render: (b) => (
        <Tag variant={b.status === "IN_PROGRESS" ? "warning" : "positive"}>
          {b.status === "IN_PROGRESS" ? "En comida" : "Completada"}
        </Tag>
      ),
      width: 120,
    },
    {
      key: "checkinTime",
      label: "Entrada",
      render: (b) => (
        <span style={{ fontSize: 12 }}>
          {fmtTime(b.checkinTime)}
          {b.isCheckinLate && <span style={{ marginLeft: 4, color: "#f59e0b" }}>⚠️</span>}
        </span>
      ),
      width: 100,
    },
    {
      key: "checkoutTime",
      label: "Regreso",
      render: (b) => (
        <span style={{ fontSize: 12 }}>
          {b.checkoutTime ? (
            <>
              {fmtTime(b.checkoutTime)}
              {b.isCheckoutLate && <span style={{ marginLeft: 4, color: "#ef4444" }}>⚠️</span>}
            </>
          ) : "—"}
        </span>
      ),
      width: 100,
    },
    {
      key: "id" as keyof LunchBreak,
      label: "Duracion",
      render: (b) => {
        const d = durationMinutes(b.checkinTime, b.checkoutTime);
        if (d === null) return <Tag variant="warning">En curso</Tag>;
        return <Tag variant={d > 60 ? "danger" : "positive"}>{d} min</Tag>;
      },
      width: 110,
    },
    {
      key: "notes",
      label: "Notas",
      render: (b) => <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{b.notes ?? "—"}</span>,
    },
  ];

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <KpiCard label="Promedio hoy" value={`${stats.avg} min`} icon="🍽️" />
        <KpiCard label="Mas de 60 min" value={stats.over60} variant={stats.over60 > 0 ? "warning" : "positive"} icon="⏰" />
        <KpiCard label="En comida ahora" value={stats.inProgress} icon="⏳" />
        <KpiCard label="Tardanzas" value={stats.lateCount} variant={stats.lateCount > 0 ? "danger" : "positive"} icon="⚠️" />
      </div>

      {items.length > 0 && (() => {
        const inProgress = items.filter(b => b.status === "IN_PROGRESS").length;
        const completed = items.filter(b => b.status === "COMPLETED").length;
        const over60 = items.filter(b => { const d = durationMinutes(b.checkinTime, b.checkoutTime); return d !== null && d > 60; }).length;
        const total = items.length;
        const rows = [
          { label: "En comida", count: inProgress, color: "var(--warning)" },
          { label: "Completadas", count: completed, color: "var(--success)" },
          { label: "> 60 min", count: over60, color: "var(--danger)" },
        ].filter(r => r.count > 0);
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución de pausas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {rows.map(r => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre o departamento…" }}
        selects={[{
          label: "Estado",
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: "IN_PROGRESS", label: "En comida" },
            { value: "COMPLETED", label: "Completada" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterStatus(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems.map((b) => ({
            nombre: b.user?.nombre ?? "",
            departamento: b.user?.department?.nombre ?? "",
            estado: b.status === "IN_PROGRESS" ? "En comida" : "Completada",
            entrada: fmtTime(b.checkinTime),
            salida: b.checkoutTime ? fmtTime(b.checkoutTime) : "",
            duracion: durationMinutes(b.checkinTime, b.checkoutTime) ?? "",
            tardanza: b.isCheckinLate || b.isCheckoutLate ? "Sí" : "No",
          })), [
            { key: "nombre", label: "Nombre" },
            { key: "departamento", label: "Departamento" },
            { key: "estado", label: "Estado" },
            { key: "entrada", label: "Entrada" },
            { key: "salida", label: "Salida" },
            { key: "duracion", label: "Duración (min)" },
            { key: "tardanza", label: "Tardanza" },
          ], `comidas-${dateFilter}`)}>CSV</Button>
        ) : undefined}
      />
      <Section
        title={loading ? "Cargando equipo…" : `${visibleItems.length} registros`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              variant={viewType === "cards" ? "primary" : "ghost"}
              onClick={() => setViewType("cards")}
            >
              Tarjetas
            </Button>
            <Button
              size="sm"
              variant={viewType === "table" ? "primary" : "ghost"}
              onClick={() => setViewType("table")}
            >
              Tabla
            </Button>
            <Button size="sm" variant="ghost" iconLeft="🔄" onClick={() => void load()}>
              Actualizar
            </Button>
          </div>
        }
      >
        {loading && (
          <EmptyState icon="⏳" title="Cargando…" description="Consultando registros del equipo." />
        )}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={error}
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        )}
        {!loading && !error && visibleItems.length === 0 && (
          <EmptyState
            icon="🍽️"
            title="Sin registros"
            description={searchQ || filterStatus ? "Sin resultados para ese filtro." : "Nadie ha registrado comida para esta fecha."}
          />
        )}
        {!loading && !error && visibleItems.length > 0 && viewType === "cards" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {visibleItems.map((m) => (
              <TeamBreakCard key={m.id} member={m} />
            ))}
          </div>
        )}
        {!loading && !error && visibleItems.length > 0 && viewType === "table" && (
          <DataTable<LunchBreak>
            columns={cols}
            rows={visibleItems}
            rowKey={(b) => b.id}
            emptyTitle="Sin registros"
            emptyDescription="No hay comidas registradas para esta fecha."
          />
        )}
      </Section>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LunchBreaksPage() {
  const { user } = useUser();
  const viewMode = useMemo(() => getAttendanceViewMode(user), [user]);
  const headerCfg = useMemo(() => getLunchBreaksSectionConfig(user), [user]);
  const isManager = viewMode !== "register";
  const canRegister = viewMode === "register" || viewMode === "manage_register";
  const token = user?.token ?? "";

  const [myBreaks, setMyBreaks] = useState<LunchBreak[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [dateFilter, setDateFilter] = useState(todayIso());

  const loadMyBreaks = useCallback(async () => {
    if (!token || !canRegister) return;
    setLoadingMy(true);
    try {
      const data = await apiFetch("lunch-breaks/my-breaks", token);
      setMyBreaks(Array.isArray(data) ? data : []);
    } catch {
      // silent — hero shows no data gracefully
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
        eyebrow="ERP · Personas"
        title={headerCfg.title}
        subtitle={headerCfg.subtitle}
        actions={
          isManager ? (
            <input
              type="date"
              value={dateFilter}
              max={todayIso()}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
              }}
            />
          ) : (
            <Button variant="ghost" iconLeft="🔄" onClick={() => void loadMyBreaks()}>
              Actualizar
            </Button>
          )
        }
      />

      {canRegister && (
        <>
          {loadingMy ? (
            <div
              style={{
                border: "1.5px solid var(--border)",
                borderRadius: 14,
                padding: "20px 24px",
                marginBottom: 20,
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              Cargando estado de hoy...
            </div>
          ) : (
            <BreakStatusHero todayBreak={todayBreak} />
          )}
          {!loadingMy && (
            <Section
              title={todayBreak?.status === "IN_PROGRESS" ? "Registrar regreso" : "Registrar salida a comida"}
              subtitle="Captura foto al salir y al regresar de tu hora de comida."
            >
              <LunchBreakForm
                isCheckin={todayBreak?.status !== "IN_PROGRESS"}
                onSuccess={() => void loadMyBreaks()}
              />
            </Section>
          )}
          {!loadingMy && <MyHistoryList items={myBreaks} />}
        </>
      )}

      {isManager && (
        <TeamLunchView token={token} dateFilter={dateFilter} />
      )}
    </>
  );
}
