"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { type Column } from "@/components/ui/DataTable";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { erpFetch, formatApiError } from "@/lib/erp-api";

type AuditRow = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  userId?: number | null;
  companyId?: number | null;
  source?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  changes?: unknown;
  previousData?: unknown;
  user?: { id: number; nombre: string; email: string } | null;
};

type Respuesta = {
  data?: AuditRow[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

const LIMITE = 100;

/** Campos de contexto del interceptor HTTP: no son datos del registro. */
const CONTEXTO = new Set(["path", "method", "durationMs", "status", "error", "request"]);

type Fila = { campo: string; antes: unknown; despues: unknown; cambio: boolean };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Lo que el back llama `changes` es, en las escrituras propias, el "después". */
function datosDespues(row: AuditRow): Record<string, unknown> | null {
  if (!esObjeto(row.changes)) return null;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row.changes)) {
    if (!CONTEXTO.has(k)) salida[k] = v;
  }
  return Object.keys(salida).length ? salida : null;
}

function contextoHttp(row: AuditRow): Record<string, unknown> | null {
  if (!esObjeto(row.changes)) return null;
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row.changes)) {
    if (CONTEXTO.has(k)) salida[k] = v;
  }
  return Object.keys(salida).length ? salida : null;
}

function comparar(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): Fila[] {
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...campos]
    .sort()
    .map((campo) => {
      const a = antes?.[campo];
      const d = despues?.[campo];
      return { campo, antes: a, despues: d, cambio: JSON.stringify(a) !== JSON.stringify(d) };
    });
}

function texto(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "(vacío)";
  if (typeof v === "string") return v || "(vacío)";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}

const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * La acción es el estado del renglón: neutra mientras sea flujo normal (alta,
 * edición, consulta) y roja solo cuando alguien borró algo, que es lo que uno
 * busca al abrir una bitácora.
 */
function tonoAccion(action: string): StatusTone {
  const a = action.toLowerCase();
  if (/delete|remove|borr|elimin|revoke|revoc/.test(a)) return "danger";
  if (/fail|error|denied|deneg|reject|rechaz/.test(a)) return "danger";
  if (/login|logout|export|approve|aprob/.test(a)) return "warning";
  return "neutral";
}

