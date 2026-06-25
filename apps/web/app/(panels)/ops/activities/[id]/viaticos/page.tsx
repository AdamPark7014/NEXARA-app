import { redirect } from "next/navigation";

export default async function ActivityViaticsAliasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/ops/activities/${id}/viatics`);
}
