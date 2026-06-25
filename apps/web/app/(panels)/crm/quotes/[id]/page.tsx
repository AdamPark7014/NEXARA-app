import { redirect } from "next/navigation";

export default async function QuoteDetailRedirect(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/crm/quotes?highlight=${encodeURIComponent(id)}`);
}
