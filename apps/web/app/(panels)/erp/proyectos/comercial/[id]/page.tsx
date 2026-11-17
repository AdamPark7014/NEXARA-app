"use client";

import { useParams } from "next/navigation";
import ProjectDetailShell from "@/components/proyectos/ProjectDetailShell";

/** Un id comercial nunca se interpreta como id operativo: el adaptador resuelve el enlace. */
export default function ResolverProyectoComercial() {
  const { id } = useParams<{ id: string }>();
  return <ProjectDetailShell id={id}>{null}</ProjectDetailShell>;
}
