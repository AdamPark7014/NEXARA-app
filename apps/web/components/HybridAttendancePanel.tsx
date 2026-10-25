"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ListExportActions from "@/components/ui/ListExportActions";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { exportToExcel } from "@/lib/export-excel";

type LinkStatus = "linked" | "erp_only" | "acs_only";

type HybridItem = {
  linkStatus: LinkStatus;
  matchKey: string | null;
  flags: string[];
  user: {
    id: number;
    nombre: string;
    email: string;
    employeeNumber: string | null;
    companyEmployeeNumber: string | null;
    department: string | null;
  } | null;
  erp: {
    checkIn: string | null;
    checkOut: string | null;
    totalMinutes: number;
    isOpen: boolean;
    estado: "PRESENTE" | "COMPLETO" | "AUSENTE";
  } | null;
  acs: {
    personId: string;
    personName: string | null;
    personCode: string | null;
    firstAt: string;
    lastAt: string;
    minutes: number | null;
    passes: number;
    denied: number;
    firstDoor: string | null;
    firstPhoto: string | null;
  } | null;
};

type HybridResponse = {
  date: string;
  sources: { erp: string; acs: string };
  howToLink: string;
  summary: { linked: number; erpOnly: number; acsOnly: number; withFlags: number };
  items: HybridItem[];
};

