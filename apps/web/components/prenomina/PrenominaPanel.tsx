"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import MoreTimeOutlinedIcon from "@mui/icons-material/MoreTimeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  DateInput,
  FilterChip,
  FilterChips,
  ListCard,
  ModuleToolbar,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { Money } from "@/components/ui/DataTable";
import { FinanceModuleShell } from "@/components/finance/FinanceModuleShell";
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
import s from "./PrenominaPanel.module.css";

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

const OT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDIENTE: { label: "Por decidir", tone: "warning" },
  APROBADO: { label: "Aprobada", tone: "success" },
  RECHAZADO: { label: "Rechazada", tone: "danger" },
};

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
        <Checkbox
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Seleccionar a todas las personas"
        />
      ),
      width: 44,
      render: (r) => (
        <Checkbox
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
        />
      ),
    },
    {
      key: "nombre",
      label: "Persona",
      render: (r) => (
        <div className={s.persona}>
          <div className={s.nombre}>{r.nombre || r.email || "Sin nombre"}</div>
          <div className={s.puesto}>{r.puesto || r.email}</div>
          {r.openDays && r.openDays.length > 0 && (
            <div className={s.jornadas}>
              <Badge tone="warning" size="sm">
                {r.openDays.length === 1 ? "1 jornada sin cerrar" : `${r.openDays.length} jornadas sin cerrar`}
              </Badge>
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
      render: (r) => <span className={s.num}>{r.daysWithAttendance ?? 0}</span>,
    },
    {
      key: "minutes",
      label: "Tiempo trabajado",
      align: "right",
      numeric: true,
      render: (r) => <span className={s.num}>{formatMinutes(r.totalMinutes || 0)}</span>,
    },
    {
      key: "extras",
      label: "Extras aprobadas",
      align: "right",
      numeric: true,
      render: (r) => (
        <span className={r.approvedOvertimeMinutes ? `${s.num} ${s.extras}` : `${s.num} ${s.tenue}`}>
          {formatMinutes(r.approvedOvertimeMinutes || 0)}
        </span>
      ),
    },
    {
      key: "sueldo",
      label: "Sueldo semanal",
      align: "right",
      numeric: true,
      render: (r) => (r.sueldoSemanal != null ? <Money value={r.sueldoSemanal} bold={false} /> : <span className={s.tenue}>—</span>),
    },
    {
      key: "suggested",
      label: "Monto sugerido",
      align: "right",
      numeric: true,
      render: (r) =>
        r.suggestedAmount != null
          ? <Money value={r.suggestedAmount} />
          : <Badge tone="warning" size="sm">Sin sueldo registrado</Badge>,
    },
  ];

  const otColumns: Column<OtRow>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => <span className={s.nombre}>{r.user?.nombre || "Sin nombre"}</span>,
    },
    {
      key: "fecha",
      label: "Día",
      render: (r) => <span className={s.num}>{formatDay(r.fecha)}</span>,
    },
    {
      key: "minutos",
      label: "Tiempo extra",
      align: "right",
      numeric: true,
      render: (r) => <span className={s.num}>{formatMinutes(r.minutos)}</span>,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => {
        const m = OT_STATUS[r.estado] ?? { label: r.estado.charAt(0) + r.estado.slice(1).toLowerCase(), tone: "neutral" as const };
        return <Badge tone={m.tone} size="sm" dot>{m.label}</Badge>;
      },
    },
    {
      key: "acciones",
      label: canDecideOt ? "Decisión" : "",
      align: "right",
      render: (r) =>
        canDecideOt && r.estado === "PENDIENTE" && token ? (
          <div className={s.decision}>
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
  const hayAvisoDeBorradores = Boolean(calculated) && (totals.withoutSalary > 0 || totals.openDays > 0);

  return (
    <>
      <FinanceModuleShell
        variant="flat"
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        rail={rail}
        actions={
          <>
            <ButtonLink href={paymentsHref} variant="ghost">
              Ver pagos
            </ButtonLink>
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
      >
        <Card as="div" className={s.barra}>
          <ModuleToolbar
            chips={
              <FilterChips ariaLabel="Periodos rápidos">
                {PRESETS.map((p) => {
                  const [pf, pt] = p.range();
                  const active = pf === from && pt === to;
                  return (
                    <FilterChip
                      key={p.id}
                      active={active}
                      onClick={() => {
                        setFrom(pf);
                        setTo(pt);
                      }}
                    >
                      {p.label}
                    </FilterChip>
                  );
                })}
              </FilterChips>
            }
          >
            <label className={s.fecha}>
              <span>Desde</span>
              <DateInput
                aria-label="Desde"
                controlSize="sm"
                className={s.fechaCtl}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className={s.fecha}>
              <span>Hasta</span>
              <DateInput
                aria-label="Hasta"
                controlSize="sm"
                className={s.fechaCtl}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </ModuleToolbar>
        </Card>

        {rangeError && (
          <Alert tone="warning" role="alert" dense>
            {rangeError}
          </Alert>
        )}
        {stale && !rangeError && (
          <Alert
            tone="info"
            role="alert"
            dense
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Recalcular
              </Button>
            }
          >
            {`Cambiaste el periodo. Los datos mostrados son de ${formatRange(calculated!.from, calculated!.to)}.`}
          </Alert>
        )}

        {error && (
          <Alert
            tone={calculated ? "warning" : "danger"}
            role="alert"
            title="No se pudo calcular la prenómina"
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          >
            {calculated ? `${error} Mostramos el último cálculo.` : error}
          </Alert>
        )}

        {hayAvisoDeBorradores && (
          <Alert tone="warning" role="alert" title="Revisa antes de crear borradores">
            {[
              totals.withoutSalary > 0
                ? `${totals.withoutSalary === 1 ? "1 persona no tiene" : `${totals.withoutSalary} personas no tienen`} sueldo semanal registrado y se omitirán.`
                : "",
              totals.openDays > 0
                ? `Hay ${totals.openDays === 1 ? "1 jornada" : `${totals.openDays} jornadas`} con entrada pero sin salida.`
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          </Alert>
        )}

        {calculated && (
          <StatRow variant="strip" ariaLabel="Totales del periodo">
            <Stat
              label="Personas"
              value={rows.length}
              hint={formatRange(calculated.from, calculated.to)}
              icon={<GroupsOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Tiempo trabajado"
              value={formatMinutes(totals.minutes)}
              icon={<ScheduleOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Extras aprobadas"
              value={formatMinutes(totals.extras)}
              icon={<MoreTimeOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Extras por decidir"
              value={pendingOt.length}
              tone={pendingOt.length ? "warning" : "success"}
              hint={pendingOt.length ? "No suman al monto hasta aprobarse" : undefined}
              icon={<PendingActionsOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Monto sugerido"
              value={MXN(totals.amount)}
              hint={selected.size !== rows.length ? `${MXN(totals.selectedAmount)} seleccionado` : undefined}
              icon={<PaymentsOutlinedIcon />}
              iconTone="neutral"
            />
          </StatRow>
        )}

        <ListCard
          listLabel="Equipo del periodo"
          toolbar={<CardHead title="Equipo del periodo" />}
          loading={firstLoad}
          empty={!firstLoad && rows.length === 0}
          emptyState={{
            icon: <GroupsOutlinedIcon />,
            title: calculated ? "Nadie registró asistencia en el periodo" : "Aún no hay cálculo",
            description: calculated ? "Prueba con otro periodo." : "Elige el periodo y pulsa «Calcular periodo».",
            action: !calculated ? (
              <Button size="sm" onClick={() => void load()} disabled={!token || !!rangeError}>
                Calcular periodo
              </Button>
            ) : undefined,
            tone: "neutral",
          }}
        >
          <DataTable
            flush
            columns={teamColumns}
            rows={rows}
            rowKey={(r) => r.userId}
            ariaLabel="Prenómina por persona"
          />
        </ListCard>

        <ListCard
          listLabel="Horas extra"
          toolbar={
            <CardHead
              title="Horas extra"
              subtitle={
                <>
                  Solo las horas extra aprobadas suman al monto sugerido.
                  {!canDecideOt ? " Puedes consultarlas, pero no tienes permiso para aprobarlas o rechazarlas." : null}
                </>
              }
            />
          }
          loading={firstLoad}
          loadingRows={3}
          empty={!firstLoad && otRows.length === 0}
          emptyState={{
            icon: <MoreTimeOutlinedIcon />,
            title: "Sin horas extra",
            description: calculated ? "Nadie registró horas extra en el periodo." : "Calcula un periodo para ver las horas extra.",
            tone: "neutral",
          }}
        >
          <DataTable
            flush
            columns={otColumns}
            rows={otRows}
            rowKey={(r) => r.id}
            ariaLabel="Horas extra del periodo"
          />
        </ListCard>
      </FinanceModuleShell>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} danger={false} />
    </>
  );
}
