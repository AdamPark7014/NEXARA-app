import { redirect } from "next/navigation";

export default async function ClientQuotesAliasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/crm/clients/${id}/quotes`);
}
