"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";

type Contract = {
  id: number;
  contractNumber: string;
  title: string;
  status: string;
  frequency: string;
  slaResponseHours: number;
  slaResolutionHours: number;
  monthlyFee: string | number;
  currency: string;
  nextVisitDate: string | null;
  startDate: string;
  endDate: string | null;
  autoGenerateOt: boolean;
  client: { id: number; name: string };
  branch?: { id: number; name: string; branchNumber?: string } | null;
  owner?: { id: number; nombre: string } | null;
  _count?: { visits: number };
};

type Visit = {
  id: number;
  scheduledDate: string;
  status: string;
  generatedAt: string | null;
  completedAt: string | null;
  activityId: number | null;
  contract: {
    id: number;
    contractNumber: string;
    title: string;
    slaResponseHours: number;
    client: { id: number; name: string };
    branch?: { id: number; name: string } | null;
  };
  assignedTo?: { id: number; nombre: string } | null;
};

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#16a34a",
  PAUSED: "#f59e0b",
  EXPIRED: "#6b7280",
  CANCELLED: "#dc2626",
  DRAFT: "#3b82f6",
  SCHEDULED: "#3b82f6",
  GENERATED: "#f59e0b",
  COMPLETED: "#16a34a",
  SKIPPED: "#6b7280",
};

