"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { addSalesOpportunityNote } from "@/lib/sales-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";

export default function OpportunityNotesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { opportunity, error, reload } = useOpportunityDetail();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const notes = opportunity.notes ?? [];

  const submit = async () => {
    if (!token || !message.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addSalesOpportunityNote(token, opportunity.id, message.trim());
      setMessage("");
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se pudo agregar la nota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailSection title="Notas de seguimiento">
      {saveError && <p role="alert" style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{saveError}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Registrar llamada, visita o acuerdo…"
          rows={3}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <Button variant="primary" onClick={() => void submit()} disabled={saving || !message.trim()}>
          {saving ? "Guardando…" : "Agregar"}
        </Button>
      </div>
      {notes.length === 0 ? (
        <EmptyState icon="📝" title="Sin notas" description="Registra el primer seguimiento de esta oportunidad." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {notes.map((n) => (
            <li
              key={n.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.55 }}>{n.message}</p>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{formatDateTime(n.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
