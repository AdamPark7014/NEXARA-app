import type { ReactNode } from "react";
import ActivityDetailShell from "@/components/ops/ActivityDetailShell";

export default async function ActivityDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <ActivityDetailShell id={id}>{props.children}</ActivityDetailShell>;
}
