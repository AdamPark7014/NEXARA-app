import { redirect } from "next/navigation";

export default async function ActivityApprovalsAliasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/ops/activities/${id}/approvals`);
}