const FLAG_LABEL: Record<string, string> = {
  sin_numero_empleado: "Sin nº empleado",
  acs_sin_checador: "ACS sin checador",
  checador_sin_acs: "Checador sin ACS",
  acs_sin_salida: "ACS sin salida",
  erp_sin_salida: "ERP sin salida",
  desfase_entrada: "Desfase entrada",
  desfase_salida: "Desfase salida",
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(m?: number | null): string {
  if (m == null) return "—";
  if (!m) return "0h";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ""}` : `${min}m`;
}

function statusLabel(s: LinkStatus): string {
  if (s === "linked") return "Vinculado";
  if (s === "erp_only") return "Solo ERP";
  return "Solo ACS";
}

export default function HybridAttendancePanel({
  token,
  date,
}: {
  token: string;
  date: string;
}) {
  const [data, setData] = useState<HybridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | LinkStatus>("");
  const [onlyFlags, setOnlyFlags] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`attendance/hybrid?date=${encodeURIComponent(date)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const json = await parseResponseJson<HybridResponse>(res);
      setData(json);
    } catch (e) {
      setData(null);
      setError("No se pudo cargar el contraste.");
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    let list = data?.items ?? [];
    if (filter) list = list.filter((i) => i.linkStatus === filter);
    if (onlyFlags) list = list.filter((i) => i.flags.length > 0);
    return list;
  }, [data, filter, onlyFlags]);

  const cols: Column<HybridItem>[] = [
    {
      key: "persona",
      label: "Persona",
      render: (r) => {
        const name = r.user?.nombre || r.acs?.personName || r.acs?.personId || "—";
        const sub =
          r.user?.employeeNumber ||
          r.user?.companyEmployeeNumber ||
          r.acs?.personId ||
          "sin código";
        return (
          <div>
            {r.user ? (
              <Link
                href={`/erp/hr/${r.user.id}`}
                style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}
              >
                {name}
              </Link>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 13 }}>{name}</span>
            )}
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {r.user?.department ? `${r.user.department} · ` : ""}
              {sub}
            </div>
          </div>
        );
      },
    },
    {
      key: "link",
      label: "Vínculo",
      width: 110,
      render: (r) => (
        <Tag variant={r.linkStatus === "linked" ? "positive" : r.linkStatus === "erp_only" ? "accent" : "warning"}>
          {statusLabel(r.linkStatus)}
        </Tag>
      ),
    },
    {
      key: "erp",
      label: "Checador ERP",
      render: (r) =>
        r.erp ? (
          <div className="nx-hyb-times">
            <div><span>Entrada</span>{fmtTime(r.erp.checkIn)}</div>
            <div><span>Salida</span>{fmtTime(r.erp.checkOut)}</div>
            <div><span>Horas</span>{fmtMinutes(r.erp.totalMinutes)}{r.erp.isOpen ? " · abierta" : ""}</div>
          </div>
        ) : (
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Sin fichaje</span>
        ),
    },
    {
      key: "acs",
      label: "Puerta ACS",
      render: (r) =>
        r.acs ? (
          <div className="nx-hyb-times">
            <div><span>Entrada</span>{fmtTime(r.acs.firstAt)}</div>
            <div><span>Salida</span>{r.acs.passes > 1 ? fmtTime(r.acs.lastAt) : "—"}</div>
            <div><span>Horas</span>{r.acs.minutes == null ? "sin salida" : fmtMinutes(r.acs.minutes)}</div>
            {r.acs.firstDoor ? <div><span>Puerta</span>{r.acs.firstDoor}</div> : null}
          </div>
        ) : (
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Sin acceso</span>
        ),
    },
    {
      key: "flags",
      label: "Alertas",
      render: (r) =>
        r.flags.length === 0 ? (
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
        ) : (
          <div className="nx-hyb-flags" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {r.flags.map((f) => (
              <Tag key={f} variant="warning">
                {FLAG_LABEL[f] || f}
              </Tag>
            ))}
          </div>
        ),
    },
  ];

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    background: active ? "var(--primary, #3b82f6)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <>
    <style>{HYB_QUIET}</style>
    <Section
      title="Híbrido Integra ↔ ERP"
      subtitle="Checador de nómina frente a las puertas."
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ListExportActions
            onExcel={
              rows.length > 0
                ? () =>
                    exportToExcel(
                      rows.map((r) => ({
                        persona: r.user?.nombre || r.acs?.personName || r.acs?.personId || "—",
                        codigo:
                          r.user?.employeeNumber ||
                          r.user?.companyEmployeeNumber ||
                          r.acs?.personId ||
                          "",
                        departamento: r.user?.department || "",
                        vinculo: statusLabel(r.linkStatus),
                        erpEntrada: r.erp?.checkIn ? fmtTime(r.erp.checkIn) : "",
                        erpSalida: r.erp?.checkOut ? fmtTime(r.erp.checkOut) : "",
                        erpMinutos: r.erp?.totalMinutes ?? "",
                        acsEntrada: r.acs?.firstAt ? fmtTime(r.acs.firstAt) : "",
                        acsSalida: r.acs && r.acs.passes > 1 ? fmtTime(r.acs.lastAt) : "",
                        acsMinutos: r.acs?.minutes ?? "",
                        puerta: r.acs?.firstDoor || "",
                        alertas: r.flags.map((f) => FLAG_LABEL[f] || f).join("; "),
                      })),
                      [
                        { key: "persona", label: "Persona" },
                        { key: "codigo", label: "Código" },
                        { key: "departamento", label: "Departamento" },
                        { key: "vinculo", label: "Vínculo" },
                        { key: "erpEntrada", label: "ERP entrada" },
                        { key: "erpSalida", label: "ERP salida" },
                        { key: "erpMinutos", label: "ERP min" },
                        { key: "acsEntrada", label: "ACS entrada" },
                        { key: "acsSalida", label: "ACS salida" },
                        { key: "acsMinutos", label: "ACS min" },
                        { key: "puerta", label: "Puerta" },
                        { key: "alertas", label: "Alertas" },
                      ],
                      `asistencia-hibrida-${date}`,
                      {
                        title: "Asistencia híbrida Integra ↔ ERP",
                        subtitle: `Día ${date}`,
                        summaryRows: [
                          { label: "Vinculados", value: data?.summary.linked ?? 0 },
                          { label: "Solo ERP", value: data?.summary.erpOnly ?? 0 },
                          { label: "Solo ACS", value: data?.summary.acsOnly ?? 0 },
                          { label: "Con alertas", value: data?.summary.withFlags ?? 0 },
                        ],
                      },
                    )
                : undefined
            }
          />
          <Link href="/integra/attendance" style={{ fontSize: 12, color: "var(--primary)" }}>
            Ver ACS Integra
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
      }
    >
      {error ? (
        <InlineAlert
          variant="danger"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      ) : (
      <>
      <div className="nx-hyb-kpis">
        <KpiCard label="Vinculados" value={data?.summary.linked ?? 0} variant="positive" icon="🔗" />
        <KpiCard label="Solo ERP" value={data?.summary.erpOnly ?? 0} variant="accent" icon="⏰" />
        <KpiCard label="Solo ACS" value={data?.summary.acsOnly ?? 0} variant="warning" icon="🚪" />
        <KpiCard label="Con alertas" value={data?.summary.withFlags ?? 0} variant={data?.summary.withFlags ? "danger" : "default"} icon="⚠️" />
      </div>

      <div className="nx-hyb-filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" style={chip(filter === "")} onClick={() => setFilter("")}>
          Todos
        </button>
        <button type="button" style={chip(filter === "linked")} onClick={() => setFilter("linked")}>
          Vinculados
        </button>
        <button type="button" style={chip(filter === "erp_only")} onClick={() => setFilter("erp_only")}>
          Solo ERP
        </button>
        <button type="button" style={chip(filter === "acs_only")} onClick={() => setFilter("acs_only")}>
          Solo ACS
        </button>
        <button type="button" style={chip(onlyFlags)} onClick={() => setOnlyFlags((v) => !v)}>
          Solo alertas
        </button>
      </div>

      {loading ? (
        <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: 13 }}>Cargando el contraste.</p>
      ) : (
        <>
          <div className="nx-hyb-table">
            <DataTable<HybridItem>
              columns={cols}
              rows={rows}
              rowKey={(r) =>
                r.user
                  ? `u-${r.user.id}`
                  : `a-${r.acs?.personId ?? r.matchKey ?? "x"}`
              }
              density="compact"
              emptyTitle="No hay fichajes ni accesos este día."
              emptyDescription=""
            />
          </div>
          <div className="nx-hyb-stack">
            {rows.length === 0 ? (
              <EmptyState title="No hay fichajes ni accesos este día." />
            ) : (
              rows.map((r) => <HybridStackCard key={r.user ? `u-${r.user.id}` : `a-${r.acs?.personId ?? r.matchKey ?? "x"}`} item={r} />)
            )}
          </div>
        </>
      )}
      </>
      )}
    </Section>
    </>
  );
}

