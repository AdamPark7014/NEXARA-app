"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import FilterToolbar from "@/components/FilterToolbar";
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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

/**
 * Shared pre-nómina panel (Finance + HR). Period → attendance + approved OT → suggested amount.
 * No CFDI. OT×2 lives in API `prenomina-amount.ts` only.
 */
export default function PrenominaPanel({
  eyebrow,
  title = "Pre-nómina",
  subtitle = "Periodo → minutos y extras APROBADOS → monto sugerido. Sin CFDI.",
  paymentsHref,
  rail,
  canDecideOt = true,
}: PrenominaPanelProps) {
  const { token } = useUser();
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(isoToday());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PrenominaPreviewRow[]>([]);
  const [otRows, setOtRows] = useState<OtRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      await upsertOvertimeCandidates(token, from, to).catch(() => null);
      const [preview, ots] = await Promise.all([
        fetchPrenominaPreview(token, from, to),
        fetchOvertimeApprovals(token, { from, to }),
      ]);
      setRows(preview.rows || []);
      setOtRows(Array.isArray(ots) ? ots : []);
      setSelected(new Set((preview.rows || []).map((r) => r.userId)));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cargar la pre-nómina"));
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  const pendingOt = useMemo(() => otRows.filter((r) => r.estado === "PENDIENTE"), [otRows]);

  const totals = useMemo(() => {
    const minutes = rows.reduce((s, r) => s + (r.totalMinutes || 0), 0);
    const extras = rows.reduce((s, r) => s + (r.approvedOvertimeMinutes || 0), 0);
    const amount = rows.reduce((s, r) => s + (r.suggestedAmount || 0), 0);
    return { minutes, extras, amount };
  }, [rows]);

  const teamColumns: Column<PrenominaPreviewRow>[] = [
    {
      key: "sel",
      label: "",
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
          aria-label={`Seleccionar ${r.nombre || r.userId}`}
        />
      ),
    },
    {
      key: "nombre",
      label: "Persona",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.nombre || `Usuario #${r.userId}`}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.puesto || r.email}</div>
        </div>
      ),
    },
    {
      key: "minutes",
      label: "Minutos",
      render: (r) => formatMinutes(r.totalMinutes || 0),
    },
    {
      key: "extras",
      label: "Extras aprobados",
      render: (r) => formatMinutes(r.approvedOvertimeMinutes || 0),
    },
    {
      key: "sueldo",
      label: "Sueldo semanal",
      render: (r) => (r.sueldoSemanal != null ? <Money value={r.sueldoSemanal} /> : "—"),
    },
    {
      key: "suggested",
      label: "Monto sugerido",
      render: (r) =>
        r.suggestedAmount != null ? <Money value={r.suggestedAmount} /> : "Sin sueldo",
    },
  ];

  const otColumns: Column<OtRow>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => r.user?.nombre || `#${r.userId}`,
    },
    {
      key: "fecha",
      label: "Día",
      render: (r) => String(r.fecha).slice(0, 10),
    },
    {
      key: "minutos",
      label: "Minutos extra",
      render: (r) => formatMinutes(r.minutos),
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => r.estado,
    },
    {
      key: "acciones",
      label: "",
      render: (r) =>
        canDecideOt && r.estado === "PENDIENTE" && token ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await decideOvertimeApproval(token, r.id, "approve");
                  toast.success("Extra aprobado");
                  await load();
                } catch (e) {
                  toast.error(formatApiError(e, "No se pudo aprobar"));
                }
              }}
            >
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await decideOvertimeApproval(token, r.id, "reject");
                  toast.success("Extra rechazado");
                  await load();
                } catch (e) {
                  toast.error(formatApiError(e, "No se pudo rechazar"));
                }
              }}
            >
              Rechazar
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rail}
      <div
        style={{
          display: "grid",
          gap: 16,
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{eyebrow}</p>
            <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>{title}</h1>
            {subtitle ? (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={load} disabled={!token || loading}>
              {loading ? "Cargando…" : "Calcular periodo"}
            </Button>
            <Button
              disabled={!token || creating || selected.size === 0 || rows.length === 0}
              onClick={async () => {
                if (!token) return;
                setCreating(true);
                try {
                  const res = await createPrenominaBatch(token, from, to, [...selected]);
                  toast.success(`Borradores creados: ${res?.created ?? 0}`);
                } catch (e) {
                  toast.error(formatApiError(e, "No se pudo crear el lote"));
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? "Creando…" : "Crear borradores"}
            </Button>
            <Link href={paymentsHref}>
              <Button variant="secondary">Ver pagos</Button>
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 13,
            padding: "8px 0",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            Minutos: <strong>{formatMinutes(totals.minutes)}</strong>
          </div>
          <div>
            Extras aprobados: <strong>{formatMinutes(totals.extras)}</strong>
          </div>
          <div>
            Sugerido:{" "}
            <strong>
              {totals.amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
            </strong>
          </div>
          <div>
            Pendientes OT: <strong>{pendingOt.length}</strong>
          </div>
        </div>

        <FilterToolbar
          dates={[
            { label: "Desde", value: from, onChange: setFrom },
            { label: "Hasta", value: to, onChange: setTo },
          ]}
        />

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Equipo del periodo</h2>
          <DataTable
            columns={teamColumns}
            rows={rows}
            rowKey={(r) => r.userId}
            ariaLabel="Pre-nómina por persona"
            emptyTitle={loading ? "Cargando…" : "Sin filas todavía"}
            emptyDescription="Elige periodo y pulsa Calcular periodo"
          />
        </section>

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Horas extra (aprobación)</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            Solo los minutos en APROBADO entran al monto sugerido.
            {!canDecideOt ? " (solo lectura: sin permiso para aprobar/rechazar)" : null}
          </p>
          <DataTable
            columns={otColumns}
            rows={otRows}
            rowKey={(r) => r.id}
            ariaLabel="Horas extra de pre-nómina"
            emptyTitle="Sin candidatos de extra"
            emptyDescription="No hay horas extra en el periodo"
          />
        </section>
      </div>
    </div>
  );
}
