import type { ReactNode } from "react";
import ActivityDetailShell from "@/components/ops/ActivityDetailShell";

/** Detalle de actividad dentro de Core (/erp): mismo contenido que OPS, sin salir del panel. */
export default async function CoreActivityDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return (
    <ActivityDetailShell id={id} core>
      {props.children}
    </ActivityDetailShell>
  );
}
