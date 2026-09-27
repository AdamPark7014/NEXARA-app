"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import MetricStrip from "@/components/ui/MetricStrip";
import InlineAlert from "@/components/ui/InlineAlert";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  createPrenominaBatch,
  decideOvertimeApproval,
  fetchOvertimeApprovals,
  fetchPrenominaPreview,
  upsertOvertimeCandidates,
  type PrenominaPreviewRow,
} from "@/lib/finance-api";

export type PrenominaPanelProps = {
  eyebrow: string;
  title?: string;
  subtitle?: string;
  paymentsHref: string;
  rail?: ReactNode;
  /** When false, OT table is read-only (no Aprobar/Rechazar). */
  canDecideOt?: boolean;
};

type OtRow = {
  id: number;
  userId: number;
  fecha: string;
  minutos: number;
  estado: string;
  user?: { nombre?: string } | null;
};

/** Fecha local (no UTC): en la tarde de CDMX `toISOString` ya es mañana. */
function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoLocal(d);
}

/** Lunes de la semana de `d` (semana laboral mexicana lunes–domingo). */
function mondayOf(d: Date) {
  const out = new Date(d);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}

const PRESETS: Array<{ id: string; label: string; range: () => [string, string] }> = [
  {
    id: "week",
    label: "Esta semana",
    range: () => {
      const mon = mondayOf(new Date());
      return [isoLocal(mon), isoLocal(new Date())];
    },
  },
  {
    id: "last-week",
    label: "Semana pasada",
    range: () => {
      const mon = mondayOf(new Date());
      mon.setDate(mon.getDate() - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return [isoLocal(mon), isoLocal(sun)];
    },
  },
  { id: "7d", label: "Últimos 7 días", range: () => [isoDaysAgo(6), isoLocal(new Date())] },
  { id: "15d", label: "Últimos 15 días", range: () => [isoDaysAgo(14), isoLocal(new Date())] },
];

function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h} h ${String(min).padStart(2, "0")} min`;
}

function formatDay(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" });
}

function formatRange(from: string, to: string) {
  return `${formatDay(from)} – ${formatDay(to)}`;
}

const MXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const OT_STATUS: Record<string, { label: string; variant: "warning" | "positive" | "danger" | "default" }> = {
  PENDIENTE: { label: "Por decidir", variant: "warning" },
  APROBADO: { label: "Aprobada", variant: "positive" },
  RECHAZADO: { label: "Rechazada", variant: "danger" },
};

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

/**
 * Shared pre-nómina panel (Finance + HR). Period → attendance + approved OT → suggested amount.
 * No CFDI. OT×2 lives in API `prenomina-amount.ts` only.
 */
export default function PrenominaPanel({
  eyebrow,
  title = "Prenómina",
  subtitle = "Asistencia y horas extra aprobadas del periodo → monto sugerido por persona. No genera CFDI.",
  paymentsHref,
  rail,
  canDecideOt = true,
}: PrenominaPanelProps) {
  const { token } = useUser();
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(isoLocal(new Date()));
  const [loading, setLoading] = useState(false);
  const [calculated, setCalculated] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PrenominaPreviewRow[]>([]);
  const [otRows, setOtRows] = useState<OtRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const rangeError = from && to && from > to ? "La fecha inicial no puede ser posterior a la final." : null;

  const load = useCallback(async () => {
    if (!token || rangeError) return;
    setLoading(true);
    setError(null);
    try {
      await upsertOvertimeCandidates(token, from, to).catch((e) => {
        toast.error(formatApiError(e, "No se pudieron sincronizar las horas extra"));
      });
      const [preview, ots] = await Promise.all([
        fetchPrenominaPreview(token, from, to),
        fetchOvertimeApprovals(token, { from, to }),
      ]);
      setRows(preview.rows || []);
      setOtRows(Array.isArray(ots) ? ots : []);
      setSelected(new Set((preview.rows || []).map((r) => r.userId)));
      setCalculated({ from, to });
    } catch (e) {
      setError(formatApiError(e, "No se pudo calcular la prenómina."));
    } finally {
      setLoading(false);
    }
  }, [token, from, to, rangeError]);

  const pendingOt = useMemo(() => otRows.filter((r) => r.estado === "PENDIENTE"), [otRows]);

  const totals = useMemo(() => {
    let minutes = 0;
    let extras = 0;
    let amount = 0;
    let selectedAmount = 0;
    let withoutSalary = 0;
    let openDays = 0;
    for (const r of rows) {
      minutes += r.totalMinutes || 0;
      extras += r.approvedOvertimeMinutes || 0;
      amount += r.suggestedAmount || 0;
      if (selected.has(r.userId)) selectedAmount += r.suggestedAmount || 0;
      if (r.suggestedAmount == null) withoutSalary += 1;
      openDays += r.openDays?.length ?? 0;
    }
    return { minutes, extras, amount, selectedAmount, withoutSalary, openDays };
  }, [rows, selected]);

  const stale = !!calculated && (calculated.from !== from || calculated.to !== to);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.userId)));
  };

  const decide = async (r: OtRow, action: "approve" | "reject") => {
    if (!token) return;
    setDeciding(r.id);
    try {
      await decideOvertimeApproval(token, r.id, action);
      toast.success(action === "approve" ? "Horas extra aprobadas" : "Horas extra rechazadas");
      await load();
    } catch (e) {
      toast.error(formatApiError(e, action === "approve" ? "No se pudo aprobar" : "No se pudo rechazar"));
    } finally {
      setDeciding(null);
    }
  };

  const runCreate = async () => {
    if (!token) return;
    setCreating(true);
    try {
      const res = await createPrenominaBatch(token, from, to, [...selected]);
      const created = Number(res?.created ?? 0);
      const skipped = Array.isArray(res?.skipped)
        ? res.skipped.length
        : Number(res?.skipped ?? 0);
      if (created > 0) {
        toast.success(created === 1 ? "Se creó 1 borrador de pago" : `Se crearon ${created} borradores de pago`);
      }
      if (skipped > 0) {
        const msg =
          skipped === 1
            ? "1 persona se omitió por no tener sueldo registrado"
            : `${skipped} personas se omitieron por no tener sueldo registrado`;
        if (created === 0) toast.error(msg);
        else toast.warning(msg);
      } else if (created === 0) {
        toast.error("No se creó ningún borrador");
      }
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron crear los borradores"));
    } finally {
      setCreating(false);
    }
  };

  const askCreate = () => {
    setConfirmState({
      title: "Crear borradores de pago",
      message: `Se crearán borradores para ${selected.size === 1 ? "1 persona" : `${selected.size} personas`} del periodo ${formatRange(from, to)} por un total sugerido de ${MXN(totals.selectedAmount)}. Podrás revisarlos en Pagos antes de pagar.`,
      confirmLabel: "Crear borradores",
      danger: false,
      fn: runCreate,
    });
  };

  const teamColumns: Column<PrenominaPreviewRow>[] = [
    {
      key: "sel",
      label: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Seleccionar a todas las personas"
          style={{ width: 18, height: 18 }}
        />
      ) as unknown as string,
      width: 44,
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.userId)}
          onChange={() => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(r.userId)) next.delete(r.userId);
              else next.add(r.userId);
              return next;
            });
          }}
          aria-label={`Seleccionar a ${r.nombre || r.email || "esta persona"}`}
          style={{ width: 18, height: 18 }}
        />
      ),
    },
    {
      key: "nombre",
      label: "Persona",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{r.nombre || r.email || "Sin nombre"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.puesto || r.email}</div>
          {r.openDays && r.openDays.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Tag variant="warning" size="sm">
                {r.openDays.length === 1 ? "1 jornada sin cerrar" : `${r.openDays.length} jornadas sin cerrar`}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "days",
      label: "Días",
      align: "right",
      numeric: true,
      render: (r) => <span style={num}>{r.daysWithAttendance ?? 0}</span>,
    },
    {
      key: "minutes",
      label: "Tiempo trabajado",
      align: "right",
      numeric: true,
      render: (r) => <span style={num}>{formatMinutes(r.totalMinutes || 0)}</span>,
    },
    {
      key: "extras",
      label: "Extras aprobadas",
      align: "right",
      numeric: true,
      render: (r) => (
        <span style={{ ...num, color: r.approvedOvertimeMinutes ? "var(--text-primary)" : "var(--text-tertiary)" }}>
          {formatMinutes(r.approvedOvertimeMinutes || 0)}
        </span>
      ),
    },
    {
      key: "sueldo",
      label: "Sueldo semanal",
      align: "right",
      numeric: true,
      render: (r) => (r.sueldoSemanal != null ? <Money value={r.sueldoSemanal} bold={false} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>),
    },
    {
      key: "suggested",
      label: "Monto sugerido",
      align: "right",
      numeric: true,
      render: (r) =>
        r.suggestedAmount != null
          ? <Money value={r.suggestedAmount} />
          : <Tag variant="warning" size="sm">Sin sueldo registrado</Tag>,
    },
  ];

  const otColumns: Column<OtRow>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => <span style={{ fontWeight: 600 }}>{r.user?.nombre || "Sin nombre"}</span>,
    },
    {
      key: "fecha",
      label: "Día",
      render: (r) => <span style={num}>{formatDay(r.fecha)}</span>,
    },
    {
      key: "minutos",
      label: "Tiempo extra",
      align: "right",
      numeric: true,
      render: (r) => <span style={num}>{formatMinutes(r.minutos)}</span>,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => {
        const m = OT_STATUS[r.estado] ?? { label: r.estado.charAt(0) + r.estado.slice(1).toLowerCase(), variant: "default" as const };
        return <Tag variant={m.variant} size="sm" dot>{m.label}</Tag>;
      },
    },
    {
      key: "acciones",
      label: canDecideOt ? "Decisión" : "",
      align: "right",
      render: (r) =>
        canDecideOt && r.estado === "PENDIENTE" && token ? (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button size="sm" loading={deciding === r.id} disabled={deciding !== null} onClick={() => void decide(r, "approve")}>
              Aprobar
            </Button>
            <Button size="sm" variant="ghost" disabled={deciding !== null} onClick={() => void decide(r, "reject")}>
              Rechazar
            </Button>
          </div>
        ) : null,
    },
  ];

  const firstLoad = loading && !calculated;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rail}
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Link href={paymentsHref} style={{ textDecoration: "none" }}>
              <Button variant="ghost">Ver pagos</Button>
            </Link>
            <Button
              variant="secondary"
              disabled={!token || creating || loading || stale || selected.size === 0 || rows.length === 0}
              loading={creating}
              onClick={askCreate}
            >
              Crear borradores{selected.size > 0 && rows.length > 0 ? ` (${selected.size})` : ""}
            </Button>
            <Button variant="primary" onClick={() => void load()} disabled={!token || !!rangeError} loading={loading}>
              {calculated ? "Recalcular" : "Calcular periodo"}
            </Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gap: 12,
          padding: 14,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--surface)",
        }}
      >
        <div role="group" aria-label="Periodos rápidos" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const [pf, pt] = p.range();
            const active = pf === from && pt === to;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setFrom(pf); setTo(pt); }}
                style={{
                  minHeight: 36, padding: "6px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                  background: active ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)",
                  color: active ? "var(--primary)" : "var(--text-primary)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <FilterToolbar
          dates={[
            { label: "Desde", value: from, onChange: setFrom },
            { label: "Hasta", value: to, onChange: setTo },
          ]}
        />
        {rangeError && <InlineAlert variant="warning" message={rangeError} dense />}
        {stale && !rangeError && (
          <InlineAlert
            variant="info"
            message={`Cambiaste el periodo. Los datos mostrados son de ${formatRange(calculated!.from, calculated!.to)}.`}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Recalcular</Button>}
            dense
          />
        )}
      </div>

      {error && (
        <InlineAlert
          variant={calculated ? "warning" : "danger"}
          title="No se pudo calcular la prenómina"
          message={calculated ? `${error} Mostramos el último cálculo.` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {calculated && (
        <MetricStrip
          ariaLabel="Totales del periodo"
          metrics={[
            { label: "Personas", value: rows.length, hint: formatRange(calculated.from, calculated.to) },
            { label: "Tiempo trabajado", value: formatMinutes(totals.minutes) },
            { label: "Extras aprobadas", value: formatMinutes(totals.extras) },
            {
              label: "Extras por decidir",
              value: pendingOt.length,
              tone: pendingOt.length ? "warning" : "success",
              hint: pendingOt.length ? "No suman al monto hasta aprobarse" : undefined,
            },
            {
              label: "Monto sugerido",
              value: MXN(totals.amount),
              hint: selected.size !== rows.length ? `${MXN(totals.selectedAmount)} seleccionado` : undefined,
            },
          ]}
        />
      )}

      {calculated && (totals.withoutSalary > 0 || totals.openDays > 0) && (
        <InlineAlert
          variant="warning"
          title="Revisa antes de crear borradores"
          message={[
            totals.withoutSalary > 0
              ? `${totals.withoutSalary === 1 ? "1 persona no tiene" : `${totals.withoutSalary} personas no tienen`} sueldo semanal registrado y se omitirán.`
              : "",
            totals.openDays > 0
              ? `Hay ${totals.openDays === 1 ? "1 jornada" : `${totals.openDays} jornadas`} con entrada pero sin salida.`
              : "",
          ].filter(Boolean).join(" ")}
        />
      )}

      <section aria-labelledby="prenomina-team">
        <h2 id="prenomina-team" style={{ fontSize: 16, margin: "0 0 8px", fontFamily: "var(--nx-font-display)" }}>Equipo del periodo</h2>
        {firstLoad ? (
          <SkeletonList rows={6} tableLike />
        ) : (
          <DataTable
            columns={teamColumns}
            rows={rows}
            rowKey={(r) => r.userId}
            ariaLabel="Prenómina por persona"
            emptyTitle={calculated ? "Nadie registró asistencia en el periodo" : "Aún no hay cálculo"}
            emptyDescription={calculated ? "Prueba con otro periodo." : "Elige el periodo y pulsa «Calcular periodo»."}
            emptyAction={!calculated ? <Button size="sm" variant="primary" onClick={() => void load()} disabled={!token || !!rangeError}>Calcular periodo</Button> : undefined}
          />
        )}
      </section>

      <section aria-labelledby="prenomina-ot">
        <h2 id="prenomina-ot" style={{ fontSize: 16, margin: "0 0 4px", fontFamily: "var(--nx-font-display)" }}>Horas extra</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px", maxWidth: "70ch" }}>
          Solo las horas extra aprobadas suman al monto sugerido.
          {!canDecideOt ? " Puedes consultarlas, pero no tienes permiso para aprobarlas o rechazarlas." : null}
        </p>
        {firstLoad ? (
          <SkeletonList rows={3} tableLike />
        ) : (
          <DataTable
            columns={otColumns}
            rows={otRows}
            rowKey={(r) => r.id}
            ariaLabel="Horas extra del periodo"
            emptyTitle="Sin horas extra"
            emptyDescription={calculated ? "Nadie registró horas extra en el periodo." : "Calcula un periodo para ver las horas extra."}
          />
        )}
      </section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </div>
  );
}