export default function MaintenanceContractsPage() {
  const { user } = useUser();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [tab, setTab] = useState<"contracts" | "visits">("contracts");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    branchId: "",
    title: "",
    description: "",
    serviceScope: "",
    frequency: "MONTHLY",
    slaResponseHours: 48,
    slaResolutionHours: 72,
    monthlyFee: 0,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    autoGenerateOt: true,
  });
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${user.token}` };
      const [contractsRes, visitsRes, clientsRes] = await Promise.all([
        fetch(buildApiUrl("maintenance-contracts"), { headers }).then((r) => r.json()),
        fetch(buildApiUrl("maintenance-contracts/visits?status=SCHEDULED"), { headers }).then((r) => r.json()),
        fetch(buildApiUrl("service-clients"), { headers }).then((r) => r.json()).catch(() => []),
      ]);
      setContracts(Array.isArray(contractsRes) ? contractsRes : []);
      setVisits(Array.isArray(visitsRes) ? visitsRes : []);
      setClients(Array.isArray(clientsRes) ? clientsRes : clientsRes?.data || []);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!form.clientId || !form.title || !form.startDate) {
      setMessage({ kind: "err", text: "Cliente, título y fecha de inicio son obligatorios" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(buildApiUrl("maintenance-contracts"), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          clientId: +form.clientId,
          branchId: form.branchId ? +form.branchId : undefined,
          endDate: form.endDate || undefined,
          monthlyFee: Number(form.monthlyFee) || 0,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "No se pudo crear el contrato");
      }
      setMessage({ kind: "ok", text: "Contrato creado correctamente" });
      setForm({ ...form, title: "", description: "", serviceScope: "" });
      await refresh();
    } catch (err) {
      setMessage({ kind: "err", text: (err as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateOT = async (visitId: number) => {
    try {
      const res = await fetch(buildApiUrl(`maintenance-contracts/visits/${visitId}/generate-ot`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ kind: "ok", text: "OT generada y asignada" });
      await refresh();
    } catch (err) {
      setMessage({ kind: "err", text: (err as Error).message });
    }
  };

  const handleSetStatus = async (id: number, status: string) => {
    try {
      await fetch(buildApiUrl(`maintenance-contracts/${id}/status`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const activeContracts = contracts.filter((c) => c.status === "ACTIVE").length;
  const totalMrr = contracts
    .filter((c) => c.status === "ACTIVE")
    .reduce((acc, c) => acc + Number(c.monthlyFee || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>📑 Contratos de mantenimiento recurrente</h1>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Gestión de SLA, frecuencias y OT automáticas para clientes con servicio recurrente (Soriana, TOKS, etc).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "16px 0" }}>
        <KpiCard label="Contratos activos" value={activeContracts} color="#16a34a" />
        <KpiCard label="MRR (MXN)" value={`$${totalMrr.toLocaleString("es-MX")}`} color="#3b82f6" />
        <KpiCard label="Visitas próximas" value={visits.length} color="#f59e0b" />
        <KpiCard label="Total contratos" value={contracts.length} color="#6b7280" />
      </div>

      {message && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: message.kind === "ok" ? "#dcfce7" : "#fee2e2",
            color: message.kind === "ok" ? "#166534" : "#991b1b",
            marginBottom: 16,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TabButton active={tab === "contracts"} onClick={() => setTab("contracts")}>Contratos</TabButton>
        <TabButton active={tab === "visits"} onClick={() => setTab("visits")}>Visitas programadas</TabButton>
      </div>

      {tab === "contracts" && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Nuevo contrato</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <label>
                Cliente
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Seleccionar...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Título
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ej. Mantenimiento POS / Comanderas"
                  style={inputStyle}
                />
              </label>
              <label>
                Frecuencia
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  style={inputStyle}
                >
                  {Object.entries(FREQ_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                SLA respuesta (h)
                <input
                  type="number"
                  value={form.slaResponseHours}
                  onChange={(e) => setForm({ ...form, slaResponseHours: +e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label>
                SLA resolución (h)
                <input
                  type="number"
                  value={form.slaResolutionHours}
                  onChange={(e) => setForm({ ...form, slaResolutionHours: +e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label>
                Tarifa mensual (MXN)
                <input
                  type="number"
                  value={form.monthlyFee}
                  onChange={(e) => setForm({ ...form, monthlyFee: +e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label>
                Inicio
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label>
                Fin (opcional)
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 24 }}>
                <input
                  type="checkbox"
                  checked={form.autoGenerateOt}
                  onChange={(e) => setForm({ ...form, autoGenerateOt: e.target.checked })}
                />
                Generar OT automáticamente
              </label>
            </div>
            <label style={{ display: "block", marginTop: 8 }}>
              Alcance del servicio (opcional)
              <textarea
                rows={2}
                value={form.serviceScope}
                onChange={(e) => setForm({ ...form, serviceScope: e.target.value })}
                placeholder="Ej. Cambio de cabezal de impresoras, revisión de comanderas, limpieza periférica"
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
            <button
              type="button"
              className="button-primary"
              onClick={handleCreate}
              disabled={creating}
              style={{ marginTop: 12 }}
            >
              {creating ? "Creando..." : "Crear contrato"}
            </button>
          </div>

          {loading ? (
            <p>Cargando...</p>
          ) : contracts.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Sin contratos registrados.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Contrato</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Frecuencia</th>
                  <th style={thStyle}>SLA Res.</th>
                  <th style={thStyle}>Próxima visita</th>
                  <th style={thStyle}>MRR</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{c.contractNumber}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.title}</div>
                    </td>
                    <td style={tdStyle}>
                      {c.client.name}
                      {c.branch && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.branch.name}</div>}
                    </td>
                    <td style={tdStyle}>{FREQ_LABEL[c.frequency] || c.frequency}</td>
                    <td style={tdStyle}>{c.slaResolutionHours} h</td>
                    <td style={tdStyle}>{c.nextVisitDate ? new Date(c.nextVisitDate).toLocaleDateString() : "—"}</td>
                    <td style={tdStyle}>${Number(c.monthlyFee).toLocaleString("es-MX")} {c.currency}</td>
                    <td style={tdStyle}>
                      <Badge color={STATUS_COLOR[c.status] || "#6b7280"}>{c.status}</Badge>
                    </td>
                    <td style={tdStyle}>
                      {c.status === "ACTIVE" ? (
                        <button type="button" onClick={() => handleSetStatus(c.id, "PAUSED")} style={buttonSmall}>Pausar</button>
                      ) : (
                        <button type="button" onClick={() => handleSetStatus(c.id, "ACTIVE")} style={buttonSmall}>Reactivar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === "visits" && (
        <>
          {loading ? (
            <p>Cargando...</p>
          ) : visits.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Sin visitas programadas próximas.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Contrato</th>
                  <th style={thStyle}>Cliente / Sucursal</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>SLA Resp.</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{v.contract.contractNumber}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.contract.title}</div>
                    </td>
                    <td style={tdStyle}>
                      {v.contract.client.name}
                      {v.contract.branch && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v.contract.branch.name}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{new Date(v.scheduledDate).toLocaleDateString()}</td>
                    <td style={tdStyle}>{v.contract.slaResponseHours} h</td>
                    <td style={tdStyle}>
                      <Badge color={STATUS_COLOR[v.status] || "#6b7280"}>{v.status}</Badge>
                    </td>
                    <td style={tdStyle}>
                      {v.status === "SCHEDULED" ? (
                        <button type="button" onClick={() => handleGenerateOT(v.id)} style={buttonSmall}>
                          Generar OT
                        </button>
                      ) : v.activityId ? (
                        <a href={`/operacion/activities?id=${v.activityId}`} style={{ color: "var(--primary)" }}>Ver OT</a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  marginTop: 4,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  background: "var(--bg-secondary)",
  fontSize: 13,
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: 10,
  fontSize: 13,
};

const buttonSmall: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--primary)",
  background: "transparent",
  color: "var(--primary)",
  cursor: "pointer",
  fontSize: 12,
};

function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        background: active ? "var(--primary)" : "var(--bg-secondary)",
        color: active ? "#fff" : "var(--text-primary)",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: `${color}22`,
        color,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
