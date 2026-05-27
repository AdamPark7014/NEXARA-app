"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";

type Tech = {
  id: string;
  nombre: string;
  vehiculo: string;
  estado: "En ruta" | "En sitio" | "Disponible" | "Almuerzo" | "Offline";
  sitioActual: string;
  proximaOT: string;
  bateria: number;
  ultimoPing: string;
  km: number;
};

const TECHS: Tech[] = [
  { id: "T-01", nombre: "Brandon C.", vehiculo: "Camioneta 03 · NRZ-887", estado: "En sitio", sitioActual: "Soriana Plaza Reforma, Puebla", proximaOT: "OT-3425 · 16:30", bateria: 78, ultimoPing: "Hace 1 min", km: 42 },
  { id: "T-02", nombre: "Ronaldo H.", vehiculo: "Camioneta 01 · NRZ-203", estado: "En ruta", sitioActual: "Camino a UDLA Cholula", proximaOT: "OT-3426 · Mañana 08:00", bateria: 64, ultimoPing: "Hace 3 min", km: 18 },
  { id: "T-03", nombre: "Sandra L.", vehiculo: "Sin asignar", estado: "Disponible", sitioActual: "Base CEDIS", proximaOT: "Sin OT", bateria: 92, ultimoPing: "Hace 1 min", km: 0 },
  { id: "T-04", nombre: "Eduardo M.", vehiculo: "Camioneta 02 · NRZ-455", estado: "Almuerzo", sitioActual: "Cerca de Centro Histórico CDMX", proximaOT: "OT-3429 · 15:00", bateria: 45, ultimoPing: "Hace 8 min", km: 67 },
];

export default function GpsPage() {
  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="GPS y telemetría en vivo"
        subtitle="Mapa en tiempo real de ingenieros, vehículos y trayectos. Útil para auditoría de almuerzos y eficiencia de ruta."
        actions={
          <>
            <Button variant="secondary" iconLeft="🔄">Refrescar</Button>
            <Button variant="primary" iconLeft="📍">Centrar todos</Button>
          </>
        }
      />

      <Section
        title="Mapa de campo"
        subtitle="Vista geográfica (próxima integración con Google Maps)"
      >
        <div
          style={{
            height: 320,
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 48 }}>🗺️</div>
          <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 16 }}>
            Mapa en vivo
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Pings recibidos cada 30s · 4 unidades activas
          </div>
        </div>
      </Section>

      <Section title="Estado de ingenieros" subtitle="Telemetría individual">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {TECHS.map((t) => (
            <article
              key={t.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>
                    {t.nombre}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {t.vehiculo}
                  </div>
                </div>
                <Tag
                  variant={
                    t.estado === "En sitio" ? "positive"
                      : t.estado === "En ruta" ? "accent"
                        : t.estado === "Disponible" ? "neutral"
                          : t.estado === "Almuerzo" ? "warning"
                            : "danger"
                  }
                >
                  {t.estado}
                </Tag>
              </div>

              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 }}>
                📍 {t.sitioActual}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                <span>🔋 {t.bateria}%</span>
                <span>📡 {t.ultimoPing}</span>
                <span>🛣️ {t.km}km hoy</span>
              </div>

              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
                <span style={{ color: "var(--text-tertiary)" }}>Siguiente:</span>{" "}
                <span style={{ fontWeight: 600 }}>{t.proximaOT}</span>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