export default function AuditoriaPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<AuditRow | null>(null);
  const [soloCambios, setSoloCambios] = useState(true);

  const [fUsuario, setFUsuario] = useState("");
  const [fEntidad, setFEntidad] = useState("");
  const [fAccion, setFAccion] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: String(LIMITE) });
      if (fUsuario) qs.set("userId", fUsuario);
      if (fEntidad) qs.set("entityType", fEntidad);
      if (fAccion) qs.set("action", fAccion);
      if (fDesde) qs.set("from", `${fDesde}T00:00:00`);
      if (fHasta) qs.set("to", `${fHasta}T23:59:59`);
      const data = await erpFetch<Respuesta | AuditRow[]>(`audit?${qs}`, token);
      const lista = Array.isArray(data) ? data : (data?.data ?? []);
      setRows(lista);
      setTotal(Array.isArray(data) ? lista.length : (data?.total ?? lista.length));
    } catch (e) {
      setError(formatApiError(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, fUsuario, fEntidad, fAccion, fDesde, fHasta]);

  useEffect(() => {
    void load();
  }, [load]);

  // Las opciones salen de lo cargado: no hay endpoint de catálogos de auditoría.
  const opcionesUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const r of rows) {
      if (r.user?.id) mapa.set(String(r.user.id), r.user.nombre || r.user.email || `#${r.user.id}`);
      else if (r.userId) mapa.set(String(r.userId), `#${r.userId}`);
    }
    return [...mapa.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const opcionesEntidad = useMemo(
    () => [...new Set(rows.map((r) => r.entityType).filter(Boolean))].sort().map((v) => ({ value: v, label: v })),
    [rows],
  );

  const opcionesAccion = useMemo(
    () => [...new Set(rows.map((r) => r.action).filter(Boolean))].sort().map((v) => ({ value: v, label: v })),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.user?.nombre ?? "Sistema"} ${r.user?.email ?? ""} ${r.action} ${r.entityType} ${r.entityId}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, busqueda]);

  const columns: Column<AuditRow>[] = [
    {
      key: "createdAt",
      label: "Cuándo",
      width: 140,
      render: (r) => (
        <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {fechaHora(r.createdAt)}
        </span>
      ),
    },
    {
      key: "usuario",
      label: "Usuario",
      render: (r) => r.user?.nombre || (r.userId ? `#${r.userId}` : "Sistema"),
    },
    {
      key: "action",
      label: "Acción",
      render: (r) => <StatusDot label={r.action} tone={tonoAccion(r.action)} />,
    },
    { key: "entityType", label: "Entidad" },
    {
      key: "entityId",
      label: "Registro",
      align: "right",
      numeric: true,
      render: (r) => (r.entityId ? `#${r.entityId}` : "—"),
    },
    {
      key: "contexto",
      label: "Contexto",
      render: (r) => {
        const ctx = contextoHttp(r);
        const ruta = ctx?.["path"] ? String(ctx["path"]) : null;
        return (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {[r.source, ruta, r.ipAddress].filter(Boolean).join(" · ") || "—"}
          </span>
        );
      },
    },
  ];

  /**
   * Lectura de lo cargado, no del total del servidor: la bitácora trae los
   * últimos {LIMITE} eventos y eso es lo que estas cifras describen.
   */
  const strip: Metric[] = useMemo(() => {
    const borrados = filtradas.filter((r) => tonoAccion(r.action) === "danger").length;
    const personas = new Set(
      filtradas.map((r) => (r.user?.id ?? r.userId ?? "sistema").toString()),
    ).size;
    return [
      {
        label: "Eventos",
        value: loading ? "…" : filtradas.length.toLocaleString("es-MX"),
        hint:
          total > rows.length
            ? `De los ${rows.length} más recientes (hay ${total})`
            : "Todos los del filtro",
      },
      {
        label: "Personas",
        value: loading ? "…" : personas,
        hint: "Quién tocó algo en este corte",
      },
      {
        label: "Entidades",
        value: loading ? "…" : new Set(filtradas.map((r) => r.entityType)).size,
        hint: "Tipos de registro afectados",
      },
      {
        label: "Bajas y rechazos",
        value: loading ? "…" : borrados,
        hint: borrados === 0 ? "Nada se borró" : "Revisar quién y por qué",
        tone: borrados > 0 ? "danger" : "default",
      },
    ];
  }, [filtradas, loading, rows.length, total]);

  const antes = abierta && esObjeto(abierta.previousData) ? (abierta.previousData as Record<string, unknown>) : null;
  const despues = abierta ? datosDespues(abierta) : null;
  const filas = comparar(antes, despues);
  const visibles = soloCambios && antes ? filas.filter((f) => f.cambio) : filas;

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Auditoría"
        subtitle="Quién cambió qué y cuándo. Abre un evento para ver el antes y el después."
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {error && (
        <InlineAlert
          message={`${error} — si falta el permiso audit.view, pide acceso a dirección.`}
          variant="danger"
        />
      )}

      <div style={{ marginBottom: 12 }}>
        <MetricStrip metrics={strip} ariaLabel="Resumen de la bitácora cargada" />
      </div>

      <FilterToolbar
        search={{ value: busqueda, onChange: setBusqueda, placeholder: "Buscar usuario, acción, entidad…" }}
        selects={[
          { label: "Usuario", value: fUsuario, onChange: setFUsuario, options: opcionesUsuario, allowAll: true },
          { label: "Entidad", value: fEntidad, onChange: setFEntidad, options: opcionesEntidad, allowAll: true },
          { label: "Acción", value: fAccion, onChange: setFAccion, options: opcionesAccion, allowAll: true },
        ]}
        dates={[
          { label: "Desde", value: fDesde, onChange: setFDesde },
          { label: "Hasta", value: fHasta, onChange: setFHasta },
        ]}
        onClear={() => {
          setBusqueda("");
          setFUsuario("");
          setFEntidad("");
          setFAccion("");
          setFDesde("");
          setFHasta("");
        }}
        resultCount={loading ? null : filtradas.length}
      />

      <Section
        title={loading ? "Cargando…" : `${filtradas.length} evento(s)`}
        subtitle={total > rows.length ? `Mostrando los ${rows.length} más recientes de ${total}.` : undefined}
        flush
      >
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "16px 18px" }}>Cargando…</p>
        ) : filtradas.length === 0 ? (
          <EmptyState title="Sin eventos" description="No hay registros de auditoría con estos filtros." />
        ) : (
          <DataTable
            columns={columns}
            rows={filtradas}
            rowKey={(r) => r.id}
            density="compact"
            onRowClick={(r) => {
              setAbierta(r);
              setSoloCambios(true);
            }}
          />
        )}
      </Section>

      <Modal
        open={!!abierta}
        onClose={() => setAbierta(null)}
        title={abierta ? `${abierta.action} · ${abierta.entityType} #${abierta.entityId}` : ""}
        maxWidth={780}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setAbierta(null)}>
              Cerrar
            </Button>
          </div>
        }
      >
        {abierta && (
          <>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                margin: "0 0 14px",
                fontSize: 12.5,
              }}
            >
              {[
                ["Usuario", abierta.user?.nombre || (abierta.userId ? `#${abierta.userId}` : "Sistema")],
                ["Correo", abierta.user?.email || "—"],
                ["Cuándo", fechaHora(abierta.createdAt)],
                ["Origen", abierta.source || "—"],
                ["IP", abierta.ipAddress || "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>{k}</dt>
                  <dd style={{ margin: "2px 0 0", fontWeight: 600 }}>{v}</dd>
                </div>
              ))}
            </dl>

            {!antes && (
              <InlineAlert
                variant="warning"
                message="Este evento no guardó el estado anterior del registro, así que no hay comparación posible: abajo va solo lo que quedó registrado."
              />
            )}

            {antes && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <strong
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-primary)",
                      fontWeight: 600,
                    }}
                  >
                    {filas.filter((f) => f.cambio).length}
                  </strong>{" "}
                  de {filas.length} campos cambiaron
                </span>
                <label
                  style={{
                    fontSize: 12.5,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={soloCambios}
                    onChange={(e) => setSoloCambios(e.target.checked)}
                  />
                  Mostrar solo lo que cambió
                </label>
              </div>
            )}

            {visibles.length === 0 ? (
              <EmptyState variant="compact" title="Sin datos del registro" description="El evento no guardó campos." />
            ) : (
              /* El diff, sin arcoíris: lo que cambió se marca con una barra y
                 se escribe en tinta plena; lo que no cambió se apaga a gris.
                 Dos niveles de gris y un acento bastan para que el ojo caiga
                 solo en los renglones que importan. */
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid var(--nx-panel-hairline, var(--border))",
                  borderRadius: 10,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12.5,
                    minWidth: 420,
                  }}
                >
                  <thead>
                    <tr>
                      {["Campo", "Antes", "Después"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
                            color: "var(--text-tertiary)",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            width: h === "Campo" ? "22%" : "39%",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((f, i) => {
                      const cambio = f.cambio && !!antes;
                      const borde =
                        i === 0
                          ? undefined
                          : "1px solid var(--nx-panel-hairline, var(--border))";
                      return (
                        <tr key={f.campo}>
                          <th
                            scope="row"
                            style={{
                              textAlign: "left",
                              padding: "8px 12px 8px 9px",
                              borderTop: borde,
                              borderLeft: cambio
                                ? "3px solid var(--state-warning-text, #b45309)"
                                : "3px solid transparent",
                              fontWeight: cambio ? 600 : 400,
                              color: cambio ? "var(--text-primary)" : "var(--text-tertiary)",
                              verticalAlign: "top",
                              wordBreak: "break-word",
                            }}
                          >
                            {f.campo}
                          </th>
                          <td
                            style={{
                              padding: "8px 12px",
                              borderTop: borde,
                              color: cambio ? "var(--text-secondary)" : "var(--text-tertiary)",
                              textDecoration: cambio ? "line-through" : undefined,
                              textDecorationColor: "var(--text-tertiary)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              verticalAlign: "top",
                            }}
                          >
                            {antes ? texto(f.antes) : "—"}
                          </td>
                          <td
                            style={{
                              padding: "8px 12px",
                              borderTop: borde,
                              color: cambio ? "var(--text-primary)" : "var(--text-tertiary)",
                              fontWeight: cambio ? 600 : 400,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              verticalAlign: "top",
                            }}
                          >
                            {texto(f.despues)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {contextoHttp(abierta) && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Contexto técnico de la petición
                </summary>
                <pre
                  style={{
                    fontSize: 11.5,
                    background: "var(--surface-2)",
                    padding: "8px 10px",
                    borderRadius: 8,
                    overflowX: "auto",
                    margin: "6px 0 0",
                  }}
                >
                  {JSON.stringify(contextoHttp(abierta), null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