const HYB_QUIET = `
.nx-hyb-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.nx-hyb-times { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.nx-hyb-times span { color: var(--text-tertiary); margin-right: 6px; }
.nx-hyb-stack { display: none; }
.nx-hyb-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}
.nx-hyb-card + .nx-hyb-card { margin-top: 12px; }
.nx-hyb-rows { display: flex; flex-direction: column; gap: 8px; margin: 0; font-size: 13px; }
.nx-hyb-rows > div { display: flex; justify-content: space-between; gap: 12px; }
.nx-hyb-rows dt { color: var(--text-tertiary); }
.nx-hyb-rows dd { margin: 0; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 390px) {
  .nx-hyb-kpis { grid-template-columns: 1fr; }
  .nx-hyb-filters { flex-direction: column; align-items: stretch; }
  .nx-hyb-table { display: none; }
  .nx-hyb-stack { display: block; }
  .nx-hyb-flags { flex-direction: column !important; align-items: flex-start; }
}
`;

function HybridStackCard({ item }: { item: HybridItem }) {
  const name = item.user?.nombre || item.acs?.personName || item.acs?.personId || "—";
  return (
    <article className="nx-hyb-card" aria-label={name}>
      {item.user ? (
        <Link href={`/erp/hr/${item.user.id}`} style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)", textDecoration: "none" }}>
          {name}
        </Link>
      ) : (
        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
      )}
      <dl className="nx-hyb-rows">
        <div><dt>Vínculo</dt><dd>{statusLabel(item.linkStatus)}</dd></div>
        {item.erp ? (
          <>
            <div><dt>Entrada</dt><dd>{fmtTime(item.erp.checkIn)}</dd></div>
            <div><dt>Salida</dt><dd>{fmtTime(item.erp.checkOut)}</dd></div>
            <div><dt>Horas</dt><dd>{fmtMinutes(item.erp.totalMinutes)}{item.erp.isOpen ? " · abierta" : ""}</dd></div>
          </>
        ) : (
          <div><dt>Checador</dt><dd>Sin fichaje</dd></div>
        )}
        {item.acs ? (
          <>
            <div><dt>Puerta entrada</dt><dd>{fmtTime(item.acs.firstAt)}</dd></div>
            <div><dt>Puerta salida</dt><dd>{item.acs.passes > 1 ? fmtTime(item.acs.lastAt) : "—"}</dd></div>
            <div><dt>Puerta horas</dt><dd>{item.acs.minutes == null ? "sin salida" : fmtMinutes(item.acs.minutes)}</dd></div>
            {item.acs.firstDoor ? <div><dt>Puerta</dt><dd>{item.acs.firstDoor}</dd></div> : null}
          </>
        ) : (
          <div><dt>Acceso</dt><dd>Sin acceso</dd></div>
        )}
        {item.flags.map((f) => (
          <div key={f}><dt>Alerta</dt><dd>{FLAG_LABEL[f] || f}</dd></div>
        ))}
      </dl>
    </article>
  );
}
