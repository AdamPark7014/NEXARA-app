"use client";

/** Videovigilancia · ficha de una cámara del diseño. */
import { useMemo } from "react";
import { useParams } from "next/navigation";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import { ButtonLink, EmptyState, Skeleton } from "@/components/base";
import { planoDeDiseno, useCalculoDiseno } from "../../../_editor/calculo";
import FichaCamara from "../../../_editor/FichaCamara";
import { useDiseno } from "../../../_editor/useDiseno";
import { planoVacio } from "@/lib/cctv/plano";

export default function FichaCamaraPage() {
  const params = useParams<{ id: string; camaraId: string }>();
  const id = Number(params?.id);
  const camaraId = decodeURIComponent(String(params?.camaraId ?? ""));
  const { diseno, error } = useDiseno(id);
  const plano = useMemo(() => (diseno ? planoDeDiseno(diseno) : planoVacio()), [diseno]);
  const calculo = useCalculoDiseno(plano, diseno?.grabacion);

  if (error) {
    return (
      <div style={{ padding: "var(--ui-s6) var(--ui-s5)" }}>
        <EmptyState icon={<VideocamOutlinedIcon />} title="No se pudo abrir la ficha" description={error} tone="neutral" action={<ButtonLink href="/erp/videovigilancia">Volver a la lista</ButtonLink>} />
      </div>
    );
  }
  if (!diseno) {
    return (
      <div style={{ padding: "var(--ui-s5)", display: "grid", gap: "var(--ui-s4)" }}>
        <Skeleton height={96} />
        <Skeleton height={520} />
      </div>
    );
  }
  return (
    <FichaCamara
      disenoId={diseno.id}
      disenoNombre={diseno.nombre}
      plano={plano}
      camaraId={camaraId}
      tapas={calculo.tapas}
      coberturas={calculo.coberturas}
      esHoja={calculo.esHoja}
    />
  );
}
