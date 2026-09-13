"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  ACTIVITY_KINDS,
  isAreaManagerEmail,
  kindsForAssignment,
  metaForKind,
  type ActivityKind,
} from "@/lib/activity-kinds";
import { resolveV2RoleKey } from "@/lib/user-access";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), { ssr: false });

/** Encargados de área: auto-asignarse una actividad (solo a sí mismos, ejecución directa). */
export default function AutoAsignarmePage() {
  const router = useRouter();
  const { user } = useUser();
  const [kind, setKind] = useState<ActivityKind | null>(null);

  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  const allowedKinds = useMemo(
    () =>
      kindsForAssignment({
        creatorEmail: user?.email,
        targetEmail: user?.email,
        v2Role: v2,
        isSuperAdmin: user?.isSuperAdmin,
      }),
    [user?.email, user?.isSuperAdmin, v2],
  );

  useEffect(() => {
    if (allowedKinds.length === 1) setKind(allowedKinds[0]);
    else if (kind && !allowedKinds.includes(kind)) setKind(null);
  }, [allowedKinds, kind]);

  const back = () => router.push("/erp/mis-actividades");

  if (!user) {
    return <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>;
  }

  if (!isAreaManagerEmail(user.email)) {
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Auto-asignarse</h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Solo los encargados de área pueden auto-asignarse actividades. Tu encargado te las asigna.
        </p>
        <Link href="/erp/mis-actividades" style={{ color: "var(--primary)", fontWeight: 700 }}>
          ← Volver a Mis actividades
        </Link>
      </div>
    );
  }

  const kindMeta = kind ? metaForKind(kind) : null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={back}
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
        ← Volver a Mis actividades
      </button>

      <header
        style={{
          padding: 18,
          borderRadius: 20,
          border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--primary) 6%, var(--surface))",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
          🙋 Auto-asignarme una actividad
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
          Queda solo a tu nombre, como ejecución directa. Ponle día, hora y cuánto te va a tomar; después la acomodas
          en tu cola.
        </p>
      </header>

      <section>
        <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
          1 · ¿Qué tipo de actividad es?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {allowedKinds.map((id) => {
            const opt = ACTIVITY_KINDS[id];
            const selected = kind === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                style={{
                  textAlign: "left",
                  padding: "14px 12px",
                  borderRadius: 16,
                  border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: selected ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  minHeight: 100,
                }}
              >
                <div style={{ fontSize: 22 }}>{opt.emoji}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 14 }}>{opt.title}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.35 }}>
                  {opt.help}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {kindMeta && kind ? (
        <section
          style={{ padding: 16, borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 12, color: "var(--text-secondary)" }}>
            2 · {kindMeta.emoji} {kindMeta.title} · para ti
          </div>
          <OpsActivityForm
            key={kind}
            tone="core"
            coreKind={kind}
            assignmentCharge="ejecucion"
            selfAssign
            initialResponsableId={Number(user.id)}
            hideResponsableSelect
            forcedProjectMode={kindMeta.projectMode}
            hideProjectModePicker
            forcedTicketType={kindMeta.ticketType}
            forcedTicketTypeCustom={kindMeta.ticketTypeCustom}
            requireSchedule={Boolean(kindMeta.requiresSchedule)}
            onCancel={back}
            onSuccess={(id) => router.push(`/erp/mis-actividades?nueva=${id}`)}
          />
        </section>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Elige un tipo para continuar.</p>
      )}
    </div>
  );
}
