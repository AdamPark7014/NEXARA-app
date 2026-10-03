"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";
import { FormSection, PageHead, SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import {
  ACTIVITY_KINDS,
  kindsForAssignment,
  metaForKind,
  type ActivityKind,
} from "@/lib/activity-kinds";
import { resolveV2RoleKey } from "@/lib/user-access";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { OpcionTarjeta, RejillaOpciones } from "@/components/pizarra/Opciones";
import s from "./nueva.module.css";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), {
  ssr: false,
  loading: () => <SkeletonRows rows={3} label="Cargando formulario" />,
});

/** Cualquier persona del equipo: auto-asignarse una actividad (solo a sí misma, ejecución directa). */
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

  const back = () => router.push("/erp/pizarra?vista=mias");

  if (!user) {
    return (
      <div className={s.pagina}>
        <SkeletonRows rows={4} label="Cargando" />
      </div>
    );
  }

  const kindMeta = kind ? metaForKind(kind) : null;

  return (
    <div className={s.pagina}>
      <PageHead
        breadcrumbs={[
          { label: "Actividades", href: "/erp/pizarra" },
          { label: "Mis actividades", href: "/erp/pizarra?vista=mias" },
          { label: "Auto-asignarme" },
        ]}
        back={{ href: "/erp/pizarra?vista=mias", label: "Volver a Mis actividades" }}
        icon={<PanToolOutlinedIcon />}
        title="Auto-asignarme una actividad"
        description="Queda solo a tu nombre, como ejecución directa. Ponle día, hora y cuánto te va a tomar; después la acomodas en tu cola."
      />

      <div className={s.pasos}>
        <FormSection step={1} done={Boolean(kind)} title="¿Qué tipo de actividad es?">
          <RejillaOpciones ariaLabel="Tipo de actividad">
            {allowedKinds.map((id) => {
              const opt = ACTIVITY_KINDS[id];
              return (
                <OpcionTarjeta
                  key={id}
                  selected={kind === id}
                  onClick={() => setKind(id)}
                  icon={<ActivityKindIcon kind={opt.icon} variant="badge" size={36} />}
                  title={opt.title}
                  help={opt.help}
                />
              );
            })}
          </RejillaOpciones>
        </FormSection>

        {kindMeta && kind ? (
          <FormSection
            step={2}
            title={
              <span className={s.titulo}>
                <ActivityKindIcon kind={kindMeta.icon} size={18} />
                <span>{kindMeta.title} · para ti</span>
              </span>
            }
            description="Título, lugar, día y hora. Al guardar vuelves a tu cola con la actividad resaltada."
          >
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
              onSuccess={(id) => router.push(`/erp/pizarra?vista=mias&nueva=${id}`)}
            />
          </FormSection>
        ) : (
          <p className={s.siguiente}>Elige un tipo para continuar.</p>
        )}
      </div>
    </div>
  );
}
