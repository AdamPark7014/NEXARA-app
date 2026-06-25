import type { ReactNode } from "react";
import OpportunityDetailShell from "@/components/crm/OpportunityDetailShell";

export default async function OpportunityDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <OpportunityDetailShell id={id}>{props.children}</OpportunityDetailShell>;
}
