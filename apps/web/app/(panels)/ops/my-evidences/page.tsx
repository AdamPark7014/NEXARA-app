"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

type Evidence = {
  id: string;
  ot: string;
  cliente: string;
  tipo: "Foto antes" | "Foto después" | "Hoja de servicio" | "Firma" | "Video" | "Acta";
  capturada: string;
  estado: "Sincronizada" | "Pendiente" | "Rechazada";
  notas?: string;
};

const EVIDENCES: Evidence[] = [
  { id: "E-9821", ot: "OT-3421", cliente: "TOKS Centro", tipo: "Foto antes", capturada: "Hoy 09:05", estado: "Sincronizada" },
  { id: "E-9822", ot: "OT-3421", cliente: "TOKS Centro", tipo: "Foto después", capturada: "Hoy 10:48", estado: "Sincronizada" },
  { id: "E-9823", ot: "OT-3421", cliente: "TOKS Centro", tipo: "Hoja de servicio", capturada: "Hoy 10:55", estado: "Sincronizada" },
  { id: "E-9824", ot: "OT-3421", cliente: "TOKS Centro", tipo: "Firma", capturada: "Hoy 11:00", estado: "Sincronizada" },
  { id: "E-9825", ot: "OT-3422", cliente: "Soriana Plaza Reforma", tipo: "Foto antes", capturada: "Hoy 12:10", estado: "Sincronizada" },
  { id: "E-9826", ot: "OT-3422", cliente: "Soriana Plaza Reforma", tipo: "Video", capturada: "Hoy 13:22", estado: "Pendiente", notas: "Sin red, esperando WiFi" },
  { id: "E-9827", ot: "OT-3418", cliente: "Constructora Reyes", tipo: "Hoja de servicio", capturada: "Ayer 16:20", estado: "Rechazada", notas: "Faltan datos del POS-7" },
];

export default function MyEvidencesPage() {
  const pendientes = EVIDENCES.filter((e) => e.estado === "Pendiente").length;
  const rechazadas = EVIDENCES.filter((e) => e.estado === "Rechazada").length;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="Mis evidencias"
        subtitle="Fotos, videos, hojas de servicio y firmas capturadas en mis OT."
        actions={
          <>
            <Button variant="secondary" iconLeft="🔄">
              Sincronizar
            </Button>
            <Button variant="primary" iconLeft="📸">
              Capturar nueva
            </Button>
          </>
        }
      />

      {(pendientes > 0 || rechazadas > 0) && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 18,
            padding: 14,
            background: "color-mix(in srgb, var(--warning) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
              Tienes pendientes
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {pendientes} evidencias sin sincronizar · {rechazadas} rechazadas por revisar
            </div>
          </div>
        </div>
      )}

      <Section title="Capturas recientes" subtitle="Las últimas 48 horas">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {EVIDENCES.map((e) => (
            <article
              key={e.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 120,
                  background:
                    e.tipo === "Foto antes" || e.tipo === "Foto después"
                      ? "linear-gradient(135deg, #1e293b, #475569)"
                      : e.tipo === "Video"
                        ? "linear-gradient(135deg, #581c87, #7c3aed)"
                        : "linear-gradient(135deg, #064e3b, #047857)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                  color: "white",
                  position: "relative",
                }}
              >
                {e.tipo.startsWith("Foto") ? "📸" : e.tipo === "Video" ? "🎥" : e.tipo === "Firma" ? "✍️" : "📄"}
                <div style={{ position: "absolute", top: 8, right: 8 }}>
                  <Tag
                    variant={
                      e.estado === "Sincronizada"
                        ? "positive"
                        : e.estado === "Pendiente"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {e.estado}
                  </Tag>
                </div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>
                  {e.tipo}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {e.ot} · {e.cliente}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {e.capturada}
                </div>
                {e.notas && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 8px",
                      fontSize: 11,
                      background: "color-mix(in srgb, var(--surface-2) 60%, transparent)",
                      borderRadius: 6,
                      color: "var(--text-secondary)",
                      fontStyle: "italic",
                    }}
                  >
                    {e.notas}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
