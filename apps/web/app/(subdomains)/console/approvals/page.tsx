"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type PendingApproval = {
  id: number;
  status: string;
  createdAt: string;
  step: {
    id: number;
    stepNumber: number;
    name: string;
    description?: string | null;
  };
  instance: {
    id: number;
    entityType: string;
    entityId: number;
    workflow: { name: string; entityType: string };
    startedBy: { id: number; nombre: string };
  };
};

export default function ApprovalsPage() {
  const { user } = useUser();
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [decideOn, setDecideOn] = useState<{ id: number; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [comments, setComments] = useState("");

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("workflow/my-pending"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setPending(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const decide = async () => {
    if (!decideOn) return;
    try {
      const res = await fetch(buildApiUrl(`workflow/approvals/${decideOn.id}/decide`), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decideOn.decision, comments }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg(`Decisión registrada: ${decideOn.decision === "APPROVED" ? "Aprobado ✅" : "Rechazado ❌"}`);
      setDecideOn(null);
      setComments("");
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🛡️ Mis aprobaciones pendientes</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Solicitudes que requieren tu decisión como aprobador en algún flujo del ERP.
      </p>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 8, marginTop: 12 }}>{msg}</div>}

      {loading ? <p>Cargando…</p> : pending.length === 0 ? (
        <div style={{ marginTop: 24, padding: 32, background: "var(--bg-secondary)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>No tienes aprobaciones pendientes.</p>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {pending.map((p) => (
            <div key={p.id} style={{ padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderLeft: "4px solid #f59e0b", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {p.instance.workflow.entityType} #{p.instance.entityId}
                  </div>
                  <strong style={{ fontSize: 16 }}>{p.instance.workflow.name}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                    Paso {p.step.stepNumber}: <strong>{p.step.name}</strong>
                    {p.step.description && <span> — {p.step.description}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                    Solicitado por <strong>{p.instance.startedBy.nombre}</strong> · {new Date(p.createdAt).toLocaleString("es-MX")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignSelf: "flex-start" }}>
                  <button type="button" onClick={() => setDecideOn({ id: p.id, decision: "APPROVED" })} style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>✓ Aprobar</button>
                  <button type="button" onClick={() => setDecideOn({ id: p.id, decision: "REJECTED" })} style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>✗ Rechazar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {decideOn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDecideOn(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-primary)", padding: 24, borderRadius: 12, maxWidth: 480, width: "92%" }}>
            <h3 style={{ marginTop: 0 }}>
              {decideOn.decision === "APPROVED" ? "✅ Aprobar solicitud" : "❌ Rechazar solicitud"}
            </h3>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Comentarios {decideOn.decision === "REJECTED" ? "(motivo del rechazo)" : "(opcional)"}
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} style={{ display: "block", width: "100%", minHeight: 80, marginTop: 6, padding: 8, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-primary)", color: "var(--text-primary)" }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDecideOn(null)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>Cancelar</button>
              <button type="button" onClick={decide} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: decideOn.decision === "APPROVED" ? "#16a34a" : "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
