"use client";

import { useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Aprobaciones jerárquicas: el flujo va de OPERATIVE → SPECIALIST → MANAGER →
 * DIRECTOR → EXECUTIVE según monto y tipo. Esta página muestra la bandeja
 * con todo lo que requiere tu intervención según tu nivel.
 */

type Approval = {
  id: string;
  type: "Compra" | "Viáticos" | "Descuento" | "Contratación" | "Vacaciones";
  titulo: string;
  detalle: string;
  monto?: string;
  solicita: string;
  solicitaRol: string;
  pasos: { rol: string; estado: "Aprobado" | "Pendiente" | "En espera"; quien?: string; fecha?: string }[];
  prioridad: "Alta" | "Media" | "Baja";
  fechaSolicitud: string;
};

const APPROVALS: Approval[] = [
  {
    id: "AP-1042",
    type: "Compra",
    titulo: "OC #4892 · 24 cámaras Hikvision DS-2CD2143G2-I + bracket",
    detalle: "Proyecto Polos del Bienestar · Polo 4 (Iztacalco). Stock comprometido contra OT-3423.",
    monto: "$ 84,200 MXN",
    solicita: "Israel Ramos",
    solicitaRol: "Ingeniero de Campo",
    pasos: [
      { rol: "Jefe de Almacén", estado: "Aprobado", quien: "Carolina J.", fecha: "Ayer 16:20" },
      { rol: "Coordinador de Compras", estado: "Aprobado", quien: "Karen E. (Director Admin)", fecha: "Hoy 09:14" },
      { rol: "Director Administrativo", estado: "Pendiente" },
      { rol: "CEO (si > $250k)", estado: "En espera" },
    ],
    prioridad: "Alta",
    fechaSolicitud: "Ayer 14:32",
  },
  {
    id: "AP-1043",
    type: "Viáticos",
    titulo: "Visita Soriana Querétaro · 4 ingenieros, 3 días",
    detalle: "Mantenimiento mensual POS + auditoría cámaras. 1,200 km redondos.",
    monto: "$ 18,400 MXN",
    solicita: "Alejandro Gonzales",
    solicitaRol: "Jefe de Proyectos",
    pasos: [
      { rol: "Director Operativo", estado: "Aprobado", quien: "Luis A.", fecha: "Hoy 08:45" },
      { rol: "Director Administrativo", estado: "Pendiente" },
    ],
    prioridad: "Media",
    fechaSolicitud: "Hoy 07:20",
  },
  {
    id: "AP-1044",
    type: "Descuento",
    titulo: "Descuento 22% · Cotización Universidad UDLA Cholula",
    detalle: "120 laptops Lenovo ThinkPad + 40 monitores 27\". Pago contra entrega.",
    monto: "$ 412,000 MXN",
    solicita: "Karina Martínez",
    solicitaRol: "Ejecutivo de Ventas",
    pasos: [
      { rol: "Gerente de Ventas", estado: "Aprobado", quien: "(autoaprobado por nivel)", fecha: "Hoy 10:02" },
      { rol: "Director Comercial / Admin", estado: "Aprobado", quien: "Karen E.", fecha: "Hoy 10:48" },
      { rol: "CEO (descuento > 20%)", estado: "Pendiente" },
    ],
    prioridad: "Alta",
    fechaSolicitud: "Hoy 09:55",
  },
  {
    id: "AP-1045",
    type: "Contratación",
    titulo: "Vacante · Ingeniero CCTV junior · Puebla",
    detalle: "Refuerzo para contratos de mantenimiento. Inicio sugerido: lunes próximo.",
    solicita: "Carolina Juárez",
    solicitaRol: "Ingeniero Senior",
    pasos: [
      { rol: "Especialista RRHH", estado: "Aprobado", quien: "Karen E. (interim)", fecha: "Ayer 18:10" },
      { rol: "Director Operativo", estado: "Pendiente" },
    ],
    prioridad: "Baja",
    fechaSolicitud: "Ayer 17:30",
  },
];

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<"all" | "Alta" | "Media" | "Baja">("all");

  const list = filter === "all" ? APPROVALS : APPROVALS.filter((a) => a.prioridad === filter);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno corporativo"
        title="Aprobaciones jerárquicas"
        subtitle="Flujo automático por nivel: cada solicitud pasa por su cadena de aprobadores. Tú ves solo lo que requiere tu firma."
        actions={
          <Button variant="secondary" iconLeft="🛠️">
            Definir flujos
          </Button>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {(["all", "Alta", "Media", "Baja"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilter(p)}
            style={{
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              borderRadius: 999,
              border: filter === p ? "1px solid var(--primary)" : "1px solid var(--border)",
              background: filter === p ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
              color: filter === p ? "var(--primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {p === "all" ? "Todas" : p}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Bandeja limpia"
          description="No hay aprobaciones pendientes que requieran tu atención. Buen trabajo."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {list.map((a) => (
            <article
              key={a.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 18,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
                gap: 20,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--primary)",
                      color: "#fff",
                      fontFamily: "var(--nx-font-display)",
                    }}
                  >
                    {a.id}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {a.type}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background:
                        a.prioridad === "Alta"
                          ? "var(--state-danger-bg)"
                          : a.prioridad === "Media"
                            ? "var(--state-warning-bg)"
                            : "var(--surface-2)",
                      color:
                        a.prioridad === "Alta"
                          ? "var(--state-danger-text)"
                          : a.prioridad === "Media"
                            ? "var(--state-warning-text)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {a.prioridad}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {a.fechaSolicitud}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "var(--nx-font-display)",
                    lineHeight: 1.3,
                  }}
                >
                  {a.titulo}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    margin: "6px 0 12px",
                    lineHeight: 1.5,
                  }}
                >
                  {a.detalle}
                </p>

                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  {a.monto && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                        Monto
                      </div>
                      <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 18 }}>
                        {a.monto}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
                      Solicita
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {a.solicita}{" "}
                      <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                        · {a.solicitaRol}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <Button variant="primary" iconLeft="✓">
                    Aprobar
                  </Button>
                  <Button variant="secondary" iconLeft="💬">
                    Pedir más info
                  </Button>
                  <Button variant="ghost" iconLeft="✕" style={{ color: "var(--danger)" }}>
                    Rechazar
                  </Button>
                </div>
              </div>

              <div
                style={{
                  background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-tertiary)",
                    marginBottom: 12,
                  }}
                >
                  Cadena de aprobación
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
                  {a.pasos.map((paso, idx) => {
                    const color =
                      paso.estado === "Aprobado"
                        ? "var(--success)"
                        : paso.estado === "Pendiente"
                          ? "var(--warning)"
                          : "var(--text-tertiary)";
                    return (
                      <li
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px 1fr",
                          gap: 12,
                          padding: "8px 0",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            display: "flex",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background: paso.estado === "Aprobado" ? color : "transparent",
                              border: `2px solid ${color}`,
                              zIndex: 2,
                              marginTop: 4,
                            }}
                          />
                          {idx < a.pasos.length - 1 && (
                            <span
                              style={{
                                position: "absolute",
                                top: 16,
                                bottom: -4,
                                width: 2,
                                background:
                                  paso.estado === "Aprobado"
                                    ? "var(--success)"
                                    : "var(--border)",
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            {paso.rol}
                          </div>
                          <div style={{ fontSize: 11, color }}>
                            {paso.estado}
                            {paso.quien && ` · ${paso.quien}`}
                            {paso.fecha && ` · ${paso.fecha}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
