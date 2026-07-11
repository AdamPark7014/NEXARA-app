"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { buildApiUrl } from "@/lib/api-base";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import KpiCard from "@/components/ui/KpiCard";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";
import { useUser } from "@/components/UserContext";

function assetUrl(path: string) {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return buildApiUrl(clean);
}

export default function OpportunityAttachmentsPage() {
  const { opportunity, error, reload, id } = useOpportunityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const files = opportunity.evidences ?? [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length || !token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      for (const file of selected) formData.append("files", file);
      const res = await fetch(buildApiUrl(`ventas/oportunidades/${id}/evidencias`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
    {files.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Total archivos" value={files.length} icon="📎" />
        <KpiCard label="PDFs" value={files.filter((f) => f.kind === "pdf").length} icon="📑" variant={files.some((f) => f.kind === "pdf") ? "accent" : "default"} />
        <KpiCard label="Imágenes" value={files.filter((f) => f.kind === "image").length} icon="🖼️" variant={files.some((f) => f.kind === "image") ? "positive" : "default"} />
        <KpiCard label="Otros" value={files.filter((f) => f.kind !== "pdf" && f.kind !== "image").length} icon="📄" />
      </div>
    )}
    {files.length > 1 && (() => {
      const pdfs = files.filter((f) => f.kind === "pdf").length;
      const imgs = files.filter((f) => f.kind === "image").length;
      const otros = files.length - pdfs - imgs;
      const total = files.length;
      return (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por tipo de archivo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {([
              { label: "PDFs", count: pdfs, color: "var(--danger)" },
              { label: "Imágenes", count: imgs, color: "var(--primary)" },
              { label: "Otros", count: otros, color: "var(--text-tertiary)" },
            ] as { label: string; count: number; color: string }[]).filter((r) => r.count > 0).map((r) => (
              <div key={r.label} style={{ display: "grid", gridTemplateColumns: "80px 1fr 36px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
    <DetailSection title="Adjuntos y evidencias">
      {/* Upload area */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
          padding: "14px 16px",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          background: "color-mix(in srgb, var(--surface-2) 40%, transparent)",
        }}
      >
        <span style={{ fontSize: 22 }}>📎</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Subir archivos</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>PDF o imagenes (JPG, PNG). Maximo 15 archivos.</div>
          {uploadError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>{uploadError}</div>}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          style={{ display: "none" }}
          onChange={(e) => void handleUpload(e)}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Subiendo…" : "Seleccionar"}
        </Button>
      </div>

      {/* Files list */}
      {files.length === 0 ? (
        <EmptyState icon="📂" title="Sin archivos" description="Sube el primer PDF o imagen usando el boton de arriba." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {files.map((f) => (
            <li
              key={f.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{f.fileName || `Archivo #${f.id}`}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {f.kind === "pdf" ? "PDF" : f.kind === "image" ? "Imagen" : f.kind || "documento"}
                </div>
              </div>
              <a
                href={assetUrl(f.fileUrl)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}
              >
                Abrir
              </a>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
    </>
  );
}
