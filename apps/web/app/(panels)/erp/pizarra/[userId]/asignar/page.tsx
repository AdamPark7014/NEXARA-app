"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import type { ActivityProjectMode } from "@/lib/ops-activity-form";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), { ssr: false });

type AssignKind = "tarea" | "proyecto";

export default function AsignarActividadPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const userId = Number(params?.userId);
  const [kind, setKind] = useState<AssignKind | null>(null);

  const forcedMode: ActivityProjectMode | undefined = useMemo(() => {
    if (kind === "tarea") return "without_project";
    if (kind === "proyecto") return "with_project";
    return undefined;
  }, [kind]);

  const canAssign =
    Boolean(user) &&
    (user?.moduleAccess?.["activities-daily"] !== "off" ||
      user?.moduleAccess?.["activities-projects"] !== "off" ||
      !user?.moduleAccess);

  if (!Number.isFinite(userId)) {
    return <p style={{ color: "#dc2626" }}>Persona no válida.</p>;
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <button
        type="button"
        onClick={() => router.push(`/erp/pizarra/${userId}`)}
        style={{
          alignSelf: "flex-start",
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: 650,
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        ← Volver al perfil
      </button>

      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Asignar actividad
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Elige el tipo; los campos cambian según Tarea o Proyecto.
        </p>
      </header>

      {!canAssign ? (
        <p style={{ color: "var(--text-secondary)" }}>No tienes permiso para asignar.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(
              [
                {
                  id: "tarea" as const,
                  title: "Tarea",
                  help: "Del día, sin proyecto ni cliente de servicio.",
                },
                {
                  id: "proyecto" as const,
                  title: "Proyecto",
                  help: "Liga a un proyecto operativo y su cliente.",
                },
              ] as const
            ).map((opt) => {
              const selected = kind === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setKind(opt.id)}
                  style={{
                    textAlign: "left",
                    padding: "16px 14px",
                    borderRadius: 14,
                    border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: selected
                      ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                      : "var(--surface)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{opt.title}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {opt.help}
                  </div>
                </button>
              );
            })}
          </div>

          {kind && forcedMode ? (
            <div
              style={{
                marginTop: 4,
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                Datos de la {kind === "tarea" ? "tarea" : "actividad de proyecto"}
              </div>
              <OpsActivityForm
                initialResponsableId={userId}
                forcedProjectMode={forcedMode}
                hideProjectModePicker
                onCancel={() => router.push(`/erp/pizarra/${userId}`)}
                onSuccess={() => router.push(`/erp/pizarra/${userId}`)}
              />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Selecciona Tarea o Proyecto para continuar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
