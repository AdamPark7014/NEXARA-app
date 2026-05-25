"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import {
  addTenderDocument,
  getTender,
  promoteTenderToOpportunity,
  setTenderStatus,
  TENDER_STATUS_COLOR,
  TENDER_STATUS_LABEL,
  TENDER_TYPE_LABEL,
  type Tender,
  type TenderStatus,
} from "@/lib/tenders-api";

const DOC_TYPES = [
  "CONVOCATORIA",
  "BASES",
  "ANEXO_TECNICO",
  "PROPUESTA_TECNICA",
  "PROPUESTA_ECONOMICA",
  "ACTA_PRESENTACION",
  "FALLO",
  "CONTRATO",
  "GARANTIA",
  "OTRO",
];

const fmt = (n: number | string | undefined) =>
  `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default function TenderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const tenderId = Number(id);
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newDoc, setNewDoc] = useState({ documentType: "BASES", name: "", url: "", notes: "" });

  const refresh = useCallback(async () => {
    if (!user?.token || !tenderId) return;
    setLoading(true);
    try {
      const data = await getTender(user.token, tenderId);
      setTender(data);
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [user?.token, tenderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStatus = async (status: TenderStatus) => {
    if (!tender) return;
    try {
      await setTenderStatus(user?.token || "", tender.id, status);
      if (status === "AWARDED") {
        const opp = await promoteTenderToOpportunity(user?.token || "", tender.id);
        setMsg({ kind: "ok", text: `Adjudicada — oportunidad #${opp.id} creada` });
      } else {
        setMsg({ kind: "ok", text: "Estado actualizado" });
      }
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
  };

  const handleAddDoc = async () => {
    if (!tender) return;
    if (!newDoc.name) {
      setMsg({ kind: "err", text: "Nombre del documento es obligatorio" });
      return;
    }
    try {
      await addTenderDocument(user?.token || "", tender.id, newDoc);
      setNewDoc({ documentType: "BASES", name: "", url: "", notes: "" });
      setMsg({ kind: "ok", text: "Documento agregado" });
      await refresh();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    }
  };

  if (loading && !tender) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (!tender) return <div style={{ padding: 24, color: "#b91c1c" }}>{msg?.text || "Licitación no encontrada"}</div>;

  const expectedMargin = Number(tender.expectedMargin);
  const marginPct = Number(tender.ourBidAmount) > 0
    ? (expectedMargin / Number(tender.ourBidAmount)) * 100
    : 0;

  return (
    <div style={{ padding: 24, maxWidth: 1180, margin: "0 auto" }}>
      <button
        type="button"
        onClick={() => router.push("/licitaciones")}
        style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", marginBottom: 12 }}
      >
        ← Volver a licitaciones
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>{tender.tenderNumber}</h1>
          <h2 style={{ margin: "4px 0", fontWeight: 500, color: "var(--text-secondary)" }}>{tender.title}</h2>
          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge color={TENDER_STATUS_COLOR[tender.status]}>{TENDER_STATUS_LABEL[tender.status]}</Badge>
            <Badge color="#6b7280">{TENDER_TYPE_LABEL[tender.tenderType]}</Badge>
            {tender.opportunity && (
              <Link href={`/oportunidades?id=${tender.opportunity.id}`} style={{ textDecoration: "none" }}>
                <Badge color="#16a34a">Oportunidad #{tender.opportunity.id}</Badge>
              </Link>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tender.status !== "AWARDED" && tender.status !== "LOST" && (
            <>
              <button type="button" className="button-primary" onClick={() => handleStatus("AWARDED")}>
                ✅ Marcar adjudicada
              </button>
              <button type="button" onClick={() => handleStatus("LOST")} style={btnGhost}>
                ❌ Marcar perdida
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: msg.kind === "ok" ? "#dcfce7" : "#fee2e2", color: msg.kind === "ok" ? "#166534" : "#991b1b" }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        <Kpi label="Presupuesto techo" value={fmt(tender.budgetCeiling)} color="#6b7280" />
        <Kpi label="Nuestra propuesta" value={fmt(tender.ourBidAmount)} color="#3b82f6" />
        <Kpi label="Costo estimado" value={fmt(tender.estimatedCost)} color="#f59e0b" />
        <Kpi
          label={`Margen esperado (${marginPct.toFixed(1)}%)`}
          value={fmt(tender.expectedMargin)}
          color={expectedMargin >= 0 ? "#16a34a" : "#dc2626"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Información general</h3>
          <Row label="Entidad convocante" value={tender.conveningEntity} />
          <Row label="Contacto" value={tender.conveningContact || "—"} />
          <Row label="Email" value={tender.conveningEmail || "—"} />
          <Row label="Teléfono" value={tender.conveningPhone || "—"} />
          <Row label="Referencia externa" value={tender.externalReference || "—"} />
          {tender.publicationUrl && (
            <Row label="Publicación" value={<a href={tender.publicationUrl} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{tender.publicationUrl}</a>} />
          )}
          {tender.description && <Row label="Descripción" value={tender.description} />}
          {tender.scope && <Row label="Alcance" value={tender.scope} />}
          {tender.technicalRequirements && <Row label="Req. técnicos" value={tender.technicalRequirements} />}
          {tender.legalRequirements && <Row label="Req. legales" value={tender.legalRequirements} />}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Fechas clave</h3>
          <Row label="Publicación" value={fmtDate(tender.publishDate)} />
          <Row label="Cierre preguntas" value={fmtDateTime(tender.questionsDeadline)} />
          <Row label="Cierre propuestas" value={fmtDateTime(tender.submissionDeadline)} />
          <Row label="Apertura" value={fmtDateTime(tender.openingDate)} />
          <Row label="Fallo / adjudicación" value={fmtDateTime(tender.awardDate)} />
          <Row label="Inicio contrato" value={fmtDate(tender.contractStartDate)} />
          <Row label="Fin contrato" value={fmtDate(tender.contractEndDate)} />
          <Row label="Garantía" value={fmt(tender.guaranteeAmount)} />
        </div>
      </div>

      {/* Documentos */}
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>📄 Documentos ({tender.documents?.length || 0})</h3>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <Field label="Tipo">
            <select value={newDoc.documentType} onChange={(e) => setNewDoc({ ...newDoc, documentType: e.target.value })} style={inputStyle}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Nombre">
            <input style={inputStyle} value={newDoc.name} onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })} />
          </Field>
          <Field label="URL">
            <input style={inputStyle} value={newDoc.url} onChange={(e) => setNewDoc({ ...newDoc, url: e.target.value })} />
          </Field>
          <Field label="Notas">
            <input style={inputStyle} value={newDoc.notes} onChange={(e) => setNewDoc({ ...newDoc, notes: e.target.value })} />
          </Field>
          <button type="button" className="button-primary" onClick={handleAddDoc}>+ Agregar</button>
        </div>

        {tender.documents && tender.documents.length > 0 && (
          <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Nombre</Th>
                <Th>URL</Th>
                <Th>Fecha</Th>
              </tr>
            </thead>
            <tbody>
              {tender.documents.map((d) => (
                <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>{d.documentType.replace(/_/g, " ")}</Td>
                  <Td>{d.name}</Td>
                  <Td>{d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Abrir</a> : "—"}</Td>
                  <Td><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{new Date(d.createdAt).toLocaleDateString("es-MX")}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {tender.events && tender.events.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>📅 Bitácora</h3>
          <ul style={{ paddingLeft: 16 }}>
            {tender.events.map((e) => (
              <li key={e.id}>
                <strong>{new Date(e.occursAt).toLocaleString("es-MX")}</strong> — {e.eventName}
                {e.description && <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>· {e.description}</span>}
              </li>
            ))}
          </ul>
        </div>
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

const btnGhost: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  background: "transparent",
  border: "1px solid var(--border)",
  cursor: "pointer",
};

function fmtDate(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("es-MX") : "—";
}
function fmtDateTime(v?: string | null) {
  return v ? new Date(v).toLocaleString("es-MX") : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>{label}{children}</label>;
}
function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: 12, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12, borderBottom: "1px solid var(--border)" }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: 8, fontSize: 13, ...style }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 10px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
