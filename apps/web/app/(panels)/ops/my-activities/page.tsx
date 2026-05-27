"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";

type Activity = {
  id: string;
  cliente: string;
  sitio: string;
  concepto: string;
  tipo: "Instalación" | "Mantenimiento" | "Correctivo" | "Auditoría";
  horaInicio: string;
  horaFin: string;
  estado: "Pendiente" | "En curso" | "Completada";
  evidenciasOk: number;
  evidenciasReq: number;
};

const MY_ACTIVITIES: Activity[] = [
  { id: "OT-3421", cliente: "TOKS Centro Histórico", sitio: "Av. 5 de Mayo 18, CDMX", concepto: "Cambio cabezal impresora térmica POS-3", tipo: "Correctivo", horaInicio: "09:00", horaFin: "11:00", estado: "Completada", evidenciasOk: 4, evidenciasReq: 4 },
  { id: "OT-3422", cliente: "Soriana Plaza Reforma", sitio: "Av. Juárez 50, Puebla", concepto: "Mantenimiento mensual POS x12 + cámaras pasillo", tipo: "Mantenimiento", horaInicio: "12:00", horaFin: "16:00", estado: "En curso", evidenciasOk: 3, evidenciasReq: 8 },
  { id: "OT-3425", cliente: "Familia Garza", sitio: "Calzada Zavaleta 100, Puebla", concepto: "Instalación 4 cámaras + NVR + cableado", tipo: "Instalación", horaInicio: "16:30", horaFin: "19:00", estado: "Pendiente", evidenciasOk: 0, evidenciasReq: 6 },
];

export default function MyActivitiesPage() {
  const [tab, setTab] = useState<"hoy" | "semana" | "todas">("hoy");

  const counts = {
    completadas: MY_ACTIVITIES.filter((a) => a.estado === "Completada").length,
    enCurso: MY_ACTIVITIES.filter((a) => a.estado === "En curso").length,
    pendientes: MY_ACTIVITIES.filter((a) => a.estado === "Pendiente").length,
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="Mis actividades de hoy"
        subtitle="Tu ruta del día. Sube evidencias y firma cada OT para cerrarla en tiempo."
        actions={
          <Button variant="primary" iconLeft="📍">
            Iniciar GPS
          </Button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { label: "OT del día", value: MY_ACTIVITIES.length, color: "var(--primary)", icon: "📋" },
          { label: "Completadas", value: counts.completadas, color: "var(--success)", icon: "✓" },
          { label: "En curso", value: counts.enCurso, color: "var(--warning)", icon: "⏳" },
          { label: "Pendientes", value: counts.pendientes, color: "var(--text-secondary)", icon: "○" },
        ].map((k) => (
          <div
            key={String(k.label)}
            style={{
              padding: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                {k.label}
              </div>
              <div style={{ marginTop: 4, fontFamily: "var(--nx-font-display)", fontSize: 28, fontWeight: 700, color: k.color, lineHeight: 1 }}>
                {k.value}
              </div>
            </div>
            <span style={{ fontSize: 24 }}>{k.icon}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["hoy", "semana", "todas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "7px 16px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 999,
              border: tab === t ? "1px solid var(--primary)" : "1px solid var(--border)",
              background: tab === t ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
              color: tab === t ? "var(--primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "hoy" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {MY_ACTIVITIES.map((a) => (
            <article
              key={a.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 18,
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 16,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  background:
                    a.estado === "Completada"
                      ? "color-mix(in srgb, var(--success) 14%, transparent)"
                      : a.estado === "En curso"
                        ? "color-mix(in srgb, var(--warning) 14%, transparent)"
                        : "var(--surface-2)",
                  color:
                    a.estado === "Completada"
                      ? "var(--success)"
                      : a.estado === "En curso"
                        ? "var(--warning)"
                        : "var(--text-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--nx-font-display)",
                  fontWeight: 700,
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.8 }}>HOY</div>
                <div style={{ fontSize: 16 }}>{a.horaInicio}</div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Tag variant="accent">{a.id}</Tag>
                  <Tag variant="neutral">{a.tipo}</Tag>
                  <Tag
                    variant={
                      a.estado === "Completada"
                        ? "positive"
                        : a.estado === "En curso"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {a.estado}
                  </Tag>
                </div>
                <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15.5 }}>
                  {a.cliente}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>
                  📍 {a.sitio}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-primary)", marginTop: 6 }}>
                  {a.concepto}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 10,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    ⏱ {a.horaInicio} – {a.horaFin}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color:
                        a.evidenciasOk === a.evidenciasReq
                          ? "var(--success)"
                          : a.evidenciasOk > 0
                            ? "var(--warning)"
                            : "var(--text-tertiary)",
                    }}
                  >
                    📸 Evidencias {a.evidenciasOk}/{a.evidenciasReq}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {a.estado === "Pendiente" && (
                  <Button variant="primary" iconLeft="▶">
                    Iniciar
                  </Button>
                )}
                {a.estado === "En curso" && (
                  <Button variant="primary" iconLeft="📸">
                    Subir evidencia
                  </Button>
                )}
                {a.estado === "Completada" && (
                  <Button variant="secondary" iconLeft="📄">
                    Ver hoja
                  </Button>
                )}
                <Button variant="ghost" iconLeft="🗺️" size="sm">
                  Ruta
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Section title="">
          <EmptyState
            icon="📅"
            title={tab === "semana" ? "Vista semanal" : "Histórico de actividades"}
            description="Próximamente verás aquí tu ruta de toda la semana o el histórico completo de tus OT."
          />
        </Section>
      )}
    </>
  );
}
