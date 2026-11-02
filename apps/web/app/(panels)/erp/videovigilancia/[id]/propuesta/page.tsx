"use client";

/** Videovigilancia · propuesta del diseño en hojas carta para descargar en PDF. */
import { useMemo } from "react";
import { useParams } from "next/navigation";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { ButtonLink, EmptyState, Skeleton } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { planoVacio } from "@/lib/cctv/plano";
import { useCatalogo } from "@/lib/cctv/useCatalogo";
import { planoDeDiseno, useCalculoDiseno } from "../../_editor/calculo";
import Propuesta from "../../_editor/Propuesta";
import { useDiseno } from "../../_editor/useDiseno";

export default function PropuestaPage() {
  const params = useParams<{ id: string }>();
  const { token } = useUser();
  const { diseno, error } = useDiseno(Number(params?.id));
  // Antes de la foto de la maqueta: los modelos agregados deciden cómo se ve cada equipo.
  const catalogo = useCatalogo(token);
  const plano = useMemo(() => (diseno ? planoDeDiseno(diseno) : planoVacio()), [diseno]);
  const calculo = useCalculoDiseno(plano, diseno?.grabacion);

  if (error) {
    return (
      <div style={{ padding: "var(--ui-s6) var(--ui-s5)" }}>
        <EmptyState icon={<VideocamOutlinedIcon />} title="No se pudo armar la propuesta" description={error} tone="neutral" action={<ButtonLink href="/erp/videovigilancia">Volver a la lista</ButtonLink>} />
      </div>
    );
  }
  if (!diseno || catalogo.cargando) {
    return (
      <div style={{ padding: "var(--ui-s5)", display: "grid", gap: "var(--ui-s4)", maxWidth: "8.5in", margin: "0 auto" }}>
        <Skeleton height={48} />
        <Skeleton height={900} />
      </div>
    );
  }
  return (
    <Propuesta
      disenoId={diseno.id}
      nombre={diseno.nombre}
      cliente={diseno.clienteNombre}
      niveles={calculo.niveles}
      resumen={calculo.resumen}
      grabacion={diseno.grabacion}
      planoTecnico={{ raiz: plano, elaboro: diseno.creadoPor?.nombre ?? null, fecha: diseno.updatedAt, version: diseno.version }}
    />
  );
}
