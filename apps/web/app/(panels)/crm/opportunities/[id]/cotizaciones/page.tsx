import { redirect } from "next/navigation";

/** Alias legacy español → ruta canónica. */
export default async function OpportunityQuotesAliasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/crm/opportunities/${id}/quotes`);
}
