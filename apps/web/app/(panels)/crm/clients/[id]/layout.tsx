import type { ReactNode } from "react";
import ClientDetailShell from "@/components/crm/ClientDetailShell";

export default async function ClientDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <ClientDetailShell id={id}>{props.children}</ClientDetailShell>;
}
