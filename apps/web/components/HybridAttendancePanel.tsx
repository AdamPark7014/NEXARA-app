"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";

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
      setError(e instanceof Error ? e.message : "No se pudo cargar el híbrido");
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
          <div style={{ fontSize: 12 }}>
            <div>
              ↓ {fmtTime(r.erp.checkIn)} · ↑ {fmtTime(r.erp.checkOut)}
            </div>
            <div style={{ color: "var(--text-tertiary)" }}>
              {fmtMinutes(r.erp.totalMinutes)}
              {r.erp.isOpen ? " · abierta" : ""}
            </div>
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
          <div style={{ fontSize: 12 }}>
            <div>
              ↓ {fmtTime(r.acs.firstAt)}
              {r.acs.passes > 1 ? ` · ↑ ${fmtTime(r.acs.lastAt)}` : ""}
            </div>
            <div style={{ color: "var(--text-tertiary)" }}>
              {r.acs.minutes == null ? "sin salida" : fmtMinutes(r.acs.minutes)}
              {r.acs.firstDoor ? ` · ${r.acs.firstDoor}` : ""}
            </div>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
    <Section
      title="Híbrido Integra ↔ ERP"
      subtitle="Contraste del día: checador (nómina) vs accesos de puerta. No inventa fichajes."
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/integra/attendance" style={{ fontSize: 12, color: "var(--primary)" }}>
            Ver ACS Integra
          </Link>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            marginBottom: 12,
            background: "var(--state-danger-bg,#fef2f2)",
            border: "1px solid var(--danger)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          fontSize: 12.5,
          color: "var(--text-secondary)",
          lineHeight: 1.45,
        }}
      >
        <div>
          <strong style={{ color: "var(--foreground)" }}>ERP:</strong> {data?.sources.erp}
        </div>
        <div style={{ marginTop: 4 }}>
          <strong style={{ color: "var(--foreground)" }}>ACS:</strong> {data?.sources.acs}
        </div>
        <div style={{ marginTop: 8, color: "var(--text-tertiary)" }}>{data?.howToLink}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Vinculados" value={data?.summary.linked ?? 0} variant="positive" icon="🔗" />
        <KpiCard label="Solo ERP" value={data?.summary.erpOnly ?? 0} variant="accent" icon="⏰" />
        <KpiCard label="Solo ACS" value={data?.summary.acsOnly ?? 0} variant="warning" icon="🚪" />
        <KpiCard label="Con alertas" value={data?.summary.withFlags ?? 0} variant={data?.summary.withFlags ? "danger" : "default"} icon="⚠️" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
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
        <div style={{ padding: 36, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          Cargando contraste híbrido…
        </div>
      ) : (
        <DataTable<HybridItem>
          columns={cols}
          rows={rows}
          rowKey={(r) =>
            r.user
              ? `u-${r.user.id}`
              : `a-${r.acs?.personId ?? r.matchKey ?? "x"}`
          }
          density="compact"
          emptyTitle="Sin señales ese día"
          emptyDescription="No hay fichajes ERP ni accesos ACS para contrastar."
        />
      )}
    </Section>
  );
}
